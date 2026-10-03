import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LandlordCharge,
  LandlordPayout,
  OwnerStatementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  GenerateStatementDto,
  StatementFilters,
} from './dto/statement.dto';
import {
  computeOutstandingBalance,
  computeStatementTotals,
  computeStatementUnsettled,
  findOverlappingPeriod,
  fromCents,
  toCents,
  type StatementExpenseLine,
  type StatementIncomeLine,
} from './statement-calculator';
import {
  renderStatementDocument,
  type StatementDocumentLine,
} from './statement-document';

/**
 * Owner statements (Module 6).
 *
 * A statement is **derived, never entered**: the service reads the `Payment`
 * rows that hit this landlord's rental invoices during the period and the
 * `LandlordCharge` rows levied in the period, then hands them to the pure
 * arithmetic in `statement-calculator.ts`. Two consequences worth stating:
 *
 *  - Finance stays the single source of truth for rent. Nothing here copies a
 *    balance; if a payment is deleted the statement preview changes with it.
 *  - Sale proceeds are excluded. `Invoice.saleTransactionId` marks money billed
 *    for a property sale, which belongs to the seller through the Sales module,
 *    not to a landlord's rental account.
 *
 * Generation writes a frozen snapshot (`incomeLines`/`expenseLines` plus the
 * five money columns) so an ISSUED statement keeps reconciling to its own lines
 * after the underlying invoices are edited.
 */

const MAX_PERIOD_DAYS = 400;

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

type StatementWithRelations = Prisma.OwnerStatementGetPayload<{
  include: { landlord: true; payouts: true; charges: true };
}>;

/**
 * A statement as the API returns it: the `Decimal` money columns flattened to
 * numbers (they do not survive `JSON.stringify` as-is) and two derived figures
 * added — what has already been paid against it and what is still owed.
 */
export type OwnerStatementDetail = Omit<
  StatementWithRelations,
  | 'grossIncome'
  | 'expenses'
  | 'managementFee'
  | 'carriedForward'
  | 'netPayout'
  | 'incomeLines'
  | 'expenseLines'
  | 'payouts'
  | 'charges'
> & {
  grossIncome: number;
  expenses: number;
  managementFee: number;
  carriedForward: number;
  netPayout: number;
  incomeLines: StatementIncomeLine[];
  expenseLines: StatementExpenseLine[];
  payouts: Array<Omit<LandlordPayout, 'amount'> & { amount: number }>;
  charges: Array<Omit<LandlordCharge, 'amount'> & { amount: number }>;
  settledAmount: number;
  outstandingAmount: number;
};

export interface StatementPreview {
  landlordId: string;
  periodStart: string;
  periodEnd: string;
  grossIncome: number;
  expenses: number;
  managementFee: number;
  carriedForward: number;
  netPayout: number;
  incomeLines: StatementIncomeLine[];
  expenseLines: StatementExpenseLine[];
  /** Statements already issued for this landlord, newest first. */
  priorStatements: Array<{
    id: string;
    statementNumber: string;
    periodStart: Date;
    periodEnd: Date;
    status: OwnerStatementStatus;
    netPayout: number;
  }>;
}

