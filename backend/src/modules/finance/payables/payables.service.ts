import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BillCategory,
  BillStatus,
  CreditStatus,
  Prisma,
  SupplierCreditSource,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { expenseAccountFor } from '../accounting/bill-categories';
import { round2 } from '../invoice-allocation';
import { TaxService } from '../tax/tax.service';

type Tx = Prisma.TransactionClient;

const OPEN_BILL_STATUSES: BillStatus[] = [
  BillStatus.OPEN,
  BillStatus.PARTIALLY_PAID,
];

/**
 * Module 7 — Finance & Accounting: accounts payable.
 *
 * The payable-side mirror of the receivable machinery, and built on the same
 * rules deliberately: money moving against a bill is recorded as an allocation,
 * a bill's money columns are *derived* rather than decremented, an overpayment
 * becomes supplier credit instead of vanishing, and a mistake is reversed rather
 * than edited away.
 *
 * Everything that touches money posts through `AccountingService` inside the
 * caller's transaction, so a bill cannot exist without its journal entry.
 */
@Injectable()
export class PayablesService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private taxService: TaxService,
  ) {}

  // ── Suppliers ─────────────────────────────────────────────────────────────

  findSuppliers(tenantId?: string, filters?: { status?: SupplierStatus }) {
    const where: Prisma.SupplierWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.status) where.status = filters.status;

    return this.prisma.supplier.findMany({
      where,
      include: {
        // Enough to answer "what do we owe them?" without a second round trip.
        bills: {
          select: { balanceAmount: true },
          orderBy: { billDate: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findSupplier(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.supplier.findFirst({
        where,
        include: {
          bills: { orderBy: { billDate: 'desc' } },
          credits: true,
        },
      }),
      'Supplier',
    );
  }

  createSupplier(
    data: {
      code?: string;
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      taxPin?: string;
      vatRegistered?: boolean;
      paymentTermsDays?: number;
      bankName?: string;
      bankBranch?: string;
      accountName?: string;
      accountNumber?: string;
      notes?: string;
    },
    tenantId?: string,
  ) {
    if (!data.name?.trim()) {
      throw new BadRequestException('A supplier needs a name');
    }
    return this.prisma.$transaction(async (tx) => {
      const code =
        data.code?.trim() || (await this.nextSupplierCode(tenantId, tx));
      return tx.supplier.create({
        data: {
          ...data,
          code,
          organizationId: tenantId ?? null,
        },
      });
    });
  }

  updateSupplier(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string;
      address: string;
      city: string;
      country: string;
      taxPin: string;
      vatRegistered: boolean;
      paymentTermsDays: number;
      bankName: string;
      bankBranch: string;
      accountName: string;
      accountNumber: string;
      notes: string;
      status: SupplierStatus;
    }>,
    tenantId?: string,
  ) {
    if (tenantId) {
      return assertTenantRecord(this.prisma.supplier, {
        id,
        organizationId: tenantId,
      }).then(() =>
        this.prisma.supplier.update({
          where: { id },
          // `code` is immutable: it identifies the supplier on documents.
          data,
        }),
      );
    }
    return this.prisma.supplier.update({ where: { id }, data });
  }

  deleteSupplier(id: string, tenantId?: string) {
    return this.prisma.$transaction(async (tx) => {
      if (tenantId) {
        await assertTenantRecord(tx.supplier, {
          id,
          organizationId: tenantId,
        });
      }
      const bills = await tx.supplierBill.count({ where: { supplierId: id } });
      if (bills > 0) {
        // Bills are documents; an archived supplier keeps the history intact.
        return tx.supplier.update({
          where: { id },
          data: { status: SupplierStatus.ARCHIVED },
        });
      }
      return tx.supplier.delete({ where: { id } });
    });
  }

  private async nextSupplierCode(
    tenantId: string | undefined,
    tx: Tx = this.prisma,
  ): Promise<string> {
    const count = await tx.supplier.count({
      where: tenantId ? { organizationId: tenantId } : {},
    });
    return `SUP-${String(count + 1).padStart(4, '0')}`;
  }

  // ── Bills ─────────────────────────────────────────────────────────────────

  private generateBillNumber(): string {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `BILL-${stamp}-${random}`;
  }

  /**
   * Accept a supplier bill.
   *
   * Tax is priced by the same rules engine invoices use, unless the caller
   * supplies amounts explicitly — an accountant transcribing a supplier's
   * document must be able to. The expense side is grouped by account so a
   * multi-category bill posts each part where it belongs.
   */
  async createBill(
    data: {
      billNumber?: string;
      supplierId: string;
      supplierReference?: string;
      billDate?: string | Date;
      dueDate?: string | Date;
      currency?: string;
      category?: BillCategory;
      subtotal?: number;
      taxAmount?: number;
      totalAmount?: number;
      /** Force the rules engine even when amounts are supplied. */
      calculateTax?: boolean;
      notes?: string;
      lines: {
        description: string;
        quantity?: number;
        unitPrice: number;
        amount?: number;
        taxRate?: number;
        taxAmount?: number;
        expenseAccountCode?: string;
      }[];
      createdBy?: string;
    },
    tenantId?: string,
  ) {
    if (!data.supplierId) {
      throw new BadRequestException('A bill must belong to a supplier');
    }
    if (!data.lines?.length) {
      throw new BadRequestException('A bill needs at least one line');
    }
    if (!tenantId) {
      throw new BadRequestException(
        'A tenant scope is required to record a bill',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const supplier = await requireRecord(
        tx.supplier.findFirst({
          where: { id: data.supplierId, organizationId: tenantId },
        }),
        'Supplier',
      );
      if (supplier.status === SupplierStatus.ARCHIVED) {
        throw new BadRequestException(
          `${supplier.name} is archived — reactivate it before billing`,
        );
      }

      const billDate = data.billDate ? new Date(data.billDate) : new Date();
      const dueDate = data.dueDate
        ? new Date(data.dueDate)
        : new Date(
            billDate.getTime() +
              (supplier.paymentTermsDays ?? 30) * 24 * 60 * 60 * 1000,
          );

      const lines = data.lines.map((line) => ({
        description: line.description?.trim() || 'Undescribed charge',
        quantity: line.quantity ?? 1,
        unitPrice: round2(Number(line.unitPrice)),
        amount: round2(
          line.amount ?? Number(line.quantity ?? 1) * Number(line.unitPrice),
        ),
        taxRate: line.taxRate ?? null,
        taxAmount: line.taxAmount ?? null,
        expenseAccountCode: line.expenseAccountCode ?? null,
      }));

      const suppliedSubtotal = data.subtotal
        ? round2(data.subtotal)
        : round2(lines.reduce((sum, line) => sum + line.amount, 0));

      // The engine prices the bill only when it was not priced for us.
      const shouldPrice =
        (data.calculateTax ?? true) && data.taxAmount === undefined;

      let priced: Awaited<ReturnType<TaxService['computeFor']>> | undefined;
      if (shouldPrice) {
        priced = await this.taxService.computeFor(
          tenantId,
          lines.map((line) => ({
            description: line.description,
            amount: line.amount,
            category: data.category ?? undefined,
          })),
          { at: billDate },
          tx,
        );
      }

      const taxTotal = priced
        ? round2(priced.chargedTax)
        : round2(data.taxAmount ?? 0);
      const subtotal = priced ? round2(priced.netAmount) : suppliedSubtotal;
      const total = priced
        ? round2(priced.netAmount + priced.chargedTax)
        : round2(data.totalAmount ?? subtotal + taxTotal);

      if (Math.abs(round2(subtotal + taxTotal) - total) > 0.01) {
        throw new BadRequestException(
          `Bill does not add up: lines ${subtotal.toFixed(2)} + tax ${taxTotal.toFixed(
            2,
          )} should equal ${total.toFixed(2)}`,
        );
      }

      const bill = await tx.supplierBill.create({
        data: {
          billNumber: data.billNumber?.trim() || this.generateBillNumber(),
          organizationId: tenantId,
          supplierId: supplier.id,
          supplierReference: data.supplierReference,
          billDate,
          dueDate,
          currency: data.currency || 'KES',
          category: data.category ?? BillCategory.OTHER,
          subtotal,
          taxAmount: taxTotal,
          totalAmount: total,
          balanceAmount: total,
          status: BillStatus.OPEN,
          taxJurisdiction: priced?.jurisdiction || undefined,
          taxSummary: priced?.summary
            ? (priced.summary as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          notes: data.notes,
          createdBy: data.createdBy,
          lines: {
            create: lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              amount: line.amount,
              taxRate: line.taxRate ?? (priced ? null : undefined),
              taxAmount: line.taxAmount,
            })),
          },
        },
        include: { lines: true },
      });

      // One entry per expense account, so a bill that mixes repairs and
      // professional fees reports as two costs rather than one blended figure.
      const byAccount = new Map<string, number>();
      for (const line of bill.lines) {
        const account = expenseAccountFor(
          data.category ?? BillCategory.OTHER,
          line.expenseAccountCode,
        );
        byAccount.set(
          account,
          round2((byAccount.get(account) ?? 0) + Number(line.amount)),
        );
      }

      await this.accountingService.postBillAccepted(
        {
          billId: bill.id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          totalAmount: total,
          taxAmount: taxTotal,
          expenses: [...byAccount.entries()].map(([accountCode, amount]) => ({
            accountCode,
            amount,
          })),
          memo: `Bill ${bill.billNumber} from ${supplier.name}`,
        },
        tenantId,
        tx,
      );

      return bill;
    });
  }

  findBills(
    tenantId?: string,
    filters?: {
      supplierId?: string;
      status?: BillStatus;
      overdueOnly?: boolean;
      limit?: number;
    },
  ) {
    const where: Prisma.SupplierBillWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    if (filters?.status) where.status = filters.status;
    if (filters?.overdueOnly) {
      where.status = { in: OPEN_BILL_STATUSES };
      where.dueDate = { lt: new Date() };
    }

    return this.prisma.supplierBill.findMany({
      where,
      include: {
        supplier: true,
        lines: true,
        payments: {
          where: { isReversed: false },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: [{ billDate: 'desc' }],
      take: Math.min(filters?.limit ?? 100, 500),
    });
  }

  async findBill(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.supplierBill.findFirst({
        where,
        include: {
          supplier: true,
          lines: true,
          payments: { orderBy: { paymentDate: 'desc' } },
          creditApplications: { include: { credit: true } },
        },
      }),
      'Bill',
    );
  }

  /**
   * Void a bill: reverse its ledger entry and re-derive what is still owed.
   * A bill that has been paid cannot simply be voided — the money already left,
   * and only a refund makes that whole again.
   */
  async voidBill(id: string, tenantId?: string, voidedBy?: string) {
    if (!tenantId) {
      throw new BadRequestException(
        'A tenant scope is required to void a bill',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const bill = await requireRecord(
        tx.supplierBill.findFirst({
          where: { id, organizationId: tenantId },
          include: { payments: { where: { isReversed: false } } },
        }),
        'Bill',
      );
      if (bill.status === BillStatus.VOID) {
        throw new BadRequestException(
          `Bill ${bill.billNumber} is already void`,
        );
      }
      if (bill.payments.length > 0) {
        throw new BadRequestException(
          `Bill ${bill.billNumber} has ${bill.payments.length} payment(s) — reverse the payment first, or refund it`,
        );
      }

      await this.accountingService.reverseEntriesForSource(
        bill.id,
        tenantId,
        voidedBy,
        tx,
      );

      return tx.supplierBill.update({
        where: { id: bill.id },
        data: { status: BillStatus.VOID, voidedAt: new Date() },
      });
    });
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  /**
   * Pay a bill. Anything beyond the outstanding balance becomes credit the
   * supplier owes us back — an overpayment is not an error and it is not lost.
   */
  async createPayment(
    data: {
      billId: string;
      amount: number;
      paymentDate?: string | Date;
      method?: string;
      reference?: string;
      notes?: string;
      createdBy?: string;
      /** Record the payment but apply it across bills afterwards. */
      unallocated?: boolean;
    },
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required to pay a bill');
    }
    const amount = round2(Number(data.amount));
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      const bill = await requireRecord(
        tx.supplierBill.findFirst({
          where: { id: data.billId, organizationId: tenantId },
        }),
        'Bill',
      );
      if (bill.status === BillStatus.VOID) {
        throw new BadRequestException(
          `Bill ${bill.billNumber} is void and cannot be paid`,
        );
      }

      const paymentDate = data.paymentDate
        ? new Date(data.paymentDate)
        : new Date();

      const payment = await tx.billPayment.create({
        data: {
          billId: bill.id,
          organizationId: tenantId,
          amount,
          currency: bill.currency,
          paymentDate,
          method: (data.method ?? 'BANK_TRANSFER') as never,
          reference: data.reference,
          notes: data.notes,
          createdBy: data.createdBy,
        },
      });

      if (data.unallocated) {
        // The cash still left; what it settles is decided by `allocate`.
        await this.accountingService.postBillPaid(
          {
            billId: bill.id,
            billNumber: bill.billNumber,
            amount,
            paymentDate,
            paymentMethod: String(data.method ?? 'BANK_TRANSFER'),
            reference: data.reference,
            description: `Payment to supplier ${bill.billNumber} (unallocated)`,
            sourceRef: {
              type: 'BILL_PAYMENT',
              id: payment.id,
              number: bill.billNumber,
            },
          },
          tenantId,
          tx,
        );
        return payment;
      }

      const applied = round2(Math.min(amount, Number(bill.balanceAmount)));
      const surplus = round2(amount - applied);

      if (applied > 0) {
        await this.accountingService.postBillPaid(
          {
            billId: bill.id,
            billNumber: bill.billNumber,
            amount: applied,
            paymentDate,
            paymentMethod: String(data.method ?? 'BANK_TRANSFER'),
            reference: data.reference,
            description: `Payment to supplier for ${bill.billNumber}`,
            sourceRef: {
              type: 'BILL_PAYMENT',
              id: payment.id,
              number: bill.billNumber,
            },
          },
          tenantId,
          tx,
        );
      }

      if (surplus > 0) {
        // We paid more than we owed: the supplier holds credit owed to us.
        await this.createSupplierCredit(
          tx,
          {
            supplierId: bill.supplierId,
            amount: surplus,
            reason: `Overpayment on bill ${bill.billNumber}`,
            source: SupplierCreditSource.OVERPAYMENT,
            sourcePaymentId: payment.id,
            createdBy: data.createdBy,
          },
          tenantId,
        );
        await this.accountingService.postBillPaid(
          {
            billId: bill.id,
            billNumber: bill.billNumber,
            amount: surplus,
            paymentDate,
            paymentMethod: String(data.method ?? 'BANK_TRANSFER'),
            reference: data.reference,
            // Not cash: the money is sitting as credit owed back to us.
            relievedByCredit: true,
            description: `Overpayment on ${bill.billNumber} held as supplier credit`,
            // Same sourceRef as the applied portion — without it, reversing
            // this payment would leave the overpayment entry standing.
            sourceRef: {
              type: 'BILL_PAYMENT',
              id: payment.id,
              number: bill.billNumber,
            },
          },
          tenantId,
          tx,
        );
      }

      if (applied > 0) {
        await tx.billPayment.update({
          where: { id: payment.id },
          data: { appliedAmount: applied },
        });
      }
      await this.syncBill(tx, bill.id, tenantId);

      return payment;
    });
  }

  /**
   * Apply a payment that arrived without a bill, across that supplier's
   * outstanding bills, oldest due date first.
   */
  async allocatePayment(
    paymentId: string,
    options?: { billIds?: string[] },
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required to allocate');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await requireRecord(
        tx.billPayment.findFirst({
          where: { id: paymentId, organizationId: tenantId },
          include: { bill: true },
        }),
        'Payment',
      );
      if (payment.isReversed) {
        throw new BadRequestException('A reversed payment cannot be allocated');
      }

      const remaining = round2(
        Number(payment.amount) - Number(payment.appliedAmount),
      );
      if (remaining <= 0) {
        throw new BadRequestException(
          'This payment is already fully allocated',
        );
      }

      const bills = options?.billIds?.length
        ? await tx.supplierBill.findMany({
            where: { id: { in: options.billIds }, organizationId: tenantId },
          })
        : await tx.supplierBill.findMany({
            where: {
              organizationId: tenantId,
              supplierId: payment.bill.supplierId,
              status: { in: OPEN_BILL_STATUSES },
              balanceAmount: { gt: 0 },
            },
            orderBy: [{ dueDate: 'asc' }, { billDate: 'asc' }],
            take: 50,
          });

      const allocations: { billId: string; amount: number }[] = [];
      let unallocated = remaining;
      for (const bill of bills) {
        if (unallocated <= 0) break;
        const applied = round2(
          Math.min(unallocated, Number(bill.balanceAmount)),
        );
        if (applied <= 0) continue;
        allocations.push({ billId: bill.id, amount: applied });
        unallocated = round2(unallocated - applied);
        await this.syncBill(tx, bill.id, tenantId);
      }

      const updated = await tx.billPayment.update({
        where: { id: payment.id },
        data: { appliedAmount: round2(Number(payment.amount) - unallocated) },
      });

      return { payment: updated, allocations, unallocated };
    });
  }

  /** Reverse a bill payment: the money is not un-spent, but the bill re-opens. */
  async reversePayment(id: string, tenantId?: string, reversedBy?: string) {
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await requireRecord(
        tx.billPayment.findFirst({
          where: { id, organizationId: tenantId },
          include: { bill: true },
        }),
        'Payment',
      );
      if (payment.isReversed) {
        throw new BadRequestException('This payment is already reversed');
      }

      await this.accountingService.reverseEntriesForSource(
        payment.id,
        tenantId,
        reversedBy,
        tx,
      );

      // The overpayment credit this payment created dies with it: the money is
      // going back, so a credit balance that survives would promise the
      // supplier a refund we no longer intend. Applied credit has to be
      // unwound too, or their next bill stays marked paid by a payment that no
      // longer exists.
      const credits = await tx.supplierCredit.findMany({
        where: { sourcePaymentId: payment.id },
        include: { applications: true },
      });
      for (const credit of credits) {
        for (const application of credit.applications) {
          await this.accountingService.reverseEntriesForSource(
            credit.id,
            tenantId,
            reversedBy,
            tx,
          );
          await this.syncBill(tx, application.billId, tenantId);
        }
        await tx.supplierCredit.update({
          where: { id: credit.id },
          data: { status: CreditStatus.VOID, appliedAmount: 0 },
        });
      }

      const updated = await tx.billPayment.update({
        where: { id: payment.id },
        data: { isReversed: true, reversedAt: new Date(), reversedBy },
      });

      await this.syncBill(tx, payment.billId, tenantId);
      return updated;
    });
  }

  findPayments(tenantId?: string, filters?: { billId?: string }) {
    const where: Prisma.BillPaymentWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.billId) where.billId = filters.billId;
    return this.prisma.billPayment.findMany({
      where,
      include: { bill: { include: { supplier: true } } },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // ── Supplier credit ───────────────────────────────────────────────────────

  private async createSupplierCredit(
    tx: Tx,
    data: {
      supplierId: string;
      amount: number;
      reason?: string;
      source?: SupplierCreditSource;
      sourcePaymentId?: string;
      createdBy?: string;
    },
    tenantId: string,
  ) {
    const amount = round2(Number(data.amount));
    if (amount <= 0) return null;
    return tx.supplierCredit.create({
      data: {
        supplierId: data.supplierId,
        amount,
        reason: data.reason,
        source: data.source ?? SupplierCreditSource.MANUAL,
        sourcePaymentId: data.sourcePaymentId,
        status: CreditStatus.OPEN,
        createdBy: data.createdBy,
        organizationId: tenantId,
      },
    });
  }

  findCredits(tenantId?: string, filters?: { supplierId?: string }) {
    const where: Prisma.SupplierCreditWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    return this.prisma.supplierCredit.findMany({
      where,
      include: {
        supplier: true,
        applications: { include: { bill: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Spend supplier credit against their bills, oldest due date first. No cash
   * moves — the credit is money we already sent and they already hold, so this
   * only settles what they billed us for.
   */
  async applyCredit(
    creditId: string,
    options?: { billIds?: string[]; amount?: number; appliedBy?: string },
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const credit = await requireRecord(
        tx.supplierCredit.findFirst({
          where: { id: creditId, organizationId: tenantId },
        }),
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

      const bills = options?.billIds?.length
        ? await tx.supplierBill.findMany({
            where: { id: { in: options.billIds }, organizationId: tenantId },
          })
        : await tx.supplierBill.findMany({
            where: {
              organizationId: tenantId,
              supplierId: credit.supplierId ?? undefined,
              status: { in: OPEN_BILL_STATUSES },
              balanceAmount: { gt: 0 },
            },
            orderBy: [{ dueDate: 'asc' }, { billDate: 'asc' }],
            take: 50,
          });

      const applications: { billId: string; amount: number }[] = [];
      let remaining = budget;
      for (const bill of bills) {
        if (remaining <= 0) break;
        const applied = round2(Math.min(remaining, Number(bill.balanceAmount)));
        if (applied <= 0) continue;

        await tx.supplierCreditApplication.create({
          data: {
            creditId: credit.id,
            billId: bill.id,
            amount: applied,
            appliedBy: options?.appliedBy,
          },
        });
        await this.accountingService.postBillPaid(
          {
            billId: bill.id,
            billNumber: bill.billNumber,
            amount: applied,
            paymentDate: new Date(),
            paymentMethod: 'CREDIT',
            relievedByCredit: true,
            description: `Supplier credit applied to ${bill.billNumber}`,
            sourceRef: { type: 'SUPPLIER_CREDIT', id: credit.id },
          },
          tenantId,
          tx,
        );

        applications.push({ billId: bill.id, amount: applied });
        remaining = round2(remaining - applied);
        await this.syncBill(tx, bill.id, tenantId);
      }

      const spent = round2(budget - remaining);
      if (spent <= 0) {
        throw new BadRequestException(
          'Nothing to apply: the selected bills have no outstanding balance',
        );
      }

      const appliedTotal = round2(Number(credit.appliedAmount) + spent);
      const updated = await tx.supplierCredit.update({
        where: { id: credit.id },
        data: {
          appliedAmount: appliedTotal,
          status:
            appliedTotal >= Number(credit.amount)
              ? CreditStatus.APPLIED
              : CreditStatus.PARTIALLY_APPLIED,
        },
        include: { applications: { include: { bill: true } } },
      });

      return { credit: updated, applications, unapplied: remaining };
    });
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  /**
   * What we owe, by age. The buckets are the point: an AP figure with no age
   * cannot be prioritised, and overdue bills are the whole reason AP exists.
   */
  async aging(tenantId?: string, asOf: Date = new Date()) {
    const bills = await this.prisma.supplierBill.findMany({
      where: {
        ...(tenantId && { organizationId: tenantId }),
        status: { in: OPEN_BILL_STATUSES },
        balanceAmount: { gt: 0 },
      },
      include: { supplier: { select: { id: true, name: true } } },
    });

    const buckets = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
    };
    const bySupplier = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        total: number;
        overdue: number;
      }
    >();

    for (const bill of bills) {
      const balance = round2(Number(bill.balanceAmount));
      const daysOverdue = Math.floor(
        (asOf.getTime() - new Date(bill.dueDate).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (daysOverdue <= 0) buckets.current = round2(buckets.current + balance);
      else if (daysOverdue <= 30)
        buckets.days1to30 = round2(buckets.days1to30 + balance);
      else if (daysOverdue <= 60)
        buckets.days31to60 = round2(buckets.days31to60 + balance);
      else if (daysOverdue <= 90)
        buckets.days61to90 = round2(buckets.days61to90 + balance);
      else buckets.over90 = round2(buckets.over90 + balance);

      const entry = bySupplier.get(bill.supplierId) ?? {
        supplierId: bill.supplierId,
        supplierName: bill.supplier.name,
        total: 0,
        overdue: 0,
      };
      entry.total = round2(entry.total + balance);
      if (daysOverdue > 0) entry.overdue = round2(entry.overdue + balance);
      bySupplier.set(bill.supplierId, entry);
    }

    const total = round2(
      bills.reduce((sum, bill) => sum + Number(bill.balanceAmount), 0),
    );

    return {
      asOf,
      buckets: { ...buckets, total },
      bySupplier: [...bySupplier.values()].sort((a, b) => b.total - a.total),
    };
  }

  /**
   * Re-derive a bill's money columns from the payments and credit applied to it.
   * Derived, never decremented, for the same reason invoices are.
   */
  private async syncBill(tx: Tx, billId: string, tenantId?: string) {
    const bill = await requireRecord(
      tx.supplierBill.findFirst({
        where: { id: billId, ...(tenantId && { organizationId: tenantId }) },
      }),
      'Bill',
    );

    const [payments, credits] = await Promise.all([
      tx.billPayment.aggregate({
        where: { billId, isReversed: false, appliedAmount: { gt: 0 } },
        _sum: { appliedAmount: true },
      }),
      tx.supplierCreditApplication.aggregate({
        where: { billId },
        _sum: { amount: true },
      }),
    ]);

    const paid = round2(
      Number(payments._sum.appliedAmount ?? 0) +
        Number(credits._sum.amount ?? 0),
    );
    const balance = round2(Math.max(0, Number(bill.totalAmount) - paid));
    const status =
      balance <= 0
        ? BillStatus.PAID
        : paid > 0
          ? BillStatus.PARTIALLY_PAID
          : bill.status === BillStatus.VOID
            ? BillStatus.VOID
            : BillStatus.OPEN;

    await tx.supplierBill.update({
      where: { id: billId },
      data: { paidAmount: paid, balanceAmount: balance, status },
    });
  }
}
