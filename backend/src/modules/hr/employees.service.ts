import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  checkLeaveRequest,
  leaveBalance,
  dateKey,
  type WorkingCalendar,
} from './leave-policy';
import { num } from './payroll-calc';
import type {
  CreateEmployeeDto,
  EmployeeComponentDto,
  EmployeeFilters,
  UpdateEmployeeDto,
} from './dto/hr.dto';

type Tx = Prisma.TransactionClient;

/**
 * The fields a directory listing may show.
 *
 * Compensation and bank details are excluded, and the exclusion is a *type*, not
 * a `delete` at the end of a select — so adding a salary field to the model later
 * cannot accidentally leak it. See `directoryView`.
 */
const DIRECTORY_SELECT = {
  id: true,
  employeeNumber: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  department: true,
  jobTitle: true,
  employmentType: true,
  hireDate: true,
  terminationDate: true,
  isActive: true,
  userId: true,
  salaryCurrency: true,
  payFrequency: true,
} as const;

/** Everything, including the sensitive half. For one record, under a permission
 *  the caller has to already hold. */
const FULL_INCLUDE = {
  leavePolicy: {
    select: {
      id: true,
      code: true,
      name: true,
      annualEntitlementDays: true,
      carryoverLimitDays: true,
      unpaidAllowed: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  components: {
    include: {
      payComponent: {
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
          direction: true,
          isTaxable: true,
          isPensionable: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const EMPLOYEE_EXPORT_HEADERS = [
  'employeeNumber',
  'name',
  'preferredName',
  'department',
  'jobTitle',
  'employmentType',
  'hireDate',
  'terminationDate',
  'payFrequency',
  'salaryCurrency',
  'isActive',
  'hasLogin',
];

/**
 * Module 12 — employees.
 *
 * The load-bearing decision in this file is not the CRUD, it is **`directoryView`
 * versus `fullView`**, and the reason for the split is arithmetic rather than
 * caution: there are about ten roles in this system and exactly one of them
 * (`ACCOUNTANT`) should see a salary. Every other role — including the
 * administrator who configures the place — needs a staff directory. A single
 * `findAll` that returned the whole record would make "who can see salaries" a
 * question nobody could answer, and it would be answered by widening the role list
 * until the answer was "everybody".
 *
 * So the cheap path is a typed `select` that physically cannot include
 * compensation, and the expensive path is `findOne`, which additionally requires
 * `employees.compensation` at the controller. Salary data is not redacted from a
 * response — it is never fetched.
 */
@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  // ==================================================================== reads

  /**
   * The staff directory: names, roles, dates — no money.
   *
   * Safe for every role that can see an employee, which is the point.
   */
  async findAll(
    organizationId: string | undefined,
    filters: EmployeeFilters = {},
  ) {
    const rows = await this.prisma.employee.findMany({
      where: this.buildWhere(organizationId, filters),
      select: DIRECTORY_SELECT,
      orderBy: [
        { isActive: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      take: 500,
    });

    return rows.map((row) => this.directoryView(row));
  }

  /**
   * A person's own employment record, resolved from their login.
   *
   * The self-service path, and the reason `UserRole.EMPLOYEE` exists at all: an
   * employee who can log in must be able to see their own payslip and file their
   * own leave without an administrator provisioning them a role with company-wide
   * visibility.
   *
   * Takes a **user id, never an employee id.** There is no request shape in which
   * a caller can name somebody else, which is the property that makes the
   * `employees.self` permission safe to hand to everybody — the permission and the
   * scoping are independent, and a bug in one cannot widen the other.
   *
   * Returns null when the login has no employment record, which is not an error:
   * a property manager with a login and no payroll record is a real arrangement.
   */
  async selfRecord(userId: string, organizationId: string | undefined) {
    const employee = await this.findByUserId(userId, organizationId);
    if (!employee) {
      throw new NotFoundException(
        'This login is not linked to an employment record, so there are no payslips or leave balances to show. An administrator can link one from the employee record.',
      );
    }
    return employee;
  }

  /**
   * One employee in full, including compensation.
   *
   * Callers must already hold `employees.compensation`; the controller enforces
   * it. Leave balance and the last few payslips come along because a payslip
   * screen that cannot show the balance is a screenshot of a number.
   */
  async findOne(id: string, organizationId: string | undefined) {
    const employee = await requireRecord(
      this.prisma.employee.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: FULL_INCLUDE,
      }),
      'Employee',
    );

    const [calendar, policy, approvedLeave, payslips] = await Promise.all([
      this.workingCalendar(organizationId),
      this.resolvePolicy(employee.leavePolicyId, employee.organizationId),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: id,
          status: 'APPROVED',
          startDate: {
            gte: new Date(new Date().getFullYear(), 0, 1),
            lte: new Date(new Date().getFullYear() + 1, 0, 1),
          },
        },
        select: {
          startDate: true,
          endDate: true,
          leaveType: true,
          id: true,
          status: true,
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.payslip.findMany({
        where: { employeeId: id },
        include: {
          payrollRun: {
            select: {
              id: true,
              reference: true,
              periodStart: true,
              periodEnd: true,
              payDate: true,
              status: true,
              currency: true,
            },
          },
        },
        orderBy: [{ periodEnd: 'desc' }],
        take: 24,
      }),
    ]);

    const balance = leaveBalance({
      policy,
      calendar,
      approved: approvedLeave.map((row) => ({
        start: row.startDate,
        end: row.endDate,
      })),
    });

    return {
      ...employee,
      basicSalary: num(employee.basicSalary),
      leavePolicy: employee.leavePolicy ?? this.policyView(policy),
      leaveBalance: balance,
      payslips: payslips.map((payslip) => this.payslipSummary(payslip)),
      components: employee.components.map((entry) => ({
        ...entry,
        percentage: entry.percentage == null ? null : num(entry.percentage),
        amount: entry.amount == null ? null : num(entry.amount),
      })),
    };
  }

  /**
   * A person's own record, resolved from their login.
   *
   * The self-service path, and the reason `UserRole.EMPLOYEE` exists at all: an
   * employee who can log in must be able to see their own payslips and file their
   * own leave without an administrator provisioning them a role with company-wide
   * visibility. Returns null when the login has no employment record — a
   * property manager with a login and no payroll record is not an error.
   */
  async findByUserId(userId: string, organizationId: string | undefined) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, ...(organizationId ? { organizationId } : {}) },
      include: FULL_INCLUDE,
    });
    if (!employee) return null;

    const calendar = await this.workingCalendar(organizationId);
    const policy = await this.resolvePolicy(
      employee.leavePolicyId,
      employee.organizationId,
    );
    const approvedLeave = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: 'APPROVED',
        startDate: {
          gte: new Date(new Date().getFullYear(), 0, 1),
          lte: new Date(new Date().getFullYear() + 1, 0, 1),
        },
      },
      select: { startDate: true, endDate: true },
    });

    return {
      ...employee,
      basicSalary: num(employee.basicSalary),
      leaveBalance: leaveBalance({
        policy,
        calendar,
        approved: approvedLeave.map((row) => ({
          start: row.startDate,
          end: row.endDate,
        })),
      }),
    };
  }

  /**
   * What the organization-wide figures are, for the dashboard.
   *
   * Headcount, department spread and pay frequency — **no salary aggregates**.
   * A "total payroll cost" tile on a dashboard is read by people who have no
   * business knowing it, and it is one of the easiest numbers in the product to
   * expose by accident.
   */
  async stats(organizationId: string | undefined) {
    const where = organizationId ? { organizationId } : {};

    const [total, active, byDepartment, byType, byFrequency, currencies] =
      await Promise.all([
        this.prisma.employee.count({ where }),
        this.prisma.employee.count({ where: { ...where, isActive: true } }),
        this.prisma.employee.groupBy({
          by: ['department'],
          where: { ...where, isActive: true },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['employmentType'],
          where: { ...where, isActive: true },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['payFrequency'],
          where: { ...where, isActive: true },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['salaryCurrency'],
          where,
          _count: { _all: true },
        }),
      ]);

    // More than one currency in one organization is the normal case for a group, not
    // a data error, so it is reported rather than flagged.
    const multiCurrency = currencies.length > 1;

    return {
      total,
      active,
      inactive: total - active,
      byDepartment: byDepartment
        .map((row) => ({
          department: row.department ?? 'Unassigned',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      byEmploymentType: Object.fromEntries(
        byType.map((row) => [row.employmentType, row._count._all]),
      ) as Partial<Record<EmploymentType, number>>,
      byPayFrequency: Object.fromEntries(
        byFrequency.map((row) => [row.payFrequency, row._count._all]),
      ),
      currencies: currencies.map((row) => ({
        currency: row.salaryCurrency,
        count: row._count._all,
      })),
      multiCurrency,
      /** Staff with a login. The gap between this and `active` is the number of
       *  people the organization pays but cannot reach — worth knowing. */
      withLogin: await this.prisma.employee.count({
        where: { ...where, isActive: true, userId: { not: null } },
      }),
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: EmployeeFilters = {},
  ): Promise<string> {
    // The export is the **directory**, not the full record. An export is the
    // easiest salary leak in the product: it leaves the building, it lands in a
    // mailbox, and the permission that produced it is one click away from an
    // accountant's screen.
    const rows = (await this.findAll(organizationId, filters)) as unknown as {
      employeeNumber: string;
      displayName: string;
      preferredName: string | null;
      department: string | null;
      jobTitle: string | null;
      employmentType: string;
      hireDate: Date;
      terminationDate: Date | null;
      payFrequency: string;
      salaryCurrency: string;
      isActive: boolean;
      hasLogin: boolean;
    }[];

    return toCsv(
      EMPLOYEE_EXPORT_HEADERS,
      rows.map((row) => ({
        employeeNumber: row.employeeNumber,
        name: row.displayName,
        preferredName: row.preferredName ?? '',
        department: row.department ?? '',
        jobTitle: row.jobTitle ?? '',
        employmentType: row.employmentType,
        hireDate: row.hireDate?.toISOString().slice(0, 10) ?? '',
        terminationDate: row.terminationDate
          ? row.terminationDate.toISOString().slice(0, 10)
          : '',
        payFrequency: row.payFrequency,
        salaryCurrency: row.salaryCurrency,
        isActive: row.isActive ? 'yes' : 'no',
        hasLogin: row.hasLogin ? 'yes' : 'no',
      })),
    );
  }

  // =================================================================== writes

  async create(dto: CreateEmployeeDto, organizationId: string) {
    const employeeNumber = dto.employeeNumber.trim().toUpperCase();

    const existing = await this.prisma.employee.findFirst({
      where: { organizationId, employeeNumber },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Employee number ${employeeNumber} is already in use in this organization.`,
      );
    }

    if (dto.userId) await this.assertUserLinkable(dto.userId, organizationId);

    try {
      const created = await this.prisma.employee.create({
        data: {
          organization: { connect: { id: organizationId } },
          employeeNumber,
          ...(dto.userId ? { user: { connect: { id: dto.userId } } } : {}),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          preferredName: dto.preferredName?.trim() || null,
          preferredLocale: dto.preferredLocale?.trim() || null,
          department: dto.department?.trim() || null,
          jobTitle: dto.jobTitle?.trim() || null,
          employmentType: dto.employmentType ?? EmploymentType.FULL_TIME,
          hireDate: new Date(dto.hireDate),
          terminationDate: dto.terminationDate
            ? new Date(dto.terminationDate)
            : null,
          basicSalary: new Prisma.Decimal(dto.basicSalary),
          salaryCurrency: dto.salaryCurrency?.toUpperCase() || undefined,
          payFrequency: dto.payFrequency,
          periodsPerYear: dto.periodsPerYear ?? 12,
          nationalId: dto.nationalId?.trim() || null,
          taxNumber: dto.taxNumber?.trim() || null,
          socialSecurityNumber: dto.socialSecurityNumber?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
          bankName: dto.bankName?.trim() || null,
          bankBranch: dto.bankBranch?.trim() || null,
          bankCode: dto.bankCode?.trim() || null,
          address: dto.address?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          ...(dto.leavePolicyId
            ? { leavePolicy: { connect: { id: dto.leavePolicyId } } }
            : {}),
        },
      });

      return this.findOne(created.id, organizationId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Employee number ${employeeNumber} is already in use, or that login is already linked to another employee.`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateEmployeeDto, organizationId: string) {
    await this.record(id, organizationId);

    if (dto.employeeNumber !== undefined) {
      const employeeNumber = dto.employeeNumber.trim().toUpperCase();
      const clash = await this.prisma.employee.findFirst({
        where: { organizationId, employeeNumber, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `Employee number ${employeeNumber} is already in use.`,
        );
      }
    }

    if (
      dto.hireDate &&
      dto.terminationDate &&
      new Date(dto.terminationDate) < new Date(dto.hireDate)
    ) {
      throw new BadRequestException(
        'The leaving date is before the hire date, so this person was never employed here.',
      );
    }

    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.employeeNumber !== undefined
          ? { employeeNumber: dto.employeeNumber.trim().toUpperCase() }
          : {}),
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.preferredName !== undefined
          ? { preferredName: dto.preferredName?.trim() || null }
          : {}),
        ...(dto.preferredLocale !== undefined
          ? { preferredLocale: dto.preferredLocale?.trim() || null }
          : {}),
        ...(dto.department !== undefined
          ? { department: dto.department?.trim() || null }
          : {}),
        ...(dto.jobTitle !== undefined
          ? { jobTitle: dto.jobTitle?.trim() || null }
          : {}),
        ...(dto.employmentType !== undefined
          ? { employmentType: dto.employmentType }
          : {}),
        ...(dto.hireDate !== undefined
          ? { hireDate: new Date(dto.hireDate) }
          : {}),
        ...(dto.terminationDate !== undefined
          ? {
              terminationDate: dto.terminationDate
                ? new Date(dto.terminationDate)
                : null,
            }
          : {}),
        ...(dto.basicSalary !== undefined
          ? { basicSalary: new Prisma.Decimal(dto.basicSalary) }
          : {}),
        ...(dto.salaryCurrency !== undefined
          ? { salaryCurrency: dto.salaryCurrency.toUpperCase() }
          : {}),
        ...(dto.payFrequency !== undefined
          ? { payFrequency: dto.payFrequency }
          : {}),
        ...(dto.periodsPerYear !== undefined
          ? { periodsPerYear: dto.periodsPerYear }
          : {}),
        ...(dto.nationalId !== undefined
          ? { nationalId: dto.nationalId?.trim() || null }
          : {}),
        ...(dto.taxNumber !== undefined
          ? { taxNumber: dto.taxNumber?.trim() || null }
          : {}),
        ...(dto.socialSecurityNumber !== undefined
          ? { socialSecurityNumber: dto.socialSecurityNumber?.trim() || null }
          : {}),
        ...(dto.bankAccount !== undefined
          ? { bankAccount: dto.bankAccount?.trim() || null }
          : {}),
        ...(dto.bankName !== undefined
          ? { bankName: dto.bankName?.trim() || null }
          : {}),
        ...(dto.bankBranch !== undefined
          ? { bankBranch: dto.bankBranch?.trim() || null }
          : {}),
        ...(dto.bankCode !== undefined
          ? { bankCode: dto.bankCode?.trim() || null }
          : {}),
        ...(dto.address !== undefined
          ? { address: dto.address?.trim() || null }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.leavePolicyId !== undefined
          ? {
              leavePolicy: dto.leavePolicyId
                ? { connect: { id: dto.leavePolicyId } }
                : { disconnect: true },
            }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Leaving, rather than being deleted.
   *
   * Payslips reference this row (`onDelete: Restrict`) and a payslip is a
   * document an employee may need years later. Setting `terminationDate` keeps the
   * record, keeps the history, and stops them appearing in the next payroll run.
   */
  async terminate(id: string, terminationDate: string, organizationId: string) {
    const employee = await this.record(id, organizationId);

    const when = new Date(terminationDate);
    if (when < employee.hireDate) {
      throw new BadRequestException(
        `${employee.firstName} was hired on ${employee.hireDate
          .toISOString()
          .slice(0, 10)}, so a leaving date before that is not possible.`,
      );
    }

    // A final payroll run is not optional bookkeeping: somebody's last month of
    // pay depends on it existing.
    const openRuns = await this.prisma.payrollRun.findFirst({
      where: {
        organizationId,
        status: { in: ['DRAFT', 'CALCULATED'] },
        periodStart: { lte: when },
        periodEnd: { gte: when },
      },
      select: { reference: true, periodEnd: true },
    });

    await this.prisma.employee.update({
      where: { id },
      data: { terminationDate: when, isActive: false },
    });

    return {
      message: `${employee.firstName} ${employee.lastName} left on ${when
        .toISOString()
        .slice(0, 10)}. Their payslips and leave history are kept.`,
      employeeId: id,
      terminationDate: when,
      /** Non-null when a payroll run is open over their leaving date, so the
       *  caller can say "pay them up to the end of this run first" rather than
       *  silently leaving them off it. */
      openRun: openRuns ?? null,
    };
  }

  /**
   * Link a login to this employment record, or unlink it.
   *
   * The reason the relation is one-to-one is here: without it, one person could
   * be two employees in the same organization, be paid twice, and appear on two
   * payslips for one month of work.
   */
  async linkUser(id: string, userId: string | null, organizationId: string) {
    await this.record(id, organizationId);

    if (userId) {
      await this.assertUserLinkable(userId, organizationId, id);
      await this.prisma.employee.update({
        where: { id },
        data: { user: { connect: { id: userId } } },
      });
    } else {
      await this.prisma.employee.update({
        where: { id },
        data: { user: { disconnect: true } },
      });
    }

    return this.findOne(id, organizationId);
  }

  /** Set or replace an employee's standing allowances and deductions. */
  async setComponents(
    id: string,
    components: EmployeeComponentDto[],
    organizationId: string,
    effectiveFrom?: string,
  ) {
    await this.record(id, organizationId);

    if (components.length === 0) {
      throw new BadRequestException(
        'Send an empty list to clear every standing arrangement, or omit the field to leave them alone.',
      );
    }

    for (const component of components) {
      if (component.percentage == null && component.amount == null) {
        throw new BadRequestException(
          `Give "${component.payComponentId}" a percentage or an amount. A component with neither is a line that never appears.`,
        );
      }
    }

    const from = effectiveFrom ? new Date(effectiveFrom) : new Date();

    return this.prisma.$transaction(async (tx) => {
      // Close the current arrangements rather than deleting them, so a payslip
      // from last month still points at the arrangement that produced it.
      await tx.employeeComponent.updateMany({
        where: { employeeId: id, effectiveTo: null },
        data: { effectiveTo: from },
      });

      for (const component of components) {
        await tx.employeeComponent.create({
          data: {
            employeeId: id,
            payComponentId: component.payComponentId,
            percentage:
              component.percentage == null
                ? null
                : new Prisma.Decimal(component.percentage),
            amount:
              component.amount == null
                ? null
                : new Prisma.Decimal(component.amount),
            currency: component.currency?.toUpperCase() || undefined,
            effectiveFrom: from,
          },
        });
      }

      return this.findOne(id, organizationId);
    });
  }

  /**
   * Would this request be granted?
   *
   * Read-only, and deliberately so: the leave form calls it on every keystroke so
   * the balance updates live, and it must never be able to *write* on the way.
   */
  async previewLeave(
    employeeId: string,
    input: { startDate: string; endDate: string; leaveType?: string },
    organizationId: string | undefined,
  ) {
    const employee = await requireRecord(
      this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          ...(organizationId ? { organizationId } : {}),
        },
        select: { id: true, leavePolicyId: true, organizationId: true },
      }),
      'Employee',
    );

    const [calendar, policy, approved] = await Promise.all([
      this.workingCalendar(organizationId),
      this.resolvePolicy(employee.leavePolicyId, employee.organizationId),
      this.prisma.leaveRequest.findMany({
        where: { employeeId, status: 'APPROVED' },
        select: { startDate: true, endDate: true },
      }),
    ]);

    return checkLeaveRequest({
      policy,
      calendar,
      start: input.startDate,
      end: input.endDate,
      leaveType: input.leaveType,
      existing: approved.map((row) => ({
        start: row.startDate,
        end: row.endDate,
      })),
      allApproved: approved.map((row) => ({
        start: row.startDate,
        end: row.endDate,
      })),
    });
  }

  async record(
    id: string,
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ) {
    return requireRecord(
      tx.employee.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: FULL_INCLUDE,
      }),
      'Employee',
    );
  }

  // ================================================================= helpers

  /**
   * The organization's non-working days and public holidays.
   *
   * The weekend comes from the organization rather than from a constant, because
   * "Saturday is a weekend" is false in a large part of the world and a leave
   * balance computed against the wrong one is wrong in a way nobody notices until
   * somebody tries to book the only day they had left.
   */
  async workingCalendar(
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ): Promise<WorkingCalendar> {
    if (!organizationId) {
      return { weekendDays: [6, 7], holidayDates: [] };
    }

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        weekendDays: true,
        payrollCountryCode: true,
        payrollRegionCode: true,
        taxCountryCode: true,
        taxRegionCode: true,
      },
    });

    const jurisdiction = {
      countryCode: org?.payrollCountryCode ?? org?.taxCountryCode ?? null,
      regionCode: org?.payrollRegionCode ?? org?.taxRegionCode ?? null,
    };

    const holidays = await tx.holiday.findMany({
      where: {
        organizationId,
        OR: [
          { countryCode: null },
          ...(jurisdiction.countryCode
            ? [
                {
                  AND: [
                    { countryCode: jurisdiction.countryCode },
                    {
                      OR: [
                        { regionCode: null },
                        ...(jurisdiction.regionCode
                          ? [{ regionCode: jurisdiction.regionCode }]
                          : []),
                      ],
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      select: { date: true, isRecurring: true },
    });

    const holidayDates = new Set<string>();
    for (const holiday of holidays) {
      holidayDates.add(dateKey(holiday.date));

      // A recurring holiday is this year's row plus the same month and day in the
      // surrounding years. Derived from `date` rather than stored beside it,
      // because a stored `month`/`day` pair is a second copy of the date that can
      // disagree with it — and a holiday that lands on the wrong day two years out
      // is a working day somebody does not get.
      if (holiday.isRecurring) {
        const month = String(holiday.date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(holiday.date.getUTCDate()).padStart(2, '0');
        const thisYear = holiday.date.getUTCFullYear();
        for (const year of [thisYear - 1, thisYear + 1]) {
          holidayDates.add(`${year}-${month}-${day}`);
        }
      }
    }

    return {
      weekendDays: org?.weekendDays?.length ? org.weekendDays : [6, 7],
      holidayDates: [...holidayDates],
    };
  }

  /** The employee's own policy, else the organization default, else a documented floor. */
  async resolvePolicy(
    leavePolicyId: string | null,
    organizationId: string,
    tx: Tx = this.prisma,
  ) {
    if (leavePolicyId) {
      const own = await tx.leavePolicy.findFirst({
        where: { id: leavePolicyId, organizationId },
        select: {
          id: true,
          code: true,
          name: true,
          annualEntitlementDays: true,
          carryoverLimitDays: true,
          minNoticeDays: true,
          minNoticeWaivedDays: true,
          unpaidAllowed: true,
          maxConsecutiveDays: true,
        },
      });
      if (own) return this.policyInput(own);
    }

    const fallback = await tx.leavePolicy.findFirst({
      where: { organizationId, isDefault: true, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        annualEntitlementDays: true,
        carryoverLimitDays: true,
        minNoticeDays: true,
        minNoticeWaivedDays: true,
        unpaidAllowed: true,
        maxConsecutiveDays: true,
      },
    });

    if (fallback) return this.policyInput(fallback);

    // Nothing configured at all. Reported rather than assumed, because a silently
    // invented entitlement is how a company ends up owing leave it never granted.
    return {
      id: null,
      code: 'UNCONFIGURED',
      name: 'No policy configured',
      annualEntitlementDays: 0,
      carryoverLimitDays: null,
      minNoticeDays: 0,
      minNoticeWaivedDays: 1,
      unpaidAllowed: true,
      maxConsecutiveDays: null,
    };
  }

  private policyInput(policy: {
    id: string;
    code: string;
    name: string;
    annualEntitlementDays: unknown;
    carryoverLimitDays: unknown;
    minNoticeDays: number;
    minNoticeWaivedDays: number;
    unpaidAllowed: boolean;
    maxConsecutiveDays: number | null;
  }) {
    return {
      id: policy.id,
      code: policy.code,
      name: policy.name,
      annualEntitlementDays: num(policy.annualEntitlementDays as never),
      carryoverLimitDays:
        policy.carryoverLimitDays == null
          ? null
          : num(policy.carryoverLimitDays as never),
      minNoticeDays: policy.minNoticeDays,
      minNoticeWaivedDays: policy.minNoticeWaivedDays,
      unpaidAllowed: policy.unpaidAllowed,
      maxConsecutiveDays: policy.maxConsecutiveDays,
    };
  }

  private policyView(policy: {
    code: string;
    annualEntitlementDays: number;
    [key: string]: unknown;
  }) {
    return {
      code: policy.code,
      annualEntitlementDays: policy.annualEntitlementDays,
      unconfigured: policy.code === 'UNCONFIGURED',
    };
  }

  /**
   * A login may only be linked to one employee, and only within one organization.
   *
   * Both halves matter. Without the organization check a manager in one company
   * could attach their own login to an employee record in another and read that
   * person's salary through a self-service screen.
   */
  private async assertUserLinkable(
    userId: string,
    organizationId: string,
    forEmployeeId?: string,
  ) {
    const user = await requireRecord(
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true, email: true },
      }),
      'User',
    );

    const already = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        id: forEmployeeId ? { not: forEmployeeId } : undefined,
      },
      select: { id: true, employeeNumber: true },
    });

    if (already) {
      throw new ConflictException(
        `${user.email} is already the login for employee ${already.employeeNumber}. One person is one employee record; link this record to a different login, or unlink the other one first.`,
      );
    }
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: EmployeeFilters,
  ): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.status === 'active') where.isActive = true;
    else if (filters.status === 'inactive') where.isActive = false;
    else if (!filters.includeInactive) where.isActive = true;

    if (filters.employmentType) {
      where.employmentType = filters.employmentType as EmploymentType;
    }
    if (filters.department)
      where.department = { equals: filters.department, mode: 'insensitive' };
    if (filters.hasUser === 'true') where.userId = { not: null };
    if (filters.hasUser === 'false') where.userId = null;

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { preferredName: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * The directory shape.
   *
   * Takes the narrow `select` as its parameter type, so a field that is not in
   * `DIRECTORY_SELECT` cannot be referenced here even by accident.
   */
  private directoryView(row: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    department: string | null;
    jobTitle: string | null;
    employmentType: string;
    hireDate: Date;
    terminationDate: Date | null;
    isActive: boolean;
    userId: string | null;
    salaryCurrency: string;
    payFrequency: string;
  }) {
    return {
      ...row,
      displayName: row.preferredName || `${row.firstName} ${row.lastName}`,
      legalName: `${row.firstName} ${row.lastName}`,
      hasLogin: Boolean(row.userId),
      tenureYears:
        Math.round(
          (((row.terminationDate ?? new Date()).getTime() -
            row.hireDate.getTime()) /
            (365.25 * 86400000)) *
            10,
        ) / 10,
    };
  }

  private payslipSummary(payslip: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
    currency: string;
    basicSalary: unknown;
    payrollRun: { id: string; reference: string; status: string };
  }) {
    return {
      id: payslip.id,
      reference: payslip.payrollRun.reference,
      runId: payslip.payrollRun.id,
      runStatus: payslip.payrollRun.status,
      periodStart: payslip.periodStart,
      periodEnd: payslip.periodEnd,
      payDate: payslip.payDate,
      currency: payslip.currency,
      basicSalary: num(payslip.basicSalary as never),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('employees_organizationId_employeeNumber') ||
      (message.includes('Unique constraint') &&
        (message.includes('employeeNumber') || message.includes('userId')))
    );
  }
}
