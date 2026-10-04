import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AgreementStatus, TenantRequestStatus, TenantRequestType } from '@prisma/client';
import { getPortalTenantId, requireRecord } from '@/common/utils';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RentalAgreementsService } from '@/modules/leases/rental-agreements.service';
import { MoveoutsService } from '@/modules/moveouts/moveouts.service';
import type {
  CreateTenantRequestDto,
  DecideTenantRequestDto,
} from './dto/tenant-request.dto';

export interface RequestFilters {
  status?: string;
  type?: string;
  tenantId?: string;
}

/**
 * Resident-initiated requests (the portal's write path).
 *
 * A request never changes a tenancy by itself: it is a queued ask, decided by
 * staff, and **approval delegates to the same services staff would have called
 * by hand** — so a resident-approved renewal goes through the renewal-window
 * gate, creates the successor agreement and syncs unit occupancy exactly as a
 * staff-initiated one does. The only new logic here is the queue's own rules
 * (one open request per lease and type, notice-period flag, the
 * PENDING → APPROVED/REJECTED/WITHDRAWN state machine) and the audit trail.
 */
@Injectable()
export class TenantRequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private leases: RentalAgreementsService,
    private moveouts: MoveoutsService,
    private notificationTriggers: NotificationTriggersService,
  ) {}

  // ---------------------------------------------------------------- resident

  /** Submit a request. Scoped to the tenant on the session, never a parameter. */
  async createFromPortal(dto: CreateTenantRequestDto, request: any) {
    const tenantId = getPortalTenantId(request);

    const lease = await this.activeLeaseFor(tenantId, dto.rentalAgreementId);

    const existing = await this.prisma.tenantRequest.findFirst({
      where: {
        rentalAgreementId: lease.id,
        type: dto.type,
        status: TenantRequestStatus.PENDING,
      },
      select: { id: true, type: true },
    });
    if (existing) {
      throw new ConflictException(
        `You already have a ${labelFor(dto.type)} request waiting on this lease. Withdraw it first or wait for a decision.`,
      );
    }

    const preferredDate = dto.preferredDate ? new Date(dto.preferredDate) : null;
    const noticeDays = lease.noticePeriodDays ?? 0;

    // A flag, not a refusal: the resident may ask to leave early, staff decide.
    const earlyNotice =
      dto.type === TenantRequestType.MOVE_OUT &&
      preferredDate !== null &&
      noticeDays > 0 &&
      daysUntil(preferredDate) < noticeDays;

    const created = await this.prisma.tenantRequest.create({
      data: {
        organizationId: lease.organizationId ?? '',
        tenantId,
        rentalAgreementId: lease.id,
        type: dto.type,
        // Snapshot what was asked, so a later lease change cannot rewrite it.
        payload: (dto.payload ?? {}) as object,
        preferredDate,
        earlyNotice,
        note: dto.note ?? null,
      },
      include: this.detailInclude(),
    });

    await this.auditRequest('TENANT_REQUEST_SUBMITTED', created, request, {
      tenantId,
    });

    return created;
  }

  /** The resident's own request history, newest first. */
  async listForPortal(request: any) {
    const tenantId = getPortalTenantId(request);

    return this.prisma.tenantRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: this.detailInclude(),
    });
  }

  /** Withdraw a request, while it is still PENDING. */
  async withdraw(id: string, request: any) {
    const tenantId = getPortalTenantId(request);

    const existing = await this.prisma.tenantRequest.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new BadRequestException('Request not found.');
    }
    if (existing.status !== TenantRequestStatus.PENDING) {
      throw new ConflictException(
        `This request has already been ${existing.status.toLowerCase()} and can no longer be withdrawn.`,
      );
    }

    const updated = await this.prisma.tenantRequest.update({
      where: { id },
      data: {
        status: TenantRequestStatus.WITHDRAWN,
        decisionNote: 'Withdrawn by the resident.',
      },
      include: this.detailInclude(),
    });

    // Delivery the leasing module left to Module 17. Best-effort: a resident
    // confirming a withdrawal must not fail because a notification could not be
    // written, and the state change has already committed.
    await this.notifyDecision(updated, 'REQUEST_WITHDRAWN');

    return updated;
  }

  /**
   * Tell the resident what happened to their request.
   *
   * Failure is swallowed on purpose. The decision itself is the record; a
   * notification is best-effort delivery on top of it, and turning a successful
   * approval into an error because a row could not be inserted would be worse
   * than a resident who opens the portal and sees the outcome.
   */
  private async notifyDecision(
    request: {
      id: string;
      tenantId: string;
      organizationId: string;
      decisionNote: string | null;
    },
    outcome:
      | 'REQUEST_APPROVED'
      | 'REQUEST_REJECTED'
      | 'REQUEST_WITHDRAWN',
  ) {
    try {
      await this.notificationTriggers.notifyRequestDecision({
        organizationId: request.organizationId,
        tenantId: request.tenantId,
        type: outcome,
        requestId: request.id,
        decisionNote: request.decisionNote,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `Could not notify tenant ${request.tenantId} about ${outcome}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // ------------------------------------------------------------------- staff

  findAll(tenantId: string, filters?: RequestFilters) {
    const where: Record<string, unknown> = { organizationId: tenantId };
    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.type) where.type = filters.type;
      if (filters.tenantId) where.tenantId = filters.tenantId;
    }

    return this.prisma.tenantRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: this.detailInclude(),
    });
  }

  async findOne(id: string, tenantId: string) {
    return requireRecord(
      this.prisma.tenantRequest.findFirst({
        where: { id, organizationId: tenantId },
        include: this.detailInclude(),
      }),
      'Tenant request',
    );
  }

  /**
   * Decide a request.
   *
   * For RENEWAL and MOVE_OUT the approval *performs the action* by calling the
   * leasing/move-out services, so the request and a staff-initiated change are
   * indistinguishable in the data. PAYMENT_PLAN, MAINTENANT and LEASE_AMENDMENT
   * have no such delegate yet — the decision is recorded and the follow-up is
   * done in the owning module.
   */
  async decide(
    id: string,
    dto: DecideTenantRequestDto,
    tenantId: string,
    userId?: string,
    request?: any,
  ) {
    const existing = await requireRecord(
      this.prisma.tenantRequest.findFirst({
        where: { id, organizationId: tenantId },
        include: this.detailInclude(),
      }),
      'Tenant request',
    );

    if (existing.status !== TenantRequestStatus.PENDING) {
      throw new ConflictException(
        `This request was already ${existing.status.toLowerCase()}.`,
      );
    }

    if (dto.decision === 'REJECT' && !dto.decisionNote?.trim()) {
      throw new BadRequestException(
        'A rejection needs a note — it is what the resident sees.',
      );
    }


    const result =
      dto.decision === 'APPROVE'
        ? await this.execute(existing, userId)
        : null;

    const updated = await this.prisma.tenantRequest.update({
      where: { id },
      data: {
        status:
          dto.decision === 'APPROVE'
            ? TenantRequestStatus.APPROVED
            : TenantRequestStatus.REJECTED,
        decidedById: userId ?? null,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote ?? null,
        ...(result ? { result: result as object } : {}),
      },
      include: this.detailInclude(),
    });

    await this.auditRequest(
      dto.decision === 'APPROVE'
        ? 'TENANT_REQUEST_APPROVED'
        : 'TENANT_REQUEST_REJECTED',
      updated,
      request,
      { tenantId, decisionNote: dto.decisionNote },
    );

    await this.notifyDecision(
      updated,
      dto.decision === 'APPROVE' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
    );

    return updated;
  }

  /**
   * Perform the action the request asked for.
   *
   * Any refusal from the underlying service (renewal outside the window, a
   * second live lease, a move-out already requested) propagates unchanged — the
   * request stays PENDING and the resident sees the real reason.
   */
  private async execute(
    request: {
      id: string;
      type: TenantRequestType;
      rentalAgreementId: string | null;
      tenantId: string;
      preferredDate: Date | null;
      payload: unknown;
      organizationId: string;
    },
    userId?: string,
  ): Promise<Record<string, unknown> | null> {
    if (!request.rentalAgreementId) {
      throw new BadRequestException(
        'This request is not attached to a lease, so there is nothing to apply it to.',
      );
    }

    const payload = (request.payload ?? {}) as {
      termMonths?: number;
      rentAmount?: number;
      newEndDate?: string;
      notes?: string;
    };

    if (request.type === TenantRequestType.RENEWAL) {
      const renewed = await this.leases.renew(
        request.rentalAgreementId,
        {
          ...(payload.termMonths ? { termMonths: payload.termMonths } : {}),
          ...(payload.rentAmount ? { rentAmount: payload.rentAmount } : {}),
          ...(payload.newEndDate ? { newEndDate: payload.newEndDate } : {}),
        },
        request.organizationId,
      );

      return {
        action: 'LEASE_RENEWED',
        previousLeaseId: renewed.previous.id,
        newLeaseId: renewed.lease.id,
        newLeaseCode: renewed.lease.code,
      };
    }

    if (request.type === TenantRequestType.MOVE_OUT) {
      const moveOut = await this.moveouts.create(
        {
          rentalAgreementId: request.rentalAgreementId,
          moveoutDate: request.preferredDate ?? new Date(),
          notes:
            'Requested by the tenant through the portal. ' +
            (payload.notes ?? '').trim(),
        },
        request.organizationId,
      );
      // Raise it as approved: staff have just decided.
      await this.moveouts.approve(
        moveOut.id,
        { notes: 'Approved from the tenant portal request.' },
        request.organizationId,
        userId,
      );

      return {
        action: 'MOVE_OUT_RAISED',
        moveOutRequestId: moveOut.id,
        moveoutDate: (request.preferredDate ?? new Date())
          .toISOString()
          .slice(0, 10),
      };
    }

    // No delegate yet for these types: the decision is recorded and the work is
    // done in the owning module (Finance for a payment plan, Maintenance for a
    // repair). Recorded here so the queue is not silently incomplete.
    return {
      action: 'RECORDED_ONLY',
      note: 'Approved — no automated action exists for this request type yet; complete it in the owning module.',
    };
  }

  // ---------------------------------------------------------------- helpers

  /**
   * The tenant's active lease. A resident can only ever ask about their own
   * current tenancy — there is no path here to another household's lease.
   */
  private async activeLeaseFor(tenantId: string, rentalAgreementId?: string) {
    const lease = await this.prisma.rentalAgreement.findFirst({
      where: {
        tenantId,
        status: AgreementStatus.ACTIVE,
        ...(rentalAgreementId ? { id: rentalAgreementId } : {}),
      },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        code: true,
        organizationId: true,
        status: true,
        endDate: true,
        noticePeriodDays: true,
        rentAmount: true,
        currency: true,
        unit: { select: { id: true, name: true } },
      },
    });

    if (!lease) {
      throw new BadRequestException(
        'You need an active lease before you can request a change.',
      );
    }

    return lease;
  }

  private detailInclude() {
    return {
      tenant: {
        select: {
          id: true,
          code: true,
          surname: true,
          otherNames: true,
          accountNumber: true,
          phone: true,
          email: true,
        },
      },
      rentalAgreement: {
        select: {
          id: true,
          code: true,
          status: true,
          endDate: true,
          rentAmount: true,
          currency: true,
          noticePeriodDays: true,
          unit: { select: { id: true, name: true } },
        },
      },
      decidedBy: { select: { id: true, firstName: true, lastName: true } },
    } as const;
  }

  /** Best-effort audit; a failed write must not fail the decision. */
  private async auditRequest(
    action: string,
    record: { id: string; organizationId: string },
    request: any,
    extra: Record<string, unknown>,
  ) {
    try {
      await this.audit.logAction({
        action,
        entity: 'TenantRequest',
        entityId: record.id,
        details: JSON.stringify(extra),
        ipAddress: request?.ip ?? null,
        userAgent: request?.headers?.['user-agent'] ?? null,
        ...(request?.user?.userId
          ? { user: { connect: { id: request.user.userId } } }
          : {}),
        ...(record.organizationId
          ? { organization: { connect: { id: record.organizationId } } }
          : {}),
      });
    } catch {
      // Auditing is best-effort; the decision itself must still succeed.
    }
  }
}

function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / 86_400_000);
}

function labelFor(type: TenantRequestType): string {
  return type.toLowerCase().replace(/_/g, ' ');
}
