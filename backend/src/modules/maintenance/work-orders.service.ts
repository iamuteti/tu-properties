import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  MaintenanceCategory,
  Prisma,
  UserRole,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { getPortalTenantId, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { AuditService } from '@/modules/audit/audit.service';
import { StockMovementsService } from '@/modules/inventory/stock-movements.service';
import type { IssueStockDto } from '@/modules/inventory/dto/inventory.dto';
import { MaintenanceNotificationsService } from './maintenance-notifications.service';
import {
  checkWorkOrderAction,
  hoursRemaining,
  isOverdue,
  offerableWorkOrderActions,
  statusLabel,
  type WorkOrderAction,
  type WorkOrderGateContext,
} from './work-order-lifecycle';
import type {
  AssignWorkOrderDto,
  BulkAssignWorkOrdersDto,
  CancelWorkOrderDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  CreateWorkOrderTaskDto,
  InspectWorkOrderDto,
  ReportIssueDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderTaskDto,
  WorkOrderFilters,
} from './dto/maintenance.dto';

type Tx = Prisma.TransactionClient;

const WORK_ORDER_EXPORT_HEADERS = [
  'reference',
  'status',
  'priority',
  'category',
  'title',
  'property',
  'unit',
  'tenant',
  'technician',
  'source',
  'reportedAt',
  'scheduledFor',
  'completedAt',
  'estimatedCost',
  'actualCost',
];

/** What a resident may see of a work order: never the internal cost notes. */
const PORTAL_INCLUDE = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true } },
  assignedTechnician: { select: { id: true, firstName: true, lastName: true } },
} as const;

const STAFF_INCLUDE = {
  property: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, property: { select: { name: true } } } },
  tenant: {
    select: {
      id: true,
      code: true,
      accountNumber: true,
      surname: true,
      otherNames: true,
      phone: true,
      email: true,
    },
  },
  asset: { select: { id: true, name: true, type: true, assetTag: true } },
  assignedTechnician: {
    select: { id: true, firstName: true, lastName: true, phone: true },
  },
  raisedBy: { select: { id: true, firstName: true, lastName: true } },
  tasks: { orderBy: { sortOrder: 'asc' as const } },
} as const;

/** The three states that are still live work. Everything else is history. */
export const OPEN_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.REQUESTED,
  WorkOrderStatus.INSPECTION,
  WorkOrderStatus.APPROVED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
];

