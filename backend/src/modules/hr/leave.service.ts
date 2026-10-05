import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaveStatus, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { WorkflowsService } from '@/modules/workflow/workflows.service';
import {
  WorkflowCompletionArgs,
  WorkflowHooksRegistry,
} from '@/modules/workflow/workflow-hooks';
import {
  checkLeaveRequest,
  dateKey,
  isoDayOf,
  leaveBalance,
  workingDaysBetween,
  type WorkingCalendar,
} from './leave-policy';
import { EmployeesService } from './employees.service';
import type {
  CreateHolidayDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  DecisionLeaveRequestDto,
  LeaveRequestFilters,
} from './dto/hr.dto';

type Tx = Prisma.TransactionClient;

export const LEAVE_WORKFLOW_ENTITY = 'LEAVE_REQUEST';

const LEAVE_EXPORT_HEADERS = [
  'employeeNumber',
  'employee',
  'leaveType',
  'startDate',
  'endDate',
  'workingDays',
  'status',
  'decidedAt',
  'reason',
];

/**
 * Module 12 — leave.
 *
 * Two decisions carry this module, and both are about what a request *means*.
 *
 * **The day count is derived, never accepted.** Five days of leave is five
 * *working* days, and a working day depends on the organization's weekend pattern
 * and the jurisdiction's public holidays — neither of which the person filing the
 * request can be authoritative about, and both of which differ between countries.
 * A hand-typed "5" that disagrees with the dates is a rejected request with no
 * visible reason, so this module refuses to create one: `checkLeaveRequest` runs
 * before the row is written and its sentence becomes the error.
 *
 * **Approval goes through Module 18's engine, not a local flag.** That is not
 * ceremony — it is where "the requester can never approve their own request" comes
 * from, which is the control that stops the manager who wants the holiday from
 * signing it off. With no policy configured the engine auto-approves, so the
 * module behaves exactly as it did before any of this existed.
 */
