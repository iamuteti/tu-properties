import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { ACCOUNT_CODES } from '../accounting/chart-of-accounts';
import { TaxService } from '../tax/tax.service';
import { round2 } from '../invoice-allocation';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private taxService: TaxService,
  ) {}

  // Generate invoice number
  /**
   * An invoice number nobody is using.
   *
   * The obvious implementation — four random digits — collides about once per
   * few hundred invoices by the birthday bound, and a bulk run generates
   * hundreds at a time. A collision here throws on a unique constraint, which
   * in the recurring job looks indistinguishable from "already billed" and
   * silently loses a tenant's invoice. So the number is checked before use, and
   * a counter is the fallback rather than more randomness.
   */
  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    billingPeriod?: string,
  ): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    if (billingPeriod) {
      const taken = await tx.invoice.count({ where: { billingPeriod } });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = `INV-${billingPeriod}-${String(taken + attempt + 1).padStart(5, '0')}`;
        const clash = await tx.invoice.findUnique({
          where: { invoiceNumber: candidate },
          select: { id: true },
        });
        if (!clash) return candidate;
      }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const candidate = `INV-${year}${month}-${random}`;
      const clash = await tx.invoice.findUnique({
        where: { invoiceNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    // Last resort: guaranteed unique, if less readable.
    return `INV-${year}${month}-${Date.now().toString(36).toUpperCase()}`;
  }

  async create(
    data: {
      invoiceNumber?: string;
      landlordId?: string;
      rentalAgreementId?: string;
      transactionClass: string;
      acReceivable?: string;
      billTo?: string;
      issueDate: string | Date;
      dueDate: string | Date;
      currency?: string;
      spotRate?: number;
      lpoNumber?: string;
      signOnEfims?: boolean;
      paymentInfo?: string;
      termsConditions?: string;
      memo?: string;
      amount: number;
      vatAmount?: number;
      totalAmount: number;
      paidAmount?: number;
      balanceAmount: number;
      status?: string;
      /**
       * Recurring billing tags its invoices with the period they bill for. It is
       * set on insert, not afterwards, so the unique constraint on
       * (rentalAgreementId, billingPeriod) fires inside the insert — a duplicate
       * run is refused atomically instead of two invoices existing briefly.
       */
      billingPeriod?: string;
      /**
       * Compute tax from the organization's configured rules instead of the
       * amounts supplied. Omitted tax amounts already imply this — an explicit
       * `vatAmount` is respected as typed, so existing callers are unaffected.
       */
      calculateTax?: boolean;
      /** Price the lines as tax-inclusive (a rate added on top by default). */
      taxInclusive?: boolean;
      invoiceItems?: {
        revenueExpenseItem?: string;
        particular?: string;
        incomeAccount?: string;
        unitCost?: number;
        qty?: number;
        taxRate?: number;
        taxAmount?: number;
        lineTotal?: number;
        className?: string;
      }[];
    },
    tenantId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const issueDate = new Date(data.issueDate);

      // Tax first: the invoice's money columns depend on what the engine
      // decided, so this has to happen before the row is built.
      const priced =
        tenantId && data.invoiceItems?.length
          ? await this.priceWithTaxRules(data, issueDate, tenantId, tx)
          : null;

      const amount = priced?.netAmount ?? Number(data.amount);
      const chargedTax = priced?.chargedTax ?? Number(data.vatAmount ?? 0);
      const totalAmount = priced
        ? priced.netAmount + priced.chargedTax
        : Number(data.totalAmount);
      const balanceAmount = priced
        ? Math.max(0, totalAmount - Number(data.paidAmount ?? 0))
        : Number(data.balanceAmount);

      const invoiceData: Prisma.InvoiceCreateInput = {
        invoiceNumber:
          data.invoiceNumber ||
          (await this.generateInvoiceNumber(tx, data.billingPeriod)),
        transactionClass: data.transactionClass,
        acReceivable: data.acReceivable,
        billTo: data.billTo,
        issueDate,
        dueDate: new Date(data.dueDate),
        currency: data.currency || 'KES',
        spotRate: data.spotRate || 1,
        lpoNumber: data.lpoNumber,
        signOnEfims: data.signOnEfims || false,
        paymentInfo: data.paymentInfo,
        termsConditions: data.termsConditions,
        memo: data.memo,
        amount,
        vatAmount: chargedTax,
        totalAmount,
        paidAmount: data.paidAmount || 0,
        balanceAmount,
        status: (data.status as never) || 'PENDING',
        billingPeriod: data.billingPeriod,
        taxWithheldAmount: priced?.withheldTax ?? 0,
        taxJurisdiction: priced?.jurisdiction || undefined,
        taxBasis: priced?.basis,
        taxSummary: priced?.summary
          ? (priced.summary as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      };

      // Add tenant organization if provided
      if (tenantId) {
        invoiceData.organization = { connect: { id: tenantId } };
      }

      // Add landlord relation if provided
      if (data.landlordId) {
        invoiceData.landlord = { connect: { id: data.landlordId } };
      }

      // Add rental agreement relation if provided (backward compatibility)
      if (data.rentalAgreementId) {
        invoiceData.rentalAgreement = {
          connect: { id: data.rentalAgreementId },
        };
      }

      if (data.invoiceItems && data.invoiceItems.length > 0) {
        invoiceData.invoiceItems = {
          create: data.invoiceItems.map((item, index) => {
            const computed = priced?.lines[index];
            const charged = computed?.taxes.find(
              (tax) => tax.treatment !== 'WITHHELD',
            );
            const firstTax = computed?.taxes[0];
            return {
              description: item.particular || '',
              revenueExpenseItem: item.revenueExpenseItem,
              incomeAccount: item.incomeAccount,
              quantity: item.qty || 1,
              unitPrice: item.unitCost || 0,
              amount: computed?.netAmount ?? item.lineTotal ?? 0,
              // The engine's rate wins when it ran; otherwise the typed-in one.
              vatRate: firstTax?.ratePercent ?? item.taxRate ?? 0,
              vatAmount: computed
                ? (charged?.amount ?? 0)
                : (item.taxAmount ?? 0),
              taxRuleId: firstTax?.ruleId,
              taxCode: firstTax?.code,
              taxBasis: firstTax?.basis,
              taxTreatment: firstTax?.treatment,
              className: item.className,
            };
          }),
        };
      }

      // The invoice and its double-entry GL effect must land together: if the
      // ledger rejects the entry (unbalanced, missing account) the invoice must
      // not exist without its accounting record.
      const invoice = await tx.invoice.create({ data: invoiceData });

      if (tenantId) {
        await this.accountingService.postInvoiceIssued(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate,
            totalAmount,
            vatAmount: chargedTax,
            netAmount: amount,
            taxes: priced?.summary
              ?.filter(
                (entry) => entry.treatment !== 'WITHHELD' && entry.amount > 0,
              )
              .map((entry) => ({
                code: entry.code,
                name: entry.name,
                amount: entry.amount,
                accountCode: entry.account,
              })),
            taxWithheld:
              priced && priced.withheldTax > 0
                ? {
                    amount: priced.withheldTax,
                    code: priced.summary.find(
                      (entry) => entry.treatment === 'WITHHELD',
                    )?.code,
                  }
                : undefined,
            status: invoice.status,
            incomeAccountCode:
              data.transactionClass === 'SALE'
                ? ACCOUNT_CODES.SALE_OF_PROPERTY_INCOME
                : undefined,
            memo: `Invoice ${invoice.invoiceNumber} issued`,
          },
          tenantId,
          tx,
        );
      }

      return invoice;
    });
  }

  /**
   * Run the organization's configured tax rules over the invoice lines.
   *
   * Skipped (returning null) when the caller supplied an explicit `vatAmount`,
   * because an amount a person typed in beats a rule we inferred — and when the
   * organization has no rules at all, in which case there is nothing to apply.
   */
  private async priceWithTaxRules(
    data: {
      vatAmount?: number;
      calculateTax?: boolean;
      invoiceItems?: { particular?: string; lineTotal?: number }[];
    },
    issueDate: Date,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ) {
    const shouldCalculate = data.calculateTax ?? data.vatAmount === undefined;
    if (!shouldCalculate) return null;

    const computed = await this.taxService.computeFor(
      tenantId,
      (data.invoiceItems ?? []).map((item) => ({
        description: item.particular ?? '',
        amount: Number(item.lineTotal ?? 0),
      })),
      { at: issueDate },
      tx,
    );

    // No configured tax means nothing to apply — leave the invoice exactly as
    // the caller described it rather than inventing zeros.
    if (computed.summary.length === 0) return null;

    return {
      ...computed,
      basis: computed.rules.some((rule) => rule.basis === 'INCLUSIVE')
        ? ('INCLUSIVE' as const)
        : ('EXCLUSIVE' as const),
    };
  }

  async update(
    id: string,
    data: {
      landlordId?: string;
      rentalAgreementId?: string;
      transactionClass?: string;
      acReceivable?: string;
      billTo?: string;
      issueDate?: string | Date;
      dueDate?: string | Date;
      currency?: string;
      spotRate?: number;
      lpoNumber?: string;
      signOnEfims?: boolean;
      paymentInfo?: string;
      termsConditions?: string;
      memo?: string;
      amount?: number;
      vatAmount?: number;
      totalAmount?: number;
      paidAmount?: number;
      balanceAmount?: number;
      status?: string;
    },
    tenantId?: string,
  ) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.invoice, {
        id,
        organizationId: tenantId,
      });
    }

    // Cancelling an invoice reverses its auto-posted GL entry — a cancelled
    // sale must not leave revenue and AR standing in the ledger.
    const previous = await this.prisma.invoice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (
      tenantId &&
      data.status === 'CANCELLED' &&
      previous &&
      previous.status !== 'CANCELLED'
    ) {
      await this.accountingService.reverseEntriesForSource(id, tenantId);
    }

    const updateData: Prisma.InvoiceUpdateInput = {};
    if (data.landlordId !== undefined) {
      updateData.landlord = data.landlordId
        ? { connect: { id: data.landlordId } }
        : { disconnect: true };
    }
    if (data.rentalAgreementId !== undefined) {
      updateData.rentalAgreement = data.rentalAgreementId
        ? { connect: { id: data.rentalAgreementId } }
        : { disconnect: true };
    }
    if (data.transactionClass !== undefined)
      updateData.transactionClass = data.transactionClass;
    if (data.acReceivable !== undefined)
      updateData.acReceivable = data.acReceivable;
    if (data.billTo !== undefined) updateData.billTo = data.billTo;
    if (data.issueDate !== undefined)
      updateData.issueDate = new Date(data.issueDate);
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.spotRate !== undefined) updateData.spotRate = data.spotRate;
    if (data.lpoNumber !== undefined) updateData.lpoNumber = data.lpoNumber;
    if (data.signOnEfims !== undefined)
      updateData.signOnEfims = data.signOnEfims;
    if (data.paymentInfo !== undefined)
      updateData.paymentInfo = data.paymentInfo;
    if (data.termsConditions !== undefined)
      updateData.termsConditions = data.termsConditions;
    if (data.memo !== undefined) updateData.memo = data.memo;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.vatAmount !== undefined) updateData.vatAmount = data.vatAmount;
    if (data.totalAmount !== undefined)
      updateData.totalAmount = data.totalAmount;
    if (data.paidAmount !== undefined) updateData.paidAmount = data.paidAmount;
    if (data.balanceAmount !== undefined)
      updateData.balanceAmount = data.balanceAmount;
    if (data.status !== undefined) updateData.status = data.status as any;

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        invoiceItems: true,
        payments: true,
        landlord: true,
        rentalAgreement: {
          include: {
            tenant: true,
            unit: true,
          },
        },
      },
    });
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.invoice.findMany({
      where,
      include: {
        landlord: true,
        rentalAgreement: {
          include: {
            tenant: true,
            unit: true,
          },
        },
        invoiceItems: true,
      },
    });
  }

  /**
 * Who owes what, and how stale.
 *
 * The receivable mirror of `PayablesService.aging`, and deliberately bucketed
 * the same way: an outstanding total with no age cannot be prioritised, and
 * "3 months late" is the only thing that tells a collections call where to
 * start.
 *
 * An invoice is excluded once it is paid or void — arrears is money that is
 * actually owed.
 */
