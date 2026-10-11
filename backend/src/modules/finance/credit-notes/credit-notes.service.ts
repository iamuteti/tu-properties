import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type CreditNote, JournalEntrySource, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { AccountingService } from '../accounting/accounting.service';
import { ACCOUNT_CODES } from '../accounting/chart-of-accounts';
import { round2 } from '../invoice-allocation';
import { syncInvoiceSettlement } from '../invoice-settlement';

type Tx = Prisma.TransactionClient;

export interface CreateCreditNoteInput {
  invoiceId: string;
  reason: string;
  notes?: string;
  currency?: string;
  lines?: { description: string; amount: number }[];
  organizationId?: string;
  actorId?: string;
}

/**
 * Module 7 — Finance & Accounting: standalone credit note issuance.
 *
 * A credit note reduces what a customer owes, with no cash moving — it is a
 * billing correction or a write-off rather than a refund. The GL posting is the
 * mirror of a refund without the bank leg: Accounts Receivable is reduced and
 * Refunds & Allowances (contra revenue) absorbs it, so revenue reports stay
 * truthful.
 *
 * The invoice's money columns are then re-derived via `syncInvoiceSettlement`,
 * which now counts ISSUED credit notes in the paid figure alongside payments,
 * credit applied and withheld tax. The refund-driven path (RefundsService)
 * creates the same `CreditNote` row and is covered by the same sum, so the two
 * cannot double-count — a credit note is a credit note regardless of how it
 * was born.
 */