@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private employees: EmployeesService,
    private workflows: WorkflowsService,
    hooks: WorkflowHooksRegistry,
  ) {
    hooks.register(LEAVE_WORKFLOW_ENTITY, {
      onApproved: (args, tx) => this.markApproved(args, tx),
      onRejected: (args, tx) => this.markRejected(args, tx),
    });
  }

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: LeaveRequestFilters = {},
    callerUserId?: string,
  ) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: await this.buildWhere(organizationId, filters, callerUserId),
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            preferredName: true,
            department: true,
          },
        },
      },
      orderBy: [{ startDate: 'desc' }],
      take: 500,
    });

    const calendars = await this.workingDaysForAll(
      organizationId,
      rows.map((row) => ({ startDate: row.startDate, endDate: row.endDate })),
    );

    return rows.map((row, index) => ({
      ...row,
      employeeName:
        row.employee.preferredName ||
        `${row.employee.firstName} ${row.employee.lastName}`,
      workingDays: calendars[index] ?? 0,
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const request = await requireRecord(
      this.prisma.leaveRequest.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          employee: {
            include: {
              leavePolicy: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  annualEntitlementDays: true,
                  carryoverLimitDays: true,
                },
              },
            },
          },
        },
      }),
      'Leave request',
    );

    const calendar = await this.employees.workingCalendar(organizationId);

    // Every *other* approved request matters, not just this employee's: two people
    // cannot cover the same shift, and that is the check most likely to be missing
    // from a hand-built leave screen.
    const others = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId: request.organizationId,
        status: LeaveStatus.APPROVED,
        id: { not: request.id },
        startDate: { lte: request.endDate },
        endDate: { gte: request.startDate },
      },
      select: { id: true, employeeId: true, startDate: true, endDate: true },
    });

    return {
      ...request,
      employeeName:
        request.employee.preferredName ||
        `${request.employee.firstName} ${request.employee.lastName}`,
      workingDays: workingDaysBetween(
        request.startDate,
        request.endDate,
        calendar,
      ),
      balance: await this.balanceFor(
        request.employeeId,
        request.organizationId,
        {
          excludeRequestId: request.id,
        },
      ),
      /** Which other people are away across these dates. Shown on the approval
       *  screen, because approving this one is how the clash is discovered. */
      clashesWith: others.map((other) => ({
        requestId: other.id,
        employeeId: other.employeeId,
        workingDays: workingDaysBetween(
          other.startDate,
          other.endDate,
          calendar,
        ),
      })),
    };
  }

  /**
   * The working calendar, day by day.
   *
   * Exists because "why is my five-day request showing as three?" is otherwise
   * unanswerable. Every non-working day says whether it is a weekend or a named
   * public holiday, so the answer is on the screen rather than in a support ticket.
   */
  async calendar(
    organizationId: string | undefined,
    from?: string,
    to?: string,
  ) {
    const calendar = await this.employees.workingCalendar(organizationId);

    const holidays = await this.prisma.holiday.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      select: { date: true, name: true, isRecurring: true, countryCode: true },
      take: 400,
    });

    const holidayByDate = new Map(
      holidays.map((holiday) => [dateKey(holiday.date), holiday.name]),
    );

    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(start.getTime() + 90 * 86400000);

    const days: {
      date: string;
      isoDay: number;
      isWorkingDay: boolean;
      reason: string | null;
      holiday: string | null;
    }[] = [];

    for (
      let cursor = Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
      );
      cursor <= end.getTime();
      cursor += 86400000
    ) {
      const day = new Date(cursor);
      const key = dateKey(day);
      const iso = isoDayOf(day);
      const weekend = calendar.weekendDays.includes(iso);
      const holiday = holidayByDate.get(key) ?? null;
      days.push({
        date: key,
        isoDay: iso,
        isWorkingDay: !weekend && !holiday,
        reason: weekend ? 'weekend' : holiday ? 'public holiday' : null,
        holiday,
      });
    }

    return {
      weekendDays: calendar.weekendDays,
      holidays: holidays.map((holiday) => ({
        date: dateKey(holiday.date),
        name: holiday.name,
        isRecurring: holiday.isRecurring,
        jurisdictionWide: holiday.countryCode === null,
      })),
      days,
    };
  }

  /** Per-employee leave balance for the current year. */
  async balances(organizationId: string | undefined) {
    const employees = await this.prisma.employee.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        department: true,
        leavePolicyId: true,
        organizationId: true,
      },
      orderBy: { employeeNumber: 'asc' },
      take: 500,
    });

    return Promise.all(
      employees.map(async (employee) => ({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        name:
          employee.preferredName ||
          `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        balance: await this.balanceFor(employee.id, employee.organizationId),
      })),
    );
  }

  /** One employee's balance, excluding a request that is still being decided. */
  async balanceFor(
    employeeId: string,
    organizationId: string,
    options: { excludeRequestId?: string } = {},
  ) {
    const calendar = await this.employees.workingCalendar(organizationId);
    const policy = await this.employees.resolvePolicy(null, organizationId);

    const employee = await requireRecord(
      this.prisma.employee.findFirst({
        where: { id: employeeId, organizationId },
        select: { id: true, leavePolicyId: true, organizationId: true },
      }),
      'Employee',
    );

    const resolved = employee.leavePolicyId
      ? await this.employees.resolvePolicy(
          employee.leavePolicyId,
          organizationId,
        )
      : policy;

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: LeaveStatus.APPROVED,
        ...(options.excludeRequestId
          ? { id: { not: options.excludeRequestId } }
          : {}),
        startDate: { gte: yearStart, lte: yearEnd },
      },
      select: { startDate: true, endDate: true },
    });

    return {
      ...leaveBalance({
        policy: resolved,
        calendar,
        approved: approved.map((row) => ({
          start: row.startDate,
          end: row.endDate,
        })),
      }),
      policy: { code: resolved.code, name: resolved.name },
      calendar: { weekendDays: calendar.weekendDays },
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: LeaveRequestFilters = {},
  ): Promise<string> {
    const rows = (await this.findAll(organizationId, filters)) as unknown as {
      employeeNumber: string;
      employeeName: string;
      leaveType: string;
      startDate: Date;
      endDate: Date;
      workingDays: number;
      status: string;
      decidedAt: Date | null;
      reason: string | null;
    }[];

    return toCsv(
      LEAVE_EXPORT_HEADERS,
      rows.map((row) => ({
        employeeNumber: row.employeeNumber ?? '',
        employee: row.employeeName,
        leaveType: row.leaveType,
        startDate: dateKey(row.startDate),
        endDate: dateKey(row.endDate),
        workingDays: row.workingDays,
        status: row.status,
        decidedAt: row.decidedAt ? dateKey(row.decidedAt) : '',
        reason: row.reason ?? '',
      })),
    );
  }

  /**
   * File a request for **yourself**.
   *
   * `CreateLeaveRequestDto` carries an `employeeId`, and on the manager route that
   * is how somebody books holiday for a report. On the self route it is simply
   * ignored — which is the only safe way to reuse the DTO, because a field a caller
   * can set and a service silently discards is a field the next developer will
   * start reading. So it is stripped explicitly, here, and the employee comes from
   * the token.
   *
   * The permission (`leave_requests.self`) and the scoping are independent: holding
   * `create` would let an employee file against anybody's id, and holding `self`
   * on the manager route would let a manager see only their own. Neither mistake
   * can widen the other.
   */
  async createForSelf(
    userId: string,
    dto: CreateLeaveRequestDto,
    organizationId: string,
  ) {
    const employee = await this.requireEmployeeForUser(userId, organizationId);

    // Spreading everything except `employeeId` rather than picking fields, so a new
    // DTO field is not silently dropped from the self-service path.
    const { employeeId: _ignored, ...rest } = dto;
    void _ignored;

    return this.create(
      { ...rest, employeeId: employee.id },
      organizationId,
      userId,
    );
  }

  /** This person's own leave requests. No employee id parameter exists to misuse. */
  async listForSelf(userId: string, organizationId: string) {
    const employee = await this.requireEmployeeForUser(userId, organizationId);
    return this.findAll(organizationId, { employeeId: employee.id });
  }

  /** Withdraw your own request. Scoped, so an id alone cannot withdraw somebody else's. */
  async cancelForSelf(
    userId: string,
    id: string,
    organizationId: string,
    note?: string,
  ) {
    const employee = await this.requireEmployeeForUser(userId, organizationId);

    const request = await this.record(id, organizationId);
    if (request.employeeId !== employee.id) {
      // A plain 404 rather than a 403: telling somebody the request exists but is
      // not theirs confirms the id is real, and every id in the system is
      // guessable enough to be worth not confirming.
      throw new NotFoundException('Leave request not found');
    }

    return this.cancel(id, organizationId, userId, note);
  }

  /**
   * This person's own leave balance.
   *
   * Separate from the tenant-wide `balances()` because that one takes an employee
   * id, and a method reachable with only `self` must not have an employee id
   * parameter at all.
   */
  async balanceForSelf(userId: string, organizationId: string) {
    const employee = await this.requireEmployeeForUser(userId, organizationId);
    return this.balanceFor(employee.id, organizationId);
  }

  private async requireEmployeeForUser(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true, employeeNumber: true },
    });

    if (!employee) {
      throw new NotFoundException(
        'This login is not linked to an employment record, so there is no leave balance or history to show. An administrator can link one from the employee record.',
      );
    }

    return employee;
  }

  // =================================================================== writes

  /**
   * File a request, having first checked the policy can actually grant it.
   *
   * Validated **before** the insert rather than after, so somebody standing at the
   * form gets the reason immediately instead of filing something an approver will
   * bounce back. A request that arrives without a policy check is how a balance
   * quietly goes negative.
   */
  async create(
    dto: CreateLeaveRequestDto,
    organizationId: string,
    userId?: string,
  ) {
    const employee = await requireRecord(
      this.prisma.employee.findFirst({
        where: { id: dto.employeeId, organizationId },
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          organizationId: true,
          leavePolicyId: true,
        },
      }),
      'Employee',
    );

    const calendar = await this.employees.workingCalendar(organizationId);
    const policy = await this.employees.resolvePolicy(null, organizationId);

    const allApproved = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId,
        status: LeaveStatus.APPROVED,
        startDate: { lte: new Date(dto.endDate) },
        endDate: { gte: new Date(dto.startDate) },
      },
      select: { startDate: true, endDate: true },
    });

    const mine = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: LeaveStatus.APPROVED,
        startDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
      },
      select: { startDate: true, endDate: true },
    });

    const ownPolicy = employee.leavePolicyId
      ? await this.employees.resolvePolicy(
          employee.leavePolicyId,
          employee.organizationId,
        )
      : policy;

    const check = checkLeaveRequest({
      policy: ownPolicy,
      calendar,
      start: dto.startDate,
      end: dto.endDate,
      leaveType: dto.leaveType ?? LeaveType.ANNUAL,
      existing: mine.map((row) => ({ start: row.startDate, end: row.endDate })),
      allApproved: allApproved.map((row) => ({
        start: row.startDate,
        end: row.endDate,
      })),
    });

    if (!check.allowed) {
      throw new ConflictException(
        check.reason ??
          'This request cannot be granted under the current policy.',
      );
    }

    const created = await this.prisma.leaveRequest.create({
      data: {
        organization: { connect: { id: organizationId } },
        employee: { connect: { id: employee.id } },
        leaveType: dto.leaveType ?? LeaveType.ANNUAL,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason?.trim() || null,
        status: LeaveStatus.PENDING,
      },
      include: {
        employee: {
          select: {
            employeeNumber: true,
            firstName: true,
            lastName: true,
            preferredName: true,
          },
        },
      },
    });

    // The engine owns the decision from here. With no `LEAVE_REQUEST` policy
    // configured it auto-approves and the hook below runs immediately, so a small
    // organization gets a working approve-on-submit flow without configuring one.
    const workflow = await this.workflows.start({
      organizationId,
      entityType: LEAVE_WORKFLOW_ENTITY,
      entityId: created.id,
      entityLabel: `${employee.employeeNumber} — ${created.leaveType.toLowerCase()} leave, ${check.workingDays} working days`,
      startedById: userId ?? null,
      context: {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        leaveType: created.leaveType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        workingDays: check.workingDays,
        remainingAfter: check.remaining,
        // Conditions an organization can write against, which is what makes the
        // gate configurable rather than hardcoded.
        annualDays: ownPolicy.annualEntitlementDays,
      },
    });

    const settled = await this.findOne(created.id, organizationId);
    return {
      ...settled,
      workflow: workflow
        ? { status: workflow.status, instanceId: workflow.id }
        : null,
    };
  }

  /**
   * Decide by hand, without the engine.
   *
   * The no-policy fallback, exposed deliberately: an organization with no
   * approval workflow configured still needs somebody to be able to say yes, and
   * refusing to offer the button would mean leave could only ever be approved by
   * an approval engine nobody set up.
   */
  async decide(
    id: string,
    dto: DecisionLeaveRequestDto,
    approve: boolean,
    organizationId: string,
    userId?: string,
  ) {
    const request = await this.record(id, organizationId);

    if (request.status !== LeaveStatus.PENDING) {
      throw new ConflictException(
        `This request was already ${request.status.toLowerCase()}, so it cannot be ${
          approve ? 'approved' : 'rejected'
        } again.`,
      );
    }

    // Enforced here as well as by the engine. The engine's refusal is the right
    // default; a second check costs nothing and survives somebody pointing the
    // decide button at the wrong record.
    if (request.employee.userId && request.employee.userId === userId) {
      throw new ForbiddenException(
        'You filed this request, so you cannot also be the person who approves it. Ask a manager or an administrator.',
      );
    }

    // Shaped to match what the engine's completion hook receives, so the by-hand
    // decision and the approval-workflow decision write identical rows. Two code
    // paths writing the same fact is how they drift.
    const args: WorkflowCompletionArgs = {
      instanceId: '',
      organizationId,
      entityType: LEAVE_WORKFLOW_ENTITY,
      entityId: id,
      entityLabel: null,
      context: {},
      decidedById: userId ?? null,
      decidedAt: new Date(),
      comment: dto.note ?? null,
    };

    return approve
      ? this.markApproved(args, this.prisma)
      : this.markRejected(args, this.prisma);
  }

  /** Called by the engine's completion hook. Never by a controller. */
  async markApproved(args: WorkflowCompletionArgs, tx: Tx) {
    const note = args.comment ?? null;

    await tx.leaveRequest.update({
      where: { id: args.entityId },
      data: {
        status: LeaveStatus.APPROVED,
        decidedAt: args.decidedAt ?? new Date(),
        decidedById: args.decidedById,
        decisionNote: note,
      },
    });

    return this.findOne(args.entityId, args.organizationId);
  }

  /** Called by the engine's completion hook. Never by a controller. */
  async markRejected(args: WorkflowCompletionArgs, tx: Tx) {
    await tx.leaveRequest.update({
      where: { id: args.entityId },
      data: {
        status: LeaveStatus.REJECTED,
        decidedAt: args.decidedAt ?? new Date(),
        decidedById: args.decidedById,
        decisionNote: args.comment ?? null,
      },
    });

    return this.findOne(args.entityId, args.organizationId);
  }

  /**
   * The employee withdraws their own request.
   *
   * `REJECTED` is deliberately not cancellable. It was already decided, by a
   * named person, with a reason — and letting the requester relabel that as a
   * cancellation would erase who declined it.
   */
  async cancel(
    id: string,
    organizationId: string,
    userId?: string,
    note?: string,
  ) {
    const request = await this.record(id, organizationId);

    if (request.status === LeaveStatus.REJECTED) {
      throw new ConflictException(
        'This request was rejected, so it stays rejected. Ask for a new one instead — the history of why it was turned down is worth keeping.',
      );
    }
    if (request.status === LeaveStatus.CANCELLED) {
      throw new ConflictException('This request has already been withdrawn.');
    }

    await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveStatus.CANCELLED,
        decidedAt: new Date(),
        decidedById: userId ?? null,
        decisionNote: note ?? null,
      },
    });

    return this.findOne(id, organizationId);
  }

  /** A pending request may be removed; a decided one is a record. */
  async remove(id: string, organizationId: string) {
    const request = await this.record(id, organizationId);

    if (request.status !== LeaveStatus.PENDING) {
      throw new ConflictException(
        `This request was ${request.status.toLowerCase()} by ${
          request.employee.preferredName || request.employee.firstName
        }'s approver on ${dateKey(
          request.decidedAt ?? new Date(),
        )}, so it is part of the record and cannot be deleted.`,
      );
    }

    await this.prisma.leaveRequest.delete({ where: { id } });
    return { message: 'Request removed.' };
  }

  // ================================================================= policies

  async policies(organizationId: string | undefined) {
    return this.prisma.leavePolicy.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createPolicy(dto: CreateLeavePolicyDto, organizationId: string) {
    if (
      dto.minNoticeDays != null &&
      dto.minNoticeWaivedDays != null &&
      dto.minNoticeWaivedDays > dto.minNoticeDays
    ) {
      throw new BadRequestException(
        'The short-notice exemption cannot be longer than the notice period, or every request is exempt.',
      );
    }

    const created = await this.prisma.leavePolicy.create({
      data: {
        organization: { connect: { id: organizationId } },
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        countryCode: dto.countryCode?.toUpperCase() ?? null,
        regionCode: dto.regionCode?.trim() || null,
        annualEntitlementDays: new Prisma.Decimal(dto.annualEntitlementDays),
        carryoverLimitDays:
          dto.carryoverLimitDays == null
            ? null
            : new Prisma.Decimal(dto.carryoverLimitDays),
        minNoticeDays: dto.minNoticeDays ?? 0,
        minNoticeWaivedDays: dto.minNoticeWaivedDays ?? 1,
        unpaidAllowed: dto.unpaidAllowed ?? true,
        maxConsecutiveDays: dto.maxConsecutiveDays ?? null,
        isDefault: dto.isDefault ?? false,
      },
    });

    if (dto.isDefault) {
      await this.prisma.leavePolicy.updateMany({
        where: { organizationId, id: { not: created.id } },
        data: { isDefault: false },
      });
    }

    return created;
  }

  async holidays(organizationId: string | undefined) {
    return this.prisma.holiday.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { date: 'asc' },
      take: 400,
    });
  }

  async createHoliday(dto: CreateHolidayDto, organizationId: string) {
    return this.prisma.holiday.create({
      data: {
        organization: { connect: { id: organizationId } },
        date: new Date(dto.date),
        name: dto.name.trim(),
        countryCode: dto.countryCode?.toUpperCase() ?? null,
        regionCode: dto.regionCode?.trim() || null,
        isRecurring: dto.isRecurring ?? false,
      },
    });
  }

  async removeHoliday(id: string, organizationId: string) {
    await requireRecord(
      this.prisma.holiday.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Holiday',
    );
    await this.prisma.holiday.delete({ where: { id } });
    return { message: 'Holiday removed.' };
  }

  // ================================================================= helpers

  async record(
    id: string,
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ) {
    return requireRecord(
      tx.leaveRequest.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              userId: true,
              leavePolicyId: true,
              organizationId: true,
            },
          },
        },
      }),
      'Leave request',
    );
  }

  /**
   * One calendar fetch for a whole page of requests.
   *
   * The calendar is the same for every row in a tenant — it depends on the
   * organization and the jurisdiction, not on the employee — so a list of 200
   * requests costs one calendar query rather than 200. Returns the day counts
   * positionally, because the caller already has its rows in order.
   */
  private async workingDaysForAll(
    organizationId: string | undefined,
    rows: { startDate: Date; endDate: Date }[],
  ): Promise<number[]> {
    if (rows.length === 0) return [];
    const calendar = await this.employees.workingCalendar(organizationId);
    return rows.map((row) =>
      workingDaysBetween(row.startDate, row.endDate, calendar),
    );
  }

  private async buildWhere(
    organizationId: string | undefined,
    filters: LeaveRequestFilters,
    callerUserId?: string,
  ): Promise<Prisma.LeaveRequestWhereInput> {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.status = filters.status as LeaveStatus;
    if (filters.leaveType) where.leaveType = filters.leaveType as LeaveType;

    if (filters.from || filters.to) {
      where.startDate = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    // "My leave" is resolved from the caller's own employment record rather than
    // from a query parameter, so nobody can ask for somebody else's by sending a
    // different employee id.
    if (filters.scope === 'mine') {
      if (!callerUserId) {
        throw new BadRequestException(
          'This login has no employment record, so "my leave" has nothing to show. An employee needs to be linked to a user.',
        );
      }
      const employee = await this.prisma.employee.findFirst({
        where: {
          userId: callerUserId,
          ...(organizationId ? { organizationId } : {}),
        },
        select: { id: true },
      });
      if (!employee) {
        throw new BadRequestException(
          'This login has no employment record, so "my leave" has nothing to show.',
        );
      }
      where.employeeId = employee.id;
    }

    return where;
  }

  /** Days for a batch of requests against one calendar. */
  private workingDaysFor(
    rows: { startDate: Date; endDate: Date }[],
    calendar: WorkingCalendar,
  ): number[] {
    return rows.map((row) =>
      workingDaysBetween(row.startDate, row.endDate, calendar),
    );
  }
}
