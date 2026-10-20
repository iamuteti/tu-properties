import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AgreementStatus, AgreementType, Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { UnitsService } from '@/modules/units/units.service';
import { InvoicesService } from '@/modules/finance/invoices/invoices.service';
import { TRANSACTION_CLASS } from '@/modules/finance/transaction-class';
import {
  DEPOSIT_BASIS,
  computeDepositAmount,
} from '@/modules/security-deposits/deposit-rule';
import {
  DEPOSIT_TRANSACTION_CLASS,
  depositInvoiceFor,
} from '@/modules/security-deposits/deposit-state';
import type {
  CreateAgreementDto,
  ExtendAgreementDto,
  AgreementFilters,
  RenewAgreementDto,
  TerminateAgreementDto,
  UpdateAgreementDto,
} from './dto/agreement.dto';
import {
  availableAgreementActions,
  checkAgreementAction,
  daysUntilEnd,
  RENEWAL_WINDOW_DAYS,
  type AgreementAction,
  type AgreementGateContext,
} from './agreement-lifecycle';

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

const AGREEMENT_EXPORT_HEADERS = [
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

interface AgreementListRow {
  code: string;
  status: string;
  agreementType: string;
  rentAmount?: number | string | null;
  currency: string;
  securityDeposit?: number | string | null;
  startDate: Date;
  endDate?: Date | null;
  tenant?: {
    surname?: string | null;
    otherNames?: string | null;
    code?: string | null;
  } | null;
  unit?: {
    name?: string | null;
    property?: { name?: string | null } | null;
  } | null;
  invoices?: Array<{
    balanceAmount: number | string;
    dueDate?: Date | string | null;
  }>;
}

@Injectable()
export class AgreementsService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
    private invoicesService: InvoicesService,
  ) {}

  // ------------------------------------------------------------------- CRUD

  async create(dto: CreateAgreementDto, tenantId: string) {
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
    const existing = await this.prisma.agreement.findFirst({
      where: {
        unitId,
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        ...(tenantId
          ? { OR: [{ organizationId: tenantId }, { organizationId: null }] }
          : {}),
      },
      select: { code: true, status: true },
    });
    if (existing) {
      throw new ConflictException(
        `This unit already has an open agreement (${existing.code}). Terminate or expire it before creating another.`,
      );
    }

    const startDate = scalars.startDate
      ? new Date(scalars.startDate)
      : new Date();
    const endDate = scalars.endDate ? new Date(scalars.endDate) : null;

    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        'The agreement end date must be after its start date.',
      );
    }

    // The deposit: what the property's rule says for this kind of unit, and
    // what this resident actually agreed to. Two numbers, kept apart, because
    // they answer two different questions and the register shows both.
    const deposit = await this.resolveDeposit({
      unitId,
      rentAmount: scalars.rentAmount,
      agreedAmount: scalars.securityDeposit,
      tenantId,
    });

    const agreement = await this.prisma.agreement.create({
      data: {
        ...scalars,
        securityDeposit: deposit.agreedAmount,
        depositRuleAmount: deposit.ruleAmount,
        code: await this.nextCode(tenantId),
        startDate,
        endDate,
        unit: { connect: { id: unitId } },
        tenant: { connect: { id: dto.tenantId } },
        ...(tenantId ? { organization: { connect: { id: tenantId } } } : {}),
      } as Prisma.AgreementCreateInput,
      include: this.listInclude(),
    });

    // The deposit is billed on its own invoice, due at move-in. It is not rent
    // and it is not part of the monthly cycle, so it carries its own class and
    // the arrears sweep leaves it alone.
    if (deposit.agreedAmount > 0) {
      await this.raiseDepositInvoice(agreement.id, tenantId);
    }

    return agreement;
  }

  /**
   * What the deposit should be, and what has been agreed.
   *
   * The rule is the owner's policy: what this kind of unit costs as a deposit
   * in this property. The agreed amount is this resident's fact, and it may
   * differ — a property manager may agree something else, and then the
   * register shows the rule and the agreement side by side rather than one
   * quietly overwriting the other.
   *
   * A unit whose kind has **no rule** is the awkward case: nobody has decided
   * what a deposit is here. That is not the same as "no deposit", so the
   * agreement cannot be created without somebody saying which it is.
   */
  private async resolveDeposit(input: {
    unitId: string;
    rentAmount?: number | null;
    agreedAmount?: number | null;
    tenantId: string;
  }): Promise<{ ruleAmount: number | null; agreedAmount: number }> {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: input.unitId,
        property: { organizationId: input.tenantId },
      },
      select: {
        unitType: {
          select: {
            id: true,
            code: true,
            name: true,
            depositRule: {
              select: { amount: true, basis: true, months: true },
            },
          },
        },
      },
    });

    const rule = unit?.unitType?.depositRule ?? null;
    const rent = Number(input.rentAmount ?? 0);

    if (!rule) {
      if (input.agreedAmount === undefined || input.agreedAmount === null) {
        throw new BadRequestException(
          unit?.unitType
            ? `No deposit has been set for ${unit.unitType.name} units, and this agreement does not say what the deposit is. Set the rule for that kind of unit, or state the deposit on the agreement.`
            : 'This unit has no kind, so no deposit rule applies to it. Set the deposit on the agreement, or give the unit a kind first.',
        );
      }
      return { ruleAmount: null, agreedAmount: Number(input.agreedAmount) };
    }

    const ruleAmount = computeDepositAmount(
      {
        amount: Number(rule.amount),
        basis: rule.basis,
        months: rule.months === null ? null : Number(rule.months),
      },
      rent,
    );

    return {
      ruleAmount,
      agreedAmount:
        input.agreedAmount === undefined || input.agreedAmount === null
          ? ruleAmount
          : Number(input.agreedAmount),
    };
  }

  /**
   * Bill the deposit.
   *
   * Its own invoice, its own class, due now: a deposit is paid before the
   * resident moves in, and it is not part of the monthly cycle — so it carries
   * no billing period, and the recurring run and the arrears sweep never see
   * it.
   */
  private async raiseDepositInvoice(agreementId: string, tenantId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organizationId: tenantId },
      select: {
        id: true,
        code: true,
        currency: true,
        securityDeposit: true,
        tenant: { select: { surname: true, otherNames: true } },
      },
    });
    if (!agreement) {
      throw new NotFoundException('Agreement not found.');
    }

    const amount = Number(agreement.securityDeposit ?? 0);
    if (amount <= 0) return null;

    const existing = await this.prisma.invoice.findFirst({
      where: {
        agreementId: agreement.id,
        transactionClass: DEPOSIT_TRANSACTION_CLASS,
      },
      select: { id: true },
    });
    if (existing) return existing;

    const now = new Date();
    return this.invoicesService.create(
      {
        transactionClass: TRANSACTION_CLASS.DEPOSIT,
        agreementId: agreement.id,
        issueDate: now,
        dueDate: now,
        currency: agreement.currency,
        billTo:
          `${agreement.tenant.surname} ${agreement.tenant.otherNames ?? ''}`.trim(),
        amount,
        totalAmount: amount,
        balanceAmount: amount,
        status: 'PENDING',
        memo: `Security deposit for agreement ${agreement.code}`,
      },
      tenantId,
    );
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: AgreementFilters,
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

    const where: Prisma.AgreementWhereInput = {
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
        tx.agreement.findMany({
          where,
          skip,
          take: limit,
          include: this.listInclude(),
          orderBy: { [orderField]: sortOrder },
        }),
        tx.agreement.count({ where }),
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

    const leases = await this.prisma.agreement.findMany({
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
      this.prisma.agreement.findFirst({
        where: {
          id,
          OR: [{ organizationId: tenantId }, { organizationId: null }],
        },
        include: {
          ...this.listInclude(),
          renewedTo: {
            select: { id: true, code: true, status: true, endDate: true },
          },
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
      'Agreement',
    );

    const money = this.leaseMoney(lease);
    const context = await this.gateContext(lease, tenantId);

    return {
      ...lease,
      money,
      timeline: {
        daysRemaining: daysUntilEnd(lease.endDate),
        availableActions: availableAgreementActions(lease.status, context),
        notices: this.leaseNotices(lease, context),
      },
    };
  }

  async update(id: string, dto: UpdateAgreementDto, tenantId: string) {
    await assertTenantRecord(this.prisma.agreement, {
      id,
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    });

    const { startDate, endDate, ...scalars } = dto;

    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      throw new BadRequestException(
        'The agreement end date must be after its start date.',
      );
    }

    return this.prisma.agreement.update({
      where: { id },
      data: {
        ...scalars,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      } as Prisma.AgreementUpdateInput,
      include: this.listInclude(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.agreement, {
      id,
      OR: [{ organizationId: tenantId }, { organizationId: null }],
    });

    const lease = await this.prisma.agreement.findUniqueOrThrow({
      where: { id },
      select: { status: true, invoices: { select: { id: true } } },
    });

    if (lease.status === AgreementStatus.ACTIVE) {
      throw new ConflictException(
        'An active agreement cannot be deleted — terminate it so the history and the unit occupancy stay correct.',
      );
    }
    if (lease.invoices.length > 0) {
      throw new ConflictException(
        `This agreement has ${lease.invoices.length} invoice(s) attached. Terminate it instead of deleting it.`,
      );
    }

    return this.prisma.agreement.delete({ where: { id } });
  }

  // -------------------------------------------------------------- lifecycle

  /** Activate a drafted lease and hand the unit over to the tenant. */
  async activate(id: string, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    this.assertAction(
      lease,
      'ACTIVATE',
      await this.gateContext(lease, tenantId),
    );

    // The deposit is paid before the resident moves in, so the agreement does
    // not go live until it has been settled — or until somebody has recorded,
    // with a reason, that this resident is not paying one.
    await this.assertDepositSettled(lease);

    const updated = await this.prisma.agreement.update({
      where: { id },
      data: { status: AgreementStatus.ACTIVE, activatedAt: new Date() },
      include: this.listInclude(),
    });

    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    return updated;
  }

  /**
   * The deposit has to be in hand before the resident gets the keys.
   *
   * Three ways to be here: the deposit is paid, the deposit is zero (the
   * property takes none for this kind of unit, or the owner waived it), or the
   * owner waived it — which is recorded with a reason rather than left as a
   * missing invoice, so the register can show it.
   */
  private async assertDepositSettled(agreement: {
    id: string;
    code: string;
    currency: string;
    securityDeposit: Prisma.Decimal | null;
    depositWaived: boolean;
  }) {
    if (agreement.depositWaived) return { waived: true, settled: true };

    const agreed = Number(agreement.securityDeposit ?? 0);
    if (agreed <= 0) return { waived: false, settled: true };

    const state = await depositInvoiceFor(this.prisma, agreement.id);
    if (state.settled) return { waived: false, settled: true };

    const outstanding = state.balance > 0 ? state.balance : agreed;
    throw new BadRequestException(
      `The deposit for ${agreement.code} has not been paid: ${outstanding.toFixed(2)} ${agreement.currency} is still outstanding. Record the payment, or record that this resident is not paying a deposit.`,
    );
  }

  /**
   * Record that this resident is not paying a deposit.
   *
   * The only way past the gate without paying, so it is stored with who did it
   * and why. The register shows it as a waiver, and the agreement keeps the
   * rule's amount next to the agreed one, so a waived deposit is visible
   * rather than looking like a resident with no deposit.
   */
  async waiveDeposit(
    id: string,
    dto: { reason: string },
    tenantId: string,
    userId?: string,
  ) {
    const agreement = await this.loadForAction(id, tenantId);

    if (agreement.status !== AgreementStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft agreement can have its deposit waived.',
      );
    }

    if (Number(agreement.securityDeposit ?? 0) <= 0) {
      throw new BadRequestException('This agreement has no deposit to waive.');
    }

    return this.prisma.agreement.update({
      where: { id },
      data: {
        depositWaived: true,
        depositWaiverReason: dto.reason,
        depositWaivedById: userId ?? null,
        depositWaivedAt: new Date(),
      },
      include: this.listInclude(),
    });
  }

  /**
   * (Re)bill the deposit.
   *
   * The invoice is raised with the agreement, so this is the recovery path for
   * the rare case where raising it failed — and the way to bill a deposit that
   * was agreed after the agreement was created.
   */
  async billDeposit(id: string, tenantId: string) {
    const agreement = await this.loadForAction(id, tenantId);

    if (Number(agreement.securityDeposit ?? 0) <= 0) {
      throw new BadRequestException('This agreement has no deposit to bill.');
    }

    const invoice = await this.raiseDepositInvoice(agreement.id, tenantId);
    return { agreementId: agreement.id, invoice };
  }

  /**
   * Renew: creates the successor agreement, links both sides of the renewal
   * chain, closes the old one as RENEWED and leaves the unit occupied.
   *
   * The successor is a real row rather than a date bump because the rent,
   * deposit and term may all change — and because occupancy history should show
   * the tenancies, not the paperwork edits.
   */
  async renew(id: string, dto: RenewAgreementDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'RENEW', context);

    if (lease.renewedToId) {
      throw new ConflictException(
        'This agreement has already been renewed. Renew the newest agreement in the chain instead.',
      );
    }

    const start =
      dto.newStartDate ??
      (lease.endDate ? addDays(lease.endDate, 1).toISOString() : undefined);

    if (!start) {
      throw new BadRequestException(
        'This agreement has no end date, so the renewal needs an explicit start date.',
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

    // The deposit is inherited, not re-charged: the resident is not moving in
    // and keeps the money they paid. It is also **re-priced** when the rule is
    // a multiple of the rent and the rent has moved, because a deposit that
    // quietly drifts out of step with the rent it secures is the problem the
    // rule exists to prevent. The difference is recorded on the successor as
    // an adjustment: what the resident owes, or what the estate owes back.
    const newRent = dto.rentAmount ?? Number(lease.rentAmount);
    const inherited = await this.inheritedDeposit({
      agreement: lease,
      newRent,
      tenantId,
    });

    const successor = await this.prisma.agreement.create({
      data: {
        code: await this.nextCode(tenantId),
        unit: { connect: { id: lease.unitId } },
        tenant: { connect: { id: lease.tenantId } },
        organization: lease.organizationId
          ? { connect: { id: lease.organizationId } }
          : { connect: { id: tenantId } },
        agreementType: lease.agreementType,
        rentAmount: newRent,
        currency: dto.currency ?? lease.currency,
        securityDeposit: inherited.amount,
        depositRuleAmount: inherited.ruleAmount,
        depositAdjustment: inherited.adjustment,
        depositWaived: lease.depositWaived,
        depositWaiverReason: lease.depositWaiverReason,
        depositWaivedById: lease.depositWaivedById,
        depositWaivedAt: lease.depositWaivedAt,
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
      } as Prisma.AgreementCreateInput,
      include: this.listInclude(),
    });

    await this.prisma.agreement.update({
      where: { id: lease.id },
      data: { status: AgreementStatus.RENEWED, renewedToId: successor.id },
    });

    // The tenant continues, so the unit stays occupied.
    await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);

    return { previous: { id: lease.id, code: lease.code }, lease: successor };
  }

  /**
   * The deposit a renewal carries forward.
   *
   * The resident is not moving in, so nothing is re-charged: the successor
   * inherits the deposit the predecessor took, and the money stays where it
   * is.
   *
   * The one thing that can change is the **rule**. "One month's rent" is not a
   * number, so when the renewal moves the rent, the deposit moves with it —
   * and the difference is recorded, because a resident whose rent went up
   * should be told what the deposit now is, and a resident whose deposit is
   * larger than the new rule should be told what is owed back.
   */
  private async inheritedDeposit(input: {
    agreement: {
      id: string;
      securityDeposit: Prisma.Decimal | null;
      depositRuleAmount: Prisma.Decimal | null;
      unitId: string;
    };
    newRent: number;
    tenantId: string;
  }): Promise<{
    amount: number;
    ruleAmount: number | null;
    adjustment: number | null;
  }> {
    const current = Number(input.agreement.securityDeposit ?? 0);
    if (current <= 0) {
      return { amount: 0, ruleAmount: null, adjustment: null };
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: input.agreement.unitId },
      select: {
        unitType: {
          select: {
            depositRule: {
              select: { amount: true, basis: true, months: true },
            },
          },
        },
      },
    });

    const rule = unit?.unitType?.depositRule ?? null;
    if (!rule || rule.basis !== DEPOSIT_BASIS.RENT_MONTHS) {
      // A fixed deposit, or no rule at all: the amount simply carries over.
      return {
        amount: current,
        ruleAmount:
          input.agreement.depositRuleAmount === null
            ? null
            : Number(input.agreement.depositRuleAmount),
        adjustment: null,
      };
    }

    const ruleAmount = computeDepositAmount(
      {
        amount: Number(rule.amount),
        basis: rule.basis,
        months: rule.months === null ? null : Number(rule.months),
      },
      input.newRent,
    );

    const adjustment = Math.round((ruleAmount - current) * 100) / 100;

    return {
      amount: current,
      ruleAmount,
      adjustment: adjustment === 0 ? null : adjustment,
    };
  }

  /** Extend in place — used for rolling monthlies with no fixed end date. */
  async extend(id: string, dto: ExtendAgreementDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    this.assertAction(lease, 'EXTEND', await this.gateContext(lease, tenantId));

    const newEnd = new Date(dto.newEndDate);
    if (lease.endDate && newEnd <= lease.endDate) {
      throw new BadRequestException(
        'An extension has to move the end date later, not earlier.',
      );
    }

    const updated = await this.prisma.agreement.update({
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
  async terminate(id: string, dto: TerminateAgreementDto, tenantId: string) {
    const lease = await this.loadForAction(id, tenantId);
    const context = await this.gateContext(lease, tenantId);
    this.assertAction(lease, 'TERMINATE', context);

    const updated = await this.prisma.agreement.update({
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
        where: { agreementId: id },
        include: { payments: { select: { amount: true } } },
      }),
    });

    // Vacate the unit only if no successor agreement took over.
    const successor = await this.prisma.agreement.findFirst({
      where: {
        unitId: lease.unitId,
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        id: { not: lease.id },
        ...(tenantId
          ? { OR: [{ organizationId: tenantId }, { organizationId: null }] }
          : {}),
      },
      select: { id: true },
    });
    if (!successor) {
      await this.unitsService.syncOccupancyStatus(lease.unitId, tenantId);
    }

    // The tenant is no longer a current occupier of anything.
    const stillActive = await this.prisma.agreement.count({
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

    const updated = await this.prisma.agreement.update({
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

    const updated = await this.prisma.agreement.update({
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
      where: { agreementId: id },
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
          agreements: {
            orderBy: { startDate: 'asc' },
            include: {
              tenant: {
                select: {
                  id: true,
                  surname: true,
                  otherNames: true,
                  code: true,
                },
              },
            },
          },
        },
      }),
      'Unit',
    );

    const periods = unit.agreements.map((agreement) => {
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
            (current.start.getTime() - previous.end.getTime()) /
              (24 * 60 * 60 * 1000),
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
          periods.find(
            (period) => period.agreementStatus === AgreementStatus.ACTIVE,
          )?.tenant ?? null,
      },
    };
  }

  // ------------------------------------------------------------------ export

  async exportCsv(
    tenantId: string,
    filters?: AgreementFilters,
    search?: string,
  ) {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      filters,
    );

    const rows = (data as unknown as AgreementListRow[]).map((lease) => {
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

    return toCsv(AGREEMENT_EXPORT_HEADERS, rows);
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
      this.prisma.agreement.findFirst({
        where: {
          id,
          OR: [{ organizationId: tenantId }, { organizationId: null }],
        },
        include: { unit: true, tenant: true },
      }),
      'Lease',
    );
  }

  private assertAction(
    lease: {
      status: AgreementStatus;
      unitId: string;
      tenantId: string;
      startDate: Date;
      endDate: Date | null;
    },
    action: AgreementAction,
    context: AgreementGateContext,
  ) {
    const check = checkAgreementAction(lease.status, action, context);
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
  ): Promise<AgreementGateContext> {
    const otherActive = await this.prisma.agreement.findFirst({
      where: {
        unitId: lease.unitId,
        id: { not: (lease as { id?: string }).id ?? '' },
        status: { in: [AgreementStatus.DRAFT, AgreementStatus.ACTIVE] },
        ...(tenantId
          ? { OR: [{ organizationId: tenantId }, { organizationId: null }] }
          : {}),
      },
      select: { id: true },
    });

    const moveOut = await this.prisma.moveOutRequest.findFirst({
      where: {
        agreementId: (lease as { id?: string }).id ?? '',
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
   * Agreement money. Unpaid rent is measured from the recorded payments, not from
   * `Invoice.balanceAmount` — finance never reconciles that column (see the
   * known-issues list), so trusting it would report every agreement as fully
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
    lease: {
      status: AgreementStatus;
      endDate: Date | null;
      terminatedReason?: string | null;
    },
    context: AgreementGateContext,
  ): string[] {
    const notices: string[] = [];
    const remaining = daysUntilEnd(lease.endDate);

    if (
      lease.endDate &&
      remaining !== null &&
      remaining <= 0 &&
      lease.status === AgreementStatus.ACTIVE
    ) {
      notices.push(
        'This agreement has passed its end date — expire it to free the unit.',
      );
    } else if (
      remaining !== null &&
      remaining <= RENEWAL_WINDOW_DAYS &&
      lease.status === AgreementStatus.ACTIVE
    ) {
      notices.push(`Ends in ${remaining} day(s) — renewal is open.`);
    }

    if (
      context.hasOtherActiveAgreement &&
      lease.status !== AgreementStatus.RENEWED
    ) {
      notices.push('Another agreement is already open on this unit.');
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
    const count = await this.prisma.agreement.count({
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
