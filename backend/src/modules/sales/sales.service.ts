import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CommissionStatus,
  InstallmentStatus,
  Prisma,
  SaleStage,
} from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { InvoicesService } from '@/modules/finance/invoices/invoices.service';
import type {
  CommissionSplitDto,
  CreateInstallmentPlanDto,
  CreateSaleDto,
  GenerateCommissionsDto,
  UpdateSaleDto,
} from './dto/sale.dto';
import {
  availableSaleStages,
  checkStageChange,
  saleStageLabel,
  STAGE_DATE_FIELD,
  type SaleGateContext,
} from './sale-stage';
import {
  calculateCommissionShares,
  calculateCommissionTotal,
  validateCommissionInput,
} from './commission-calculator';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SaleFilters {
  stage?: string;
  propertyId?: string;
  agentUserId?: string;
  buyerContactId?: string;
}

export interface CommissionFilters {
  agentUserId?: string;
  status?: string;
  saleTransactionId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const SORTABLE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'code',
  'stage',
  'agreedPrice',
  'handoverDate',
]);

const SALE_EXPORT_HEADERS = [
  'code',
  'stage',
  'propertyCode',
  'propertyName',
  'buyer',
  'agent',
  'askingPrice',
  'agreedPrice',
  'bookingFee',
  'depositAmount',
  'currency',
  'commissionRate',
  'commissionEarned',
  'instalments',
  'instalmentsPaid',
  'outstanding',
  'quotationDate',
  'offerDate',
  'reservationDate',
  'agreementDate',
  'handoverDate',
];

