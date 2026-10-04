import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerCreditSource,
  JournalEntrySource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { CreditsService } from '../credits/credits.service';
import { allocateToInvoice, round2 } from '../invoice-allocation';
import { syncInvoiceSettlement } from '../invoice-settlement';
import { withheldOn } from '../tax/withheld';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private accountingService: AccountingService,
    private creditsService: CreditsService,
  ) {}

  /**
   * Record a payment.
   *
   * The controller receives the flat shape the UI sends (`invoiceId`,
   * `rentalAgreementId`, `receiptId`) while Prisma needs either all scalar FKs
   * *or* all nested relation writes — mixing them is rejected. Since we also
   * connect `organization` as a relation, the parent links are converted to
   * nested writes here; before this, paying an invoice by `invoiceId` always
   * failed with "Unknown argument `invoiceId`".
   *
   * When the payment is applied to an invoice, the invoice balance and status
   * are updated and the cash movement is posted to the general ledger — all
   * inside one transaction, so a payment can never land without its invoice
   * allocation or its ledger entry.
   */
  async create(
    data: Prisma.PaymentCreateInput & {
      recordedBy?: string;
      invoiceId?: string | null;
      rentalAgreementId?: string | null;
      receiptId?: string | null;
    },
    tenantId?: string,
  ) {
    const { invoiceId, rentalAgreementId, receiptId, ...rest } = data;
    // `recordedBy` is the UI's display name, not a column.
    delete (rest as { recordedBy?: string }).recordedBy;

    const paymentData = {
      ...rest,
      ...(invoiceId ? { invoice: { connect: { id: invoiceId } } } : {}),
      ...(rentalAgreementId
        ? { rentalAgreement: { connect: { id: rentalAgreementId } } }
        : {}),
      ...(receiptId ? { receipt: { connect: { id: receiptId } } } : {}),
    } as Prisma.PaymentCreateInput;

    // Add tenant organization if provided
    if (tenantId) {
      paymentData.organization = { connect: { id: tenantId } };
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({ data: paymentData });

      if (!invoiceId) {
        // Cash still arrived, so the ledger must still see it. It is credited to
        // AR on account until `allocate` decides which invoice it belongs to.
        if (tenantId) {
          await this.accountingService.postPaymentReceived(
            {
              amount: round2(Number(payment.amount)),
              paymentDate: payment.paymentDate,
              paymentMethod: payment.paymentMethod as string,
              reference: payment.paymentReference ?? undefined,
              description: 'Payment received on account',
              source: JournalEntrySource.PAYMENT,
              sourceRef: { type: 'PAYMENT', id: payment.id },
            },
            tenantId,
            tx,
          );
        }
        return payment;
      }

      const invoiceWhere: Prisma.InvoiceWhereInput = { id: invoiceId };
      if (tenantId) invoiceWhere.organizationId = tenantId;
      const invoice = await tx.invoice.findFirst({
        where: invoiceWhere,
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          balanceAmount: true,
          paidAmount: true,
          status: true,
          landlordId: true,
          taxWithheldAmount: true,
          taxSummary: true,
          rentalAgreement: { select: { tenantId: true } },
        },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found for payment allocation');
      }
      if (invoice.status === 'CANCELLED') {
        throw new BadRequestException(
          `Invoice ${invoice.invoiceNumber} is CANCELLED and cannot receive payments`,
        );
      }
      // A PAID invoice is not an error — the money is still real, so it is taken
      // as credit below rather than refused.

      const amount = round2(Number(payment.amount));
      if (amount <= 0) {
        throw new BadRequestException(
          'Payment amount must be greater than zero',
        );
      }

      // An invoice only absorbs what it still owes. Anything beyond that is the
      // customer's money, so it becomes credit rather than being lost or
      // driving the invoice negative.
      const allocation = allocateToInvoice(
        {
          totalAmount: Number(invoice.totalAmount),
          balanceAmount: Number(invoice.balanceAmount),
          paidAmount: Number(invoice.paidAmount),
          status: invoice.status,
        },
        amount,
      );
      // The split is recorded, not just the outcome: a refund or reversal has
      // to be able to tell that 5,000 paid 3,000 of this bill and put 2,000 on
      // credit.
      if (allocation.applied > 0) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: allocation.applied,
          },
        });
      }

      // One definition of the money columns, covering payments, credit and tax
      // the customer withheld on our behalf — rather than each caller adding up
      // the sources it happens to know about.
      await syncInvoiceSettlement(tx, invoice.id, tenantId);

      if (allocation.surplus > 0 && tenantId) {
        await this.creditsService.captureSurplus(
          {
            amount: allocation.surplus,
            reason: `Overpayment on invoice ${invoice.invoiceNumber}`,
            source: CustomerCreditSource.OVERPAYMENT,
            sourcePaymentId: payment.id,
            tenantId: invoice.rentalAgreement?.tenantId ?? undefined,
            landlordId: invoice.landlordId ?? undefined,
            // Last resort for an invoice with neither a lease nor an owner: the
            // credit still has to belong to somebody.
            customerName:
              invoice.rentalAgreement || invoice.landlordId
                ? undefined
                : (payment.payee ?? undefined),
            currency: payment.currency,
          },
          tenantId,
          tx,
        );
      }

      if (tenantId) {
        await this.accountingService.postPaymentReceived(
          {
            amount,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod as string,
            reference: payment.paymentReference ?? undefined,
            description: `Payment applied to invoice ${invoice.invoiceNumber}`,
            taxWithheld: withheldOn(invoice),
            source: JournalEntrySource.PAYMENT,
            sourceRef: {
              type: 'PAYMENT',
              id: payment.id,
              number: invoice.invoiceNumber,
            },
          },
          tenantId,
          tx,
        );
      }

      // The credit created above is deliberately not in the return value: callers
      // and the payments API expect a `Payment` back. Surplus shows up on
      // `GET /finance/credits`, which is where an accountant looks for it.
      return payment;
    });
  }

  /**
   * Reverse a payment that was applied in error: the ledger entry is posted in
   * reverse and the invoice is re-derived from the payments that remain. The
   * payment row is kept (marked `isReversed`) rather than deleted so the history
   * of what was once applied stays auditable.
   */
  async reverse(id: string, tenantId?: string, reversedBy?: string) {
    return this.prisma.$transaction(async (tx) => {
      const where = tenantId ? { id, organizationId: tenantId } : { id };
      const payment = await requireRecord(
        tx.payment.findFirst({
          where,
          include: { invoice: true },
        }),
        'Payment',
      );
      if (payment.isReversed) {
        throw new BadRequestException('Payment is already reversed');
      }
      if (payment.invoiceId) {
        // Derived from the payments that remain, never decremented: a reversal
        // and a refund can both hit the same invoice.
        await syncInvoiceSettlement(tx, payment.invoiceId);
      }

      await this.accountingService.reverseEntriesForSource(
        id,
        tenantId,
        reversedBy,
        tx,
      );

      return tx.payment.update({
        where: { id },
        data: { isReversed: true, reversedAt: new Date(), reversedBy },
      });
    });
  }

  /**
   * Allocate a payment that arrived without an invoice — a bank transfer
   * credited to the account, an M-Pesa deposit with no reference — across the
   * customer's outstanding invoices, oldest due date first. Any part that no
   * invoice needs becomes credit, so the money is always accounted for.
   *
   * This is the default the module doc asks for ("oldest outstanding invoice
   * first"); pass explicit `invoiceIds` to override the order.
   */
  async allocate(
    id: string,
    options?: { invoiceIds?: string[]; allocatedBy?: string },
    tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required to allocate');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await requireRecord(
        tx.payment.findFirst({
          where: { id, organizationId: tenantId },
          include: {
            invoice: true,
            rentalAgreement: { select: { tenantId: true } },
          },
        }),
        'Payment',
      );
      if (payment.isReversed) {
        throw new BadRequestException('A reversed payment cannot be allocated');
      }

      const remaining = round2(
        Number(payment.amount) - Number(payment.appliedAmount ?? 0),
      );
      if (remaining <= 0) {
        throw new BadRequestException(
          'This payment is already fully allocated',
        );
      }

      // Narrow the search to the customer this payment belongs to, when we can
      // tell who that is — allocating a landlord's transfer across a stranger's
      // arrears would be worse than leaving it unallocated.
      const scope: Prisma.InvoiceWhereInput = payment.rentalAgreementId
        ? { rentalAgreementId: payment.rentalAgreementId }
        : payment.invoice?.landlordId
          ? { landlordId: payment.invoice.landlordId }
          : {};

      const invoices = options?.invoiceIds?.length
        ? await tx.invoice.findMany({
            where: { id: { in: options.invoiceIds }, organizationId: tenantId },
          })
        : await tx.invoice.findMany({
            where: {
              organizationId: tenantId,
              status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
              balanceAmount: { gt: 0 },
              ...scope,
            },
            orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
            take: 50,
          });

      if (options?.invoiceIds?.length) {
        // Honour the caller's order rather than re-sorting by date.
        const byId = new Map(
          options.invoiceIds.map((invoiceId, index) => [invoiceId, index]),
        );
        invoices.sort((a, b) => byId.get(a.id)! - byId.get(b.id)!);
      }

      const allocations: { invoiceId: string; amount: number }[] = [];
      let unallocated = remaining;
      let tenantIdForCredit: string | undefined;
      let landlordIdForCredit: string | undefined;

      for (const invoice of invoices) {
        if (unallocated <= 0) break;
        const allocation = allocateToInvoice(
          {
            totalAmount: Number(invoice.totalAmount),
            balanceAmount: Number(invoice.balanceAmount),
            paidAmount: Number(invoice.paidAmount),
            status: invoice.status,
          },
          unallocated,
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
        allocations.push({ invoiceId: invoice.id, amount: allocation.applied });
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: allocation.applied,
            createdBy: options?.allocatedBy,
          },
        });
        unallocated = round2(unallocated - allocation.applied);
      }

      // Anything the invoices could not absorb is the customer's money.
      let credit: Awaited<ReturnType<CreditsService['captureSurplus']>> = null;
      if (unallocated > 0) {
        const owner = allocations.length
          ? await tx.invoice.findFirst({
              where: {
                id: { in: allocations.map((entry) => entry.invoiceId) },
              },
              select: {
                landlordId: true,
                rentalAgreement: { select: { tenantId: true } },
              },
            })
          : null;
        tenantIdForCredit =
          owner?.rentalAgreement?.tenantId ??
          payment.rentalAgreement?.tenantId ??
          undefined;
        landlordIdForCredit =
          owner?.landlordId ?? payment.invoice?.landlordId ?? undefined;

        if (!tenantIdForCredit && !landlordIdForCredit) {
          throw new BadRequestException(
            'The unallocated part has no tenant or landlord to credit — allocate it to an invoice or record it as a receipt first',
          );
        }

        credit = await this.creditsService.captureSurplus(
          {
            amount: unallocated,
            reason: `Unallocated payment ${payment.id}`,
            source: CustomerCreditSource.UNALLOCATED_RECEIPT,
            sourcePaymentId: payment.id,
            tenantId: tenantIdForCredit,
            landlordId: landlordIdForCredit,
            currency: payment.currency,
            createdBy: options?.allocatedBy,
          },
          tenantId,
          tx,
        );
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { appliedAmount: round2(Number(payment.amount) - unallocated) },
      });

      return { payment: updated, allocations, unallocated, credit };
    });
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.payment.findMany({
      where,
      include: {
        invoice: true,
        rentalAgreement: true,
        receipt: true,
      },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.payment.findFirst({
        where,
        include: {
          invoice: true,
          rentalAgreement: true,
          receipt: true,
        },
      }),
      'Payment',
    );
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.payment, {
        id,
        organizationId: tenantId,
      });
      // Deleting a payment that was applied to an invoice must also undo the
      // allocation and the ledger entry; otherwise the invoice stays "paid"
      // against money that no longer arrived. Already-reversed payments have
      // nothing left to undo.
      const existing = await this.prisma.payment.findFirst({
        where: { id, organizationId: tenantId },
        select: { isReversed: true },
      });
      if (existing && !existing.isReversed) {
        await this.reverse(id, tenantId);
      }
    }
    return this.prisma.payment.delete({
      where: { id },
    });
  }

  async deleteMany(ids: string[], tenantId?: string) {
    const where = tenantId
      ? { id: { in: ids }, organizationId: tenantId }
      : { id: { in: ids } };
    const result = await this.prisma.payment.deleteMany({
      where,
    });
    return { deleted: result.count };
  }
}
