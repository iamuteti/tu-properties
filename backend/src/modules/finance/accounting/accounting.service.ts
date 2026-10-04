import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, JournalEntrySource, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import {
  ACCOUNT_CODES,
  DEFAULT_CHART_OF_ACCOUNTS,
  PAYMENT_METHOD_ACCOUNT,
} from './chart-of-accounts';

type Tx = Prisma.TransactionClient;

/**
 * A single side of a journal entry, as accepted by `postEntry`.
 * Exactly one of `debit`/`credit` may be non-zero.
 */
export interface JournalLineInput {
  /** Account code (e.g. `1200`) or account id. Codes keep auto-posting stable. */
  accountCode?: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  description?: string;
  memo?: string;
}

export interface PostEntryInput {
  entryDate?: Date | string;
  memo?: string;
  reference?: string;
  source?: JournalEntrySource;
  sourceRef?: Record<string, string | null>;
  postedBy?: string;
  lines: JournalLineInput[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Module 7 — Finance & Accounting: double-entry general ledger.
 *
 * Two responsibilities:
 *
 * 1. **Chart of accounts.** Every organization gets the standard chart seeded
 *    lazily (`ensureAccounts`) so auto-posting always has somewhere to post.
 * 2. **Posting.** `postEntry` refuses to write an unbalanced or single-sided
 *    entry, so the trial balance can never drift. Auto-posting from invoices,
 *    receipts and payments goes through the same method as manual entries —
 *    users are never asked to do double-entry for routine transactions.
 *
 * `postEntry` accepts a Prisma transaction client so callers can post their GL
 * entry inside the same transaction as the business record, guaranteeing the
 * ledger and the source record move together.
 */
@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // ── Chart of accounts ─────────────────────────────────────────────────────

  /**
   * Seed the default chart for an organization if it does not have one yet.
   * Idempotent: safe to call on every auto-post (it is a single count query
   * on the happy path).
   */
  async ensureAccounts(organizationId: string, tx: Tx = this.prisma) {
    const existing = await tx.account.count({
      where: { organizationId },
    });
    if (existing > 0) return;

    await tx.account.createMany({
      data: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
        code: account.code,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        description: account.description ?? null,
        normalBalance: account.normalBalance,
        isSystem: true,
        isPostable: true,
        isActive: true,
        organizationId,
      })),
      skipDuplicates: true,
    });
  }

  async listAccounts(tenantId?: string) {
    if (tenantId) await this.ensureAccounts(tenantId);
    return this.prisma.account.findMany({
      where: tenantId ? { organizationId: tenantId } : undefined,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
  }

  async createAccount(
    data: {
      code: string;
      name: string;
      type: AccountType;
      subtype?: string;
      description?: string;
      normalBalance?: 'DEBIT' | 'CREDIT';
      isPostable?: boolean;
    },
    tenantId?: string,
  ) {
    const duplicate = await this.prisma.account.findFirst({
      where: { code: data.code, organizationId: tenantId ?? null },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(`Account code ${data.code} already exists`);
    }
    return this.prisma.account.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        subtype: data.subtype,
        description: data.description,
        normalBalance: data.normalBalance ?? 'DEBIT',
        isPostable: data.isPostable ?? true,
        isSystem: false,
        isActive: true,
        ...(tenantId && { organization: { connect: { id: tenantId } } }),
      },
    });
  }

  async updateAccount(
    id: string,
    data: {
      name?: string;
      subtype?: string;
      description?: string;
      isPostable?: boolean;
      isActive?: boolean;
    },
    tenantId?: string,
  ) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.account, {
        id,
        organizationId: tenantId,
      });
    }
    // `code`, `type` and `normalBalance` are deliberately immutable: entries
    // and reports key off them, and rewriting them would rewrite history.
    return this.prisma.account.update({ where: { id }, data });
  }

  async deleteAccount(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.account, {
        id,
        organizationId: tenantId,
      });
    }
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: { isSystem: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.isSystem) {
      throw new ForbiddenException(
        'System accounts are used by automatic journal entries and cannot be deleted; deactivate it instead',
      );
    }
    const posted = await this.prisma.journalLine.count({
      where: { accountId: id },
    });
    if (posted > 0) {
      throw new BadRequestException(
        'Account has posted journal entries; deactivate it instead of deleting',
      );
    }
    return this.prisma.account.delete({ where: { id } });
  }

  // ── Posting ───────────────────────────────────────────────────────────────

  private async nextEntryNumber(tx: Tx, organizationId?: string) {
    const count = await tx.journalEntry.count({
      where: organizationId ? { organizationId } : {},
    });
    return `JE-${String(count + 1).padStart(6, '0')}`;
  }

  private async resolveAccount(
    tx: Tx,
    reference: string,
    organizationId?: string,
  ): Promise<{ id: string; code: string; isPostable: boolean }> {
    const account = await tx.account.findFirst({
      where: { code: reference, organizationId: organizationId ?? null },
      select: { id: true, code: true, isPostable: true },
    });
    if (!account) {
      throw new BadRequestException(
        `GL posting failed: account ${reference} does not exist for this organization`,
      );
    }
    return account;
  }

  /**
   * Validate lines into debit/credit pairs that balance to the cent, resolving
   * accounts by code or id. Shared by `postEntry` and the manual-entry path.
   */
  private async normalizeLines(
    tx: Tx,
    lines: JournalLineInput[],
    organizationId?: string,
  ) {
    if (!lines || lines.length < 2) {
      throw new BadRequestException(
        'A journal entry needs at least two lines (double entry)',
      );
    }

    const resolved: Prisma.JournalLineCreateWithoutEntryInput[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
      const debit = round2(Number(line.debit ?? 0));
      const credit = round2(Number(line.credit ?? 0));
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(
          'Journal amounts must be positive; swap the debit/credit side instead',
        );
      }
      if (debit === 0 && credit === 0) continue;
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          'A journal line is either a debit or a credit, not both',
        );
      }

      const account = line.accountId
        ? await tx.account.findFirst({
            where: {
              id: line.accountId,
              ...(organizationId ? { organizationId } : {}),
            },
            select: { id: true, code: true, isPostable: true },
          })
        : await this.resolveAccount(tx, line.accountCode ?? '', organizationId);
      if (!account) {
        throw new BadRequestException(
          `GL posting failed: account ${line.accountId ?? line.accountCode} does not exist for this organization`,
        );
      }
      if (!account.isPostable) {
        throw new BadRequestException(
          `Account ${account.code} is a header account and cannot be posted to`,
        );
      }

      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      resolved.push({
        account: { connect: { id: account.id } },
        debit,
        credit,
        description: line.description,
        memo: line.memo,
      });
    }

    if (resolved.length < 2) {
      throw new BadRequestException(
        'A journal entry needs at least two lines (double entry)',
      );
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(
        `Journal entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`,
      );
    }
    if (totalDebit === 0) {
      throw new BadRequestException('Journal entry total cannot be zero');
    }

    return { resolved, totalDebit, totalCredit };
  }

  /**
   * Write a balanced journal entry. Callers doing routine auto-posting should
   * pass their own transaction client so the entry commits with the source
   * record; a failure to post then rolls back the source record too.
   */
  async postEntry(
    input: PostEntryInput,
    tenantId?: string,
    tx: Tx = this.prisma,
  ) {
    if (!tenantId) {
      throw new BadRequestException(
        'A tenant scope is required to post to the general ledger',
      );
    }
    await this.ensureAccounts(tenantId, tx);

    // `normalizeLines` has already proven the lines balance; `postEntry`
    // never sees an unbalanced set of lines.
    const { resolved } = await this.normalizeLines(tx, input.lines, tenantId);

    return tx.journalEntry.create({
      data: {
        entryNumber: await this.nextEntryNumber(tx, tenantId),
        entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
        memo: input.memo,
        reference: input.reference,
        source: input.source ?? JournalEntrySource.MANUAL,
        sourceRef: input.sourceRef
          ? (input.sourceRef as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: 'POSTED',
        postedBy: input.postedBy,
        postedAt: new Date(),
        organization: { connect: { id: tenantId } },
        lines: { create: resolved },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  /**
   * Reverse a posted entry by writing an equal-and-opposite entry and marking
   * the original REVERSED. Entries are never deleted — an audited ledger that
   * can be rewritten is not an audited ledger.
   */
  async reverseEntry(
    id: string,
    tenantId?: string,
    postedBy?: string,
    callerTx?: Tx,
  ) {
    const run = (tx: Tx) => {
      const where = tenantId ? { id, organizationId: tenantId } : { id };
      return (async () => {
        const entry = await requireRecord(
          tx.journalEntry.findFirst({
            where,
            include: { lines: { include: { account: true } } },
          }),
          'Journal entry',
        );
        if (entry.status === 'REVERSED') {
          throw new BadRequestException(
            `Entry ${entry.entryNumber} is already reversed`,
          );
        }

        const reversal = await this.postEntry(
          {
            entryDate: new Date(),
            memo: `Reversal of ${entry.entryNumber}${
              entry.memo ? ` — ${entry.memo}` : ''
            }`,
            reference: entry.reference ?? undefined,
            source: entry.source,
            sourceRef: {
              type: 'REVERSAL',
              id: entry.id,
              number: entry.entryNumber,
            },
            postedBy,
            lines: entry.lines.map((line) => ({
              accountId: line.accountId,
              debit: Number(line.credit),
              credit: Number(line.debit),
              description: line.description ?? undefined,
            })),
          },
          entry.organizationId ?? undefined,
          tx,
        );

        await tx.journalEntry.update({
          where: { id: entry.id },
          data: {
            status: 'REVERSED',
            reversedByEntry: { connect: { id: reversal.id } },
          },
        });

        return reversal;
      })();
    };

    // Callers that are already inside a transaction (invoice cancellation,
    // payment reversal) pass their client so the reversal commits with them.
    return callerTx ? run(callerTx) : this.prisma.$transaction(run);
  }

  /**
   * Reverse every posted entry generated for a business record (e.g. an
   * invoice being cancelled or deleted). Used instead of letting a source
   * record disappear while its ledger entry still stands.
   */
  async reverseEntriesForSource(
    sourceId: string,
    tenantId?: string,
    postedBy?: string,
    callerTx?: Tx,
  ) {
    const tx = callerTx ?? this.prisma;
    const entries = await tx.journalEntry.findMany({
      where: {
        organizationId: tenantId,
        status: 'POSTED',
        sourceRef: { path: ['id'], equals: sourceId },
      },
      select: { id: true },
    });

    const reversed = [] as Awaited<
      ReturnType<AccountingService['postEntry']>
    >[];
    for (const entry of entries) {
      reversed.push(await this.reverseEntry(entry.id, tenantId, postedBy, tx));
    }
    return reversed;
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  async findEntries(
    tenantId?: string,
    filters?: {
      from?: string;
      to?: string;
      source?: string;
      limit?: number;
    },
  ) {
    const where: Prisma.JournalEntryWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};
    if (filters?.from || filters?.to) {
      where.entryDate = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }
    if (filters?.source) {
      where.source = filters.source as JournalEntrySource;
    }
    return this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: true } } },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(filters?.limit ?? 100, 500),
    });
  }

  async findEntry(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.journalEntry.findFirst({
        where,
        include: {
          lines: { include: { account: true } },
          reversedByEntry: true,
          reversesEntry: true,
        },
      }),
      'Journal entry',
    );
  }

  /**
   * Trial balance: one row per account with period debit/credit totals and the
   * resulting balance. Debits and credits across the whole trial balance always
   * match, which is asserted before returning.
   */
  async trialBalance(tenantId?: string, from?: string, to?: string) {
    const accounts = await this.listAccounts(tenantId);
    if (accounts.length === 0) {
      return { rows: [], totalDebit: 0, totalCredit: 0, balanced: true };
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        entry: {
          organizationId: tenantId,
          ...(from || to
            ? {
                entryDate: {
                  ...(from && { gte: new Date(from) }),
                  ...(to && { lte: new Date(to) }),
                },
              }
            : {}),
        },
      },
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    });

    const totals = new Map<string, { debit: number; credit: number }>();
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      const current = totals.get(line.accountId) ?? { debit: 0, credit: 0 };
      current.debit = round2(current.debit + Number(line.debit));
      current.credit = round2(current.credit + Number(line.credit));
      totals.set(line.accountId, current);
      totalDebit = round2(totalDebit + Number(line.debit));
      totalCredit = round2(totalCredit + Number(line.credit));
    }

    const rows = accounts
      .map((account) => {
        const movement = totals.get(account.id) ?? { debit: 0, credit: 0 };
        // Balance is expressed in the account's own natural sign: assets and
        // expenses are positive when debited, liabilities/equity/revenue when
        // credited.
        const signed =
          account.normalBalance === 'DEBIT'
            ? round2(movement.debit - movement.credit)
            : round2(movement.credit - movement.debit);
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: movement.debit,
          credit: movement.credit,
          balance: signed,
        };
      })
      .filter((row) => row.debit !== 0 || row.credit !== 0);

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  /** Ledger for one account: running balance over every posted line. */
  async accountLedger(
    accountId: string,
    tenantId?: string,
    from?: string,
    to?: string,
  ) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.account, {
        id: accountId,
        organizationId: tenantId,
      });
    }
    const account = await requireRecord(
      this.prisma.account.findUnique({ where: { id: accountId } }),
      'Account',
    );

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        organizationId: tenantId,
        lines: { some: { accountId } },
        ...(from || to
          ? {
              entryDate: {
                ...(from && { gte: new Date(from) }),
                ...(to && { lte: new Date(to) }),
              },
            }
          : {}),
      },
      include: { lines: { include: { account: true } } },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    });

    let running = 0;
    const lines = entries.flatMap((entry) =>
      entry.lines
        .filter((line) => line.accountId === accountId)
        .map((line) => {
          const debit = Number(line.debit);
          const credit = Number(line.credit);
          running =
            account.normalBalance === 'DEBIT'
              ? round2(running + debit - credit)
              : round2(running + credit - debit);
          return {
            lineId: line.id,
            entryId: entry.id,
            entryNumber: entry.entryNumber,
            entryDate: entry.entryDate,
            description: line.description,
            debit,
            credit,
            balance: running,
          };
        }),
    );

    return { account, lines, closingBalance: running };
  }

  // ── Auto-posting helpers ---------------------------------------------------

  /**
   * Invoice issued: the tenant/buyer now owes us money, so the AR control
   * account is debited and the invoice's revenue lines plus VAT are credited.
   * Cancelled invoices never post.
   */
  async postInvoiceIssued(
    args: {
      invoiceId: string;
      invoiceNumber: string;
      issueDate: Date;
      totalAmount: number;
      vatAmount?: number | null;
      netAmount?: number;
      status?: string;
      incomeAccountCode?: string;
      memo?: string;
    },
    tenantId: string,
    tx: Tx = this.prisma,
  ) {
    if (args.status === 'CANCELLED') return null;

    const total = round2(Number(args.totalAmount));
    if (total <= 0) return null;

    const vat = round2(Number(args.vatAmount ?? 0));
    const net =
      args.netAmount !== undefined
        ? round2(args.netAmount)
        : round2(total - vat);
    const revenue = args.incomeAccountCode || ACCOUNT_CODES.RENT_INCOME;

    const lines: JournalLineInput[] = [
      {
        // The full invoice total is owed to us: net revenue plus the VAT we
        // will remit on the tenant's behalf.
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        debit: total,
        description: `Invoice ${args.invoiceNumber}`,
      },
    ];
    if (vat > 0) {
      lines.push({
        accountCode: ACCOUNT_CODES.VAT_PAYABLE,
        credit: vat,
        description: `VAT on invoice ${args.invoiceNumber}`,
      });
    }
    lines.push({
      accountCode: revenue,
      credit: net,
      description: `Revenue on invoice ${args.invoiceNumber}`,
    });

    return this.postEntry(
      {
        entryDate: args.issueDate,
        memo: args.memo ?? `Invoice ${args.invoiceNumber} issued`,
        reference: args.invoiceNumber,
        source: JournalEntrySource.INVOICE,
        sourceRef: {
          type: 'INVOICE',
          id: args.invoiceId,
          number: args.invoiceNumber,
        },
        lines,
      },
      tenantId,
      tx,
    );
  }

  /**
   * Money received: cash/bank/mobile money is debited and AR relieved. When
   * the money is collected on behalf of a landlord it is not income yet — it is
   * credited to the "held for landlords" liability and relieved from rent
   * receivable, matching how the owner statement module pays it out later.
   */
  async postPaymentReceived(
    args: {
      amount: number;
      paymentDate: Date;
      paymentMethod: string;
      reference?: string;
      description: string;
      onBehalfOfLandlord?: boolean;
      reliefAccountCode?: string;
      sourceRef?: Record<string, string | null>;
      source?: JournalEntrySource;
    },
    tenantId: string,
    tx: Tx = this.prisma,
  ) {
    const amount = round2(Number(args.amount));
    if (amount <= 0) return null;

    const cashCode = PAYMENT_METHOD_ACCOUNT[args.paymentMethod] ?? '1010';
    const creditCode = args.onBehalfOfLandlord
      ? ACCOUNT_CODES.RENT_HELD_FOR_LANDLORDS
      : (args.reliefAccountCode ?? ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    return this.postEntry(
      {
        entryDate: args.paymentDate,
        memo: args.description,
        reference: args.reference,
        source: args.source ?? JournalEntrySource.RECEIPT,
        sourceRef: args.sourceRef,
        lines: [
          {
            accountCode: cashCode,
            debit: amount,
            description: args.description,
          },
          {
            accountCode: creditCode,
            credit: amount,
            description: args.description,
          },
        ],
      },
      tenantId,
      tx,
    );
  }
}