async arrears(tenantId?: string, asOf: Date = new Date(), propertyId?: string) {
  const invoices = await this.prisma.invoice.findMany({
    where: {
      ...(tenantId && { organizationId: tenantId }),
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      balanceAmount: { gt: 0 },
      ...(propertyId ? { rentalAgreement: { unit: { propertyId } } } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      issueDate: true,
      balanceAmount: true,
      currency: true,
      rentalAgreement: {
        select: {
          id: true,
          tenantId: true,
          tenant: { select: { id: true, surname: true, otherNames: true, phone: true } },
          unit: { select: { name: true, property: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const buckets = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
  };

  const byTenant = new Map<
    string,
    {
      tenantId: string;
      tenantName: string;
      phone: string | null;
      total: number;
      overdue: number;
      invoices: { id: string; invoiceNumber: string; dueDate: Date; balance: number }[];
    }
  >();

  for (const invoice of invoices) {
    const balance = round2(Number(invoice.balanceAmount));
    const daysOverdue = Math.floor(
      (asOf.getTime() - new Date(invoice.dueDate).getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysOverdue <= 0) buckets.current = round2(buckets.current + balance);
    else if (daysOverdue <= 30) buckets.days1to30 = round2(buckets.days1to30 + balance);
    else if (daysOverdue <= 60) buckets.days31to60 = round2(buckets.days31to60 + balance);
    else if (daysOverdue <= 90) buckets.days61to90 = round2(buckets.days61to90 + balance);
    else buckets.over90 = round2(buckets.over90 + balance);

    // An invoice with no lease (a sale invoice, say) has no tenant to owe it;
    // it is counted in the buckets and left out of the per-tenant list rather
    // than being lumped under a blank name.
    const lease = invoice.rentalAgreement;
    if (!lease) continue;

    const entry = byTenant.get(lease.tenantId) ?? {
      tenantId: lease.tenantId,
      tenantName: [lease.tenant?.surname, lease.tenant?.otherNames]
        .filter(Boolean)
        .join(' '),
      phone: lease.tenant?.phone ?? null,
      total: 0,
      overdue: 0,
      invoices: [],
    };
    entry.total = round2(entry.total + balance);
    if (daysOverdue > 0) entry.overdue = round2(entry.overdue + balance);
    entry.invoices.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      balance,
    });
    byTenant.set(lease.tenantId, entry);
  }

  const total = round2(invoices.reduce((sum, i) => sum + Number(i.balanceAmount), 0));
  const overdue = round2(
    total - (buckets.current || 0),
  );

  return {
    asOf,
    buckets: { ...buckets, total, overdue },
    byTenant: [...byTenant.values()].sort((a, b) => b.overdue - a.overdue || b.total - a.total),
  };
}

async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.invoice.findFirst({
        where,
        include: {
          invoiceItems: true,
          payments: true,
          landlord: true,
          rentalAgreement: {
            include: {
              tenant: true,
              unit: true,
            },
          },
        },
      }),
      'Invoice',
    );
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.invoice, {
        id,
        organizationId: tenantId,
      });
      // Reverse the ledger effect first; deleting the invoice must not leave
      // an orphan revenue/AR posting behind.
      await this.accountingService.reverseEntriesForSource(id, tenantId);
    }
    return this.prisma.invoice.delete({
      where: { id },
    });
  }

  async deleteMany(ids: string[], tenantId?: string) {
    const where = tenantId
      ? { id: { in: ids }, organizationId: tenantId }
      : { id: { in: ids } };
    const result = await this.prisma.invoice.deleteMany({
      where,
    });
    return { deleted: result.count };
  }
}
