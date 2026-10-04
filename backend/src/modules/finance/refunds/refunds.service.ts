import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomerCreditSource, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { PAYMENT_METHOD_ACCOUNT } from '../accounting/chart-of-accounts';
import { round2 } from '../invoice-allocation';
import { syncInvoiceSettlement } from '../invoice-settlement';
import { CreditsService } from '../credits/credits.service';

type Tx = Prisma.TransactionClient;

function generateRefundNumber(): string {
  const now = new Date();
  return `RFD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    Math.floor(Math.random() * 10000),
  ).padStart(4, '0')}`;
}

/**
 * Module 8 — Payments: refunds.
 *
 * A payment is never deleted or edited to represent money going back — that
 * would erase the fact that it was ever received. A `PaymentRefund` records the
 * direction explicitly, and:
 *
 *   - the invoice the payment funded is re-derived from live payments minus
 *     refunds, so a refund re-opens exactly the balance it closed,
 *   - the cash leaves the ledger (debit contra revenue, credit the same cash
 *     account the payment landed in),
 *   - a credit note is issued against the customer, so the refund has a
 *     document behind it — the doc's recommended pattern.
 */
@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private creditsService: CreditsService,
  ) {}

  /**
   * Refund part or all of a payment. Refunds the surplus back to the customer's
   * credit balance rather than pushing a negative payment onto an invoice.
   */
  async create(
    data: {
      paymentId: string;
      amount: number;
      reason: string;
      refundReference?: string;
      /** True when the money was never applied to an invoice and so goes back
       *  as a credit rather than as a credit note against one. */
      toCredit?: boolean;
      processedBy?: string;
    },
    tenantId?: string,
  ) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('A refund needs a reason');
    }
    const amount = round2(Number(data.amount));
    if (amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required to refund');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await requireRecord(
        tx.payment.findFirst({
          where: { id: data.paymentId, organizationId: tenantId },
          include: { invoice: { include: { rentalAgreement: true } } },
        }),
        'Payment',
      );
      if (payment.isReversed) {
        throw new BadRequestException(
          'This payment was reversed — reverse the reversal instead of refunding it',
        );
      }

      const alreadyRefunded = round2(
        Number(
          (
            await tx.paymentRefund.aggregate({
              where: { paymentId: payment.id },
              _sum: { amount: true },
            })
          )._sum.amount ?? 0,
        ),
      );
      const refundable = round2(Number(payment.amount) - alreadyRefunded);
      if (amount > refundable) {
        throw new BadRequestException(
          `Refund of ${amount.toFixed(2)} exceeds the ${refundable.toFixed(2)} still refundable on this payment`,
        );
      }

      const creditNote = await this.issueCreditNote(
        tx,
        {
          payment,
          amount,
          reason: data.reason,
          invoiceId: data.toCredit ? null : (payment.invoiceId ?? null),
          tenantId: payment.invoice?.rentalAgreement?.tenantId,
          landlordId: payment.invoice?.landlordId ?? null,
          processedBy: data.processedBy,
        },
        tenantId,
      );

      const refund = await tx.paymentRefund.create({
        data: {
          paymentId: payment.id,
          amount,
          reason: data.reason,
          refundReference: data.refundReference,
          processedBy: data.processedBy,
          creditNoteId: creditNote.id,
          organizationId: tenantId,
        },
        include: { creditNote: true, payment: true },
      });

      // A refund that was never applied to an invoice is money the customer
      // still owns — hand it back as credit instead of pretending it settled a
      // bill.
      if (data.toCredit && !payment.invoiceId) {
        await this.creditsService.captureSurplus(
          {
            amount,
            reason: `Refund of payment: ${data.reason}`,
            source: CustomerCreditSource.REFUND_UNSPENT,
            sourcePaymentId: payment.id,
            tenantId: payment.invoice?.rentalAgreement?.tenantId,
            landlordId: payment.invoice?.landlordId ?? undefined,
            currency: payment.currency,
            createdBy: data.processedBy,
          },
          tenantId,
          tx,
        );
      }

      // Money actually leaves the business.
      await this.accountingService.postRefund(
        {
          amount,
          refundDate: refund.processedAt,
          fromAccountCode:
            PAYMENT_METHOD_ACCOUNT[payment.paymentMethod] ?? '1010',
          description: `Refund of payment ${payment.id}`,
          reference: data.refundReference,
          sourceRef: {
            type: 'REFUND',
            id: refund.id,
            number: creditNote.creditNoteNumber,
          },
        },
        tenantId,
        tx,
      );

      if (payment.invoiceId) {
        await syncInvoiceSettlement(tx, payment.invoiceId, tenantId);
      }

      return tx.paymentRefund.findUniqueOrThrow({
        where: { id: refund.id },
        include: {
          creditNote: { include: { lines: true } },
          payment: { include: { invoice: true } },
        },
      });
    });
  }

  private async issueCreditNote(
    tx: Tx,
    args: {
      payment: { id: string; currency: string };
      amount: number;
      reason: string;
      invoiceId: string | null;
      tenantId?: string | null;
      landlordId?: string | null;
      processedBy?: string;
    },
    tenantId: string,
  ) {
    return tx.creditNote.create({
      data: {
        creditNoteNumber: generateRefundNumber(),
        organizationId: tenantId,
        invoiceId: args.invoiceId,
        tenantId: args.tenantId ?? undefined,
        landlordId: args.landlordId ?? undefined,
        issueDate: new Date(),
        reason: args.reason,
        // A refund carries no fresh tax: it unwinds what was invoiced, so the
        // VAT is on the original invoice, not re-charged here.
        subtotal: args.amount,
        vatAmount: 0,
        totalAmount: args.amount,
        currency: args.payment.currency || 'KES',
        status: 'ISSUED',
        createdBy: args.processedBy,
        lines: {
          create: {
            description: `Refund — ${args.reason}`,
            quantity: 1,
            unitPrice: args.amount,
            amount: args.amount,
          },
        },
      },
    });
  }

  findAll(tenantId?: string, filters?: { paymentId?: string }) {
    const where: Prisma.PaymentRefundWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.paymentId) where.paymentId = filters.paymentId;
    return this.prisma.paymentRefund.findMany({
      where,
      include: {
        creditNote: true,
        payment: { include: { invoice: true, rentalAgreement: true } },
      },
      orderBy: { processedAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.paymentRefund.findFirst({
        where,
        include: {
          creditNote: { include: { lines: true } },
          payment: { include: { invoice: true, rentalAgreement: true } },
        },
      }),
      'Refund',
    );
  }

  /** How much of a payment is still refundable — used to cap the UI. */
  async refundableAmount(paymentId: string, tenantId?: string) {
    const where = tenantId
      ? { id: paymentId, organizationId: tenantId }
      : { id: paymentId };
    const payment = await requireRecord(
      this.prisma.payment.findFirst({ where }),
      'Payment',
    );
    const refunded = Number(
      (
        await this.prisma.paymentRefund.aggregate({
          where: { paymentId: payment.id },
          _sum: { amount: true },
        })
      )._sum.amount ?? 0,
    );
    return {
      paymentAmount: Number(payment.amount),
      refunded: round2(refunded),
      refundable: round2(Number(payment.amount) - refunded),
    };
  }
}
