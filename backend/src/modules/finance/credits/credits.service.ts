import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditStatus, CustomerCreditSource, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { allocateToInvoice, round2 } from '../invoice-allocation';

type Tx = Prisma.TransactionClient;

/**
 * Module 8 — Payments: credit balances.
 *
 * When a customer pays more than they owe, the surplus is the company's
 * liability to them, not a rounding error. Every overpayment, unallocated
 * receipt and goodwill gesture becomes a `CustomerCredit`, which is spent
 * oldest-invoice-first so nobody has to remember to apply it.
 *
 * A credit is not money: the cash was already recognised when it was received
 * (debit cash, credit AR). Spending a credit therefore moves **no cash** and
 * posts **no journal entry** — it only re-points AR from one invoice to
 * another. Refunds, which do move cash, live in `RefundsService`.
 */
@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Record money the customer is owed back. `amount` is the grant; how much of
   * it is already spent is derived from `appliedAmount`.
   */
  async create(
    data: {
      tenantId?: string;
      landlordId?: string;
      customerName?: string;
      amount: number;
      reason?: string;
      source?: CustomerCreditSource;
      sourcePaymentId?: string;
      currency?: string;
      createdBy?: string;
    },
    tenantId?: string,
    tx: Tx = this.prisma,
  ) {
    const amount = round2(Number(data.amount));
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be greater than zero');
    }
    if (!data.tenantId && !data.landlordId && !data.customerName?.trim()) {
      throw new BadRequestException(
        'A credit must belong to a tenant, a landlord or a named customer',
      );
    }

    if (data.tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id: data.tenantId,
        organizationId: tenantId,
      });
    }
    if (data.landlordId) {
      await assertTenantRecord(this.prisma.landlord, {
        id: data.landlordId,
        organizationId: tenantId,
      });
    }

    return tx.customerCredit.create({
      data: {
        amount,
        currency: data.currency || 'KES',
        reason: data.reason,
        source: data.source ?? CustomerCreditSource.MANUAL,
        sourcePaymentId: data.sourcePaymentId,
        tenantId: data.tenantId,
        landlordId: data.landlordId,
        customerName: data.customerName?.trim() || null,
        status: CreditStatus.OPEN,
        createdBy: data.createdBy,
        organizationId: tenantId ?? null,
      },
    });
  }

  /**
   * Record the part of a payment no invoice needed. Called from the payment and
   * receipt paths so an overpayment can never be lost — the alternative is
   * money in the bank that the system thinks nobody paid.
   */
  async captureSurplus(
    args: {
      amount: number;
      reason: string;
      source: CustomerCreditSource;
      sourcePaymentId?: string;
      tenantId?: string;
      landlordId?: string;
      customerName?: string;
      currency?: string;
      createdBy?: string;
    },
    tenantId: string,
    tx: Tx = this.prisma,
  ) {
    const amount = round2(Number(args.amount));
    if (amount <= 0) return null;
    return this.create(
      {
        tenantId: args.tenantId,
        landlordId: args.landlordId,
        customerName: args.customerName,
        amount,
        reason: args.reason,
        source: args.source,
        sourcePaymentId: args.sourcePaymentId,
        currency: args.currency,
        createdBy: args.createdBy,
      },
      tenantId,
      tx,
    );
  }

  findAll(
    tenantId?: string,
    filters?: { status?: string; tenantId?: string; landlordId?: string },
  ) {
    const where: Prisma.CustomerCreditWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.status) where.status = filters.status as CreditStatus;
    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.landlordId) where.landlordId = filters.landlordId;

    return this.prisma.customerCredit.findMany({
      where,
      include: {
        tenant: true,
        landlord: true,
        applications: { include: { invoice: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.customerCredit.findFirst({
        where,
        include: {
          tenant: true,
          landlord: true,
          applications: { include: { invoice: true } },
          sourcePayment: true,
        },
      }),
      'Credit',
    );
  }

  /** Every customer's usable credit balance in one place. */
  async balances(tenantId?: string) {
    const credits = await this.prisma.customerCredit.findMany({
      where: {
        ...(tenantId && { organizationId: tenantId }),
        status: { in: [CreditStatus.OPEN, CreditStatus.PARTIALLY_APPLIED] },
      },
      include: { tenant: true, landlord: true },
    });

    const byCustomer = new Map<
      string,
      { label: string; balance: number; credits: number }
    >();
    for (const credit of credits) {
      const balance = round2(
        Number(credit.amount) - Number(credit.appliedAmount),
      );
      if (balance <= 0) continue;
      const key =
        credit.tenantId ??
        credit.landlordId ??
        credit.customerName ??
        'unknown';
      const label = credit.tenant
        ? `${credit.tenant.surname} ${credit.tenant.otherNames ?? ''}`.trim()
        : (credit.landlord?.name ?? credit.customerName ?? 'Unknown');
      const current = byCustomer.get(key) ?? { label, balance: 0, credits: 0 };
      current.balance = round2(current.balance + balance);
      current.credits += 1;
      byCustomer.set(key, current);
    }
    return [...byCustomer.entries()].map(([key, value]) => ({
      customerKey: key,
      ...value,
    }));
  }

  /**
   * Spend a credit, oldest invoice first.
   *
   * `invoiceIds` restricts it to chosen invoices (the manual override); with no
   * ids it walks the customer's outstanding invoices by due date. Spending stops
   * when the credit or the outstanding balance runs out, and every invoice it
   * touched is written in the same transaction.
   */
  async applyToInvoices(
    id: string,
    options?: {
      invoiceIds?: string[];
      amount?: number;
      appliedBy?: string;
    },
    tenantId?: string,
    tx?: Tx,
  ) {
    if (tx) return this.applyWithin(id, options, tenantId, tx);
    return this.prisma.$transaction((inner) =>
      this.applyWithin(id, options, tenantId, inner),
    );
  }

  private async applyWithin(
    id: string,
    options:
      | { invoiceIds?: string[]; amount?: number; appliedBy?: string }
      | undefined,
    tenantId: string | undefined,
    tx: Tx,
  ) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    const credit = await requireRecord(
      tx.customerCredit.findFirst({ where }),
      'Credit',
    );
    if (credit.status === CreditStatus.VOID) {
      throw new BadRequestException('This credit has been voided');
    }

    const available = round2(
      Number(credit.amount) - Number(credit.appliedAmount),
    );
    const budget = options?.amount
      ? round2(Math.min(options.amount, available))
      : available;
    if (budget <= 0) {
      throw new BadRequestException('This credit has nothing left to apply');
    }

    const invoices = await this.outstandingInvoices(
      credit,
      options?.invoiceIds,
      tx,
    );

    let remaining = budget;
    const applications: { invoiceId: string; amount: number }[] = [];

    for (const invoice of invoices) {
      if (remaining <= 0) break;
      const allocation = allocateToInvoice(
        {
          totalAmount: Number(invoice.totalAmount),
          balanceAmount: Number(invoice.balanceAmount),
          paidAmount: Number(invoice.paidAmount),
          status: invoice.status,
        },
        remaining,
      );
      if (allocation.applied <= 0) continue;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: allocation.paidAmount,
          balanceAmount: allocation.balanceAmount,
          status: allocation.status,
        },
      });
      await tx.creditApplication.create({
        data: {
          creditId: credit.id,
          invoiceId: invoice.id,
          amount: allocation.applied,
          appliedBy: options?.appliedBy,
        },
      });

      applications.push({ invoiceId: invoice.id, amount: allocation.applied });
      remaining = round2(remaining - allocation.applied);
    }

    const spent = round2(budget - remaining);
    if (spent <= 0) {
      throw new BadRequestException(
        'Nothing to apply: the selected invoices have no outstanding balance',
      );
    }

    const appliedTotal = round2(Number(credit.appliedAmount) + spent);
    const updated = await tx.customerCredit.update({
      where: { id: credit.id },
      data: {
        appliedAmount: appliedTotal,
        status:
          appliedTotal >= Number(credit.amount)
            ? CreditStatus.APPLIED
            : CreditStatus.PARTIALLY_APPLIED,
      },
      include: {
        applications: { include: { invoice: true } },
        tenant: true,
        landlord: true,
      },
    });

    return { credit: updated, applications, unapplied: remaining };
  }

  /**
   * The customer's outstanding invoices in the order a credit should be spent:
   * oldest due date first. A manual `invoiceIds` list is honoured in the order
   * given rather than re-sorted — the caller asked for that order.
   */
  private async outstandingInvoices(
    credit: { tenantId: string | null; landlordId: string | null },
    invoiceIds?: string[],
    tx: Tx = this.prisma,
  ) {
    if (invoiceIds?.length) {
      const explicit = await tx.invoice.findMany({
        where: {
          id: { in: invoiceIds },
          ...(credit.tenantId && {
            rentalAgreement: { tenantId: credit.tenantId },
          }),
          ...(credit.landlordId && { landlordId: credit.landlordId }),
        },
      });
      // Honour the order the caller asked for rather than re-sorting by date.
      const byId = new Map(
        invoiceIds.map((invoiceId, index) => [invoiceId, index]),
      );
      return explicit.sort((a, b) => byId.get(a.id)! - byId.get(b.id)!);
    }

    return tx.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceAmount: { gt: 0 },
        ...(credit.tenantId
          ? { rentalAgreement: { tenantId: credit.tenantId } }
          : {}),
        ...(credit.landlordId ? { landlordId: credit.landlordId } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
      take: 50,
    });
  }

  /** Void a credit. Refused once it has been spent — that money already went
   * somewhere, and unwinding it belongs to the invoice it paid, not here. */
  async void(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.customerCredit, {
        id,
        organizationId: tenantId,
      });
    }
    const credit = await requireRecord(
      this.prisma.customerCredit.findUnique({ where: { id } }),
      'Credit',
    );
    if (Number(credit.appliedAmount) > 0) {
      throw new BadRequestException(
        'This credit has already been applied to an invoice and cannot be voided',
      );
    }
    if (credit.status === CreditStatus.VOID) {
      throw new NotFoundException('Credit not found');
    }
    return this.prisma.customerCredit.update({
      where: { id },
      data: { status: CreditStatus.VOID },
    });
  }
}