@Injectable()
export class OwnerStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ derivation

  /**
   * Rent collected for this landlord in the period, one line per invoice.
   *
   * An invoice counts as owner income when it names the landlord, or when it is
   * a rental invoice for one of the landlord's properties but was raised without
   * naming them (the legacy path — `Invoice.landlordId` is nullable).
   */
  private async collectIncomeLines(
    landlordId: string,
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<StatementIncomeLine[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId,
        paymentDate: { gte: periodStart, lte: periodEnd },
        invoice: {
          organizationId,
          // Sale instalments are not rent.
          saleTransactionId: null,
          OR: [
            { landlordId },
            {
              landlordId: null,
              rentalAgreement: { unit: { property: { landlordId } } },
            },
          ],
        },
      },
      select: {
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            invoiceNumber: true,
            rentalAgreement: {
              select: {
                unit: { select: { property: { select: { name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const byInvoice = new Map<
      string,
      { amountCents: number; paymentDate: string; property: string | null }
    >();

    for (const payment of payments) {
      const invoiceNumber = payment.invoice?.invoiceNumber;
      if (!invoiceNumber) continue;

      const property =
        payment.invoice?.rentalAgreement?.unit.property.name ?? null;
      const existing = byInvoice.get(invoiceNumber);
      const entry = existing ?? {
        amountCents: 0,
        paymentDate: payment.paymentDate.toISOString().slice(0, 10),
        property,
      };
      entry.amountCents += toCents(Number(payment.amount));
      // The line is dated on the last payment that made up this period's total.
      entry.paymentDate = payment.paymentDate.toISOString().slice(0, 10);
      byInvoice.set(invoiceNumber, entry);
    }

    return [...byInvoice.entries()].map(([ref, entry]) => ({
      ref,
      description: 'Rent collected',
      property: entry.property,
      amount: fromCents(entry.amountCents),
      paymentDate: entry.paymentDate,
    }));
  }

  /** Owner charges raised in the period that no statement has claimed yet. */
  private async collectExpenseLines(
    landlordId: string,
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<StatementExpenseLine[]> {
    const charges = await this.prisma.landlordCharge.findMany({
      where: {
        landlordId,
        organizationId,
        ownerStatementId: null,
        chargeDate: { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        category: true,
        description: true,
        amount: true,
        chargeDate: true,
        property: { select: { name: true } },
      },
      orderBy: { chargeDate: 'asc' },
    });

    return charges.map((charge) => ({
      ref: charge.id,
      category: charge.category,
      description: charge.description,
      property: charge.property?.name ?? null,
      amount: Number(charge.amount),
      chargeDate: charge.chargeDate.toISOString().slice(0, 10),
    }));
  }

  /**
   * What is still owed from statements that ended before this period starts.
   *
   * A payout only clears the balance once it is actually PAID, so a transfer
   * sitting in PROCESSING still counts as owed.
   */
  private async computeCarriedForward(
    landlordId: string,
    organizationId: string,
    periodStart: Date,
  ): Promise<number> {
    const statements = await this.prisma.ownerStatement.findMany({
      where: {
        landlordId,
        organizationId,
        periodEnd: { lt: periodStart },
        status: {
          in: [OwnerStatementStatus.ISSUED, OwnerStatementStatus.SETTLED],
        },
      },
      select: {
        id: true,
        status: true,
        netPayout: true,
        payouts: { select: { status: true, amount: true } },
      },
    });

    const paidByStatement: Record<string, number> = {};
    for (const statement of statements) {
      const settled = (statement.payouts ?? [])
        .filter((payout) => payout.status === 'PAID')
        .reduce((sum, payout) => sum + toCents(Number(payout.amount)), 0);
      if (settled > 0) {
        paidByStatement[statement.id] = fromCents(settled);
      }
    }

    return computeOutstandingBalance({
      statements: statements.map((statement) => ({
        status: statement.status,
        netPayout: Number(statement.netPayout),
      })),
      paidByStatement,
    });
  }

  /** Total the landlord is owed across every statement ever issued. */
  async outstanding(
    landlordId: string,
    organizationId: string,
  ): Promise<{
    outstanding: number;
    paid: number;
    statements: number;
  }> {
    await this.assertLandlord(landlordId, organizationId);

    const statements = await this.prisma.ownerStatement.findMany({
      where: {
        landlordId,
        organizationId,
        status: {
          in: [OwnerStatementStatus.ISSUED, OwnerStatementStatus.SETTLED],
        },
      },
      select: {
        id: true,
        status: true,
        netPayout: true,
        payouts: { select: { status: true, amount: true } },
      },
    });

    const paidByStatement: Record<string, number> = {};
    for (const statement of statements) {
      const settled = (statement.payouts ?? [])
        .filter((payout) => payout.status === 'PAID')
        .reduce((sum, payout) => sum + toCents(Number(payout.amount)), 0);
      if (settled > 0) paidByStatement[statement.id] = fromCents(settled);
    }

    const paid = Object.values(paidByStatement).reduce(
      (sum, amount) => sum + toCents(amount),
      0,
    );

    return {
      outstanding: computeOutstandingBalance({
        statements: statements.map((statement) => ({
          status: statement.status,
          netPayout: Number(statement.netPayout),
        })),
        paidByStatement,
      }),
      paid: fromCents(paid),
      statements: statements.length,
    };
  }

  // -------------------------------------------------------------- preview

  /** The same calculation `generate` performs, without writing anything. */
  async preview(
    landlordId: string,
    periodStart: Date,
    periodEnd: Date,
    organizationId: string,
    overrides: Partial<GenerateStatementDto> = {},
  ): Promise<StatementPreview> {
    const landlord = await this.assertLandlord(landlordId, organizationId);
    const [incomeLines, expenseLines, carriedForward, priorStatements] =
      await Promise.all([
        this.collectIncomeLines(
          landlordId,
          organizationId,
          periodStart,
          periodEnd,
        ),
        this.collectExpenseLines(
          landlordId,
          organizationId,
          periodStart,
          periodEnd,
        ),
        this.computeCarriedForward(landlordId, organizationId, periodStart),
        this.prisma.ownerStatement.findMany({
          where: { landlordId, organizationId },
          select: {
            id: true,
            statementNumber: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            netPayout: true,
          },
          orderBy: { periodEnd: 'desc' },
          take: 12,
        }),
      ]);

    const totals = computeStatementTotals({
      incomeLines,
      expenseLines,
      feeType: overrides.managementFeeType ?? landlord.managementFeeType,
      feeRate:
        overrides.managementFeeRate ?? Number(landlord.managementFeeRate),
      feeAmount:
        overrides.managementFeeAmount ?? Number(landlord.managementFeeAmount),
      carriedForward,
    });

    return {
      landlordId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      ...totals,
      incomeLines,
      expenseLines,
      priorStatements: priorStatements.map((statement) => ({
        ...statement,
        netPayout: Number(statement.netPayout),
      })),
    };
  }

  // ------------------------------------------------------------- generate

  /** Query-parameter entry point for `GET /owner-statements/preview`. */
  async previewFor(
    landlordId: string,
    periodStartValue: string,
    periodEndValue: string,
    organizationId: string,
    overrides: Partial<GenerateStatementDto> = {},
  ): Promise<StatementPreview> {
    const periodStart = parsePeriodStart(periodStartValue);
    const periodEnd = parsePeriodEnd(periodEndValue);
    validatePeriod(periodStart, periodEnd);

    return this.preview(
      landlordId,
      periodStart,
      periodEnd,
      organizationId,
      overrides,
    );
  }

  async generate(
    dto: GenerateStatementDto,
    organizationId: string,
    userId?: string,
  ): Promise<OwnerStatementDetail> {
    const periodStart = parsePeriodStart(dto.periodStart);
    const periodEnd = parsePeriodEnd(dto.periodEnd);
    validatePeriod(periodStart, periodEnd);

    const preview = await this.preview(
      dto.landlordId,
      periodStart,
      periodEnd,
      organizationId,
      dto,
    );

    // Guard the double-pay: two statements covering the same rent would send the
    // owner money twice for the same month.
    const overlap = findOverlappingPeriod(
      preview.priorStatements.map((statement) => ({
        id: statement.id,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        status: statement.status,
      })),
      periodStart,
      periodEnd,
    );

    if (overlap) {
      throw new ConflictException(
        `Statement ${overlap.id} already covers part of that period (${overlap.periodStart.toISOString().slice(0, 10)} – ${overlap.periodEnd.toISOString().slice(0, 10)}). ` +
          'Void it or choose a period that does not overlap.',
      );
    }

    const statementNumber = await this.nextStatementNumber(
      organizationId,
      periodEnd,
    );

    // The statement and the claim on its charges must land together: a failure
    // halfway through would leave charges owned by a statement that does not
    // exist. The read-back happens *after* the transaction commits — reading it
    // inside would use a different connection and not see the new row.
    const created = await this.prisma.$transaction(async (tx) => {
      const statement = await tx.ownerStatement.create({
        data: {
          statementNumber,
          organizationId,
          landlordId: dto.landlordId,
          periodStart,
          periodEnd,
          grossIncome: preview.grossIncome,
          expenses: preview.expenses,
          managementFee: preview.managementFee,
          carriedForward: preview.carriedForward,
          netPayout: preview.netPayout,
          notes: dto.notes ?? null,
          incomeLines: preview.incomeLines as unknown as Prisma.InputJsonValue,
          expenseLines: preview.expenseLines as unknown as Prisma.InputJsonValue,
          generatedBy: userId ?? null,
        },
      });

      // Claim the charges so the next statement cannot roll them in again.
      if (preview.expenseLines.length > 0) {
        await tx.landlordCharge.updateMany({
          where: {
            id: { in: preview.expenseLines.map((line) => line.ref) },
            ownerStatementId: null,
          },
          data: { ownerStatementId: statement.id },
        });
      }

      return statement;
    });

    return this.findOne(created.id, organizationId);
  }

  // ---------------------------------------------------------------- reads

  findAll(
    organizationId: string,
    params?: PaginationParams,
    filters?: StatementFilters,
  ): Promise<PaginatedResult<unknown>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'periodEnd',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: Prisma.OwnerStatementWhereInput = { organizationId };

    if (filters?.landlordId) where.landlordId = filters.landlordId;
    if (filters?.status) where.status = filters.status;
    if (filters?.periodStart || filters?.periodEnd) {
      where.periodEnd = {
        ...(filters.periodStart ? { gte: new Date(filters.periodStart) } : {}),
        ...(filters.periodEnd ? { lte: new Date(filters.periodEnd) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { statementNumber: { contains: search, mode: 'insensitive' } },
        { landlord: { name: { contains: search, mode: 'insensitive' } } },
        { landlord: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.ownerStatement.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            landlord: { select: { id: true, code: true, name: true } },
            payouts: true,
          },
        }),
        tx.ownerStatement.count({ where }),
      ]);

      return {
        data: data.map((row) => ({
          ...row,
          grossIncome: Number(row.grossIncome),
          expenses: Number(row.expenses),
          managementFee: Number(row.managementFee),
          carriedForward: Number(row.carriedForward),
          netPayout: Number(row.netPayout),
          incomeLines: (row.incomeLines ??
            []) as unknown as StatementIncomeLine[],
          expenseLines: (row.expenseLines ??
            []) as unknown as StatementExpenseLine[],
          payouts: row.payouts.map((payout) => ({
            ...payout,
            amount: Number(payout.amount),
          })),
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<OwnerStatementDetail> {
    const statement: StatementWithRelations = await requireRecord(
      this.prisma.ownerStatement.findFirst({
        where: { id, organizationId },
        include: {
          landlord: true,
          payouts: { orderBy: { createdAt: 'desc' } },
          charges: { orderBy: { chargeDate: 'asc' } },
        },
      }),
      'Owner statement',
    );

    const settled = statement.payouts
      .filter((payout) => payout.status !== 'FAILED')
      .reduce((sum, payout) => sum + toCents(Number(payout.amount)), 0);

    return {
      ...statement,
      grossIncome: Number(statement.grossIncome),
      expenses: Number(statement.expenses),
      managementFee: Number(statement.managementFee),
      carriedForward: Number(statement.carriedForward),
      netPayout: Number(statement.netPayout),
      incomeLines: (statement.incomeLines ??
        []) as unknown as StatementIncomeLine[],
      expenseLines: (statement.expenseLines ??
        []) as unknown as StatementExpenseLine[],
      payouts: statement.payouts.map((payout) => ({
        ...payout,
        amount: Number(payout.amount),
      })),
      charges: statement.charges.map((charge) => ({
        ...charge,
        amount: Number(charge.amount),
      })),
      settledAmount: fromCents(settled),
      outstandingAmount: computeStatementUnsettled(
        Number(statement.netPayout),
        statement.payouts.map((payout) => ({
          status: payout.status,
          amount: Number(payout.amount),
        })),
      ),
    };
  }

  // ------------------------------------------------------------ lifecycle

  /** Send it to the owner: the numbers stop moving. */
  async issue(
    id: string,
    organizationId: string,
  ): Promise<OwnerStatementDetail> {
    const statement = await this.assertStatement(id, organizationId);

    if (statement.status === OwnerStatementStatus.VOID) {
      throw new ConflictException(
        'This statement was voided and cannot be issued.',
      );
    }
    if (statement.status === OwnerStatementStatus.SETTLED) {
      throw new ConflictException('This statement is already settled.');
    }
    if (statement.status === OwnerStatementStatus.ISSUED) {
      return this.findOne(id, organizationId);
    }

    await this.prisma.ownerStatement.update({
      where: { id },
      data: { status: OwnerStatementStatus.ISSUED, issuedAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Retract a statement. The row stays for the audit trail and its charges are
   * released back into the pool so a corrected statement can pick them up.
   * A statement that money has already left against cannot be voided.
   */
  async void(
    id: string,
    organizationId: string,
    reason?: string,
  ): Promise<OwnerStatementDetail> {
    const statement = await this.assertStatement(id, organizationId);

    if (statement.status === OwnerStatementStatus.VOID) {
      throw new ConflictException('This statement is already void.');
    }

    const paid = statement.payouts.filter((payout) => payout.status === 'PAID');
    if (paid.length > 0) {
      throw new ConflictException(
        'A statement cannot be voided after a payout has been made against it.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.landlordCharge.updateMany({
        where: { ownerStatementId: id },
        data: { ownerStatementId: null },
      });

      await tx.ownerStatement.update({
        where: { id },
        data: {
          status: OwnerStatementStatus.VOID,
          notes: reason
            ? `${statement.notes ? `${statement.notes}\n\n` : ''}Voided: ${reason}`
            : statement.notes,
        },
      });
    });

    return this.findOne(id, organizationId);
  }

  /** A draft was never sent, so it can simply be removed. */
  async remove(id: string, organizationId: string): Promise<{ id: string }> {
    const statement = await this.assertStatement(id, organizationId);

    if (statement.status !== OwnerStatementStatus.DRAFT) {
      throw new ConflictException(
        'Only a draft statement can be deleted. Void an issued statement instead — it is a document the owner was sent.',
      );
    }

    await this.prisma.landlordCharge.updateMany({
      where: { ownerStatementId: id },
      data: { ownerStatementId: null },
    });
    await this.prisma.ownerStatement.delete({ where: { id } });

    return { id };
  }

  /** Every statement in one CSV, for the finance team. */
  async exportCsv(
    organizationId: string,
    filters?: StatementFilters,
  ): Promise<string> {
    const statements = await this.prisma.ownerStatement.findMany({
      where: {
        organizationId,
        ...(filters?.landlordId ? { landlordId: filters.landlordId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: { landlord: { select: { code: true, name: true } } },
      orderBy: { periodEnd: 'desc' },
    });

    return toCsv(
      [
        'statementNumber',
        'landlordCode',
        'landlord',
        'periodStart',
        'periodEnd',
        'grossIncome',
        'expenses',
        'managementFee',
        'carriedForward',
        'netPayout',
        'status',
        'issuedAt',
      ],
      statements.map((statement) => ({
        statementNumber: statement.statementNumber,
        landlordCode: statement.landlord.code,
        landlord: statement.landlord.name,
        periodStart: statement.periodStart.toISOString().slice(0, 10),
        periodEnd: statement.periodEnd.toISOString().slice(0, 10),
        grossIncome: Number(statement.grossIncome).toFixed(2),
        expenses: Number(statement.expenses).toFixed(2),
        managementFee: Number(statement.managementFee).toFixed(2),
        carriedForward: Number(statement.carriedForward).toFixed(2),
        netPayout: Number(statement.netPayout).toFixed(2),
        status: statement.status,
        issuedAt: statement.issuedAt?.toISOString().slice(0, 10) ?? '',
      })),
    );
  }

  // ------------------------------------------------------------- internals

  /**
   * The printable statement. Rendered from the stored snapshot, not from a live
   * recalculation: the document must match the numbers that were issued.
   */
  async renderDocument(id: string, organizationId: string): Promise<string> {
    const statement = await this.findOne(id, organizationId);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        legalName: true,
        contactEmail: true,
        contactPhone: true,
        taxId: true,
      },
    });

    const landlord = statement.landlord;

    return renderStatementDocument({
      statementNumber: statement.statementNumber,
      status: statement.status,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      issuedAt: statement.issuedAt ?? null,
      currency: statement.currency,
      grossIncome: statement.grossIncome,
      expenses: statement.expenses,
      managementFee: statement.managementFee,
      carriedForward: statement.carriedForward,
      netPayout: statement.netPayout,
      settledAmount: statement.settledAmount,
      outstandingAmount: statement.outstandingAmount,
      notes: statement.notes ?? null,
      incomeLines: statement.incomeLines as unknown as StatementDocumentLine[],
      expenseLines:
        statement.expenseLines as unknown as StatementDocumentLine[],
      managementFeeType: landlord.managementFeeType,
      managementFeeRate: Number(landlord.managementFeeRate),
      landlord: {
        code: landlord.code,
        name: landlord.name,
        email: landlord.email,
        phone: landlord.phone,
        address: landlord.address,
        city: landlord.city,
        country: landlord.country,
        bankName: landlord.bankName,
        accountName: landlord.accountName,
        accountNumber: landlord.accountNumber,
      },
      organization: organization
        ? {
            name: organization.name,
            legalName: organization.legalName,
            contactEmail: organization.contactEmail,
            contactPhone: organization.contactPhone,
            taxId: organization.taxId,
          }
        : { name: '' },
    });
  }

  private async assertLandlord(landlordId: string, organizationId: string) {
    const landlord = await requireRecord(
      this.prisma.landlord.findFirst({
        where: { id: landlordId, organizationId },
        select: {
          id: true,
          name: true,
          code: true,
          managementFeeType: true,
          managementFeeRate: true,
          managementFeeAmount: true,
        },
      }),
      'Landlord',
    );

    return landlord;
  }

  private async assertStatement(id: string, organizationId: string) {
    return requireRecord(
      this.prisma.ownerStatement.findFirst({
        where: { id, organizationId },
        include: { payouts: true },
      }),
      'Owner statement',
    );
  }

  /**
   * `OST-YYYYMM-NNNN`. Sequential within the month so statements sort the way
   * they were produced, with a random suffix to survive two processes
   * generating at once.
   */
  private async nextStatementNumber(
    organizationId: string,
    periodEnd: Date,
  ): Promise<string> {
    const prefix = `OST-${periodEnd.getUTCFullYear()}${String(periodEnd.getUTCMonth() + 1).padStart(2, '0')}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await this.prisma.ownerStatement.count({
        where: { organizationId, statementNumber: { startsWith: prefix } },
      });
      const candidate = `${prefix}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const clash = await this.prisma.ownerStatement.findFirst({
        where: { statementNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }
}

export function parsePeriodStart(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('periodStart is not a valid date.');
  }
  return date;
}

/** A bare `YYYY-MM-DD` end date means the whole day, so extend it to its end. */
export function parsePeriodEnd(value: string): Date {
  const date = parsePeriodStart(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  return date;
}

function validatePeriod(periodStart: Date, periodEnd: Date): void {
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new BadRequestException('The period must end on or after it starts.');
  }

  const days =
    (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_PERIOD_DAYS) {
    throw new BadRequestException(
      `A statement period cannot span more than ${MAX_PERIOD_DAYS} days.`,
    );
  }

  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  if (periodEnd.getTime() > endOfToday.getTime()) {
    throw new BadRequestException(
      'A statement cannot cover a period that has not finished yet.',
    );
  }
}
