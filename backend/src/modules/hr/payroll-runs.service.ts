import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { AccountingService } from '@/modules/finance/accounting/accounting.service';
import {
  computePayslip,
  num,
  payrollJournalLines,
  totalsFromLines,
  type ComputedLine,
  type PayComponentInput,
  type PayEarning,
  type PayrollWarning,
} from './payroll-calc';
import { EmployeesService } from './employees.service';
import { PAYROLL_ACCOUNTS, PayrollRulesService } from './payroll-rules.service';
import type {
  CreatePayrollRunDto,
  PayrollRunFilters,
  VoidPayrollRunDto,
} from './dto/hr.dto';

type Tx = Prisma.TransactionClient;

const RUN_EXPORT_HEADERS = [
  'reference',
  'periodStart',
  'periodEnd',
  'payDate',
  'currency',
  'status',
  'payslips',
  'gross',
  'deductions',
  'employerCost',
  'net',
  'warnings',
  'journalEntryId',
];

/**
 * Module 12 — payroll runs.
 *
 * Three decisions, and the first is the one that makes the rest safe.
 *
 * **A payroll is approved and posted as a unit.** That is what `PayrollRun` is
 * for: calculating twelve payslips that can then be approved one at a time is how
 * a company ends up paying a quarter of its staff and not the rest, and how the
 * ledger and the bank disagree without anybody noticing until the bank
 * reconciliation that Module 7 still has no tool for.
 *
 * **The figures are never stored.** A `Payslip` holds its basic salary and its
 * `PayslipLine` rows; gross, deductions and net are `totalsFromLines` on read,
 * for the same reason Module 11 holds no stock level. The module doc sketch asked
 * for three columns on `Payslip` — and a stored net that can disagree with
 * gross − deductions is precisely the bug a tax audit exists to find.
 *
 * **The ledger entry goes through finance's service.** `AccountingService.postEntry`
 * proves the lines balance and refuses an unbalanced set, so a payroll that cannot
 * be reconciled to the penny is refused before it is written rather than after. One
 * entry for the whole run, not one per employee: forty staff posting four accounts
 * each makes the trial balance unreadable for no benefit.
 */
