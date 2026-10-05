import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  Prisma,
  PurchaseCategory,
  PurchasePriority,
  PurchaseRequestStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { AuditService } from '@/modules/audit/audit.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { round2 } from './procurement-comparison';
import {
  checkPurchaseRequestAction,
  label,
  offerablePurchaseRequestActions,
  OPEN_REQUEST_STATUSES,
  type PurchaseRequestGateContext,
} from './procurement-lifecycle';
import type {
  CreatePurchaseRequestDto,
  PurchaseRequestFilters,
  RejectPurchaseRequestDto,
  ReplacePurchaseRequestLinesDto,
  SubmitPurchaseRequestDto,
  UpdatePurchaseRequestDto,
} from './dto/procurement.dto';

type Tx = Prisma.TransactionClient;

const REQUEST_INCLUDE = {
  requestedBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  lines: { orderBy: { sortOrder: 'asc' as const } },
  rfqs: {
    select: { id: true, reference: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  orders: {
    select: { id: true, reference: true, status: true, totalAmount: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

const REQUEST_EXPORT_HEADERS = [
  'reference',
  'status',
  'priority',
  'category',
  'title',
  'department',
  'requestedBy',
  'lineCount',
  'estimatedAmount',
  'currency',
  'neededBy',
  'createdAt',
  'decidedAt',
];

/**
 * Module 10 — purchase requests.
 *
 * A request is the document that makes a purchase legitimate: somebody in a
 * department said what is needed and why, and an approver agreed. Three rules
 * shape this class:
 *
 * 1. **`status` is never written directly.** Every move goes through an action
 *    that consults `checkPurchaseRequestAction` first, so an APPROVED request
 *    always had lines and a REJECTED one always carries a reason.
 * 2. **Money on a request is an estimate, never a commitment.** Nothing here
 *    creates a payable. The commitment happens when a purchase order is sent,
 *    and finance's bill is a third, later event — three documents because
 *    three different people sign them.
 * 3. **Approval runs through Module 18's engine** when the organization has a
 *    PURCHASE_REQUEST policy, and falls back to a direct approve otherwise, so
 *    an installation that has never configured an approval policy still works.
 */
@Injectable()
export class PurchaseRequestsService {
  private readonly logger = new Logger(PurchaseRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: PurchaseRequestFilters = {},
  ) {
    const rows = await this.prisma.purchaseRequest.findMany({
      where: this.buildWhere(organizationId, filters),
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return rows.map((row) => this.decorate(row));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const row = await this.record(id, organizationId);
    return this.decorate(row);
  }

  /**
   * Counts for the dashboard card.
   *
   * `awaitingApproval` is the one that matters operationally: a request nobody
   * has decided is the only number here that is somebody's job to change.
   */
  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const [byStatus, byCategory, all] = await Promise.all([
      this.prisma.purchaseRequest.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.purchaseRequest.groupBy({
        by: ['category'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.purchaseRequest.findMany({
        where: base,
        select: {
          status: true,
          priority: true,
          estimatedAmount: true,
          createdAt: true,
        },
        take: 5000,
      }),
    ]);

    return {
      total: all.length,
      open: all.filter((row) => OPEN_REQUEST_STATUSES.includes(row.status))
        .length,
      awaitingApproval: all.filter(
        (row) => row.status === PurchaseRequestStatus.PENDING,
      ).length,
      urgentOpen: all.filter(
        (row) =>
          OPEN_REQUEST_STATUSES.includes(row.status) &&
          row.priority === PurchasePriority.URGENT,
      ).length,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<PurchaseRequestStatus, number>>,
      byCategory: Object.fromEntries(
        byCategory.map((row) => [row.category, row._count._all]),
      ) as Partial<Record<PurchaseCategory, number>>,
      estimatedOpen: round2(
        all
          .filter((row) => OPEN_REQUEST_STATUSES.includes(row.status))
          .reduce((sum, row) => sum + Number(row.estimatedAmount ?? 0), 0),
      ),
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: PurchaseRequestFilters = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, filters);

    return toCsv(
      REQUEST_EXPORT_HEADERS,
      rows.map((row) => {
        const record = row as unknown as {
          reference: string;
          status: string;
          priority: string;
          category: string;
          title: string;
          department: string | null;
          requestedBy?: {
            firstName?: string | null;
            lastName?: string | null;
          } | null;
          lines?: unknown[];
          estimatedAmount: unknown;
          currency: string;
          neededBy: Date | null;
          createdAt: Date;
          decidedAt: Date | null;
        };
        return {
          reference: record.reference,
          status: record.status,
          priority: record.priority,
          category: record.category,
          title: record.title,
          department: record.department ?? '',
          requestedBy: [
            record.requestedBy?.firstName,
            record.requestedBy?.lastName,
          ]
            .filter(Boolean)
            .join(' '),
          lineCount: record.lines?.length ?? 0,
          estimatedAmount: record.estimatedAmount?.toString() ?? '',
          currency: record.currency,
          neededBy: record.neededBy?.toISOString() ?? '',
          createdAt: record.createdAt?.toISOString() ?? '',
          decidedAt: record.decidedAt?.toISOString() ?? '',
        };
      }),
    );
  }

  // =================================================================== writes

  /**
   * Raise a request.
   *
   * `saveAsDraft` is the only reason DRAFT exists: nobody wants a half-typed
   * request in the approval inbox, and a submit endpoint that sends you straight
   * to PENDING makes the "draft" concept impossible to express.
   *
   * The estimate is derived from the lines when they carry prices and the
   * caller did not type a figure, so the number on the request and the numbers
   * under it cannot disagree.
   */
  async create(
    dto: CreatePurchaseRequestDto,
    organizationId: string,
    userId?: string,
  ) {
    const lines = dto.lines.map((line) => this.priceLine(line));

    // A typed estimate wins over a derived one — somebody who knows the budget
    // is allowed to state it, and a request whose estimate is deliberately
    // higher than its line sum is a real thing (contingency).
    const estimatedAmount =
      dto.estimatedAmount !== undefined
        ? round2(dto.estimatedAmount)
        : lines.some((line) => line.estimatedAmount != null)
          ? round2(
              lines.reduce(
                (sum, line) => sum + Number(line.estimatedAmount ?? 0),
                0,
              ),
            )
          : null;

    const status =
      dto.saveAsDraft === true
        ? PurchaseRequestStatus.DRAFT
        : PurchaseRequestStatus.PENDING;

    const created = await this.createWithReference({
      organization: { connect: { id: organizationId } },
      title: dto.title.trim(),
      description: dto.description?.trim(),
      category: dto.category,
      priority: dto.priority ?? PurchasePriority.NORMAL,
      status,
      department: dto.department?.trim(),
      currency: dto.currency?.toUpperCase() || 'KES',
      neededBy: dto.neededBy ? new Date(dto.neededBy) : undefined,
      estimatedAmount:
        estimatedAmount != null
          ? new Prisma.Decimal(estimatedAmount)
          : undefined,
      ...(userId ? { requestedBy: { connect: { id: userId } } } : {}),
      lines: {
        create: lines.map((line, index) => ({
          organization: { connect: { id: organizationId } },
          description: line.description,
          specification: line.specification,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice:
            line.unitPrice != null
              ? new Prisma.Decimal(line.unitPrice)
              : undefined,
          estimatedAmount:
            line.estimatedAmount != null
              ? new Prisma.Decimal(line.estimatedAmount)
              : undefined,
          sortOrder: index,
        })),
      },
    } satisfies Omit<Prisma.PurchaseRequestCreateInput, 'reference'>);

    if (status === PurchaseRequestStatus.PENDING) {
      await this.announceAwaitingApproval({
        ...created,
        // Decimal → number at the boundary: the notification renders it as text,
        // and `String(decimal)` is not something to put in front of a person.
        estimatedAmount:
          created.estimatedAmount != null
            ? Number(created.estimatedAmount)
            : null,
      });
    }

    return this.findOne(created.id, organizationId);
  }

  /**
   * Edit the descriptive fields of a request.
   *
   * Refused once it has been submitted, except for a REJECTED request being
   * reopened into DRAFT — which is why the caller has to reopen it first rather
   * than being able to edit a decision's subject in place.
   */
  async update(
    id: string,
    dto: UpdatePurchaseRequestDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertEditable(existing.status);

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.department !== undefined
          ? { department: dto.department?.trim() || null }
          : {}),
        ...(dto.neededBy !== undefined
          ? { neededBy: dto.neededBy ? new Date(dto.neededBy) : null }
          : {}),
        ...(dto.estimatedAmount !== undefined
          ? {
              estimatedAmount:
                dto.estimatedAmount === null
                  ? null
                  : new Prisma.Decimal(round2(dto.estimatedAmount)),
            }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });

    return this.decorate(updated);
  }

  /**
   * Replace the whole line set.
   *
   * Replace rather than add-one/remove-one: a request is a shopping list that is
   * edited before it goes anywhere, and an itemised diff on a list nobody has
   * seen is not a history worth keeping. Derived, not stored as an audit.
   */
  async replaceLines(
    id: string,
    dto: ReplacePurchaseRequestLinesDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertEditable(existing.status);

    const lines = dto.lines.map((line) => this.priceLine(line));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequestLine.deleteMany({
        where: { purchaseRequestId: id },
      });
      await tx.purchaseRequestLine.createMany({
        data: lines.map((line, index) => ({
          organizationId,
          purchaseRequestId: id,
          description: line.description,
          specification: line.specification,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice:
            line.unitPrice != null
              ? new Prisma.Decimal(line.unitPrice)
              : undefined,
          estimatedAmount:
            line.estimatedAmount != null
              ? new Prisma.Decimal(line.estimatedAmount)
              : undefined,
          sortOrder: index,
        })),
      });

      // Re-derive the header estimate from the new lines, unless the requester
      // typed one deliberately (a DRAFT's estimate is theirs to keep).
      const rederived = round2(
        lines.reduce((sum, line) => sum + Number(line.estimatedAmount ?? 0), 0),
      );

      return tx.purchaseRequest.update({
        where: { id },
        data: {
          estimatedAmount: new Prisma.Decimal(rederived),
        },
        include: REQUEST_INCLUDE,
      });
    });

    return this.decorate(updated);
  }

  /**
   * Delete a request.
   *
   * Only while it is a draft or a rejection. A submitted request that somebody
   * may have already acted on is cancelled with a reason — "we never got that
   * request" is not an acceptable answer to an auditor.
   */
  async remove(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status !== PurchaseRequestStatus.DRAFT &&
      existing.status !== PurchaseRequestStatus.REJECTED
    ) {
      throw new ConflictException(
        `This request is ${label(existing.status).toLowerCase()}. Cancel it instead of deleting it — the record is the history.`,
      );
    }

    await this.prisma.purchaseRequest.delete({ where: { id } });
    return { message: 'Purchase request deleted.' };
  }

  // ============================================================= transitions

  async submit(
    id: string,
    dto: SubmitPurchaseRequestDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'SUBMIT', {
      lineCount: existing.lines.length,
    });

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.PENDING,
        ...(dto.note?.trim()
          ? { description: joinNote(existing.description, dto.note) }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });

    await this.announceAwaitingApproval({
      ...updated,
      estimatedAmount:
        updated.estimatedAmount != null
          ? Number(updated.estimatedAmount)
          : null,
    });
    await this.auditDecision(updated.id, organizationId, userId, 'SUBMIT', {
      note: dto.note,
    });

    return this.decorate(updated);
  }

  /**
   * Approve without the approval engine.
   *
   * The direct path, for organizations with no PURCHASE_REQUEST policy. Where a
   * policy exists the request goes through `PurchaseRequestApprovalsService`
   * instead, so "over this much needs two signatures" is enforceable.
   */
  async approve(
    id: string,
    organizationId: string,
    userId?: string,
    note?: string | null,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'APPROVE', {
      lineCount: existing.lines.length,
    });

    const updated = await this.markApproved(id, this.prisma as unknown as Tx, {
      decidedById: userId,
      note,
    });

    await this.auditDecision(updated.id, organizationId, userId, 'APPROVE', {
      note,
    });
    return this.findOne(updated.id, organizationId);
  }

  async reject(
    id: string,
    dto: RejectPurchaseRequestDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'REJECT', {
      lineCount: existing.lines.length,
      rejectionReason: dto.reason,
    });

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        rejectionReason: dto.reason.trim(),
        decisionNote: dto.reason.trim(),
        decidedAt: new Date(),
        ...(userId ? { decidedBy: { connect: { id: userId } } } : {}),
      },
      include: REQUEST_INCLUDE,
    });

    await this.announceOutcome(updated.id, organizationId);
    await this.auditDecision(updated.id, organizationId, userId, 'REJECT', {
      reason: dto.reason,
    });

    return this.decorate(updated);
  }

  async cancel(
    id: string,
    dto: { reason: string },
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'CANCEL', {
      lineCount: existing.lines.length,
    });

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.CANCELLED,
        decisionNote: dto.reason.trim(),
        decidedAt: new Date(),
        ...(userId ? { decidedBy: { connect: { id: userId } } } : {}),
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditDecision(updated.id, organizationId, userId, 'CANCEL', {
      reason: dto.reason,
    });

    return this.decorate(updated);
  }

  /** Reopen a rejected request as a draft, keeping the rejection on the record. */
  async reopen(id: string, organizationId: string, userId?: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'REOPEN', {
      lineCount: existing.lines.length,
    });

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.DRAFT,
        // The rejection stays where it is; only the decision fields move, so the
        // history of what was turned down is not erased by a resubmission.
      },
      include: REQUEST_INCLUDE,
    });

    await this.auditDecision(updated.id, organizationId, userId, 'REOPEN');
    return this.decorate(updated);
  }

  /**
   * Move to APPROVED from a workflow decision.
   *
   * Called by the approval handler inside the decision's transaction and by
   * nothing else — APPROVED is only reachable through an approval.
   */
  async markApproved(
    id: string,
    tx: Tx,
    meta: { decidedById?: string | null; note?: string | null } = {},
  ) {
    const existing = await tx.purchaseRequest.findFirst({
      where: { id },
      include: { lines: { select: { id: true } } },
    });
    if (!existing) {
      throw new BadRequestException(
        `Purchase request ${id} no longer exists, so there is nothing to approve.`,
      );
    }

    const check = checkPurchaseRequestAction(existing.status, 'APPROVE', {
      lineCount: existing.lines.length,
    });
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? 'This request cannot be approved.',
      );
    }

    return tx.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.APPROVED,
        approvalRequestedAt: new Date(),
        decidedAt: new Date(),
        ...(meta.decidedById
          ? { decidedBy: { connect: { id: meta.decidedById } } }
          : {}),
        ...(meta.note?.trim()
          ? { decisionNote: joinNote(null, meta.note) }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });
  }

  /** Record a rejection from a workflow decision, inside its transaction. */
  async markRejected(
    id: string,
    tx: Tx,
    meta: { decidedById?: string | null; reason?: string | null } = {},
  ) {
    const existing = await tx.purchaseRequest.findFirst({ where: { id } });
    if (!existing) {
      throw new BadRequestException(
        `Purchase request ${id} no longer exists, so there is nothing to reject.`,
      );
    }

    return tx.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        rejectionReason:
          meta.reason?.trim() || 'Rejected by the approval policy.',
        decisionNote: meta.reason?.trim() || 'Rejected by the approval policy.',
        decidedAt: new Date(),
        ...(meta.decidedById
          ? { decidedBy: { connect: { id: meta.decidedById } } }
          : {}),
      },
      include: REQUEST_INCLUDE,
    });
  }

  // ================================================================== helpers

  /** Load a tenant-scoped request with its lines for mutation. */
  async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.purchaseRequest.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: REQUEST_INCLUDE,
      }),
      'Purchase request',
    );
  }

  private assertEditable(status: PurchaseRequestStatus) {
    if (
      status !== PurchaseRequestStatus.DRAFT &&
      status !== PurchaseRequestStatus.REJECTED
    ) {
      throw new ConflictException(
        `This request is ${label(status).toLowerCase()}, so its details can no longer be edited. Reopen it first.`,
      );
    }
  }

  /** Throw the gate's own reason — it is written for the person who pressed it. */
  private assertCanAct(
    request: {
      id: string;
      status: PurchaseRequestStatus;
      lines?: { id: string }[];
    },
    action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'REOPEN' | 'RAISE_RFQ',
    context: Partial<PurchaseRequestGateContext>,
  ) {
    const check = checkPurchaseRequestAction(request.status, action, {
      lineCount: request.lines?.length ?? 0,
      ...context,
    });
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? `That action is not allowed from ${request.status}.`,
      );
    }
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: PurchaseRequestFilters,
  ): Prisma.PurchaseRequestWhereInput {
    const where: Prisma.PurchaseRequestWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.status) where.status = filters.status as PurchaseRequestStatus;
    if (filters.category) where.category = filters.category as PurchaseCategory;
    if (filters.priority) where.priority = filters.priority as PurchasePriority;
    if (filters.requestedById) where.requestedById = filters.requestedById;
    if (filters.department) {
      where.department = { contains: filters.department, mode: 'insensitive' };
    }
    if (filters.open) where.status = { in: OPEN_REQUEST_STATUSES };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** A line, with its estimate derived when a price was given. */
  private priceLine(line: {
    description: string;
    specification?: string;
    quantity?: number;
    unitPrice?: number;
  }) {
    const quantity = line.quantity ?? 1;
    const estimatedAmount =
      line.unitPrice != null ? round2(quantity * line.unitPrice) : null;

    return {
      description: line.description.trim(),
      specification: line.specification?.trim(),
      quantity,
      unitPrice: line.unitPrice != null ? round2(line.unitPrice) : null,
      estimatedAmount,
    };
  }

  /**
   * Allocate the next `PR-YYYY-NNNN` for this organization.
   *
   * Sequential because a request is referred to by its reference in an approval
   * email; the retry loop covers two people raising one in the same second,
   * because without it one of them gets a unique-constraint 500 for no reason a
   * user could understand.
   */
  private async createWithReference(
    input: Omit<Prisma.PurchaseRequestCreateInput, 'reference'>,
  ) {
    const organizationId =
      typeof input.organization === 'object' && 'connect' in input.organization
        ? (input.organization.connect as { id: string }).id
        : (input.organization as unknown as string);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = await this.nextReference(organizationId);
      try {
        return await this.prisma.purchaseRequest.create({
          data: { ...input, reference },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('reference')) throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate a purchase request reference. Please try again.',
    );
  }

  private async nextReference(organizationId: string) {
    const prefix = `PR-${new Date().getFullYear()}-`;
    const last = await this.prisma.purchaseRequest.findFirst({
      where: { organizationId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const sequence = last
      ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1
      : 1;

    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }

  /** Derived, never stored: what the row should show next to the status. */
  private decorate<
    T extends {
      status: PurchaseRequestStatus;
      lines: { id: string }[];
      rfqs?: { id: string }[];
    },
  >(row: T) {
    return {
      ...row,
      statusLabel: label(row.status),
      lineCount: row.lines.length,
      rfqCount: row.rfqs?.length ?? 0,
      availableActions: offerablePurchaseRequestActions(row.status, {
        lineCount: row.lines.length,
      }),
    };
  }

  // ============================================================= notifications

  /**
   * Somebody has to decide this.
   *
   * Addressed to the people who approve purchases, minus whoever raised it —
   * the engine refuses self-approval anyway, and a message to the requester
   * saying "please approve your own request" is worse than no message.
   */
  private async announceAwaitingApproval(request: {
    id: string;
    organizationId: string;
    reference: string;
    title: string;
    estimatedAmount?: number | null;
    requestedById?: string | null;
  }) {
    await this.safely(`approval request for ${request.reference}`, async () => {
      const recipients = await this.prisma.user.findMany({
        where: {
          organizationId: request.organizationId,
          isActive: true,
          portalTenantId: null,
          role: {
            in: [
              UserRole.PROCUREMENT_OFFICER,
              UserRole.ADMIN,
              UserRole.SUPER_ADMIN,
              UserRole.ACCOUNTANT,
              UserRole.PROPERTY_MANAGER,
            ],
          },
          ...(request.requestedById
            ? { id: { not: request.requestedById } }
            : {}),
        },
        select: { id: true },
        take: 25,
      });

      for (const recipient of recipients) {
        await this.notifications.notify(
          {
            organizationId: request.organizationId,
            type: NotificationType.APPROVAL_REQUESTED,
            priority: NotificationPriority.HIGH,
            title: `Purchase request needs approval: ${request.title}`,
            body: `${request.reference}${
              request.estimatedAmount != null
                ? ` — ${round2(request.estimatedAmount).toLocaleString()} estimated`
                : ''
            }`,
            entityType: 'PurchaseRequest',
            entityId: request.id,
            actionUrl: `/procurement/purchase-requests/${request.id}`,
            channels: [NotificationChannel.IN_APP],
            dedupeKey: `purchase-request-approval:${request.id}`,
          },
          { userId: recipient.id },
        );
      }
    });
  }

  /**
   * Tell the person who raised it how the decision went.
   *
   * Public because it is also the workflow's job: a decision taken through
   * Module 18's engine lands in `markApproved`/`markRejected`, and without this
   * the requester would only find out by opening the page — which is the same
   * failure the maintenance module hit and fixed for work orders.
   *
   * `REQUEST_APPROVED`/`REQUEST_REJECTED` rather than `APPROVAL_REQUESTED`: those
   * two are the facts about a *request*, which is what this is. The approval
   * engine notifies its own approvers.
   */
  async announceOutcome(id: string, organizationId: string | undefined) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
      select: {
        id: true,
        organizationId: true,
        reference: true,
        status: true,
        requestedById: true,
      },
    });

    if (!request) return;
    await this.announceDecision(request);
  }

  /** The requester's copy of an approve/reject. */
  private async announceDecision(request: {
    id: string;
    organizationId: string;
    reference: string;
    status: PurchaseRequestStatus;
    requestedById?: string | null;
  }) {
    if (!request.requestedById) return;

    const approved = request.status === PurchaseRequestStatus.APPROVED;
    const body = approved
      ? 'It has been approved and can go out for quotations.'
      : 'It was not approved. Open it to read why.';

    await this.safely(`decision on ${request.reference}`, async () => {
      await this.notifications.notify(
        {
          organizationId: request.organizationId,
          type: approved
            ? NotificationType.REQUEST_APPROVED
            : NotificationType.REQUEST_REJECTED,
          priority: NotificationPriority.NORMAL,
          title: `${request.reference} ${approved ? 'approved' : 'rejected'}`,
          body,
          entityType: 'PurchaseRequest',
          entityId: request.id,
          actionUrl: `/procurement/purchase-requests/${request.id}`,
          channels: [NotificationChannel.IN_APP],
          dedupeKey: `purchase-request-decision:${request.id}:${request.status}`,
        },
        { userId: request.requestedById },
      );
    });
  }

  /**
   * Never let delivery break the decision it is reporting on.
   *
   * The same rule the maintenance module uses: the state change is the record,
   * and turning an approval into an error because a row could not be inserted is
   * worse than somebody opening the page and seeing the result.
   */
  private async safely(what: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `Could not send procurement notification for ${what}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Best-effort audit.
   *
   * The global interceptor already records the request itself; this records the
   * decision specifically — who approved or rejected a purchase request, and
   * what they said — because that is the question an auditor asks and it is not
   * recoverable from a generic UPDATE row.
   */
  private async auditDecision(
    requestId: string,
    organizationId: string,
    userId: string | undefined,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      await this.audit.logAction({
        action: `PURCHASE_REQUEST_${action}`,
        entity: 'PurchaseRequest',
        entityId: requestId,
        details: JSON.stringify(extra),
        ipAddress: null,
        userAgent: null,
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        ...(organizationId
          ? { organization: { connect: { id: organizationId } } }
          : {}),
      });
    } catch {
      // Auditing is best-effort; the decision itself must still stand.
    }
  }
}

/** A note appended to an existing description without destroying it. */
function joinNote(existing: string | null | undefined, note: string): string {
  const trimmed = note.trim();
  return existing?.trim() ? `${existing.trim()}\n\n${trimmed}` : trimmed;
}
