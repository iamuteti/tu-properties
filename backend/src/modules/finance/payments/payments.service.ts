import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JournalEntrySource, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private accountingService: AccountingService,
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

      if (!invoiceId) return payment;

      const invoiceWhere: Prisma.InvoiceWhereInput = { id: invoiceId };
      if (tenantId) invoiceWhere.organizationId = tenantId;
      const invoice = await tx.invoice.findFirst({
        where: invoiceWhere,
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          balanceAmount: true,
          status: true,
        },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found for payment allocation');
      }
      if (invoice.status === 'CANCELLED' || invoice.status === 'PAID') {
        throw new BadRequestException(
          `Invoice ${invoice.invoiceNumber} is ${invoice.status} and cannot receive payments`,
        );
      }

      const amount = round2(Number(payment.amount));
      if (amount <= 0) {
        throw new BadRequestException(
          'Payment amount must be greater than zero',
        );
      }

      const newBalance = round2(Number(invoice.balanceAmount) - amount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: round2(Number(invoice.totalAmount) - newBalance),
          balanceAmount: Math.max(0, newBalance),
          status: newBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
        },
      });

      if (tenantId) {
        await this.accountingService.postPaymentReceived(
          {
            amount,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod as string,
            reference: payment.paymentReference ?? undefined,
            description: `Payment applied to invoice ${invoice.invoiceNumber}`,
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
      if (payment.invoiceId && payment.invoice) {
        const remaining = await tx.payment.aggregate({
          where: { invoiceId: payment.invoiceId, isReversed: false },
          _sum: { amount: true },
        });
        const paid = round2(Number(remaining._sum.amount ?? 0));
        const balance = round2(Number(payment.invoice.totalAmount) - paid);
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: paid,
            balanceAmount: Math.max(0, balance),
            status:
              paid <= 0
                ? payment.invoice.status === 'OVERDUE'
                  ? 'OVERDUE'
                  : 'PENDING'
                : balance <= 0
                  ? 'PAID'
                  : 'PARTIALLY_PAID',
          },
        });
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
