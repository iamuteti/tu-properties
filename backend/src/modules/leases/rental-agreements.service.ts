import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AgreementStatus, AgreementType, Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { UnitsService } from '@/modules/units/units.service';
import type {
  CreateRentalAgreementDto,
  ExtendLeaseDto,
  LeaseFilters,
  RenewLeaseDto,
  TerminateLeaseDto,
  UpdateRentalAgreementDto,
} from './dto/lease.dto';
import {
  availableLeaseActions,
  checkLeaseAction,
  daysUntilEnd,
  RENEWAL_WINDOW_DAYS,
  type LeaseAction,
  type LeaseGateContext,
} from './lease-lifecycle';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const SORTABLE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'code',
  'status',
  'startDate',
  'endDate',
  'rentAmount',
]);

const LEASE_EXPORT_HEADERS = [
  'code',
  'status',
  'type',
  'tenant',
  'tenantCode',
  'unit',
  'property',
  'rentAmount',
  'currency',
  'securityDeposit',
  'startDate',
  'endDate',
  'daysToExpiry',
  'arrears',
  'outstanding',
];

interface LeaseListRow {
  code: string;
  status: string;
  agreementType: string;
  rentAmount?: number | string | null;
  currency: string;
  securityDeposit?: number | string | null;
  startDate: Date;
  endDate?: Date | null;
  tenant?: { surname?: string | null; otherNames?: string | null; code?: string | null } | null;
  unit?: { name?: string | null; property?: { name?: string | null } | null } | null;
  invoices?: Array<{ balanceAmount: number | string; dueDate?: Date | string | null }>;
}