/**
 * Module 9 — Work orders.
 *
 * The rules live in `work-order-lifecycle.ts` and are pure; this class owns
 * persistence, tenant scoping and the notifications. Three properties are worth
 * knowing before reading it:
 *
 * 1. `status` is never written directly. Every move goes through an action
 *    endpoint that checks the gate first, so an APPROVED work order always has
 *    an inspection behind it and a COMPLETED one always has a resolution note.
 * 2. Every reference (property, unit, tenant, asset, technician) is verified
 *    against the caller's organization *before* it is connected — the same
 *    cross-tenant write Module 2 closed for units (master doc issue 26).
 * 3. Notification failures never fail the transition. The state change is the
 *    record; a message that could not be queued is a delivery problem, and
 *    refusing to complete a repair because a row could not be inserted is worse
 *    than a resident who finds out by opening the portal.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: MaintenanceNotificationsService,
    private stock: StockMovementsService,
  ) {}

  // ==================================================================== reads

  async findAll(organizationId: string | undefined, filters: WorkOrderFilters = {}) {
    const rows = await this.prisma.workOrder.findMany({
      where: this.buildWhere(organizationId, filters),
      include: STAFF_INCLUDE,
      orderBy: [{ status: 'asc' }, { reportedAt: 'desc' }],
      take: 500,
    });

    return rows.map((row) => this.decorate(row));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const row = await requireRecord(
      this.prisma.workOrder.findFirst({
        where: { id, organizationId },
        include: STAFF_INCLUDE,
      }),
      'Work order',
    );

    return this.decorate(row);
  }

  /**
   * Counts for the dashboard card and the board header.
   *
   * `overdue` and `unassigned` are computed here rather than stored: both are
   * derived from the response window in `work-order-lifecycle` and from "has an
   * assignee", and a stored flag would have to be re-derived on every
   * transition anyway — the definition of a second source of truth.
   */
  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const [byStatus, byCategory, all] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { ...base, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['category'],
        where: { ...base, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.workOrder.findMany({
        where: { ...base, status: { in: OPEN_STATUSES } },
        select: {
          priority: true,
          reportedAt: true,
          status: true,
          scheduledFor: true,
          assignedTechnicianId: true,
        },
        take: 5000,
      }),
    ]);

    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);

    return {
      open: all.length,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<WorkOrderStatus, number>>,
      byCategory: Object.fromEntries(
        byCategory.map((row) => [row.category, row._count._all]),
      ) as Partial<Record<MaintenanceCategory, number>>,
      overdue: all.filter((row) => isOverdue(row, now)).length,
      emergency: all.filter((row) => row.priority === WorkOrderPriority.EMERGENCY)
        .length,
      unassigned: all.filter((row) => !row.assignedTechnicianId).length,
      scheduledThisWeek: all.filter(
        (row) =>
          row.status === WorkOrderStatus.ASSIGNED &&
          row.scheduledFor !== null &&
          row.scheduledFor >= now &&
          row.scheduledFor <= week,
      ).length,
      awaitingApproval: all.filter((row) => row.status === WorkOrderStatus.INSPECTION)
        .length,
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: WorkOrderFilters = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, filters);
    return toCsv(
      WORK_ORDER_EXPORT_HEADERS,
      rows.map((row) => {
        const record = row as unknown as {
          reference: string;
          status: string;
          priority: string;
          category: string;
          title: string;
          reportedAt: Date;
          scheduledFor: Date | null;
          completedAt: Date | null;
          estimatedCost: unknown;
          actualCost: unknown;
          property?: { name?: string | null } | null;
          unit?: { name?: string | null } | null;
          tenant?: { surname?: string | null; otherNames?: string | null } | null;
          assignedTechnician?: { firstName?: string | null; lastName?: string | null } | null;
          source: string;
        };
        return {
          reference: record.reference,
          status: record.status,
          priority: record.priority,
          category: record.category,
          title: record.title,
          property: record.property?.name ?? '',
          unit: record.unit?.name ?? '',
          tenant: [record.tenant?.surname, record.tenant?.otherNames]
            .filter(Boolean)
            .join(' '),
          technician: [
            record.assignedTechnician?.firstName,
            record.assignedTechnician?.lastName,
          ]
            .filter(Boolean)
            .join(' '),
          source: record.source,
          reportedAt: record.reportedAt?.toISOString() ?? '',
          scheduledFor: record.scheduledFor?.toISOString() ?? '',
          completedAt: record.completedAt?.toISOString() ?? '',
          estimatedCost: record.estimatedCost?.toString() ?? '',
          actualCost: record.actualCost?.toString() ?? '',
        };
      }),
    );
  }

  // =================================================================== writes

  /**
   * Raise a work order from the staff side.
   *
   * The reference is allocated here rather than by the client, and the whole
   * create is retried on a unique-collision: two staff raising a fault at the
   * same second must not produce one work order and one 500.
   */
  async create(
    dto: CreateWorkOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    await this.assertReferences(organizationId, {
      propertyId: dto.propertyId,
      unitId: dto.unitId,
      tenantId: dto.tenantId,
      assetId: dto.assetId,
      technicianId: dto.assignedTechnicianId,
    });

    if (dto.unitId && !dto.propertyId) {
      // Derive it rather than storing a work order with a unit but no property:
      // every list, board column and export groups by property.
      const unit = await this.prisma.unit.findUnique({
        where: { id: dto.unitId },
        select: { propertyId: true },
      });
      dto.propertyId = unit?.propertyId ?? undefined;
    }

    const input = {
      organization: { connect: { id: organizationId } },
      title: dto.title.trim(),
      description: dto.description.trim(),
      category: dto.category,
      priority: dto.priority ?? WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.REQUESTED,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(),
      ...(dto.propertyId ? { property: { connect: { id: dto.propertyId } } } : {}),
      ...(dto.unitId ? { unit: { connect: { id: dto.unitId } } } : {}),
      ...(dto.tenantId ? { tenant: { connect: { id: dto.tenantId } } } : {}),
      ...(dto.assetId ? { asset: { connect: { id: dto.assetId } } } : {}),
      ...(dto.assignedTechnicianId
        ? { assignedTechnician: { connect: { id: dto.assignedTechnicianId } } }
        : {}),
      ...(dto.accessInstructions
        ? { accessInstructions: dto.accessInstructions.trim() }
        : {}),
      ...(dto.estimatedCost !== undefined
        ? { estimatedCost: new Prisma.Decimal(dto.estimatedCost) }
        : {}),
      ...(dto.scheduledFor
        ? { scheduledFor: new Date(dto.scheduledFor) }
        : {}),
      ...(userId ? { raisedBy: { connect: { id: userId } } } : {}),
    } satisfies Omit<Prisma.WorkOrderCreateInput, 'reference'>;

    const created = await this.createWithReference(input);
    await this.notifications.announceNewWorkOrder(created);
    return this.findOne(created.id, organizationId);
  }

  /**
   * The resident's report from the portal.
   *
   * The tenant, unit and property all come from the session's lease — nothing
   * about *where* the fault is or *whose* it is comes from the client, so a
   * resident cannot file a work order against another household's unit.
   */
  async createFromPortal(dto: ReportIssueDto, request: any) {
    const tenantId = getPortalTenantId(request);

    const lease = await this.prisma.rentalAgreement.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        organizationId: true,
        unitId: true,
        unit: { select: { propertyId: true } },
      },
    });

    if (!lease?.organizationId) {
      throw new BadRequestException(
        'You need an active lease before you can report a maintenance issue.',
      );
    }

    const input = {
      organization: { connect: { id: lease.organizationId } },
      title: dto.title.trim(),
      description: dto.description.trim(),
      category: dto.category,
      priority: dto.priority ?? WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.REQUESTED,
      source: WorkOrderSource.TENANT_PORTAL,
      reportedAt: new Date(),
      tenant: { connect: { id: tenantId } },
      ...(lease.unitId ? { unit: { connect: { id: lease.unitId } } } : {}),
      ...(lease.unit?.propertyId
        ? { property: { connect: { id: lease.unit.propertyId } } }
        : {}),
      ...(dto.accessInstructions
        ? { accessInstructions: dto.accessInstructions.trim() }
        : {}),
    } satisfies Omit<Prisma.WorkOrderCreateInput, 'reference'>;

    const created = await this.createWithReference(input);
    await this.notifications.announceNewWorkOrder(created);
    return this.portalView(created);
  }

  /**
   * A maintenance request approved out of the resident request queue.
   *
   * Delegated rather than reimplemented: approving a `MAINTENANT` tenant request
   * now produces the same work order a phone call would, so the queue stops
   * recording `RECORDED_ONLY` for the one type that has an owning module now.
   */
  async createFromTenantRequest(args: {
    requestId: string;
    tenantId: string;
    organizationId: string;
    description: string;
    payload?: { category?: string; priority?: string; title?: string } | null;
    userId?: string;
  }) {
    const lease = await this.prisma.rentalAgreement.findFirst({
      where: { tenantId: args.tenantId, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      select: {
        organizationId: true,
        unitId: true,
        unit: { select: { propertyId: true } },
      },
    });

    const category = toEnum(MaintenanceCategory, args.payload?.category);
    if (!category) {
      throw new BadRequestException(
        `Maintenance request ${args.requestId} has no usable category, so it cannot become a work order.`,
      );
    }

    const input = {
      organization: { connect: { id: args.organizationId } },
      title: args.payload?.title?.trim() || defaultTitle(category),
      description: args.description.trim(),
      category,
      priority:
        toEnum(WorkOrderPriority, args.payload?.priority) ?? WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.REQUESTED,
      source: WorkOrderSource.TENANT_REQUEST,
      reportedAt: new Date(),
      tenant: { connect: { id: args.tenantId } },
      ...(lease?.unitId ? { unit: { connect: { id: lease.unitId } } } : {}),
      ...(lease?.unit?.propertyId
        ? { property: { connect: { id: lease.unit.propertyId } } }
        : {}),
      ...(args.userId ? { raisedBy: { connect: { id: args.userId } } } : {}),
    } satisfies Omit<Prisma.WorkOrderCreateInput, 'reference'>;

    const created = await this.createWithReference(input);
    await this.notifications.announceNewWorkOrder(created);
    return this.findOne(created.id, args.organizationId);
  }

  /**
   * Update the descriptive fields.
   *
   * No status, no assignment, no money: those move through their own endpoints
   * so each one is audited with an actor and a reason.
   */
  async update(id: string, dto: UpdateWorkOrderDto, organizationId: string) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status === WorkOrderStatus.CLOSED ||
      existing.status === WorkOrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        `This work order is ${statusLabel(
          existing.status,
        ).toLowerCase()} and its record can no longer be edited.`,
      );
    }

    await this.assertReferences(organizationId, {
      propertyId: dto.propertyId,
      unitId: dto.unitId,
      assetId: dto.assetId,
    });

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.accessInstructions !== undefined
          ? { accessInstructions: dto.accessInstructions?.trim() || null }
          : {}),
        ...(dto.estimatedCost !== undefined
          ? { estimatedCost: new Prisma.Decimal(dto.estimatedCost) }
          : {}),
        ...(dto.scheduledFor !== undefined
          ? { scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null }
          : {}),
        ...(dto.propertyId !== undefined
          ? dto.propertyId
            ? { property: { connect: { id: dto.propertyId } } }
            : { property: { disconnect: true } }
          : {}),
        ...(dto.unitId !== undefined
          ? dto.unitId
            ? { unit: { connect: { id: dto.unitId } } }
            : { unit: { disconnect: true } }
          : {}),
        ...(dto.assetId !== undefined
          ? dto.assetId
            ? { asset: { connect: { id: dto.assetId } } }
            : { asset: { disconnect: true } }
          : {}),
      },
      include: STAFF_INCLUDE,
    });

    return this.decorate(updated);
  }

  /**
   * Delete a work order.
   *
   * Only while it is still a report. Once anybody has inspected, approved,
   * assigned or worked on it, the record is the audit trail and must be
   * cancelled instead — deleting it is how "we never got that complaint" happens.
   */
  async remove(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status !== WorkOrderStatus.REQUESTED &&
      existing.status !== WorkOrderStatus.INSPECTION
    ) {
      throw new ConflictException(
        `This work order is already ${statusLabel(
          existing.status,
        ).toLowerCase()}. Cancel it instead of deleting it — the record is the history.`,
      );
    }

    await this.prisma.workOrder.delete({ where: { id } });
    return { message: 'Work order deleted.' };
  }

  // ============================================================= transitions

  /** Record what the inspection found and move to INSPECTION. */
  async inspect(
    id: string,
    dto: InspectWorkOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'INSPECT', {
      inspectionNote: dto.inspectionNote,
    });

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.INSPECTION,
        inspectionNote: dto.inspectionNote.trim(),
        inspectedAt: new Date(),
        ...(dto.estimatedCost !== undefined
          ? { estimatedCost: new Prisma.Decimal(dto.estimatedCost) }
          : {}),
      },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, {
      action: 'INSPECT',
      estimatedCost: dto.estimatedCost,
    });
    return this.decorate(updated);
  }

  /**
   * Approve the work and put somebody on it, in one action.
   *
   * Two steps on purpose. An APPROVED work order that nobody is assigned to is
   * the classic way a job dies: it is off the technician's screen, it is nobody's
   * responsibility, and it never appears in an overdue report. So when there is
   * no approval policy to satisfy, approving asks "and who?" in the same breath.
   *
   * When an organization *has* configured a WORK_ORDER approval policy the flow
   * is different and goes through `WorkOrderApprovalsService`: the work order
   * sits in INSPECTION until the engine's last level says yes, lands in
   * APPROVED, and is assigned afterwards by `assign`.
   */
  async approve(
    id: string,
    dto: { technicianId: string; scheduledFor?: string; note?: string },
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    const technician = await this.assertTechnician(dto.technicianId, organizationId);

    // Only the APPROVE gate: this action *is* the assignment, so running ASSIGN
    // from INSPECTION would be asking the matrix a question about a state this
    // action deliberately bypasses.
    this.assertCanAct(existing, 'APPROVE', {
      inspectionNote: existing.inspectionNote,
    });

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.ASSIGNED,
        assignedTechnician: { connect: { id: technician.id } },
        ...(dto.scheduledFor
          ? { scheduledFor: new Date(dto.scheduledFor) }
          : {}),
        ...(dto.note?.trim()
          ? { inspectionNote: `${existing.inspectionNote ?? ''}\n\nApproved: ${dto.note.trim()}`.trim() }
          : {}),
      },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, {
      action: 'APPROVE_AND_ASSIGN',
      technicianId: technician.id,
    });
    await this.notifications.announceAssigned(updated);
    await this.notifications.announceStatusToTenant(updated);
    return this.decorate(updated);
  }

  /** Send it back out: either a different technician or a new date. */
  async assign(id: string, dto: AssignWorkOrderDto, organizationId: string) {
    const existing = await this.record(id, organizationId);
    const technician = await this.assertTechnician(dto.technicianId, organizationId);

    this.assertCanAct(existing, 'ASSIGN', {
      priority: existing.priority,
      hasTechnician: true,
      technicianActive: technician.isActive,
    });

    const reassignment = existing.assignedTechnicianId;
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.ASSIGNED,
        assignedTechnician: { connect: { id: technician.id } },
        ...(dto.scheduledFor
          ? { scheduledFor: new Date(dto.scheduledFor) }
          : {}),
      },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, technician.id, {
      action: reassignment ? 'REASSIGN' : 'ASSIGN',
      technicianId: technician.id,
      from: reassignment ?? null,
    });
    await this.notifications.announceAssigned(updated);
    return this.decorate(updated);
  }

  async start(id: string, organizationId: string, userId?: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'START', {});

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { status: WorkOrderStatus.IN_PROGRESS, startedAt: new Date() },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, { action: 'START' });
    await this.notifications.announceStatusToTenant(updated);
    return this.decorate(updated);
  }

  async complete(
    id: string,
    dto: CompleteWorkOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    const openTasks = await this.openTaskCount(id);

    this.assertCanAct(existing, 'COMPLETE', {
      resolutionNote: dto.resolutionNote,
      openTasks,
    });

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.COMPLETED,
        resolutionNote: dto.resolutionNote.trim(),
        completedAt: new Date(),
        ...(dto.actualCost !== undefined
          ? { actualCost: new Prisma.Decimal(dto.actualCost) }
          : {}),
      },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, {
      action: 'COMPLETE',
      actualCost: dto.actualCost,
    });
    await this.notifications.announceStatusToTenant(updated);
    return this.decorate(updated);
  }

  async close(id: string, organizationId: string, userId?: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'CLOSE', {});

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { status: WorkOrderStatus.CLOSED, closedAt: new Date() },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, { action: 'CLOSE' });
    await this.notifications.announceStatusToTenant(updated);
    return this.decorate(updated);
  }

  async cancel(
    id: string,
    dto: CancelWorkOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'CANCEL', { reason: dto.reason });

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason.trim(),
      },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, {
      action: 'CANCEL',
      reason: dto.reason,
    });
    await this.notifications.announceStatusToTenant(updated);
    return this.decorate(updated);
  }

  /**
   * Move to APPROVED after a workflow decision.
   *
   * Called by the approval handler inside the decision's transaction, and by
   * nothing else — APPROVED is only reachable through an approval.
   */
  async markApproved(
    id: string,
    tx: Tx,
    meta: { actorId?: string | null; note?: string | null } = {},
  ) {
    const existing = await tx.workOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException(
        `Work order ${id} no longer exists, so there is nothing to approve.`,
      );
    }
    if (existing.status !== WorkOrderStatus.INSPECTION) {
      throw new ConflictException(
        `This work order is ${statusLabel(
          existing.status,
        ).toLowerCase()} and cannot be approved.`,
      );
    }

    return tx.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.APPROVED,
        approvalRequestedAt: new Date(),
        ...(meta.note?.trim()
          ? {
              inspectionNote: `${existing.inspectionNote ?? ''}\n\nApproved: ${meta.note.trim()}`.trim(),
            }
          : {}),
      },
    });
  }

  /**
   * Assign without changing state — used when the technician changes on a job
   * that is already under way, which is not a lifecycle transition at all.
   */
  async reassign(
    id: string,
    technicianId: string,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    const technician = await this.assertTechnician(technicianId, organizationId);

    if (existing.status === WorkOrderStatus.CLOSED) {
      throw new ConflictException(
        'This work order is closed. Raise a new one for further work.',
      );
    }
    if (existing.status === WorkOrderStatus.CANCELLED) {
      throw new ConflictException('This work order was cancelled.');
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { assignedTechnician: { connect: { id: technician.id } } },
      include: STAFF_INCLUDE,
    });

    await this.auditTransition(updated, userId, {
      action: 'REASSIGN',
      technicianId: technician.id,
      from: existing.assignedTechnicianId ?? null,
    });
    await this.notifications.announceAssigned(updated);
    return this.decorate(updated);
  }

  /**
   * Put a batch of work orders in front of one technician.
   *
   * A maintenance manager triaging a morning's twenty faults needs this; it is
   * refused for anything the gates would refuse individually, so a bulk action
   * can never be a way round the state machine.
   */
  async bulkAssign(
    dto: BulkAssignWorkOrdersDto,
    organizationId: string,
    userId?: string,
  ) {
    const technician = await this.assertTechnician(dto.technicianId, organizationId);

    const results: { id: string; ok: boolean; reason?: string }[] = [];
    for (const id of dto.workOrderIds) {
      try {
        const existing = await this.record(id, organizationId);
        this.assertCanAct(existing, 'ASSIGN', {
          priority: existing.priority,
          hasTechnician: true,
          technicianActive: technician.isActive,
        });

        const updated = await this.prisma.workOrder.update({
          where: { id },
          data: {
            status: WorkOrderStatus.ASSIGNED,
            assignedTechnician: { connect: { id: technician.id } },
            ...(dto.scheduledFor
              ? { scheduledFor: new Date(dto.scheduledFor) }
              : {}),
          },
          include: STAFF_INCLUDE,
        });

        await this.auditTransition(updated, userId, {
          action: 'BULK_ASSIGN',
          technicianId: technician.id,
        });
        results.push({ id, ok: true });
      } catch (error) {
        results.push({
          id,
          ok: false,
          reason: error instanceof Error ? error.message : 'Could not assign.',
        });
      }
    }

    return {
      assigned: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  // ==================================================================== tasks

  async addTask(
    id: string,
    dto: CreateWorkOrderTaskDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status === WorkOrderStatus.CLOSED ||
      existing.status === WorkOrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        'This work order is finished, so its checklist can no longer change.',
      );
    }

    const open = await this.openTaskCount(id);
    const task = await this.prisma.workOrderTask.create({
      data: {
        organizationId,
        workOrderId: id,
        description: dto.description.trim(),
        sortOrder: dto.sortOrder ?? open,
      },
    });

    return task;
  }

  async updateTask(
    id: string,
    taskId: string,
    dto: UpdateWorkOrderTaskDto,
    organizationId: string,
    userId?: string,
  ) {
    await this.record(id, organizationId);

    const task = await requireRecord(
      this.prisma.workOrderTask.findFirst({
        where: { id: taskId, workOrderId: id, organizationId },
      }),
      'Checklist item',
    );

    const isDone = dto.isDone ?? task.isDone;

    return this.prisma.workOrderTask.update({
      where: { id: task.id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        isDone,
        completedAt: isDone ? new Date() : null,
        ...(isDone && userId
          ? { completedBy: { connect: { id: userId } } }
          : {}),
        ...(isDone ? {} : { completedBy: { disconnect: true } }),
      },
    });
  }

  async removeTask(id: string, taskId: string, organizationId: string) {
    await this.record(id, organizationId);
    await this.prisma.workOrderTask.deleteMany({
      where: { id: taskId, workOrderId: id, organizationId },
    });
    return { message: 'Checklist item removed.' };
  }

  // ============================================================= materials

  /**
   * What this job consumed from the store, and what is left on the shelf.
   *
   * Reads Module 11's ledger rather than keeping a parallel materials list, so
   * "what did the job use" and "what went down" are the same number and cannot
   * disagree.
   */
  async materials(id: string, organizationId: string | undefined) {
    await this.record(id, organizationId);

    const movements = await this.stock.movementsForWorkOrder(
      id,
      organizationId,
    );

    const net = new Map<string, number>();
    for (const movement of movements) {
      net.set(
        movement.itemId,
        (net.get(movement.itemId) ?? 0) + movement.quantity,
      );
    }

    const ids = [...net.keys()];
    const itemRows =
      ids.length === 0
        ? []
        : await this.prisma.inventoryItem.findMany({
            where: {
              id: { in: ids },
              ...(organizationId ? { organizationId } : {}),
            },
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
              unitCost: true,
            },
          });
    const itemById = new Map(itemRows.map((item) => [item.id, item]));

    return {
      workOrderId: id,
      movements,
      /** One line per item, net of everything issued and put back. */
      consumed: [...net.entries()]
        .map(([itemId, quantity]) => {
          const item = itemById.get(itemId);
          return {
            inventoryItemId: itemId,
            sku: item?.sku ?? '',
            name: item?.name ?? '',
            unitOfMeasure: item?.unitOfMeasure ?? 'unit',
            /** Net of issues and returns, so a part-used-and-returned job reads
             *  as the part it actually kept. */
            quantity: Math.round(quantity * 100) / 100,
            estimatedCost:
              item?.unitCost == null
                ? null
                : Math.round(Math.abs(quantity) * Number(item.unitCost) * 100) / 100,
          };
        })
        .filter((row) => row.quantity !== 0),
      totalEstimatedCost: Math.round(
        [...net.entries()].reduce((sum, [itemId, quantity]) => {
          const item = itemById.get(itemId);
          if (!item?.unitCost) return sum;
          return sum + Math.abs(quantity) * Number(item.unitCost);
        }, 0) * 100,
      ) / 100,
    };
  }

  /**
   * Issue material against this job.
   *
   * Delegates the ledger write to Module 11 — this module owns the work order,
   * inventory owns the shelf, and the movement that links them is written by
   * whichever knows the balance. The reference on each row (`WO-2026-0007:
   * <title>`) is what makes "what did this job consume" answerable from the
   * item's own page.
   */
  async issueMaterials(
    id: string,
    dto: IssueStockDto,
    organizationId: string,
    userId?: string,
  ) {
    await this.record(id, organizationId);

    const movements = await this.stock.issueForWorkOrder(
      id,
      dto,
      organizationId,
      userId,
    );

    return { workOrderId: id, issued: movements.length, movements };
  }

  /** Put material back — the honest inverse, not a delete. See Module 11. */
  async returnMaterials(
    id: string,
    movementIds: string[],
    organizationId: string,
    userId?: string,
  ) {
    await this.record(id, organizationId);

    const movements = await this.stock.reverseForWorkOrder(
      id,
      movementIds,
      organizationId,
      userId,
    );

    return { workOrderId: id, returned: movements.length, movements };
  }

  // =================================================================== portal

  async listForPortal(request: any) {
    const tenantId = getPortalTenantId(request);

    const rows = await this.prisma.workOrder.findMany({
      where: { tenantId },
      orderBy: { reportedAt: 'desc' },
      take: 100,
      include: PORTAL_INCLUDE,
    });

    return rows.map((row) => this.portalView(row));
  }

  /**
   * Withdraw a report while it is still just a report.
   *
   * Once it is being worked on, withdrawing would be a cancellation and would
   * need a reason — so the portal points the resident at the contact form
   * instead of pretending the problem went away.
   */
  async withdrawFromPortal(id: string, request: any) {
    const tenantId = getPortalTenantId(request);

    await requireRecord(
      this.prisma.workOrder.findFirst({
        where: { id, tenantId, status: WorkOrderStatus.REQUESTED },
        include: PORTAL_INCLUDE,
      }),
      'Maintenance request',
    );

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'Withdrawn by the resident.',
      },
      include: PORTAL_INCLUDE,
    });

    await this.notifications.announceStatusToTenant(updated);

    return this.portalView(updated);
  }

  // ============================================================== technicians

  /**
   * Who can be assigned a job.
   *
   * Restricted to the roles that actually do maintenance work, so a work order
   * cannot end up assigned to the finance accountant because they were the only
   * user on the picker's list.
   */
  async listTechnicians(organizationId: string | undefined) {
    return this.prisma.user.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
        portalTenantId: null,
        role: {
          in: [
            UserRole.MAINTENANCE_MANAGER,
            UserRole.TECHNICIAN,
            UserRole.PROPERTY_MANAGER,
            UserRole.ADMIN,
            UserRole.SUPER_ADMIN,
          ],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /** Per-technician workload, for the "who is drowning" question. */
  async technicianWorkload(organizationId: string | undefined) {
    const open = await this.prisma.workOrder.groupBy({
      by: ['assignedTechnicianId'],
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: OPEN_STATUSES },
        assignedTechnicianId: { not: null },
      },
      _count: { _all: true },
    });

    const technicians = await this.listTechnicians(organizationId);
    const counts = new Map(
      open.map((row) => [row.assignedTechnicianId as string, row._count._all]),
    );

    return technicians.map((technician) => ({
      ...technician,
      openWorkOrders: counts.get(technician.id) ?? 0,
    }));
  }

  // ================================================================== helpers

  /** Load a tenant-scoped work order for mutation. */
  private async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.workOrder.findFirst({
        where: { id, organizationId },
        include: { tasks: { select: { isDone: true } } },
      }),
      'Work order',
    );
  }

  private async openTaskCount(id: string): Promise<number> {
    return this.prisma.workOrderTask.count({
      where: { workOrderId: id, isDone: false },
    });
  }

  /** Throw the gate's own reason — it is written for the person who pressed it. */
  private assertCanAct(
    workOrder: { id: string; status: WorkOrderStatus; priority: WorkOrderPriority },
    action: WorkOrderAction,
    context: Partial<WorkOrderGateContext>,
  ) {
    const check = checkWorkOrderAction(workOrder.status, action, {
      priority: workOrder.priority,
      ...context,
    });
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? `That action is not allowed from ${workOrder.status}.`,
      );
    }
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: WorkOrderFilters,
  ): Prisma.WorkOrderWhereInput {
    const where: Prisma.WorkOrderWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.status) where.status = filters.status as WorkOrderStatus;
    if (filters.category) where.category = filters.category as MaintenanceCategory;
    if (filters.priority) where.priority = filters.priority as WorkOrderPriority;
    if (filters.source) where.source = filters.source as WorkOrderSource;
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.assigned === 'unassigned') {
      where.assignedTechnicianId = null;
    } else if (filters.technicianId) {
      where.assignedTechnicianId = filters.technicianId;
    }
    if (filters.open) where.status = { in: OPEN_STATUSES };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * Verify every referenced record belongs to the caller's organization.
   *
   * This is the hole Module 2 found in `UnitsService.create` (issue 26): a
   * relation connect with an id from the request body attaches a row to another
   * tenant's property. `Unit` has no `organizationId` of its own, so it is
   * checked through its property.
   */
  private async assertReferences(
    organizationId: string | undefined,
    refs: {
      propertyId?: string;
      unitId?: string;
      tenantId?: string;
      assetId?: string;
      technicianId?: string;
    },
  ) {
    const org = organizationId ?? undefined;

    if (refs.propertyId) {
      await requireRecord(
        this.prisma.property.findFirst({
          where: { id: refs.propertyId, ...(org ? { organizationId: org } : {}) },
          select: { id: true },
        }),
        'Property',
      );
    }

    if (refs.unitId) {
      const unit = await requireRecord(
        this.prisma.unit.findFirst({
          where: {
            id: refs.unitId,
            // `Unit` carries no organizationId of its own (master doc issue 25),
            // so tenant scope runs through its property.
            ...(org ? { property: { organizationId: org } } : {}),
          },
          select: { id: true, propertyId: true },
        }),
        'Unit',
      );

      // A unit under a different property than the one claimed is the same class
      // of cross-tenant write as Module 2's unit-attach bug, one relation deeper.
      if (refs.propertyId && unit.propertyId !== refs.propertyId) {
        throw new BadRequestException(
          'That unit does not belong to the property you selected.',
        );
      }
    }

    if (refs.tenantId) {
      await requireRecord(
        this.prisma.tenant.findFirst({
          where: { id: refs.tenantId, ...(org ? { organizationId: org } : {}) },
          select: { id: true },
        }),
        'Tenant',
      );
    }

    if (refs.assetId) {
      await requireRecord(
        this.prisma.asset.findFirst({
          where: { id: refs.assetId, ...(org ? { organizationId: org } : {}) },
          select: { id: true },
        }),
        'Asset',
      );
    }

    if (refs.technicianId) {
      await this.assertTechnician(refs.technicianId, organizationId);
    }
  }

  /** A technician must be a real, active member of this organization. */
  private async assertTechnician(id: string, organizationId: string | undefined) {
    const technician = await requireRecord(
      this.prisma.user.findFirst({
        where: {
          id,
          isActive: true,
          portalTenantId: null,
          ...(organizationId ? { organizationId } : {}),
          role: {
            in: [
              UserRole.MAINTENANCE_MANAGER,
              UserRole.TECHNICIAN,
              UserRole.PROPERTY_MANAGER,
              UserRole.ADMIN,
              UserRole.SUPER_ADMIN,
            ],
          },
        },
        select: { id: true, firstName: true, lastName: true, isActive: true },
      }),
      'Technician',
    );

    if (!technician) {
      throw new BadRequestException(
        'That person cannot be assigned maintenance work — they are not an active technician, manager or administrator in this organization.',
      );
    }

    return technician;
  }

  /**
   * Allocate the next `WO-YYYY-NNNN` for this organization.
   *
   * Sequential because work orders get quoted over the phone and read aloud to
   * residents ("your reference is WO-2026-0042"). The retry loop covers two
   * staff raising a fault in the same second; without it one of them gets a
   * unique-constraint 500 for no reason a user could understand.
   */
  private async createWithReference(input: Omit<Prisma.WorkOrderCreateInput, 'reference'>) {
    const organizationId =
      typeof input.organization === 'object' && 'connect' in input.organization
        ? (input.organization.connect as { id: string }).id
        : (input.organization as unknown as string);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = await this.nextReference(organizationId);
      try {
        return await this.prisma.workOrder.create({
          data: { ...input, reference },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('reference')) throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate a work order reference. Please try again.',
    );
  }

  private async nextReference(organizationId: string) {
    const prefix = `WO-${new Date().getFullYear()}-`;
    const last = await this.prisma.workOrder.findFirst({
      where: { organizationId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const sequence = last
      ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1
      : 1;

    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }

  /** Derived, never stored: overdue, hours left, open checklist, legal actions. */
  private decorate<T extends {
    status: WorkOrderStatus;
    priority: WorkOrderPriority;
    reportedAt: Date;
    assignedTechnicianId: string | null;
    inspectionNote?: string | null;
    resolutionNote?: string | null;
    tasks?: { isDone: boolean }[];
  }>(row: T) {
    const now = new Date();
    const openTasks = (row.tasks ?? []).filter((task) => !task.isDone).length;

    return {
      ...row,
      statusLabel: statusLabel(row.status),
      overdue: isOverdue(row, now),
      hoursRemaining: hoursRemaining(row, now),
      openTasks,
      availableActions: offerableWorkOrderActions(row.status, {
        priority: row.priority,
        // Real, not assumed: an unfinished checklist is a fact about the record,
        // so Complete is offered but the refusal will say what is missing.
        openTasks,
        inspectionNote: row.inspectionNote ?? null,
        resolutionNote: row.resolutionNote ?? null,
      }),
    };
  }

  private portalView<T extends object>(row: T) {
    return {
      ...row,
      statusLabel: statusLabel(
        (row as { status: WorkOrderStatus }).status,
      ),
    };
  }

  /** Best-effort audit, in the style of the rest of the codebase. */
  private async auditTransition(
    record: { id: string; organizationId: string; reference?: string },
    userId: string | undefined,
    extra: Record<string, unknown>,
  ) {
    try {
      await this.audit.logAction({
        action: `WORK_ORDER_${String(extra.action ?? 'UPDATE')}`,
        entity: 'WorkOrder',
        entityId: record.id,
        details: JSON.stringify({
          reference: record.reference,
          ...extra,
        }),
        ipAddress: null,
        userAgent: null,
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        ...(record.organizationId
          ? { organization: { connect: { id: record.organizationId } } }
          : {}),
      });
    } catch {
      // Auditing is best-effort; the transition itself must still stand.
    }
  }
}

/** Narrow an untrusted string to an enum member, or null. */
function toEnum<T extends Record<string, string>>(
  values: T,
  value: string | undefined,
): T[keyof T] | null {
  if (!value) return null;
  return Object.values(values).includes(value)
    ? (value as T[keyof T])
    : null;
}

function defaultTitle(category: MaintenanceCategory): string {
  return `${categoryLabel(category)} repair requested`;
}

function categoryLabel(category: MaintenanceCategory): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
