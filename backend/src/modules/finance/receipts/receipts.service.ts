import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { CreditsService } from '../credits/credits.service';
import { allocateToInvoice } from '../invoice-allocation';
import { CustomerCreditSource, JournalEntrySource } from '@prisma/client';

@Injectable()
export class ReceiptsService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private creditsService: CreditsService,
  ) {}

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  // Generate receipt number
  private generateReceiptNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `REC-${year}${month}-${random}`;
  }

  async create(
    data: {
      receiptId?: string;
      receiptType?: 'ApplyToInvoice' | 'CashReceipt';
      receiptCategory?: 'Rent' | 'General';
      receivedFrom: string;
      paymentMethod:
        | 'CASH'
        | 'BANK_TRANSFER'
        | 'CHEQUE'
        | 'MPESA'
        | 'CARD'
        | 'OTHER';
      depositIntoAc?: string;
      refNo?: string;
      chequeNo?: string;
      chequeDate?: string;
      recordingDate?: string | Date;
      amountReceived: number;
      notes?: string;
      tenantId?: string;
      landlordId?: string;
      recordDate?: string | Date;
      bankingDate?: string | Date;
      paymentRefNo?: string;
      amountVatInclusive?: boolean;
      receiptTo?: 'Landlord' | 'GeneralLedger';
      drtOrDrf?: 'DirectReceipt' | 'DepositRefund';
      memo?: string;
      paymentBank?: string;
      currency?: string;
      spotRate?: number;
      receiptLines?: {
        date: string | Date;
        invNo?: string;
        particular: string;
        invoiceTotal: number;
        prevReceipts?: number;
        amtDue: number;
        payment: number;
        newBalance: number;
        whtTax?: number;
      }[];
      payments?: {
        invoiceId?: string;
        rentalAgreementId?: string;
        paymentDate: string | Date;
        amount: number;
        currency?: string;
        spotRate?: number;
        paymentMethod:
          | 'CASH'
          | 'BANK_TRANSFER'
          | 'CHEQUE'
          | 'MPESA'
          | 'CARD'
          | 'OTHER';
        paymentReference?: string;
        payee?: string;
        paidFrom?: string;
        paidTo?: string;
        paymentType?: 'ApplyToBill' | 'CashPayment';
        chequeNumber?: string;
        chequeDate?: string;
        mpesaReceiptNumber?: string;
        mpesaPhoneNumber?: string;
        notes?: string;
        attachments?: string;
      }[];
      recordedBy?: string;
    },
    tenantId?: string,
  ) {
    const receiptData: Prisma.ReceiptCreateInput = {
      receiptId: data.receiptId || this.generateReceiptNumber(),
      receiptType: (data.receiptType as any) || 'ApplyToInvoice',
      receiptCategory: (data.receiptCategory as any) || 'Rent',
      receivedFrom: data.receivedFrom,
      paymentMethod: data.paymentMethod as any,
      depositIntoAc: data.depositIntoAc,
      refNo: data.refNo,
      chequeNo: data.chequeNo,
      chequeDate: data.chequeDate ? new Date(data.chequeDate) : undefined,
      recordingDate: data.recordingDate
        ? new Date(data.recordingDate)
        : new Date(),
      amountReceived: data.amountReceived,
      notes: data.notes,
      recordDate: data.recordDate ? new Date(data.recordDate) : undefined,
      bankingDate: data.bankingDate ? new Date(data.bankingDate) : undefined,
      paymentRefNo: data.paymentRefNo,
      amountVatInclusive: data.amountVatInclusive ?? true,
      receiptTo: (data.receiptTo as any) || 'Landlord',
      drtOrDrf: (data.drtOrDrf as any) || 'DepositRefund',
      memo: data.memo,
      paymentBank: data.paymentBank,
      currency: data.currency || 'KES',
      spotRate: data.spotRate || 1,
      recordedBy: data.recordedBy,
    };

    // Verify tenant/landlord relations belong to this tenant before
    // connecting them — otherwise a receipt could be attached to
    // another organization's records.
    if (data.tenantId && tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id: data.tenantId,
        organizationId: tenantId,
      });
    }
    if (data.landlordId && tenantId) {
      await assertTenantRecord(this.prisma.landlord, {
        id: data.landlordId,
        organizationId: tenantId,
      });
    }

    // Add tenant organization if provided
    if (tenantId) {
      receiptData.organization = { connect: { id: tenantId } };
    }

    // Add tenant relation if provided
    if (data.tenantId) {
      receiptData.tenant = { connect: { id: data.tenantId } };
    }

    // Add landlord relation if provided
    if (data.landlordId) {
      receiptData.landlord = { connect: { id: data.landlordId } };
    }

    // Add receipt lines if provided
    if (data.receiptLines && data.receiptLines.length > 0) {
      receiptData.receiptLines = {
        create: data.receiptLines.map((line) => ({
          date: new Date(line.date),
          invNo: line.invNo,
          particular: line.particular,
          invoiceTotal: line.invoiceTotal,
          prevReceipts: line.prevReceipts || 0,
          amtDue: line.amtDue,
          payment: line.payment,
          newBalance: line.newBalance,
          whtTax: line.whtTax || 0,
        })),
      };
    }

    // Normalize payments (also used to apply money to invoices below)
    const paymentsCreate =
      data.payments && data.payments.length > 0
        ? data.payments.map((payment) => ({
            paymentDate: new Date(payment.paymentDate),
            amount: payment.amount,
            currency: payment.currency || 'KES',
            spotRate: payment.spotRate || 1,
            paymentMethod: payment.paymentMethod as any,
            paymentReference: payment.paymentReference,
            payee: payment.payee,
            paidFrom: payment.paidFrom,
            paidTo: payment.paidTo,
            paymentType: (payment.paymentType as any) || 'ApplyToBill',
            chequeNumber: payment.chequeNumber,
            chequeDate: payment.chequeDate
              ? new Date(payment.chequeDate)
              : undefined,
            mpesaReceiptNumber: payment.mpesaReceiptNumber,
            mpesaPhoneNumber: payment.mpesaPhoneNumber,
            notes: payment.notes,
            attachments: payment.attachments,
            recordedBy: data.recordedBy,
            // Add tenant organization if provided
            ...(tenantId && { organization: { connect: { id: tenantId } } }),
            // Add invoice relation if provided
            ...(payment.invoiceId && {
              invoice: { connect: { id: payment.invoiceId } },
            }),
            // Add rental agreement relation if provided
            ...(payment.rentalAgreementId && {
              rentalAgreement: { connect: { id: payment.rentalAgreementId } },
            }),
          }))
        : [];

    if (paymentsCreate.length > 0) {
      receiptData.payments = { create: paymentsCreate };
      // The receipt total must equal what was actually applied
      const totalApplied = paymentsCreate.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );
      if (Math.abs(totalApplied - Number(data.amountReceived)) > 0.01) {
        throw new BadRequestException(
          `Sum of payments (${totalApplied.toFixed(2)}) must equal amount received (${Number(data.amountReceived).toFixed(2)})`,
        );
      }
    }

    // Receipt creation moves money, so run it (and the invoice balance
    // updates, and the GL postings) in a single transaction: either everything
    // lands or nothing does. Invoice balances are only updated for invoices we
    // own — a receipt can never apply money to another tenant's invoice.
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({ data: receiptData });

      // Money applied to a specific invoice relieves AR; any part of the
      // receipt that is not allocated is posted on-account so the cash is
      // still reflected in the ledger.
      let unallocated = 0;

      for (const payment of paymentsCreate) {
        const amount = this.round2(Number(payment.amount));
        const invoiceId = payment.invoice?.connect?.id;

        if (!invoiceId) {
          unallocated = this.round2(unallocated + amount);
          continue;
        }

        const invoiceWhere: Prisma.InvoiceWhereInput = { id: invoiceId };
        if (tenantId) invoiceWhere.organizationId = tenantId;
        const invoice = await tx.invoice.findFirst({
          where: invoiceWhere,
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true,
            balanceAmount: true,
            paidAmount: true,
            rentalAgreement: { select: { tenantId: true } },
          },
        });
        if (!invoice) {
          throw new NotFoundException(
            'Invoice not found for payment allocation',
          );
        }
        if (invoice.status === 'CANCELLED') {
          throw new BadRequestException(
            `Invoice ${invoice.invoiceNumber} is CANCELLED and cannot receive payments`,
          );
        }

        // An invoice absorbs only what it still owes; the rest is the
        // customer's money and is credited, not dropped.
        const allocation = allocateToInvoice(
          {
            totalAmount: Number(invoice.totalAmount),
            balanceAmount: Number(invoice.balanceAmount),
            paidAmount: Number(invoice.paidAmount),
            status: invoice.status,
          },
          amount,
        );

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: allocation.paidAmount,
            balanceAmount: allocation.balanceAmount,
            status: allocation.status,
          },
        });

        // Recorded as an allocation so a later refund knows exactly how much of
        // this payment settled the bill.
        const createdPayment = await tx.payment.findFirst({
          where: { receiptId: receipt.id, amount },
          select: { id: true },
        });
        if (createdPayment) {
          await tx.paymentAllocation.create({
            data: {
              paymentId: createdPayment.id,
              invoiceId: invoice.id,
              amount: allocation.applied,
              createdBy: data.recordedBy,
            },
          });
        }

        if (allocation.surplus > 0 && tenantId) {
          await this.creditsService.captureSurplus(
            {
              amount: allocation.surplus,
              reason: `Overpayment on invoice ${invoice.invoiceNumber}`,
              source: CustomerCreditSource.OVERPAYMENT,
              tenantId: invoice.rentalAgreement?.tenantId ?? undefined,
              landlordId: data.landlordId,
              currency: receipt.currency,
              createdBy: data.recordedBy,
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
              reference: payment.paymentReference,
              description: `Receipt ${receipt.receiptId} — payment applied`,
              source: JournalEntrySource.RECEIPT,
              sourceRef: {
                type: 'RECEIPT',
                id: receipt.id,
                number: receipt.receiptId,
              },
            },
            tenantId,
            tx,
          );
        }
      }

      if (tenantId && unallocated > 0) {
        await this.accountingService.postPaymentReceived(
          {
            amount: unallocated,
            paymentDate: receipt.recordingDate,
            paymentMethod: receipt.paymentMethod as string,
            reference: receipt.refNo ?? undefined,
            description: `Receipt ${receipt.receiptId} — on account`,
            // Money collected for an owner is not income until the owner
            // statement is paid out, so it sits in a liability account.
            onBehalfOfLandlord: Boolean(data.landlordId),
            source: JournalEntrySource.RECEIPT,
            sourceRef: {
              type: 'RECEIPT',
              id: receipt.id,
              number: receipt.receiptId,
            },
          },
          tenantId,
          tx,
        );
      }

      return receipt;
    });
  }

  findAll(tenantId?: string, category?: string) {
    const where: Prisma.ReceiptWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (category && ['Rent', 'General', 'Refund'].includes(category)) {
      where.receiptCategory = category as any;
    }
    return this.prisma.receipt.findMany({
      where,
      include: {
        tenant: true,
        payments: {
          include: {
            invoice: true,
            rentalAgreement: true,
          },
        },
        receiptLines: true,
      },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.receipt.findFirst({
        where,
        include: {
          tenant: true,
          payments: {
            include: {
              invoice: true,
              rentalAgreement: true,
            },
          },
          receiptLines: true,
        },
      }),
      'Receipt',
    );
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.receipt, {
        id,
        organizationId: tenantId,
      });
      // A deleted receipt must not leave its cash movement in the ledger.
      await this.accountingService.reverseEntriesForSource(id, tenantId);
    }
    return this.prisma.receipt.delete({
      where: { id },
    });
  }

  async deleteMany(ids: string[], tenantId?: string) {
    const where = tenantId
      ? { id: { in: ids }, organizationId: tenantId }
      : { id: { in: ids } };
    const result = await this.prisma.receipt.deleteMany({
      where,
    });
    return { deleted: result.count };
  }
}