@Injectable()
export class CreditNotesService {
  private readonly logger = new Logger(CreditNotesService.name);

  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) {}

  /**
   * Issue a standalone credit note against an invoice.
   *
   * The amount is validated against the invoice's outstanding balance — a credit
   * note larger than what is owed is refused, because it would invert a
   * customer into a credit balance on a row that is not a `CustomerCredit`.
   * The note is created and the GL is posted inside one transaction, so the
   * invoice and its ledger entry cannot diverge.
   */
  async create(input: CreateCreditNoteInput): Promise<CreditNote> {
    const tenantId = input.organizationId;
    if (!tenantId) {
      throw new BadRequestException('A tenant scope is required');
    }

    const amount = round2(
      Number(
        input.lines?.reduce((sum, line) => sum + Number(line.amount), 0) ?? 0,
      ),
    );
    if (amount <= 0) {
      throw new BadRequestException(
        'Credit note total must be greater than zero',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await requireRecord(
        tx.invoice.findFirst({
          where: {
            id: input.invoiceId,
            organizationId: tenantId,
          },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            balanceAmount: true,
            currency: true,
          },
        }),
        'Invoice',
      );

      const outstanding = round2(Number(invoice.balanceAmount));
      if (amount > outstanding) {
        throw new BadRequestException(
          `Credit note of ${amount.toFixed(2)} exceeds the ${outstanding.toFixed(2)} outstanding balance on invoice ${invoice.invoiceNumber}`,
        );
      }

      const creditNote = await tx.creditNote.create({
        data: {
          creditNoteNumber: await this.nextCreditNoteNumber(tx, tenantId),
          organizationId: tenantId,
          invoiceId: invoice.id,
          issueDate: new Date(),
          reason: input.reason,
          notes: input.notes,
          currency: input.currency ?? invoice.currency ?? 'KES',
          subtotal: amount,
          vatAmount: 0,
          totalAmount: amount,
          status: 'ISSUED',
          createdBy: input.actorId,
          lines: input.lines
            ? {
                create: input.lines.map((line) => ({
                  description: line.description,
                  quantity: 1,
                  unitPrice: line.amount,
                  amount: line.amount,
                })),
              }
            : undefined,
        },
      });

      await this.accountingService.postEntry(
        {
          entryDate: new Date(),
          memo: `Credit note ${creditNote.creditNoteNumber} on invoice ${invoice.invoiceNumber}`,
          reference: creditNote.creditNoteNumber,
          source: JournalEntrySource.CREDIT_NOTE,
          sourceRef: {
            type: 'CREDIT_NOTE',
            id: creditNote.id,
            number: creditNote.creditNoteNumber,
          },
          lines: [
            {
              accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
              credit: amount,
              description: `Credit note ${creditNote.creditNoteNumber} — reduces AR`,
            },
            {
              accountCode: ACCOUNT_CODES.REFUNDS_AND_ALLOWANCES,
              debit: amount,
              description: `Write-off on invoice ${invoice.invoiceNumber}`,
            },
          ],
        },
        tenantId,
        tx,
      );

      await syncInvoiceSettlement(tx, input.invoiceId, tenantId);

      this.logger.log(
        `Issued credit note ${creditNote.creditNoteNumber} for ${amount.toFixed(2)} on invoice ${invoice.invoiceNumber}`,
      );

      return creditNote;
    });
  }

  async findAll(organizationId?: string): Promise<CreditNote[]> {
    return this.prisma.creditNote.findMany({
      where: { organizationId },
      include: {
        invoice: true,
        tenant: true,
        landlord: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, organizationId?: string): Promise<CreditNote> {
    return requireRecord(
      this.prisma.creditNote.findFirst({
        where: { id, organizationId },
        include: {
          lines: true,
          invoice: {
            select: {
              invoiceNumber: true,
              totalAmount: true,
              balanceAmount: true,
            },
          },
          tenant: true,
          landlord: true,
        },
      }),
      'Credit note',
    );
  }

  /**
   * Void a credit note that has not been refunded or otherwise consumed.
   *
   * The note is moved to VOID and a reversing journal entry is posted so AR is
   * restored and the contra account unwinds. The invoice is re-derived from live
   * data, so its balance returns to what the voided credit had reduced it by.
   */
  async void(
    id: string,
    reason: string,
    organizationId?: string,
    actorId?: string,
  ): Promise<CreditNote> {
    return this.prisma.$transaction(async (tx) => {
      const note = await requireRecord(
        tx.creditNote.findFirst({
          where: { id, organizationId },
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true },
            },
          },
        }),
        'Credit note',
      );
      if (note.status === 'VOID') {
        throw new BadRequestException('Credit note is already voided');
      }

      const refunded = await tx.paymentRefund.findFirst({
        where: { creditNoteId: note.id },
        select: { id: true },
      });
      if (refunded) {
        throw new BadRequestException(
          'This credit note backs a refund — reverse the refund instead of voiding the note',
        );
      }

      const amount = Number(note.totalAmount);

      await tx.creditNote.update({
        where: { id: note.id },
        data: { status: 'VOID' },
      });

      await this.accountingService.postEntry(
        {
          entryDate: new Date(),
          memo: `Voided credit note ${note.creditNoteNumber} — ${reason}`,
          reference: note.creditNoteNumber,
          source: JournalEntrySource.CREDIT_NOTE,
          sourceRef: {
            type: 'CREDIT_NOTE_VOID',
            id: note.id,
            number: note.creditNoteNumber,
          },
          postedBy: actorId,
          lines: [
            {
              accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
              debit: amount,
              description: `Reversal of credit note ${note.creditNoteNumber}`,
            },
            {
              accountCode: ACCOUNT_CODES.REFUNDS_AND_ALLOWANCES,
              credit: amount,
              description: `Reversal of write-off on invoice ${note.invoice?.invoiceNumber ?? 'unknown'}`,
            },
          ],
        },
        organizationId,
        tx,
      );

      if (note.invoiceId) {
        await syncInvoiceSettlement(tx, note.invoiceId, organizationId);
      }

      return tx.creditNote.findUniqueOrThrow({
        where: { id: note.id },
      });
    });
  }

  private async nextCreditNoteNumber(
    tx: Tx,
    organizationId: string,
  ): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const count = await tx.creditNote.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-${month}-01T00:00:00.000Z`),
        },
      },
    });
    return `CN-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
}