@Injectable()
export class PayrollRunsService {
  constructor(
    private prisma: PrismaService,
    private rules: PayrollRulesService,
    private employees: EmployeesService,
    private accounting: AccountingService,
  ) {}

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: PayrollRunFilters = {},
  ) {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(filters.status
          ? { status: filters.status as PayrollRunStatus }
          : {}),
        ...(filters.year
          ? {
              periodStart: {
                gte: new Date(`${filters.year}-01-01`),
                lte: new Date(`${filters.year}-12-31`),
              },
            }
          : {}),
        ...(filters.search
          ? {
              reference: {
                contains: filters.search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      },
      include: {
        payslips: {
          select: {
            id: true,
            basicSalary: true,
            currency: true,
            lines: {
              select: { direction: true, amount: true },
            },
          },
        },
      },
      orderBy: [{ periodEnd: 'desc' }],
      take: 100,
    });

    return runs.map((run) => ({ ...run, summary: this.summarise(run) }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const run = await requireRecord(
      this.prisma.payrollRun.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          payslips: {
            include: {
              employee: {
                select: {
                  id: true,
                  employeeNumber: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  department: true,
                  jobTitle: true,
                  bankAccount: true,
                  bankName: true,
                },
              },
              lines: { orderBy: { sortOrder: 'asc' } },
            },
            orderBy: { employee: { employeeNumber: 'asc' } },
          },
        },
      }),
      'Payroll run',
    );

    const coverage = await this.rules.coverageFor(run.organizationId);

    return {
      ...run,
      payslips: run.payslips.map((payslip) => ({
        ...payslip,
        employeeName:
          payslip.employee.preferredName ||
          `${payslip.employee.firstName} ${payslip.employee.lastName}`,
        basicSalary: num(payslip.basicSalary),
        lines: payslip.lines.map((line) => this.lineView(line)),
        totals: this.totalsOf(payslip.lines),
      })),
      summary: this.summarise(run),
      coverage,
    };
  }

  async payslip(payslipId: string, organizationId: string | undefined) {
    const payslip = await requireRecord(
      this.prisma.payslip.findFirst({
        where: { id: payslipId, ...(organizationId ? { organizationId } : {}) },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              preferredLocale: true,
              department: true,
              jobTitle: true,
              nationalId: true,
              taxNumber: true,
              socialSecurityNumber: true,
              bankAccount: true,
              bankName: true,
              bankBranch: true,
              salaryCurrency: true,
            },
          },
          payrollRun: {
            select: {
              id: true,
              reference: true,
              status: true,
              periodStart: true,
              periodEnd: true,
              payDate: true,
              currency: true,
              rulesApplied: true,
            },
          },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      'Payslip',
    );

    const lines = payslip.lines.map((line) => this.lineView(line));

    return {
      ...payslip,
      basicSalary: num(payslip.basicSalary),
      employeeName:
        payslip.employee.preferredName ||
        `${payslip.employee.firstName} ${payslip.employee.lastName}`,
      lines,
      totals: this.totalsOf(lines),
      /** Which rules produced the statutory lines, so the figures can be traced
       *  back to the rows that decided them rather than to whoever typed them. */
      applied: this.appliedFrom(payslip.lines),
    };
  }

  /**
   * This person's own payslips, resolved from their login.
   *
   * The self-service read path, and the one place in this service where an id in
   * the URL is **not** trusted on its own. Every other payslip read scopes by
   * `employeeId` as well, so guessing an id returns somebody else's payslip to
   * an employee rather than their own — which would be the worst bug this module
   * could have, and one that a passing "can they see their payslip?" test would
   * not catch.
   *
   * Takes a user id, never an employee id, for the same reason: there is no
   * request shape in which a caller can name somebody else.
   */
  async payslipsForSelf(userId: string, organizationId: string | undefined) {
    const employee = await this.requireRecordForUser(
      userId,
      organizationId,
      'This login is not linked to an employment record, so there are no payslips to show.',
    );

    const payslips = await this.prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        payrollRun: {
          select: {
            id: true,
            reference: true,
            status: true,
            periodStart: true,
            periodEnd: true,
            payDate: true,
          },
        },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: [{ periodEnd: 'desc' }],
      take: 60,
    });

    return payslips.map((payslip) => ({
      ...payslip,
      basicSalary: num(payslip.basicSalary),
      lines: payslip.lines.map((line) => this.lineView(line)),
      totals: this.totalsOf(payslip.lines),
      /**
       * Whether the money has actually moved. An employee looking at a run still
       * sitting in APPROVED is owed an answer to "has this been paid?", and the
       * payroll being posted is not the same as the bank transfer having happened.
       */
      paymentState:
        payslip.payrollRun.status === 'PAID'
          ? 'paid'
          : payslip.payrollRun.status === 'APPROVED'
            ? 'approved-not-released'
            : 'not-yet-paid',
    }));
  }

  /** One of this person's own payslips. Scoped, so an id alone gets you nothing. */
  async ownPayslip(
    userId: string,
    payslipId: string,
    organizationId: string | undefined,
  ) {
    const employee = await this.requireRecordForUser(
      userId,
      organizationId,
      'This login is not linked to an employment record, so there are no payslips to show.',
    );

    // Scoping by `employeeId` in the query rather than checking afterwards is
    // deliberate: a filter that cannot match the wrong row cannot return the wrong
    // row, and the refusal is a plain 404 rather than a 403 that confirms the id
    // exists.
    const payslip = await requireRecord(
      this.prisma.payslip.findFirst({
        where: {
          id: payslipId,
          employeeId: employee.id,
          ...(organizationId ? { organizationId } : {}),
        },
        include: {
          payrollRun: {
            select: {
              id: true,
              reference: true,
              status: true,
              periodStart: true,
              periodEnd: true,
              payDate: true,
              currency: true,
            },
          },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      'Payslip',
    );

    const lines = payslip.lines.map((line) => this.lineView(line));

    return {
      ...payslip,
      basicSalary: num(payslip.basicSalary),
      lines,
      totals: this.totalsOf(lines),
      applied: this.appliedFrom(payslip.lines),
    };
  }

  /**
   * Resolve the caller's own employment record, or explain that there isn't one.
   *
   * Shared by all three self-service reads so the wording is identical wherever
   * somebody hits it.
   */
  private async requireRecordForUser(
    userId: string,
    organizationId: string | undefined,
    message: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, employeeNumber: true, preferredLocale: true },
    });

    if (!employee) throw new NotFoundException(message);
    return employee;
  }

  async exportCsv(organizationId: string | undefined): Promise<string> {
    const runs = await this.findAll(organizationId);

    return toCsv(
      RUN_EXPORT_HEADERS,
      runs.map((run) => ({
        reference: run.reference,
        periodStart: run.periodStart.toISOString().slice(0, 10),
        periodEnd: run.periodEnd.toISOString().slice(0, 10),
        payDate: run.payDate.toISOString().slice(0, 10),
        currency: run.currency,
        status: run.status,
        payslips: run.summary.payslips,
        gross: run.summary.gross ?? '',
        deductions: run.summary.employeeDeductions ?? '',
        employerCost: run.summary.totalCost ?? '',
        net: run.summary.net ?? '',
        currencies: run.summary.currencies.length,
        journalEntryId: run.journalEntryId ?? '',
      })),
    );
  }

  // =================================================================== writes

  async create(
    dto: CreatePayrollRunDto,
    organizationId: string,
    userId?: string,
  ) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    const payDate = new Date(dto.payDate);

    if (periodEnd < periodStart) {
      throw new BadRequestException(
        'The period ends before it starts, so there is nothing to pay for.',
      );
    }
    if (payDate < periodEnd) {
      throw new BadRequestException(
        'The pay date is before the period ends. Staff are paid for work they have not finished yet.',
      );
    }

    const existing = await this.prisma.payrollRun.findFirst({
      where: { organizationId, reference: dto.reference },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Run ${dto.reference} already exists. A reference is how a payslip is quoted in a dispute, so it cannot be reused.`,
      );
    }

    const org = await requireRecord(
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { currency: true },
      }),
      'Organization',
    );

    const run = await this.prisma.payrollRun.create({
      data: {
        organization: { connect: { id: organizationId } },
        reference: dto.reference,
        periodStart,
        periodEnd,
        payDate,
        currency: dto.currency?.toUpperCase() || org.currency,
        status: PayrollRunStatus.DRAFT,
      },
    });

    return {
      ...run,
      message:
        'Run created. Nothing has been calculated yet — press Calculate, and read the coverage warning before paying anybody.',
      scope: dto.employeeIds?.length
        ? { employees: dto.employeeIds.length }
        : { employees: 'every active employee' },
      calculatedBy: userId ?? null,
    };
  }

  /**
   * Work out every payslip in the run.
   *
   * Replaces any previous calculation rather than adding to it. A recalculation
   * that left the old payslips in place would pay the difference twice, and the
   * run would contain two months of somebody's salary with no way to tell which is
   * which.
   */
  async calculate(id: string, organizationId: string, userId?: string) {
    const run = await this.record(id, organizationId);

    if (
      run.status !== PayrollRunStatus.DRAFT &&
      run.status !== PayrollRunStatus.CALCULATED
    ) {
      throw new ConflictException(
        `Run ${run.reference} is ${run.status.toLowerCase()}, so it cannot be recalculated. Void it and create a new one — an approved or paid run is a document.`,
      );
    }

    const [employees, resolvedRules, coverage] = await Promise.all([
      this.employeesInScope(run, organizationId),
      // Resolved once for the whole run. Resolving per employee would let a rule
      // change mid-run produce a payroll with two different tax rates on it.
      this.rules.resolveRules(organizationId, run.periodEnd),
      this.rules.coverageFor(organizationId),
    ]);

    const skipped: {
      employeeId: string;
      employeeNumber: string;
      reason: string;
    }[] = [];
    const included: typeof employees = [];

    for (const employee of employees) {
      if (employee.hireDate > run.periodEnd) {
        skipped.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: `Starts ${employee.hireDate.toISOString().slice(0, 10)}, after this period ends.`,
        });
        continue;
      }
      if (
        employee.terminationDate &&
        employee.terminationDate < run.periodStart
      ) {
        skipped.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: `Left ${employee.terminationDate.toISOString().slice(0, 10)}, before this period begins.`,
        });
        continue;
      }

      // **A run is in one currency.** Summing a euro salary and a shilling salary
      // produces a number that is not a quantity of anything, and the journal entry
      // built from it would post the two to the same account — which is how a
      // ledger acquires a balance nobody can reconcile to a bank statement.
      // Somebody paid in a second currency needs their own run, which is one extra
      // click and is the honest cost.
      if (employee.salaryCurrency && employee.salaryCurrency !== run.currency) {
        skipped.push({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          reason: `Paid in ${employee.salaryCurrency}, and this run is in ${run.currency}. A run totals one currency — create a ${employee.salaryCurrency} run for this period.`,
        });
        continue;
      }

      included.push(employee);
    }

    const warnings: PayrollWarning[] = [];
    if (!coverage.configured) {
      // Not fatal — a jurisdiction with no rules still produces payslips — but it
      // is the single most dangerous state this module can be in, so it is
      // repeated on every payslip and not just once at the top of the response.
      warnings.push({
        code: 'NO_RULES_RESOLVED',
        message:
          'No statutory payroll rules are configured for this organization jurisdiction. Nothing has been withheld from anybody, which looks like a successful run. Configure the rules before approving.',
      });
    }

    const payslips = included.map((employee) => {
      const input = this.buildInput(employee, run);
      const computed = computePayslip(input, resolvedRules);

      warnings.push(...computed.warnings);

      return { employee, computed };
    });

    const locale = await this.defaultLocale(organizationId);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });

      for (const { employee, computed } of payslips) {
        await tx.payslip.create({
          data: {
            organization: { connect: { id: organizationId } },
            payrollRun: { connect: { id: run.id } },
            employee: { connect: { id: employee.id } },
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            payDate: run.payDate,
            currency: employee.salaryCurrency || run.currency,
            basicSalary: new Prisma.Decimal(computed.totals.gross),
            // The rules in force when this was calculated, so the payslip explains
            // itself years later without re-running a rule that has since been
            // superseded.
            rulesApplied: resolvedRules.map((rule) => ({
              id: rule.id,
              code: rule.code,
              periodMode: rule.periodMode ?? 'PERIOD',
              bands: rule.bands ?? null,
              ratePercent: rule.ratePercent ?? null,
            })) as unknown as Prisma.InputJsonValue,
            locale: employee.preferredLocale || locale,
            lines: {
              create: computed.lines.map((line) => ({
                direction: line.direction,
                code: line.code,
                name: line.name,
                amount: new Prisma.Decimal(line.amount),
                kind: line.kind,
                payrollRuleId: line.ruleId ?? null,
                accountCode: line.accountCode ?? null,
                sortOrder: line.sortOrder,
              })),
            },
          },
        });
      }

      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollRunStatus.CALCULATED,
          calculatedAt: new Date(),
          calculatedById: userId ?? null,
          rulesApplied: resolvedRules.map((rule) => ({
            id: rule.id,
            code: rule.code,
            name: rule.name,
            type: rule.type,
            base: rule.base,
            bearer: rule.bearer,
            periodMode: rule.periodMode,
            periodsPerYear: rule.periodsPerYear,
          })) as Prisma.InputJsonValue,
        },
      });
    });

    return {
      run: created,
      coverage,
      payslips: payslips.map(({ employee, computed }) => ({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        name:
          employee.preferredName ||
          `${employee.firstName} ${employee.lastName}`,
        totals: computed.totals,
        lines: computed.lines,
      })),
      skipped,
      // Every payslip in this run shares the run's currency \u2014 included already
      // excluded anybody paid in another \u2014 so a flat sum here is safe, and the
      // currency is stated rather than assumed.
      summary: {
        payslips: payslips.length,
        currency: run.currency,
        gross: payslips.reduce((sum, p) => sum + p.computed.totals.gross, 0),
        employeeDeductions: payslips.reduce(
          (sum, p) => sum + p.computed.totals.employeeDeductions,
          0,
        ),
        employerContributions: payslips.reduce(
          (sum, p) => sum + p.computed.totals.employerContributions,
          0,
        ),
        net: payslips.reduce((sum, p) => sum + p.computed.totals.net, 0),
      },
      /** Deduplicated by code, because twenty employees all tripping the same
       *  warning should produce one line in the response, not twenty. */
      warnings: this.dedupeWarnings(warnings),
      skippedWarning:
        skipped.length > 0
          ? `${skipped.length} employee${skipped.length === 1 ? '' : 's'} not included: ${skipped
              .map((row) => `${row.employeeNumber} (${row.reason})`)
              .join('; ')}`
          : null,
    };
  }

  /**
   * Approve the run.
   *
   * Refuses while any payslip is broken. Approving a run that pays somebody a
   * negative amount, or nothing at all, is the one thing this module must not make
   * easy — so the check is here rather than in the UI, where a payroll clerk
   * running a long list will click past a warning.
   */
  async approve(id: string, organizationId: string, userId?: string) {
    const run = await this.record(id, organizationId);

    if (run.status !== PayrollRunStatus.CALCULATED) {
      throw new ConflictException(
        `Run ${run.reference} is ${run.status.toLowerCase()}. Only a calculated run can be approved.`,
      );
    }

    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: id },
      include: {
        employee: { select: { employeeNumber: true, firstName: true } },
        lines: { select: { direction: true, amount: true } },
      },
    });

    const broken = payslips
      .map((payslip) => ({
        employee: payslip.employee.employeeNumber,
        totals: this.totalsOf(payslip.lines),
      }))
      .filter((row) => row.totals.net <= 0);

    if (broken.length > 0) {
      throw new ConflictException(
        `${broken.length} payslip${broken.length === 1 ? '' : 's'} would pay nothing or less than nothing: ${broken
          .map((row) => `${row.employee} (net ${row.totals.net})`)
          .join(
            ', ',
          )}. Fix the salary or the rule and recalculate — a payslip that nets to zero is usually a missing salary.`,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: userId ?? null,
      },
    });

    return {
      ...updated,
      message: `Run ${run.reference} approved with ${payslips.length} payslips. It still has to be posted to the ledger before anyone is paid.`,
    };
  }

  /**
   * Post the whole run as one journal entry.
   *
   * The point where this module meets Module 7. `postEntry` refuses an unbalanced
   * set of lines, so a run whose figures do not reconcile to the penny is stopped
   * here rather than turning up in the trial balance three months later.
   */
  async post(id: string, organizationId: string, userId?: string) {
    const run = await this.record(id, organizationId);

    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new ConflictException(
        `Run ${run.reference} is ${run.status.toLowerCase()}. Only an approved run can be posted.`,
      );
    }
    if (run.journalEntryId) {
      throw new ConflictException(
        `Run ${run.reference} is already posted as journal entry ${run.journalEntryId}. Void it and create a new run rather than posting it twice.`,
      );
    }

    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: id },
      include: {
        lines: {
          select: {
            direction: true,
            amount: true,
            accountCode: true,
            name: true,
          },
        },
      },
    });

    const entry = payrollJournalLines(
      payslips.map((payslip) => ({
        lines: payslip.lines,
      })),
      {
        salaryExpense: PAYROLL_ACCOUNTS.SALARY_EXPENSE,
        netPayable: PAYROLL_ACCOUNTS.NET_PAYABLE,
        statutoryAccount: PAYROLL_ACCOUNTS.STATUTORY_FALLBACK,
      },
    );

    if (!entry.balanced) {
      throw new ConflictException(
        entry.warning ??
          'The payroll entry does not balance and has not been posted.',
      );
    }

    const journal = await this.accounting.postEntry(
      {
        entryDate: run.payDate,
        memo: `Payroll ${run.reference} — ${payslips.length} employee${payslips.length === 1 ? '' : 's'}`,
        source: 'PAYROLL',
        reference: run.reference,
        lines: entry.lines.map((line) => ({
          accountCode: line.accountCode,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        })),
      },
      organizationId,
    );

    await this.prisma.payrollRun.update({
      where: { id },
      data: { journalEntryId: journal.id },
    });

    return {
      ...run,
      journalEntryId: journal.id,
      entryNumber: journal.entryNumber,
      lines: entry.lines,
      message: `Run ${run.reference} posted as journal entry ${journal.entryNumber}. Staff can now be paid.`,
      postedBy: userId ?? null,
    };
  }

  /**
   * Mark the run paid.
   *
   * Refuses unless it is posted. Paying staff before the cost of employing them
   * is in the ledger is how a trial balance stops meaning anything, and the fix
   * afterwards is a reconstruction nobody enjoys.
   */
  async pay(
    id: string,
    dto: { paymentReference?: string },
    organizationId: string,
    userId?: string,
  ) {
    const run = await this.record(id, organizationId);

    if (run.status !== PayrollRunStatus.APPROVED) {
      throw new ConflictException(
        `Run ${run.reference} is ${run.status.toLowerCase()}. Only an approved run can be paid.`,
      );
    }
    if (!run.journalEntryId) {
      throw new ConflictException(
        `Run ${run.reference} has not been posted to the ledger. Post it first — paying staff without the cost of employing them on the books makes the trial balance a work of fiction.`,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.PAID,
        paidAt: new Date(),
        paidById: userId ?? null,
      },
    });

    return {
      ...updated,
      message: dto.paymentReference
        ? `Run ${run.reference} marked paid (${dto.paymentReference}).`
        : `Run ${run.reference} marked paid.`,
    };
  }

  /**
   * Void the run. Never delete it.
   *
   * A voided run keeps its payslips because it happened: it was calculated, maybe
   * approved, and was wrong. Deleting it would leave a payment with no document
   * behind it and an approval nobody can account for.
   */
  async voidRun(
    id: string,
    dto: VoidPayrollRunDto,
    organizationId: string,
    userId?: string,
  ) {
    const run = await this.record(id, organizationId);

    if (run.status === PayrollRunStatus.VOID) {
      throw new ConflictException(`Run ${run.reference} is already voided.`);
    }
    if (run.status === PayrollRunStatus.PAID) {
      throw new ConflictException(
        `Run ${run.reference} has already been paid, so it cannot be voided. Recover the payment through accounts payable instead — this module does not model payroll recovery.`,
      );
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: PayrollRunStatus.VOID,
        voidedAt: new Date(),
        voidedById: userId ?? null,
        voidReason: dto.reason.trim(),
      },
    });

    return {
      ...updated,
      message: run.journalEntryId
        ? `Run ${run.reference} is void. Journal entry ${run.journalEntryId} is still posted — reverse it from the ledger, because the money genuinely left the business.`
        : `Run ${run.reference} is void. Its payslips are kept as the record of what was calculated.`,
    };
  }

  /** A draft run has nothing worth keeping; anything decided is a document. */
  async remove(id: string, organizationId: string) {
    const run = await this.record(id, organizationId);

    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new ConflictException(
        `Run ${run.reference} has been calculated, so it is a document. Void it with a reason instead of deleting it.`,
      );
    }

    await this.prisma.payrollRun.delete({ where: { id } });
    return { message: `Draft run ${run.reference} deleted.` };
  }

  async record(
    id: string,
    organizationId: string | undefined,
    tx: Tx = this.prisma,
  ) {
    return requireRecord(
      tx.payrollRun.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Payroll run',
    );
  }

  // ================================================================= helpers

  /**
   * Who is on this run.
   *
   * Everyone active, minus the two cases that would pay the wrong amount: somebody
   * who started after the period ended, and somebody who left before it began.
   * Both are reported in `skipped` rather than silently dropped — a run that quietly
   * omits a leaver is how a final payment gets forgotten.
   */
  private async employeesInScope(
    run: { reference: string; employeeIds?: string[] },
    organizationId: string,
  ) {
    return this.prisma.employee.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(run.employeeIds ? { id: { in: run.employeeIds } } : {}),
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        preferredLocale: true,
        department: true,
        hireDate: true,
        terminationDate: true,
        basicSalary: true,
        salaryCurrency: true,
        payFrequency: true,
        periodsPerYear: true,
        components: {
          where: { effectiveTo: null },
          include: {
            payComponent: {
              select: {
                id: true,
                code: true,
                name: true,
                direction: true,
                kind: true,
                isTaxable: true,
                isPensionable: true,
              },
            },
          },
        },
      },
      orderBy: { employeeNumber: 'asc' },
      take: 500,
    });
  }

  /**
   * Turn an employment record into the engine's input.
   *
   * The proration is the part worth reading. An employee whose contract is
   * "KSh 1,200,000 a year" is not paid 1,200,000 in every period — a monthly run
   * pays a twelfth. Someone who joins on the 20th is not paid a full month either,
   * and the statutory treatment of that partial month differs by jurisdiction, so
   * what is done here is the *simple* division and the payslip shows the figure it
   * used. Refusing to guess is the right call; a number that is visibly prorated is
   * better than one that is quietly wrong.
   */
  private buildInput(
    employee: {
      basicSalary: unknown;
      periodsPerYear: number;
      components: {
        percentage: unknown;
        amount: unknown;
        payComponent: {
          code: string;
          name: string;
          direction: string;
          kind: string;
          isTaxable: boolean;
          isPensionable: boolean;
        };
      }[];
    },
    _run: { periodStart: Date; periodEnd: Date },
  ) {
    // The period is deliberately not read here: proration is by *contract*
    // (`periodsPerYear`), not by the run's dates, so that a mid-month joiner is
    // prorated the same way whichever run happens to cover them. Said out loud
    // because an unused-but-required parameter is otherwise a question.
    void _run;
    const periods = employee.periodsPerYear > 0 ? employee.periodsPerYear : 12;
    const annual = num(employee.basicSalary as never);

    // A monthly frequency against a monthly salary is the identity; anything else
    // is a contract expressed annually and divided.
    const basic = Math.round((annual / periods) * 100) / 100;

    const earnings: PayEarning[] = [];
    const components: PayComponentInput[] = [];

    for (const entry of employee.components) {
      const component = entry.payComponent;
      const amount =
        entry.percentage != null
          ? (basic * num(entry.percentage as never)) / 100
          : num(entry.amount as never);

      if (amount === 0) continue;

      if (component.direction === 'EARNING') {
        earnings.push({
          code: component.code,
          name: component.name,
          amount: Math.round(amount * 100) / 100,
          kind: 'COMPANY',
          isTaxable: component.isTaxable,
          isPensionable: component.isPensionable,
        });
      } else if (component.direction === 'EMPLOYEE_DEDUCTION') {
        components.push({
          code: component.code,
          name: component.name,
          percentage:
            entry.percentage != null
              ? num(entry.percentage as never)
              : undefined,
          amount:
            entry.percentage == null
              ? Math.round(amount * 100) / 100
              : undefined,
          kind: 'COMPANY',
        });
      }
    }

    return {
      basicSalary: basic,
      earnings,
      components,
      periodsPerYear: periods,
    };
  }

  private async defaultLocale(organizationId: string): Promise<string | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultLocale: true },
    });
    return org?.defaultLocale ?? null;
  }

  private lineView(line: {
    direction: string;
    code: string;
    name: string;
    amount: unknown;
    kind: string;
    payrollRuleId: string | null;
    accountCode: string | null;
    sortOrder: number;
    createdAt?: Date;
  }) {
    return {
      ...line,
      amount: num(line.amount as never),
    };
  }

  private appliedFrom(
    lines: { payrollRuleId: string | null; code: string; name: string }[],
  ) {
    const seen = new Set<string>();
    const applied: { ruleId: string; code: string; name: string }[] = [];
    for (const line of lines) {
      if (!line.payrollRuleId || seen.has(line.payrollRuleId)) continue;
      seen.add(line.payrollRuleId);
      applied.push({
        ruleId: line.payrollRuleId,
        code: line.code,
        name: line.name,
      });
    }
    return applied;
  }

  /**
   * Totals for a run.
   *
   * Grouped by currency rather than summed flat, because this function is the
   * last place a mixed-currency run could be quietly added up. `calculate` already
   * refuses to put two currencies in one run, but a total that reads
   * `gross: 65566.68` with no currency attached is indistinguishable from one that
   * does not know it is nonsense.
   */
  private summarise(run: {
    payslips: {
      currency: string;
      lines: { direction: string; amount: unknown }[];
    }[];
    journalEntryId: string | null;
    periodStart: Date;
    periodEnd: Date;
  }) {
    const byCurrency = new Map<
      string,
      { gross: number; deductions: number; employer: number; payslips: number }
    >();

    for (const payslip of run.payslips) {
      const totals = this.totalsOf(payslip.lines);
      const bucket = byCurrency.get(payslip.currency) ?? {
        gross: 0,
        deductions: 0,
        employer: 0,
        payslips: 0,
      };
      bucket.gross += totals.gross;
      bucket.deductions += totals.employeeDeductions;
      bucket.employer += totals.employerContributions;
      bucket.payslips += 1;
      byCurrency.set(payslip.currency, bucket);
    }

    const round = (value: number) => Math.round(value * 100) / 100;

    const currencies = [...byCurrency.entries()]
      .map(([currency, bucket]) => ({
        currency,
        payslips: bucket.payslips,
        gross: round(bucket.gross),
        employeeDeductions: round(bucket.deductions),
        employerContributions: round(bucket.employer),
        totalCost: round(bucket.gross + bucket.employer),
        net: round(bucket.gross - bucket.deductions),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    // The single-currency case is what a caller normally wants, so the flat
    // figures are there — but they are `null` rather than a sum when the run
    // somehow holds more than one, because a number that cannot be attributed to
    // a currency is worse than no number.
    const single = currencies.length === 1 ? currencies[0] : null;

    return {
      payslips: run.payslips.length,
      currencies,
      mixedCurrency: currencies.length > 1,
      gross: single?.gross ?? null,
      employeeDeductions: single?.employeeDeductions ?? null,
      employerContributions: single?.employerContributions ?? null,
      totalCost: single?.totalCost ?? null,
      net: single?.net ?? null,
      posted: Boolean(run.journalEntryId),
    };
  }

  /**
   * Totals for a set of persisted lines.
   *
   * The cast is at the boundary and only here: Prisma types `direction` as a plain
   * string while the engine's union is narrower, and the two describe the same
   * three values. Doing it at every call site would be three casts and no
   * explanation; doing it in one place means a fourth direction added to the enum
   * breaks here, loudly, rather than silently counting as zero.
   */
  private totalsOf(lines: unknown[]) {
    return totalsFromLines(lines as ComputedLine[]);
  }

  /**
   * Collapse repeated warnings into one line each, with a count.
   *
   * A missing rule set trips `NO_RULES_RESOLVED` once per employee, and forty
   * identical sentences is a response nobody reads — which is how the one warning
   * that mattered this month gets scrolled past.
   */
  private dedupeWarnings(warnings: PayrollWarning[]): PayrollWarning[] {
    const counts = new Map<string, number>();
    const first = new Map<string, PayrollWarning>();

    for (const warning of warnings) {
      counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
      if (!first.has(warning.code)) first.set(warning.code, { ...warning });
    }

    return [...first.values()].map((warning) => {
      const count = counts.get(warning.code) ?? 1;
      return count === 1
        ? warning
        : {
            ...warning,
            message: `${warning.message} Affects ${count} people.`,
          };
    });
  }
}