@Injectable()
export class RentalAgreementsService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  // ------------------------------------------------------------------- CRUD

  async create(dto: CreateRentalAgreementDto, tenantId: string) {
    const { unitId, tenantId: _tenantId, ...scalars } = dto;
    void _tenantId;

    await assertTenantRecord(this.prisma.unit, {
      id: unitId,
      property: { organizationId: tenantId },
    });
    await assertTenantRecord(this.prisma.tenant, {
      id: dto.tenantId,
      organizationId: tenantId,
    });

    // One live agreement per unit: two tenants cannot hold the same flat.
    const existing = await this.prisma.rentalAgreement.findFirst({
      where: {
        unitId,
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        ...(tenantId ? { OR: [{ organizationId: tenantId }, { organizationId: null }] } : {}),
      },
      select: { code: true, status: true },
    });
    if (existing) {
      throw new ConflictException(
        `This unit already has an open lease (${existing.code}). Terminate or expire it before creating another.`,
      );
    }

    const startDate = scalars.startDate ? new Date(scalars.startDate) : new Date();
    const endDate = scalars.endDate ? new Date(scalars.endDate) : null;

    if (endDate && endDate <= startDate) {
      throw new BadRequestException('The lease end date must be after its start date.');
    }

    return this.prisma.rentalAgreement.create({
      data: {
        ...scalars,
        code: await this.nextCode(tenantId),
        startDate,
        endDate,
        unit: { connect: { id: unitId } },
        tenant: { connect: { id: dto.tenantId } },
        ...(tenantId ? { organization: { connect: { id: tenantId } } } : {}),
      } as Prisma.RentalAgreementCreateInput,
      include: this.listInclude(),
    });
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: LeaseFilters,
  ): Promise<PaginatedResult<unknown>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;
    const orderField = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';

    const where: Prisma.RentalAgreementWhereInput = {
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    };

    if (filters) {
      if (filters.status) where.status = filters.status as AgreementStatus;
      if (filters.agreementType) {
        where.agreementType = filters.agreementType as AgreementType;
      }
      if (filters.unitId) where.unitId = filters.unitId;
      if (filters.tenantId) where.tenantId = filters.tenantId;
      if (filters.propertyId) where.unit = { propertyId: filters.propertyId };
      if (filters.expiringInDays) {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + filters.expiringInDays);
        where.endDate = { not: null, lte: horizon };
        where.status = AgreementStatus.ACTIVE;
      }
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            {
              tenant: {
                is: {
                  OR: [
                    { surname: { contains: search, mode: 'insensitive' } },
                    { otherNames: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
            {
              unit: {
                is: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    {
                      property: {
                        is: { name: { contains: search, mode: 'insensitive' } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.rentalAgreement.findMany({
          where,
          skip,
          take: limit,
          include: this.listInclude(),
          orderBy: { [orderField]: sortOrder },
        }),
        tx.rentalAgreement.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /**
   * Expiry reminder stub (checklist item: "stub as a scheduled query until
   * Notifications exists"). Returns the leases ending inside the window with
   * the tenant contact details a reminder would need.
   */
  async expiring(tenantId: string, days = RENEWAL_WINDOW_DAYS) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);

    const leases = await this.prisma.rentalAgreement.findMany({
      where: {
        OR: [{ organizationId: tenantId }, { organizationId: null }],
        status: AgreementStatus.ACTIVE,
        endDate: { not: null, lte: horizon },
      },
      include: this.listInclude(),
      orderBy: { endDate: 'asc' },
      take: 200,
    });

    return leases.map((lease) => ({
      ...lease,
      daysRemaining: daysUntilEnd(lease.endDate),
      // Surfaced so the UI can show who to call; delivery comes with Module 18.
      reminderTarget: {
        name: `${lease.tenant.surname} ${lease.tenant.otherNames ?? ''}`.trim(),
        phone: lease.tenant.phone,
        email: lease.tenant.email,
      },
    }));
  }

  /**
   * Lease detail with the money view, the renewal chain and the actions that
   * are currently legal.
   */
  async findOne(id: string, tenantId: string) {
    const lease = await requireRecord(
      this.prisma.rentalAgreement.findFirst({
        where: { id, OR: [{ organizationId: tenantId }, { organizationId: null }] },
        include: {
          ...this.listInclude(),
          renewedTo: { select: { id: true, code: true, status: true, endDate: true } },
          renewedFrom: {
            select: { id: true, code: true, status: true, endDate: true },
          },
          moveOutRequests: {
            orderBy: { createdAt: 'desc' },
            include: { deductions: true },
          },
          inspections: {
            orderBy: { scheduledDate: 'desc' },
            include: { items: true },
          },
          invoices: {
            orderBy: { dueDate: 'desc' },
            include: { payments: { select: { amount: true } } },
          },
          payments: { orderBy: { paymentDate: 'desc' } },
        },
      }),
      'Lease',
    );

    const money = this.leaseMoney(lease);
    const context = await this.gateContext(lease, tenantId);

    return {
      ...lease,
      money,
      timeline: {
        daysRemaining: daysUntilEnd(lease.endDate),
        availableActions: availableLeaseActions(lease.status, context),
        notices: this.leaseNotices(lease, context),
      },
    };
  }

  async update(id: string, dto: UpdateRentalAgreementDto, tenantId: string) {
    await assertTenantRecord(this.prisma.rentalAgreement, {
      id,
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    });

    const { startDate, endDate, ...scalars } = dto;

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      throw new BadRequestException('The lease end date must be after its start date.');
    }

    return this.prisma.rentalAgreement.update({
      where: { id },
      data: {
        ...scalars,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      } as Prisma.RentalAgreementUpdateInput,
      include: this.listInclude(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.rentalAgreement, {
      id,
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    });

    const lease = await this.prisma.rentalAgreement.findUniqueOrThrow({
      where: { id },
      select: { status: true, invoices: { select: { id: true } } },
    });

    if (lease.status === AgreementStatus.ACTIVE) {
      throw new ConflictException(
        'An active lease cannot be deleted — terminate it so the history and the unit occupancy stay correct.',
      );
    }
    if (lease.invoices.length > 0) {
      throw new ConflictException(
        `This lease has ${lease.invoices.length} invoice(s) attached. Terminate it instead of deleting it.`,
      );
    }

    return this.prisma.rentalAgreement.delete({ where: { id } });
  }

  // -------------------------------------------------------------- lifecycle

  /** Activate a drafted lease and hand the unit over to the tenant. */
  async activate(id: string, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    this.assertAction(lease, 'ACTIVATE', await this.gateContext(lease, tenantId));

    const updated = await this.prisma.rentalAgreement.update({
      where: { id },
      data: { status: AgreementStatus.ACTIVE, activatedAt: new Date() },
      include: this.listInclude(),
    });

    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    return updated;
  }

  /**
   * Renew: creates the successor agreement, links both sides of the renewal
   * chain, closes the old one as RENEWED and leaves the unit occupied.
   *
   * The successor is a real row rather than a date bump because the rent,
   * deposit and term may all change — and because occupancy history should show
   * the tenancies, not the paperwork edits.
   */
  async renew(id: string, dto: RenewLeaseDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'RENEW', context);

    if (lease.renewedToId) {
      throw new ConflictException(
        'This lease has already been renewed. Renew the newest agreement in the chain instead.',
      );
    }

    const start =
      dto.newStartDate ??
      (lease.endDate ? addDays(lease.endDate, 1).toISOString() : undefined);

    if (!start) {
      throw new BadRequestException(
        'This lease has no end date, so the renewal needs an explicit start date.',
      );
    }

    const end = dto.newEndDate
      ? new Date(dto.newEndDate)
      : dto.termMonths
        ? addMonths(new Date(start), dto.termMonths)
        : lease.endDate
          ? addMonths(new Date(start), lease.termMonths ?? 12)
          : null;

    if (end && end <= new Date(start)) {
      throw new BadRequestException(
        'The renewed term must end after it starts.',
      );
    }

    const successor = await this.prisma.rentalAgreement.create({
      data: {
        code: await this.nextCode(tenantId),
        unit: { connect: { id: lease.unitId } },
        tenant: { connect: { id: lease.tenantId } },
        organization: lease.organizationId
          ? { connect: { id: lease.organizationId } }
          : { connect: { id: tenantId } },
        agreementType: lease.agreementType,
        rentAmount: dto.rentAmount ?? lease.rentAmount,
        currency: dto.currency ?? lease.currency,
        securityDeposit: dto.securityDeposit ?? lease.securityDeposit,
        noticePeriodDays: lease.noticePeriodDays,
        escalationRate: lease.escalationRate,
        escalationMonth: lease.escalationMonth,
        paymentDay: lease.paymentDay,
        termMonths: dto.termMonths ?? lease.termMonths,
        startDate: new Date(start),
        endDate: end,
        status: AgreementStatus.ACTIVE,
        activatedAt: new Date(),
        renewedFrom: { connect: { id: lease.id } },
      } as Prisma.RentalAgreementCreateInput,
      include: this.listInclude(),
    });

    await this.prisma.rentalAgreement.update({
      where: { id: lease.id },
      data: { status: AgreementStatus.RENEWED, renewedToId: successor.id },
    });

    // The tenant continues, so the unit stays occupied.
    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);

    return { previous: { id: lease.id, code: lease.code }, lease: successor };
  }

  /** Extend in place — used for rolling monthlies with no fixed end date. */
  async extend(id: string, dto: ExtendLeaseDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    this.assertAction(lease, 'EXTEND', await this.gateContext(lease, tenantId));

    const newEnd = new Date(dto.newEndDate);
    if (lease.endDate && newEnd <= lease.endDate) {
      throw new BadRequestException(
        'An extension has to move the end date later, not earlier.',
      );
    }

    const updated = await this.prisma.rentalAgreement.update({
      where: { id },
      data: { endDate: newEnd },
      include: this.listInclude(),
    });

    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    return updated;
  }

  /**
   * Early termination. The reason is recorded, the unit becomes vacant unless a
   * renewal/extension took over, and arrears are reported rather than hidden —
   * a tenant leaving owing money is ordinary, so termination is not blocked, but
   * the caller always learns what is outstanding.
   */
  async terminate(id: string, dto: TerminateLeaseDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'TERMINATE', context);

    const updated = await this.prisma.rentalAgreement.update({
      where: { id },
      data: {
        status: AgreementStatus.TERMINATED,
        terminatedAt: new Date(),
        terminatedReason: dto.reason,
      },
      include: this.listInclude(),
    });

    const money = this.leaseMoney({
      invoices: await this.prisma.invoice.findMany({
        where: { rentalAgreementId: id },
        include: { payments: { select: { amount: true } } },
      }),
    });

    // Vacate the unit only if no successor agreement took over.
    const successor = await this.prisma.rentalAgreement.findFirst({
      where: {
        unitId: lease.unitId,
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        id: { not: lease.id },
        ...(tenantId ? { OR: [{ organizationId: tenantId }, { organizationId: null }] } : {}),
      },
      select: { id: true },
    });
    if (!successor) {
      await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    }

    // The tenant is no longer a current occupier of anything.
    const stillActive = await this.prisma.rentalAgreement.count({
      where: {
        tenantId: lease.tenantId,
        status: AgreementStatus.ACTIVE,
        id: { not: lease.id },
      },
    });
    if (stillActive === 0) {
      await this.prisma.tenant.update({
        where: { id: lease.tenantId },
        data: { status: 'INACTIVE' },
      });
    }

    return {
      lease: updated,
      outstanding: money.outstanding,
      arrears: money.arrears,
      unitVacated: !successor,
    };
  }

  /** Let a lease run out at its end date. */
  async expire(id: string, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'EXPIRE', context);

    const updated = await this.prisma.rentalAgreement.update({
      where: { id },
      data: { status: AgreementStatus.EXPIRED, expiredAt: new Date() },
      include: this.listInclude(),
    });

    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    return updated;
  }

  /** Put an expired lease back in force (e.g. the tenant never left). */
  async reactivate(id: string, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'REACTIVATE', context);

    const updated = await this.prisma.rentalAgreement.update({
      where: { id },
      data: { status: AgreementStatus.ACTIVE, expiredAt: null },
      include: this.listInclude(),
    });

    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    return updated;
  }

  // --------------------------------------------------------- ledger & history

  /** Everything billed and collected against one lease. */
  async ledger(id: string, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);

    const invoices = await this.prisma.invoice.findMany({
      where: { rentalAgreementId: id },
      orderBy: { dueDate: 'desc' },
      include: { payments: { orderBy: { paymentDate: 'desc' } } },
    });

    const money = this.leaseMoney({ ...lease, invoices });

    return {
      money,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        amount: Number(invoice.amount),
        paid: invoice.payments.reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        ),
        status: invoice.status,
      })),
    };
  }

  /**
   * Occupancy history for a unit: every tenancy in order, plus the vacant gaps
   * between them. Derived from the agreements rather than stored, so it cannot
   * drift from the leases themselves.
   */
  async occupancyHistory(unitId: string, tenantId: string) {
    await assertTenantRecord(this.prisma.unit, {
      id: unitId,
      property: { organizationId: tenantId },
    });

    const unit = await requireRecord(
      this.prisma.unit.findFirst({
        where: { id: unitId },
        include: {
          property: { select: { id: true, name: true, code: true } },
          rentalAgreements: {
            orderBy: { startDate: 'asc' },
            include: {
              tenant: {
                select: { id: true, surname: true, otherNames: true, code: true },
              },
            },
          },
        },
      }),
      'Unit',
    );

    const periods = unit.rentalAgreements.map((agreement) => {
      const start = agreement.startDate;
      const end =
        agreement.terminatedAt ??
        agreement.endDate ??
        (agreement.status === AgreementStatus.ACTIVE ? new Date() : null);

      return {
        kind: 'tenancy' as const,
        agreementId: agreement.id,
        agreementCode: agreement.code,
        agreementStatus: agreement.status,
        tenant: agreement.tenant,
        start,
        end,
        occupiedDays: end
          ? Math.max(
              1,
              Math.round(
                (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
              ),
            )
          : null,
      };
    });

    // Vacant gaps: between the end of one tenancy and the start of the next.
    const gaps: Array<{
      kind: 'vacancy';
      start: Date;
      end: Date;
      vacantDays: number;
    }> = [];

    for (let index = 1; index < periods.length; index += 1) {
      const previous = periods[index - 1];
      const current = periods[index];
      if (previous.end && current.start > previous.end) {
        gaps.push({
          kind: 'vacancy',
          start: previous.end,
          end: current.start,
          vacantDays: Math.round(
            (current.start.getTime() - previous.end.getTime()) / (24 * 60 * 60 * 1000),
          ),
        });
      }
    }

    return {
      unit: { id: unit.id, name: unit.name, property: unit.property },
      status: unit.status,
      periods: [...periods, ...gaps].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      ),
      summary: {
        tenancies: periods.length,
        totalOccupiedDays: periods.reduce(
          (sum, period) => sum + (period.occupiedDays ?? 0),
          0,
        ),
        totalVacantDays: gaps.reduce((sum, gap) => sum + gap.vacantDays, 0),
        currentTenant:
          periods.find((period) => period.agreementStatus === AgreementStatus.ACTIVE)
            ?.tenant ?? null,
      },
    };
  }

  // ------------------------------------------------------------------ export

  async exportCsv(tenantId: string, filters?: LeaseFilters, search?: string) {
    const { data } = await this.findAll(tenantId, { limit: 10000, search }, filters);

    const rows = (data as unknown as LeaseListRow[]).map((lease) => {
      const money = this.leaseMoney(lease as never);
      return {
        code: lease.code,
        status: lease.status,
        type: lease.agreementType,
        tenant: lease.tenant
          ? `${lease.tenant.surname} ${lease.tenant.otherNames ?? ''}`.trim()
          : '',
        tenantCode: lease.tenant?.code ?? '',
        unit: lease.unit?.name ?? '',
        property: lease.unit?.property?.name ?? '',
        rentAmount: lease.rentAmount ?? '',
        currency: lease.currency,
        securityDeposit: lease.securityDeposit ?? '',
        startDate: lease.startDate,
        endDate: lease.endDate ?? '',
        daysToExpiry: daysUntilEnd(lease.endDate ?? null) ?? '',
        arrears: money.arrears,
        outstanding: money.outstanding,
      };
    });

    return toCsv(LEASE_EXPORT_HEADERS, rows);
  }

  // ---------------------------------------------------------------- helpers

  private listInclude() {
    return {
      unit: {
        select: {
          id: true,
          name: true,
          code: true,
          propertyId: true,
          property: { select: { id: true, name: true, code: true } },
        },
      },
      tenant: {
        select: {
          id: true,
          code: true,
          surname: true,
          otherNames: true,
          email: true,
          phone: true,
          accountNumber: true,
        },
      },
      _count: { select: { invoices: true } },
    } as const;
  }

  private async loadForAction(id: string, tenantId: string) {
    return requireRecord(
      this.prisma.rentalAgreement.findFirst({
        where: { id, OR: [{ organizationId: tenantId }, { organizationId: null }] },
        include: { unit: true, tenant: true },
      }),
      'Lease',
    );
  }

  private assertAction(
    lease: { status: AgreementStatus; unitId: string; tenantId: string; startDate: Date; endDate: Date | null },
    action: LeaseAction,
    context: LeaseGateContext,
  ) {
    const check = checkLeaseAction(lease.status, action, context);
    if (!check.allowed) {
      throw new ConflictException(check.reason);
    }
  }

  /** Facts the lifecycle rules need, read from the database. */
  private async gateContext(
    lease: {
      unitId: string;
      startDate: Date;
      endDate: Date | null;
      status: AgreementStatus;
    },
    tenantId: string,
  ): Promise<LeaseGateContext> {
    const otherActive = await this.prisma.rentalAgreement.findFirst({
      where: {
        unitId: lease.unitId,
        id: { not: (lease as { id?: string }).id ?? '' },
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        ...(tenantId ? { OR: [{ organizationId: tenantId }, { organizationId: null }] } : {}),
      },
      select: { id: true },
    });

    const moveOut = await this.prisma.moveOutRequest.findFirst({
      where: {
        rentalAgreementId: (lease as { id?: string }).id ?? '',
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true },
    });

    return {
      startDate: lease.startDate,
      endDate: lease.endDate,
      hasOtherActiveAgreement: Boolean(otherActive),
      moveOutRequested: Boolean(moveOut),
    };
  }

  /**
   * Lease money. Unpaid rent is measured from the recorded payments, not from
   * `Invoice.balanceAmount` — finance never reconciles that column (see the
   * known-issues list), so trusting it would report every lease as fully
   * outstanding.
   */
  private leaseMoney(lease: {
    invoices?: Array<{
      amount: Prisma.Decimal | number | string;
      dueDate?: Date | string | null;
      payments?: Array<{ amount: Prisma.Decimal | number | string }>;
    }>;
  }) {
    let invoiced = 0;
    let paid = 0;
    let arrears = 0;
    const now = new Date();

    for (const invoice of lease.invoices ?? []) {
      const amount = Number(invoice.amount);
      const settled = (invoice.payments ?? []).reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      invoiced += amount;
      paid += settled;
      if (invoice.dueDate && new Date(invoice.dueDate) < now) {
        arrears += Math.max(amount - settled, 0);
      }
    }

    return {
      invoiced: round2(invoiced),
      paid: round2(paid),
      outstanding: round2(Math.max(invoiced - paid, 0)),
      arrears: round2(arrears),
    };
  }

  /** Advisory notices the detail page shows above the action buttons. */
  private leaseNotices(
    lease: { status: AgreementStatus; endDate: Date | null; terminatedReason?: string | null },
    context: LeaseGateContext,
  ): string[] {
    const notices: string[] = [];
    const remaining = daysUntilEnd(lease.endDate);

    if (lease.endDate && remaining !== null && remaining <= 0 && lease.status === AgreementStatus.ACTIVE) {
      notices.push('This lease has passed its end date — expire it to free the unit.');
    } else if (remaining !== null && remaining <= RENEWAL_WINDOW_DAYS && lease.status === AgreementStatus.ACTIVE) {
      notices.push(
        `Ends in ${remaining} day(s) — renewal is open.`,
      );
    }

    if (context.hasOtherActiveAgreement && lease.status !== AgreementStatus.RENEWED) {
      notices.push('Another lease is already open on this unit.');
    }
    if (context.moveOutRequested) {
      notices.push('A move-out request is open against this tenancy.');
    }
    if (lease.terminatedReason) {
      notices.push(`Terminated: ${lease.terminatedReason}`);
    }

    return notices;
  }

  private async nextCode(tenantId: string) {
    const count = await this.prisma.rentalAgreement.count({
      where: { OR: [{ organizationId: tenantId }, { organizationId: null }] },
    });
    return `RA-${String(count + 1).padStart(6, '0')}`;
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
