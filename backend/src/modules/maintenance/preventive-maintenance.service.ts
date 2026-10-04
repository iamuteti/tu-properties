import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  AssetStatus,
  AssetType,
  MaintenanceCategory,
  PmRunStatus,
  Prisma,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { AuditService } from '@/modules/audit/audit.service';
import { addUtcDays, dayOf, nextDueDate } from './work-order-lifecycle';
import type {
  CreatePmScheduleDto,
  UpdatePmScheduleDto,
} from './dto/maintenance.dto';

type Tx = Prisma.TransactionClient;

const SCHEDULE_INCLUDE = {
  asset: {
    select: {
      id: true,
      name: true,
      type: true,
      assetTag: true,
      status: true,
      property: { select: { id: true, name: true } },
    },
  },
  assignedTechnician: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

/** Which trade a given machine's service belongs to. */
const CATEGORY_FOR_ASSET: Partial<Record<AssetType, MaintenanceCategory>> = {
  WATER_PUMP: MaintenanceCategory.PLUMBING,
  GENERATOR: MaintenanceCategory.ELECTRICAL,
  HVAC: MaintenanceCategory.ELECTRICAL,
  ELEVATOR: MaintenanceCategory.OTHER,
  CCTV: MaintenanceCategory.SECURITY,
};

/**
 * Module 9 — preventive maintenance.
 *
 * A schedule is a promise that somebody will look at the machine on a date
 * whether or not anybody complains. The generator that only gets looked at when
 * it fails is the whole reason this table exists, so the sweep that raises the
 * work orders is the load-bearing part of this module.
 *
 * Three decisions worth keeping:
 *
 * 1. **Idempotency is the database's job.** `WorkOrder` carries
 *    `pmScheduleId` + `pmDueOn` behind a unique constraint, so a sweep that runs
 *    twice — a second instance, a manual run after a restart, a scheduler that
 *    fires twice before anybody notices — cannot raise the same service twice for
 *    one period. It reports *skipped*, which is the correct outcome, exactly as
 *    the recurring billing job does.
 * 2. **The interval is the schedule, not a list of dates.** `nextDueAt` is
 *    recomputed from the service that just happened, so one missed month does not
 *    shift every month after it.
 * 3. **One bad schedule never aborts the sweep.** Every outcome is recorded per
 *    schedule in `details`; a single asset with a deleted technician must not
 *    stop the other forty from being serviced.
 */
@Injectable()
export class PreventiveMaintenanceService {
  private readonly logger = new Logger(PreventiveMaintenanceService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // =================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: { assetId?: string; propertyId?: string; active?: boolean } = {},
  ) {
    const rows = await this.prisma.preventiveMaintenanceSchedule.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(filters.assetId ? { assetId: filters.assetId } : {}),
        ...(filters.propertyId
          ? { asset: { propertyId: filters.propertyId } }
          : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {}),
      },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ nextDueAt: 'asc' }],
      take: 500,
    });

    const now = new Date();
    return rows.map((row) => ({
      ...row,
      overdue: row.active && row.nextDueAt < now,
      daysUntilDue: Math.ceil(
        (row.nextDueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      ),
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const schedule = await requireRecord(
      this.prisma.preventiveMaintenanceSchedule.findFirst({
        where: { id, organizationId },
        include: SCHEDULE_INCLUDE,
      }),
      'Maintenance schedule',
    );

    const workOrders = await this.prisma.workOrder.findMany({
      where: { pmScheduleId: id },
      select: {
        id: true,
        reference: true,
        status: true,
        title: true,
        reportedAt: true,
        scheduledFor: true,
        completedAt: true,
        resolutionNote: true,
        pmDueOn: true,
      },
      orderBy: { reportedAt: 'desc' },
      take: 24,
    });

    return {
      ...schedule,
      overdue: schedule.active && schedule.nextDueAt < new Date(),
      workOrders,
    };
  }

  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const now = new Date();
    const horizon = addUtcDays(now, 7);

    const schedules = await this.prisma.preventiveMaintenanceSchedule.findMany({
      where: { ...base, active: true },
      select: { nextDueAt: true },
      take: 5000,
    });

    return {
      active: schedules.length,
      overdue: schedules.filter((row) => row.nextDueAt < now).length,
      dueThisWeek: schedules.filter(
        (row) => row.nextDueAt >= now && row.nextDueAt <= horizon,
      ).length,
    };
  }

  async findRuns(organizationId: string | undefined, limit = 25) {
    return this.prisma.preventiveMaintenanceRun.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  // ================================================================== writes

  async create(dto: CreatePmScheduleDto, organizationId: string) {
    const asset = await this.assertAsset(dto.assetId, organizationId);
    await this.assertTechnician(dto.assignedTechnicianId, organizationId);

    const nextDueAt = dto.nextDueAt
      ? dayOf(new Date(dto.nextDueAt))
      : addUtcDays(new Date(), 1);

    const schedule = await this.prisma.preventiveMaintenanceSchedule.create({
      data: {
        organization: { connect: { id: organizationId } },
        asset: { connect: { id: dto.assetId } },
        title: dto.title.trim(),
        ...(dto.description ? { description: dto.description.trim() } : {}),
        frequencyDays: dto.frequencyDays,
        leadTimeDays: dto.leadTimeDays ?? 0,
        ...(dto.checklist?.length
          ? { checklist: dto.checklist as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.assignedTechnicianId
          ? { assignedTechnician: { connect: { id: dto.assignedTechnicianId } } }
          : {}),
        nextDueAt,
        ...(dto.notes ? { notes: dto.notes.trim() } : {}),
      },
      include: SCHEDULE_INCLUDE,
    });

    await this.auditSchedule('PM_SCHEDULE_CREATED', schedule, organizationId);
    return schedule;
  }

  async update(
    id: string,
    dto: UpdatePmScheduleDto,
    organizationId: string,
  ) {
    await this.record(id, organizationId);
    await this.assertTechnician(dto.assignedTechnicianId, organizationId);

    const schedule = await this.prisma.preventiveMaintenanceSchedule.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.frequencyDays !== undefined
          ? { frequencyDays: dto.frequencyDays }
          : {}),
        ...(dto.leadTimeDays !== undefined
          ? { leadTimeDays: dto.leadTimeDays }
          : {}),
        ...(dto.checklist !== undefined
          ? {
              checklist:
                dto.checklist.length > 0
                  ? (dto.checklist as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
            }
          : {}),
        ...(dto.nextDueAt
          ? { nextDueAt: dayOf(new Date(dto.nextDueAt)) }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.assignedTechnicianId !== undefined
          ? dto.assignedTechnicianId
            ? { assignedTechnician: { connect: { id: dto.assignedTechnicianId } } }
            : { assignedTechnician: { disconnect: true } }
          : {}),
      },
      include: SCHEDULE_INCLUDE,
    });

    await this.auditSchedule('PM_SCHEDULE_UPDATED', schedule, organizationId);
    return schedule;
  }

  async remove(id: string, organizationId: string) {
    await this.record(id, organizationId);

    const open = await this.prisma.workOrder.count({
      where: {
        pmScheduleId: id,
        status: { in: ['REQUESTED', 'INSPECTION', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'] },
      },
    });

    if (open > 0) {
      throw new ConflictException(
        `This schedule has ${open} open work order${open === 1 ? '' : 's'} from it. Finish or cancel ${open === 1 ? 'it' : 'them'} first, or pause the schedule instead of deleting it.`,
      );
    }

    await this.prisma.preventiveMaintenanceSchedule.delete({ where: { id } });
    await this.auditSchedule(
      'PM_SCHEDULE_DELETED',
      { id, organizationId },
      organizationId,
    );
    return { message: 'Maintenance schedule deleted.' };
  }

  // =================================================================== sweep

  /**
   * Raise the work orders that are due, for every active organization.
   *
   * Called by the daily cron and available as an endpoint, because the first
   * service after a deployment should not have to wait for 02:30 — and because
   * running it by hand for one organization is how a missed day is recovered
   * without raising everybody's work twice (the unique constraint makes that
   * safe).
   */
  async runForAllOrganizations(onDate: Date = new Date(), triggeredBy?: string) {
    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const results: Awaited<
      ReturnType<PreventiveMaintenanceService['runForOrganization']>
    >[] = [];
    for (const organization of organizations) {
      results.push(await this.runForOrganization(organization.id, onDate, triggeredBy));
    }

    this.logger.log(
      `Preventive maintenance sweep: ${organizations.length} org(s), ${results.reduce(
        (sum, run) => sum + run.workOrdersCreated,
        0,
      )} work order(s) raised, ${results.reduce(
        (sum, run) => sum + run.schedulesSkipped,
        0,
      )} skipped`,
    );

    return results;
  }

  /**
   * Raise one organization's due preventive work orders.
   *
   * "Due" means the service window has opened — `nextDueAt` minus the schedule's
   * own lead time — so a monthly generator job can be raised a week early to
   * give time to book a contractor, which is the difference between preventive
   * and merely-not-broken.
   */
  async runForOrganization(
    organizationId: string | undefined,
    onDate: Date = new Date(),
    triggeredBy?: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException(
        'A tenant scope is required to run preventive maintenance',
      );
    }

    const today = dayOf(onDate);

    const run = await this.prisma.preventiveMaintenanceRun.create({
      data: {
        organizationId,
        runOn: today,
        status: PmRunStatus.RUNNING,
        triggeredBy,
      },
    });

    const details: Record<string, string> = {};
    let created = 0;
    let skipped = 0;
    let failed = 0;

    // Every active schedule, filtered for "its window has opened" in memory: the
    // lead time belongs to each schedule, so a single SQL comparison against
    // `today` would either raise everything early or never raise anything early.
    const schedules = await this.prisma.preventiveMaintenanceSchedule.findMany({
      where: { organizationId, active: true },
      include: {
        asset: { select: { id: true, name: true, type: true, status: true } },
      },
      take: 2000,
    });

    for (const schedule of schedules) {
      const dueOn = dayOf(schedule.nextDueAt);
      const windowOpened = addUtcDays(dueOn, -schedule.leadTimeDays);

      if (windowOpened > today) {
        details[schedule.id] = `skipped: not due until ${windowOpened
          .toISOString()
          .slice(0, 10)}`;
        skipped += 1;
        continue;
      }

      const reason = this.skipReason(schedule);
      if (reason) {
        details[schedule.id] = `skipped: ${reason}`;
        skipped += 1;
        continue;
      }

      try {
        const outcome = await this.raise(schedule, dueOn, today);
        details[schedule.id] = outcome.created
          ? `raised ${outcome.reference}`
          : 'skipped: already raised for this period';
        if (outcome.created) created += 1;
        else skipped += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A unique-constraint failure *is* the idempotency guard doing its job,
        // not a failure worth alarming anybody about.
        if (message.includes('pmScheduleId') || message.includes('pmDueOn')) {
          details[schedule.id] = 'skipped: already raised for this period';
          skipped += 1;
        } else {
          details[schedule.id] = `failed: ${message.slice(0, 200)}`;
          failed += 1;
        }
      }
    }

    const finished = await this.prisma.preventiveMaintenanceRun.update({
      where: { id: run.id },
      data: {
        schedulesConsidered: schedules.length,
        workOrdersCreated: created,
        schedulesSkipped: skipped,
        schedulesFailed: failed,
        details: details as Prisma.InputJsonObject,
        status:
          failed > 0 ? PmRunStatus.FAILED : PmRunStatus.COMPLETED,
        finishedAt: new Date(),
        ...(failed > 0 ? { errorMessage: `${failed} schedule(s) failed` } : {}),
      },
    });

    return finished;
  }

  /** Raise one schedule's work order now, by hand. */
  async runOne(id: string, organizationId: string, userId?: string) {
    const schedule = await this.prisma.preventiveMaintenanceSchedule.findFirst({
      where: { id, organizationId },
      include: {
        asset: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
    });

    if (!schedule) {
      throw new ConflictException('Maintenance schedule not found.');
    }
    if (!schedule.active) {
      throw new ConflictException(
        'This schedule is paused. Resume it before raising work against it.',
      );
    }

    const reason = this.skipReason(schedule);
    if (reason) {
      throw new ConflictException(
        `This service cannot be raised right now: ${reason}.`,
      );
    }

    // The same due-window test the sweep applies, so "run it now" means "raise
    // this period", not "raise the next period early": without it, a second
    // hand-run books a service three months before it is due.
    const today = dayOf(new Date());
    const windowOpened = addUtcDays(
      dayOf(schedule.nextDueAt),
      -schedule.leadTimeDays,
    );
    if (windowOpened > today) {
      throw new ConflictException(
        `This service is not due until ${windowOpened
          .toISOString()
          .slice(0, 10)}. It opens ${schedule.leadTimeDays} day(s) early on that date.`,
      );
    }

    const dueOn = dayOf(schedule.nextDueAt);
    const outcome = await this.raise(schedule, dueOn, today);

    if (outcome.created) {
      await this.auditSchedule(
        'PM_WORK_ORDER_RAISED',
        schedule,
        organizationId,
        { workOrderId: outcome.id, userId },
      );
    }

    return outcome;
  }

  /**
   * The daily sweep.
   *
   * Early morning, after yesterday's postings have committed — the same window
   * the billing and reminder jobs use, so all three are visible together in the
   * logs of a morning.
   */
  @Cron('0 30 2 * * *')
  async scheduledSweep() {
    try {
      await this.runForAllOrganizations(new Date());
    } catch (error) {
      this.logger.error(
        `Scheduled preventive maintenance failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ================================================================= helpers

  /**
   * Why this service cannot be raised, or null when it can.
   *
   * A retired asset is the important case: it is history, and history does not
   * need servicing.
   */
  private skipReason(schedule: {
    asset?: { status?: string; name?: string } | null;
    frequencyDays?: number;
  }): string | null {
    if (!schedule.asset) return 'the asset no longer exists';
    if (schedule.asset.status === AssetStatus.RETIRED) {
      return `${schedule.asset.name} is retired`;
    }
    if (!schedule.frequencyDays || schedule.frequencyDays < 1) {
      return 'the schedule has no interval';
    }
    return null;
  }

  /**
   * Create the work order for one due period.
   *
   * The checklist is copied here rather than read from the schedule at display
   * time, so a historic visit keeps the list it was actually performed against
   * even after the schedule is rewritten.
   */
  private async raise(
    schedule: {
      id: string;
      organizationId: string;
      title: string;
      description: string | null;
      checklist: unknown;
      asset: { id: string; name: string; type: AssetType; status: string };
      assetId: string;
      assignedTechnicianId: string | null;
      frequencyDays: number;
      nextDueAt: Date;
      leadTimeDays: number;
    },
    dueOn: Date,
    today: Date,
  ): Promise<{ created: boolean; id?: string; reference?: string }> {
    const checklist = Array.isArray(schedule.checklist)
      ? (schedule.checklist as string[])
      : [];

    try {
      return await this.prisma.$transaction(async (tx) => {
        const reference = await this.nextReference(
          schedule.organizationId,
          tx,
        );

        const workOrder = await tx.workOrder.create({
          data: {
            organization: { connect: { id: schedule.organizationId } },
            reference,
            title: `${schedule.title} — ${schedule.asset.name}`,
            description:
              schedule.description?.trim() ||
              `Scheduled preventive maintenance for ${schedule.asset.name}. Due ${dueOn
                .toISOString()
                .slice(0, 10)}.`,
            category: CATEGORY_FOR_ASSET[schedule.asset.type] ?? MaintenanceCategory.OTHER,
            // Preventive work is planned, not urgent: raising it as HIGH would
            // train the team to ignore priorities.
            priority: WorkOrderPriority.NORMAL,
            status: WorkOrderStatus.REQUESTED,
            source: WorkOrderSource.PREVENTIVE,
            reportedAt: today,
            asset: { connect: { id: schedule.assetId } },
            property: {
              connect: {
                id: (
                  await tx.asset.findUniqueOrThrow({
                    where: { id: schedule.assetId },
                    select: { propertyId: true },
                  })
                ).propertyId,
              },
            },
            ...(schedule.assignedTechnicianId
              ? { assignedTechnician: { connect: { id: schedule.assignedTechnicianId } } }
              : {}),
            pmSchedule: { connect: { id: schedule.id } },
            pmDueOn: dueOn,
            tasks: {
              create: checklist.map((step, index) => ({
                organizationId: schedule.organizationId,
                description: step,
                sortOrder: index,
              })),
            },
          },
        });

        // The clock moves from the period just serviced, not from today: a job
        // run five months late slips once, it does not stay five months behind.
        await tx.preventiveMaintenanceSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: today,
            nextDueAt: nextDueDate(dueOn, schedule.frequencyDays, today),
          },
        });

        // The asset is now on its service list until the work order closes.
        if (schedule.asset.status === AssetStatus.OPERATIONAL) {
          await tx.asset.update({
            where: { id: schedule.assetId },
            data: { status: AssetStatus.SERVICE_DUE },
          });
        }

        return { created: true, id: workOrder.id, reference: workOrder.reference };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('pmScheduleId') ||
        message.includes('pmDueOn') ||
        message.includes('already raised')
      ) {
        return { created: false };
      }
      throw error;
    }
  }

  /** The same `WO-YYYY-NNNN` sequence work orders use. */
  private async nextReference(organizationId: string, tx: Tx) {
    const prefix = `WO-${new Date().getFullYear()}-`;
    const last = await tx.workOrder.findFirst({
      where: { organizationId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const sequence = last
      ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1
      : 1;

    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }

  private async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.preventiveMaintenanceSchedule.findFirst({
        where: { id, organizationId },
      }),
      'Maintenance schedule',
    );
  }

  private async assertAsset(assetId: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.asset.findFirst({
        where: {
          id: assetId,
          ...(organizationId ? { organizationId } : {}),
        },
        select: { id: true, name: true, status: true },
      }),
      'Asset',
    );
  }

  private async assertTechnician(id: string | undefined, organizationId: string | undefined) {
    if (!id) return;

    const technician = await this.prisma.user.findFirst({
      where: {
        id,
        isActive: true,
        portalTenantId: null,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true },
    });

    if (!technician) {
      throw new BadRequestException(
        'That person is not an active member of this organization.',
      );
    }
  }

  private async auditSchedule(
    action: string,
    schedule: { id: string; organizationId: string; title?: string },
    organizationId: string | undefined,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await this.audit.logAction({
        action,
        entity: 'PreventiveMaintenanceSchedule',
        entityId: schedule.id,
        details: JSON.stringify({ title: schedule.title ?? null, ...extra }),
        ipAddress: null,
        userAgent: null,
        ...(extra.userId
          ? { user: { connect: { id: extra.userId as string } } }
          : {}),
        organization: {
          connect: { id: schedule.organizationId ?? organizationId },
        },
      });
    } catch {
      // Best-effort.
    }
  }
}