/** A sale row as returned by `findAll`, narrowed for CSV export. */
interface SaleListRow {
  code: string;
  stage: string;
  propertyTitle?: string | null;
  askingPrice?: number | string | null;
  agreedPrice?: number | string | null;
  bookingFee?: number | string | null;
  depositAmount?: number | string | null;
  currency: string;
  commissionRate?: number | string | null;
  quotationDate?: Date | null;
  offerDate?: Date | null;
  reservationDate?: Date | null;
  agreementDate?: Date | null;
  handoverDate?: Date | null;
  property?: { code?: string | null; name?: string | null } | null;
  buyerContact?: { firstName?: string | null; lastName?: string | null } | null;
  agent?: { firstName?: string | null; lastName?: string | null } | null;
  installments?: Array<{ amount: number | string; status: string }>;
  commissions?: Array<{ amount: number | string }>;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
  ) {}

  async create(dto: CreateSaleDto, tenantId: string) {
    const property = await requireRecord(
      this.prisma.property.findFirst({
        where: { id: dto.propertyId, organizationId: tenantId },
        select: { id: true, name: true },
      }),
      'Property',
    );

    // `propertyId` is consumed by the nested `property.connect` below; leaving it
    // in the spread would hand Prisma a scalar FK next to a nested write.
    const { buyerContactId, leadId, agentUserId, propertyId, ...scalars } = dto;
    await this.assertReferences(tenantId, {
      buyerContactId,
      leadId,
      agentUserId,
    });

    // One open sale per property: two live negotiations on the same asset is
    // always a data-entry mistake.
    const openSale = await this.prisma.saleTransaction.findFirst({
      where: {
        propertyId,
        organizationId: tenantId,
        stage: { notIn: [SaleStage.HANDOVER, SaleStage.CANCELLED] },
      },
      select: { code: true, stage: true },
    });
    if (openSale) {
      throw new ConflictException(
        `This property already has an open sale (${openSale.code}, ${saleStageLabel(openSale.stage)}).`,
      );
    }

    const now = new Date();

    return this.prisma.saleTransaction.create({
      data: {
        ...scalars,
        code: await this.nextCode(tenantId),
        propertyTitle: dto.propertyTitle ?? property.name,
        property: { connect: { id: propertyId } },
        organization: { connect: { id: tenantId } },
        ...(buyerContactId
          ? { buyerContact: { connect: { id: buyerContactId } } }
          : {}),
        ...(leadId ? { lead: { connect: { id: leadId } } } : {}),
        ...(agentUserId ? { agent: { connect: { id: agentUserId } } } : {}),
        quotationDate: now,
      } as Prisma.SaleTransactionCreateInput,
      include: this.listInclude(),
    });
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: SaleFilters,
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

    const where: Prisma.SaleTransactionWhereInput = {
      organizationId: tenantId,
    };

    if (filters) {
      if (filters.stage) where.stage = filters.stage as SaleStage;
      if (filters.propertyId) where.propertyId = filters.propertyId;
      if (filters.agentUserId) where.agentUserId = filters.agentUserId;
      if (filters.buyerContactId) where.buyerContactId = filters.buyerContactId;
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { propertyTitle: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
        {
          buyerContact: {
            is: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.saleTransaction.findMany({
          where,
          skip,
          take: limit,
          include: this.listInclude(),
          orderBy: { [orderField]: sortOrder },
        }),
        tx.saleTransaction.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /** Pipeline board feed: open sales only. */
  pipeline(tenantId: string, options?: { agentUserId?: string }) {
    return this.prisma.saleTransaction.findMany({
      where: {
        organizationId: tenantId,
        stage: { notIn: [SaleStage.HANDOVER, SaleStage.CANCELLED] },
        ...(options?.agentUserId ? { agentUserId: options.agentUserId } : {}),
      },
      include: this.listInclude(),
      orderBy: [{ stage: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
    });
  }

  /**
   * Sale detail with the payment schedule, the invoices raised against it,
   * commissions, and the stages it may move to right now.
   */
  async findOne(id: string, tenantId: string) {
    const sale = await requireRecord(
      this.prisma.saleTransaction.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          ...this.listInclude(),
          installments: {
            orderBy: { sequence: 'asc' },
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                  dueDate: true,
                  amount: true,
                  paidAmount: true,
                  balanceAmount: true,
                  currency: true,
                  payments: { select: { amount: true } },
                },
              },
            },
          },
          commissions: {
            orderBy: { createdAt: 'asc' },
            include: {
              agent: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              approvedBy: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      'Sale',
    );

    const money = this.summariseMoney(sale);
    const context: SaleGateContext = {
      agreedPrice: numberOrNull(sale.agreedPrice),
      buyerContactId: sale.buyerContactId,
      hasInvoices: sale.installments.some((i) => Boolean(i.invoiceId)),
      outstandingBalance: money.outstanding,
      currency: sale.currency,
    };

    return {
      ...sale,
      money,
      pipeline: { availableStages: availableSaleStages(sale.stage, context) },
    };
  }

  async update(id: string, dto: UpdateSaleDto, tenantId: string) {
    await assertTenantRecord(this.prisma.saleTransaction, {
      id,
      organizationId: tenantId,
    });

    const { buyerContactId, leadId, agentUserId, ...scalars } = dto;
    await this.assertReferences(tenantId, {
      buyerContactId,
      leadId,
      agentUserId,
    });

    return this.prisma.saleTransaction.update({
      where: { id },
      data: {
        ...scalars,
        ...(buyerContactId !== undefined
          ? buyerContactId === null
            ? { buyerContact: { disconnect: true } }
            : { buyerContact: { connect: { id: buyerContactId } } }
          : {}),
        ...(leadId !== undefined
          ? leadId === null
            ? { lead: { disconnect: true } }
            : { lead: { connect: { id: leadId } } }
          : {}),
        ...(agentUserId !== undefined
          ? agentUserId === null
            ? { agent: { disconnect: true } }
            : { agent: { connect: { id: agentUserId } } }
          : {}),
      } as Prisma.SaleTransactionUpdateInput,
      include: this.listInclude(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.saleTransaction, {
      id,
      organizationId: tenantId,
    });

    const sale = await this.prisma.saleTransaction.findUniqueOrThrow({
      where: { id },
      select: { stage: true, installments: { select: { invoiceId: true } } },
    });

    if (sale.stage === SaleStage.HANDOVER) {
      throw new ConflictException(
        'A completed sale cannot be deleted — cancel a new sale instead of removing a finished one.',
      );
    }

    const invoiced = sale.installments.filter((i) => i.invoiceId).length;
    if (invoiced > 0) {
      throw new ConflictException(
        `This sale has ${invoiced} invoice(s) raised against it. Cancel the sale instead of deleting it, so the finance trail survives.`,
      );
    }

    return this.prisma.saleTransaction.delete({ where: { id } });
  }

  // ------------------------------------------------------- stage transitions

  /**
   * Move a sale through the pipeline — the only way `stage` changes.
   * Stamps the stage date on the way in, and on HANDOVER marks the property
   * SOLD so the registry reflects reality.
   */
  async setStage(
    id: string,
    stage: SaleStage,
    tenantId: string,
    reason?: string,
  ) {
    const sale = await requireRecord(
      this.prisma.saleTransaction.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          installments: {
            include: {
              invoice: {
                select: {
                  amount: true,
                  balanceAmount: true,
                  status: true,
                  payments: { select: { amount: true } },
                },
              },
            },
          },
        },
      }),
      'Sale',
    );

    if (stage === SaleStage.CANCELLED && !reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when cancelling a sale.',
      );
    }

    const context: SaleGateContext = {
      agreedPrice: numberOrNull(sale.agreedPrice),
      buyerContactId: sale.buyerContactId,
      hasInvoices: sale.installments.some((i) => Boolean(i.invoiceId)),
      outstandingBalance: outstandingFromInstallments(sale.installments),
      currency: sale.currency,
    };

    const check = checkStageChange(sale.stage, stage, context);
    if (!check.allowed) {
      throw new ConflictException(check.reason);
    }

    const dateField = STAGE_DATE_FIELD[stage];
    const now = new Date();

    const updated = await this.prisma.saleTransaction.update({
      where: { id },
      data: {
        stage,
        ...(dateField ? { [dateField]: now } : {}),
        ...(stage === SaleStage.CANCELLED
          ? { cancellationReason: reason }
          : {}),
      } as Prisma.SaleTransactionUpdateInput,
      include: this.listInclude(),
    });

    if (stage === SaleStage.HANDOVER) {
      // The property is no longer an available asset.
      await this.prisma.property.update({
        where: { id: sale.propertyId },
        data: { status: 'ARCHIVED' },
      });
    }

    return updated;
  }

  // -------------------------------------------------------------- instalments

  /**
   * Replace the payment schedule with an equal monthly plan (plus an optional
   * up-front instalment for the booking fee/deposit).
   */
  async createInstallmentPlan(
    saleId: string,
    dto: CreateInstallmentPlanDto,
    tenantId: string,
  ) {
    const sale = await requireRecord(
      this.prisma.saleTransaction.findFirst({
        where: { id: saleId, organizationId: tenantId },
        select: {
          id: true,
          agreedPrice: true,
          currency: true,
          bookingFee: true,
          depositAmount: true,
        },
      }),
      'Sale',
    );

    const agreed = numberOrNull(sale.agreedPrice);
    if (!agreed || agreed <= 0) {
      throw new BadRequestException(
        'Record the agreed price before scheduling instalments.',
      );
    }

    const alreadyInvoiced = await this.prisma.saleInstallment.count({
      where: { saleTransactionId: saleId, invoiceId: { not: null } },
    });
    if (alreadyInvoiced > 0) {
      throw new ConflictException(
        `This sale already has ${alreadyInvoiced} invoice(s) raised. Cancel those invoices before re-planning the schedule.`,
      );
    }

    const upfront = dto.upfrontAmount ?? 0;
    const financed = Math.max(agreed - upfront, 0);
    const count = dto.installments;
    const per = Math.round((financed / count) * 100) / 100;
    const firstDue = new Date(dto.firstDueDate);
    const intervalDays = dto.intervalDays ?? 30;

    const rows: Prisma.SaleInstallmentCreateManyInput[] = [];
    let sequence = 1;

    if (upfront > 0) {
      rows.push({
        saleTransactionId: saleId,
        sequence,
        description:
          dto.upfrontDescription ??
          (numberOrNull(sale.bookingFee) === upfront
            ? 'Booking fee'
            : 'Deposit'),
        amount: upfront,
        dueDate: firstDue,
        status: InstallmentStatus.SCHEDULED,
      });
      sequence += 1;
    }

    for (let index = 0; index < count; index += 1) {
      const dueDate = new Date(firstDue);
      dueDate.setDate(dueDate.getDate() + index * intervalDays);
      rows.push({
        saleTransactionId: saleId,
        sequence,
        description:
          rows.length === 0 ? 'Instalment 1' : `Instalment ${index + 1}`,
        amount:
          index === count - 1 ? round2(financed - per * (count - 1)) : per,
        dueDate,
        status: InstallmentStatus.SCHEDULED,
      });
      sequence += 1;
    }

    await this.prisma.saleInstallment.deleteMany({
      where: { saleTransactionId: saleId, invoiceId: null },
    });
    await this.prisma.saleInstallment.createMany({ data: rows });

    return this.prisma.saleInstallment.findMany({
      where: { saleTransactionId: saleId },
      orderBy: { sequence: 'asc' },
    });
  }

  /**
   * Raise a Finance invoice for one instalment.
   *
   * Billing goes through `InvoicesService` (Module 2 finance) rather than a
   * parallel sales invoicing path, so sale money lands in the same ledger and
   * payment reconciliation as everything else. Sale invoices are marked with
   * `transactionClass = 'SALE'` and linked back via `saleTransactionId`.
   */
  async invoiceInstallment(
    saleId: string,
    installmentId: string,
    description: string | undefined,
    memo: string | undefined,
    tenantId: string,
  ) {
    const sale = await requireRecord(
      this.prisma.saleTransaction.findFirst({
        where: { id: saleId, organizationId: tenantId },
        include: {
          property: { select: { landlordId: true, name: true } },
          buyerContact: { select: { firstName: true, lastName: true } },
        },
      }),
      'Sale',
    );

    const installment = await requireRecord(
      this.prisma.saleInstallment.findFirst({
        where: { id: installmentId, saleTransactionId: saleId },
      }),
      'Installment',
    );

    if (installment.invoiceId) {
      throw new ConflictException(
        'An invoice has already been raised for this instalment.',
      );
    }
    if (installment.status === InstallmentStatus.WAIVED) {
      throw new ConflictException(
        'This instalment was waived and cannot be invoiced.',
      );
    }

    const amount = numberOrNull(installment.amount);
    const label = description ?? installment.description;

    const invoice = await this.invoicesService.create(
      {
        transactionClass: 'SALE',
        acReceivable: sale.property.landlordId
          ? `Landlord:${sale.property.landlordId}`
          : undefined,
        billTo: sale.buyerContact
          ? `${sale.buyerContact.firstName} ${sale.buyerContact.lastName ?? ''}`.trim()
          : (sale.propertyTitle ?? undefined),
        issueDate: new Date(),
        dueDate: installment.dueDate,
        currency: sale.currency,
        amount,
        totalAmount: amount,
        balanceAmount: amount,
        memo: memo ?? `Sale ${sale.code} — ${label}`,
        landlordId: sale.property.landlordId ?? undefined,
        invoiceItems: [
          {
            revenueExpenseItem: 'Property sale',
            particular: `${label} (sale ${sale.code})`,
            qty: 1,
            unitCost: amount,
            lineTotal: amount,
          },
        ],
      },
      tenantId,
    );

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { saleTransactionId: saleId },
    });

    await this.prisma.saleInstallment.update({
      where: { id: installmentId },
      data: { invoiceId: invoice.id, status: InstallmentStatus.INVOICED },
    });

    return invoice;
  }

  /** Mark an instalment paid/waived by hand (used when a payment is recorded offline). */
  async setInstallmentStatus(
    saleId: string,
    installmentId: string,
    status: InstallmentStatus,
    tenantId: string,
  ) {
    await assertTenantRecord(this.prisma.saleTransaction, {
      id: saleId,
      organizationId: tenantId,
    });

    const installment = await requireRecord(
      this.prisma.saleInstallment.findFirst({
        where: { id: installmentId, saleTransactionId: saleId },
      }),
      'Installment',
    );

    if (status === InstallmentStatus.INVOICED && !installment.invoiceId) {
      throw new BadRequestException(
        'Raise the invoice first — an instalment cannot be marked invoiced without one.',
      );
    }

    return this.prisma.saleInstallment.update({
      where: { id: installmentId },
      data: {
        status,
        paidAt: status === InstallmentStatus.PAID ? new Date() : null,
      },
    });
  }

  /** Re-derive instalment statuses from their invoices (payments land in Finance). */
  async refreshInstallmentStatus(saleId: string, tenantId: string) {
    await assertTenantRecord(this.prisma.saleTransaction, {
      id: saleId,
      organizationId: tenantId,
    });

    const installments = await this.prisma.saleInstallment.findMany({
      where: { saleTransactionId: saleId },
      include: {
        invoice: {
          select: {
            amount: true,
            balanceAmount: true,
            status: true,
            payments: { select: { amount: true } },
          },
        },
      },
    });

    const updated: string[] = [];
    for (const installment of installments) {
      if (!installment.invoice) continue;

      let next: InstallmentStatus = installment.status;
      if (installment.status !== InstallmentStatus.WAIVED) {
        // Same measure as the handover gate: what is left after the payments
        // actually recorded against the invoice.
        const outstanding = outstandingFromInstallments([installment]);
        next =
          outstanding <= 0
            ? InstallmentStatus.PAID
            : InstallmentStatus.INVOICED;
      }

      if (next !== installment.status) {
        await this.prisma.saleInstallment.update({
          where: { id: installment.id },
          data: {
            status: next,
            paidAt:
              next === InstallmentStatus.PAID
                ? (installment.paidAt ?? new Date())
                : null,
          },
        });
        updated.push(installment.id);
      }
    }

    return { updated: updated.length };
  }

  // --------------------------------------------------------------- commissions

  /**
   * Create the commission rows for a sale.
   *
   * Replaces any existing rows so the split can be corrected; already-approved
   * or paid commissions are protected rather than silently overwritten.
   */
  async generateCommissions(
    saleId: string,
    dto: GenerateCommissionsDto,
    tenantId: string,
  ) {
    const sale = await requireRecord(
      this.prisma.saleTransaction.findFirst({
        where: { id: saleId, organizationId: tenantId },
        select: {
          id: true,
          code: true,
          agreedPrice: true,
          currency: true,
          commissionRate: true,
          agentUserId: true,
        },
      }),
      'Sale',
    );

    const rate = dto.commissionRate ?? numberOrNull(sale.commissionRate);
    if (rate === null) {
      throw new BadRequestException(
        'Set a commission rate on the sale before generating commissions.',
      );
    }

    const participants: CommissionSplitDto[] = dto.participants?.length
      ? dto.participants
      : sale.agentUserId
        ? [{ agentUserId: sale.agentUserId, splitPercentage: 100 }]
        : [];

    if (!participants.length) {
      throw new BadRequestException(
        'Assign an agent to the sale, or provide an explicit split.',
      );
    }

    const agreedPrice = numberOrNull(sale.agreedPrice);
    if (agreedPrice === null) {
      throw new BadRequestException(
        'Record the agreed price before generating commissions.',
      );
    }

    const validation = validateCommissionInput({
      agreedPrice,
      commissionRate: rate,
      participants,
    });
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    // Protect money that has already left the building.
    const settled = await this.prisma.commission.count({
      where: {
        saleTransactionId: saleId,
        status: { in: [CommissionStatus.APPROVED, CommissionStatus.PAID] },
      },
    });
    if (settled > 0) {
      throw new ConflictException(
        `${settled} commission(s) on this sale are already approved or paid and cannot be re-split.`,
      );
    }

    const shares = calculateCommissionShares({
      agreedPrice,
      commissionRate: rate,
      participants,
    });

    await this.assertAgents(
      tenantId,
      shares.map((share) => share.agentUserId),
    );

    await this.prisma.commission.deleteMany({
      where: { saleTransactionId: saleId, status: CommissionStatus.PENDING },
    });

    const basis = dto.basis ?? 'SALE';
    const created: Awaited<ReturnType<typeof this.prisma.commission.create>>[] =
      [];
    for (const share of shares) {
      created.push(
        await this.prisma.commission.create({
          data: {
            organizationId: tenantId,
            saleTransactionId: saleId,
            agentUserId: share.agentUserId,
            amount: share.amount,
            splitPercentage: share.splitPercentage,
            currency: sale.currency,
            basis,
            status: CommissionStatus.PENDING,
          },
        }),
      );
    }

    return {
      total: calculateCommissionTotal({
        agreedPrice,
        commissionRate: rate,
      }),
      rate,
      commissions: created,
    };
  }

  findCommissions(tenantId: string, filters?: CommissionFilters) {
    const where: Prisma.CommissionWhereInput = { organizationId: tenantId };
    if (filters) {
      if (filters.agentUserId) where.agentUserId = filters.agentUserId;
      if (filters.saleTransactionId) {
        where.saleTransactionId = filters.saleTransactionId;
      }
      if (filters.status) where.status = filters.status as CommissionStatus;
    }

    return this.prisma.commission.findMany({
      where,
      include: {
        agent: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        saleTransaction: {
          select: { code: true, stage: true, propertyTitle: true },
        },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Per-agent commission totals — the report behind the "commission is visible
   * per agent" acceptance criterion.
   */
  async commissionReport(tenantId: string, filters?: CommissionFilters) {
    const rows = await this.findCommissions(tenantId, filters);

    const byAgent = new Map<
      string,
      {
        agentUserId: string;
        agentName: string;
        agentEmail: string;
        saleCount: number;
        total: number;
        pending: number;
        approved: number;
        paid: number;
      }
    >();

    for (const row of rows) {
      const key = row.agentUserId;
      const entry = byAgent.get(key) ?? {
        agentUserId: key,
        agentName:
          `${row.agent.firstName ?? ''} ${row.agent.lastName ?? ''}`.trim() ||
          row.agent.email,
        agentEmail: row.agent.email,
        saleCount: 0,
        total: 0,
        pending: 0,
        approved: 0,
        paid: 0,
      };

      const amount = numberOrNull(row.amount);
      entry.saleCount += 1;
      entry.total = round2(entry.total + amount);
      if (row.status === CommissionStatus.PAID)
        entry.paid = round2(entry.paid + amount);
      else if (row.status === CommissionStatus.APPROVED) {
        entry.approved = round2(entry.approved + amount);
      } else if (row.status === CommissionStatus.PENDING) {
        entry.pending = round2(entry.pending + amount);
      }
      byAgent.set(key, entry);
    }

    return {
      rows,
      byAgent: Array.from(byAgent.values()).sort((a, b) => b.total - a.total),
    };
  }

  /** Approve or pay a commission. PAID requires APPROVED first. */
  async setCommissionStatus(
    id: string,
    status: CommissionStatus,
    tenantId: string,
    userId?: string,
    details?: { paidRef?: string; notes?: string },
  ) {
    const commission = await requireRecord(
      this.prisma.commission.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Commission',
    );

    if (
      status === CommissionStatus.PAID &&
      commission.status !== CommissionStatus.APPROVED
    ) {
      throw new ConflictException(
        'A commission must be approved before it can be marked paid.',
      );
    }
    if (status === CommissionStatus.PAID && !details?.paidRef) {
      throw new BadRequestException(
        'Record the payment reference when marking a commission paid.',
      );
    }
    if (
      status === CommissionStatus.PENDING &&
      commission.status !== CommissionStatus.REJECTED
    ) {
      throw new ConflictException(
        'A commission can only go back to pending after being rejected.',
      );
    }

    return this.prisma.commission.update({
      where: { id },
      data: {
        status,
        notes: details?.notes ?? commission.notes,
        ...(status === CommissionStatus.APPROVED
          ? { approvedAt: new Date(), approvedById: userId ?? null }
          : {}),
        ...(status === CommissionStatus.PAID
          ? { paidAt: new Date(), paidRef: details?.paidRef ?? null }
          : {}),
      },
      include: {
        agent: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  // ------------------------------------------------------------ export

  async exportCsv(tenantId: string, filters?: SaleFilters, search?: string) {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      filters,
    );

    const rows = (data as unknown as SaleListRow[]).map((sale) => {
      const installments = sale.installments ?? [];
      const total = installments.reduce(
        (sum, installment) => sum + numberOrNull(installment.amount),
        0,
      );
      const paid = installments
        .filter((i) => i.status === InstallmentStatus.PAID)
        .reduce(
          (sum, installment) => sum + numberOrNull(installment.amount),
          0,
        );
      const commission = (sale.commissions ?? []).reduce(
        (sum, row) => sum + numberOrNull(row.amount),
        0,
      );

      return {
        code: sale.code,
        stage: sale.stage,
        propertyCode: sale.property?.code ?? '',
        propertyName: sale.propertyTitle ?? sale.property?.name ?? '',
        buyer: sale.buyerContact
          ? `${sale.buyerContact.firstName ?? ''} ${sale.buyerContact.lastName ?? ''}`.trim()
          : '',
        agent: sale.agent
          ? `${sale.agent.firstName ?? ''} ${sale.agent.lastName ?? ''}`.trim()
          : '',
        askingPrice: sale.askingPrice ?? '',
        agreedPrice: sale.agreedPrice ?? '',
        bookingFee: sale.bookingFee ?? '',
        depositAmount: sale.depositAmount ?? '',
        currency: sale.currency,
        commissionRate: sale.commissionRate ?? '',
        commissionEarned: commission,
        installments: installments.length,
        installmentsPaid: installments.filter(
          (i) => i.status === InstallmentStatus.PAID,
        ).length,
        outstanding: round2(Math.max(total - paid, 0)),
        quotationDate: sale.quotationDate ?? '',
        offerDate: sale.offerDate ?? '',
        reservationDate: sale.reservationDate ?? '',
        agreementDate: sale.agreementDate ?? '',
        handoverDate: sale.handoverDate ?? '',
      };
    });

    return toCsv(SALE_EXPORT_HEADERS, rows);
  }

  // ---------------------------------------------------------------- helpers

  private listInclude() {
    return {
      property: {
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          landlordId: true,
        },
      },
      buyerContact: {
        select: { id: true, firstName: true, lastName: true, type: true },
      },
      agent: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      lead: {
        select: { id: true, firstName: true, lastName: true, stage: true },
      },
      installments: {
        select: { id: true, amount: true, status: true, dueDate: true },
      },
      commissions: {
        select: { id: true, amount: true, status: true, agentUserId: true },
      },
    } as const;
  }

  /** Sale totals used by the detail page and the handover gate. */
  private summariseMoney(sale: {
    agreedPrice: Prisma.Decimal | null;
    installments: Array<{
      amount: Prisma.Decimal;
      status: string;
      invoice: {
        amount: Prisma.Decimal;
        balanceAmount: Prisma.Decimal;
        payments?: Array<{ amount: Prisma.Decimal }>;
      } | null;
    }>;
    commissions: Array<{ amount: Prisma.Decimal }>;
  }) {
    const scheduled = sale.installments.reduce(
      (sum, installment) => sum + numberOrNull(installment.amount),
      0,
    );
    // Same measure the handover gate uses: invoiced balances plus anything
    // scheduled but not yet billed, so the number on screen and the number the
    // server enforces can never disagree.
    const outstanding = outstandingFromInstallments(sale.installments);
    const commission = sale.commissions.reduce(
      (sum, row) => sum + numberOrNull(row.amount),
      0,
    );

    return {
      agreedPrice: numberOrNull(sale.agreedPrice),
      scheduled: round2(scheduled),
      outstanding,
      commission: round2(commission),
    };
  }

  private async nextCode(tenantId: string) {
    const count = await this.prisma.saleTransaction.count({
      where: { organizationId: tenantId },
    });
    const year = new Date().getFullYear();
    return `SALE-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /** Buyer/lead/agent ids must all belong to the caller's organization. */
  private async assertReferences(
    tenantId: string,
    refs: {
      buyerContactId?: string | null;
      leadId?: string | null;
      agentUserId?: string | null;
    },
  ) {
    if (refs.buyerContactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: refs.buyerContactId, organizationId: tenantId },
        select: { id: true },
      });
      if (!contact) {
        throw new BadRequestException(
          'The selected buyer is not in your contacts directory.',
        );
      }
    }

    if (refs.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: refs.leadId, organizationId: tenantId },
        select: { id: true },
      });
      if (!lead) {
        throw new BadRequestException(
          'The selected lead does not exist in your organization.',
        );
      }
    }

    if (refs.agentUserId) {
      await this.assertAgents(tenantId, [refs.agentUserId]);
    }
  }

  private async assertAgents(tenantId: string, agentUserIds: string[]) {
    const unique = Array.from(new Set(agentUserIds));
    if (unique.length === 0) return;

    const agents = await this.prisma.user.findMany({
      where: { id: { in: unique }, organizationId: tenantId },
      select: { id: true },
    });
    const found = new Set(agents.map((agent) => agent.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        'One or more commission agents are not users in your organization.',
      );
    }
  }
}

function numberOrNull(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Outstanding balance of a sale, per instalment.
 *
 * Two deliberate choices here:
 *
 * 1. **Payments are the source of truth, not `Invoice.balanceAmount`.**
 *    `PaymentsService.create` writes a `Payment` row and never updates the
 *    parent invoice's `paidAmount`/`balanceAmount` columns, so trusting those
 *    columns would leave every sale permanently "outstanding" and handover
 *    unreachable. The payments actually recorded against each invoice are
 *    summed here instead. Reconciling the invoice columns themselves is Finance
 *    module work and is listed as a follow-up in `05-MODULE-sales.md`.
 * 2. **A scheduled-but-unbilled instalment still counts as owed**, which is
 *    what stops a sale being handed over before the schedule has been billed.
 */
function outstandingFromInstallments(
  installments: Array<{
    amount: Prisma.Decimal;
    status: string;
    invoice: {
      amount: Prisma.Decimal;
      balanceAmount: Prisma.Decimal;
      payments?: Array<{ amount: Prisma.Decimal }>;
    } | null;
  }>,
): number {
  return round2(
    installments.reduce((sum, installment) => {
      if (installment.status === InstallmentStatus.WAIVED) return sum;

      if (!installment.invoice) {
        return sum + numberOrNull(installment.amount);
      }

      const invoiceAmount = numberOrNull(installment.invoice.amount);
      const paid = (installment.invoice.payments ?? []).reduce(
        (total, payment) => total + numberOrNull(payment.amount),
        0,
      );
      // Fall back to the invoice's stored balance if the payments relation was
      // not loaded (some callers only select the balance column).
      const balance =
        paid > 0
          ? Math.max(invoiceAmount - paid, 0)
          : Math.max(numberOrNull(installment.invoice.balanceAmount), 0);

      return sum + balance;
    }, 0),
  );
}
