/**
 * Module 12 — payroll arithmetic.
 *
 * Deliberately pure and country-agnostic, in exactly the way
 * `finance/tax/tax-calculator.ts` is: **nothing here knows what PAYE is, what
 * NSSF is, or what 1.5% is.** The caller hands over the rules that apply to this
 * organization in this jurisdiction, and this decides the money. That separation
 * is the whole reason a Nairobi cleaner and a Berlin engineer can be paid by the
 * same code — and the reason a new country is a data change.
 *
 * All arithmetic is in integer **cents**, matching the tax engine. Floating-point
 * payroll is the classic source of a payslip that is one cent out of the trial
 * balance and cannot be reconciled against a remittance advice, and unlike an
 * invoice a payslip is a document an employee can dispute.
 *
 * ## The three rules that are easy to get wrong
 *
 * **1. Annualisation, not a monthly band walk.** Almost every country computes
 * income tax on annual income and divides by the number of periods, because the
 * bands themselves are set annually. Walking the same bands once per month on
 * monthly pay gives a *different* answer, sometimes by a factor of three, because
 * the year's band allowance is spent by January and every month after that is
 * taxed at the top rate. Hence `periodMode`.
 *
 * **2. Floors and caps apply to the BASE, before the rate.** A social fund with a
 * minimum contribution is really a minimum contributory wage: below the floor
 * everyone pays the same minimum, which only comes out right if the floor is
 * applied to the base and then rated. Clamping the *result* instead produces a
 * figure that is close to the right shape and wrong in value.
 *
 * **3. Employer cost never touches net pay.** An employer contribution is a cost
 * of employing somebody, and it appears on the payslip because an employee is
 * entitled to see it — not because it reduces what they are paid. Getting this
 * backwards is the single most common way a hand-built payroll is wrong.
 */

/** Money as a percentage, not a fraction: 1.5 means 1.5%. */
export type Percent = number;

/**
 * Read a number out of whatever the caller has.
 *
 * Accepts the three things this module actually receives for money: a plain
 * number from a DTO, a `Prisma.Decimal` straight off a row, and a string from
 * JSON. Accepting only `number` would mean every service either casts (and loses
 * the Decimal's precision) or sprinklers `Number()` around the codebase.
 */
export function num(
  value: number | string | { toString(): string } | null | undefined,
): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Mirrored as string unions rather than imported from Prisma, so this file stays
 *  testable without the generated client — same choice `tax-calculator.ts` makes. */
export type RuleType = 'PROGRESSIVE_BANDS' | 'PERCENTAGE' | 'FIXED';
export type CalculationBase = 'GROSS' | 'BASIC' | 'TAXABLE';
export type Bearer = 'EMPLOYEE' | 'EMPLOYER' | 'BOTH';
export type PeriodMode = 'PERIOD' | 'ANNUALISED';
export type DeductionKind = 'STATUTORY' | 'COMPANY' | 'OTHER';
export type LineDirection =
  | 'EARNING'
  | 'EMPLOYEE_DEDUCTION'
  | 'EMPLOYER_CONTRIBUTION';

export function toCents(
  value: number | string | { toString(): string } | null | undefined,
): number {
  const parsed =
    value === null || value === undefined || value === ''
      ? 0
      : typeof value === 'number'
        ? value
        : Number(value.toString());
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** One rung of a progressive ladder. `upTo: null` means "and everything above". */
export interface PayBand {
  /** Cumulative upper bound of the band. `null` on the last band. */
  upTo: number | null;
  /** Percentage applied to the slice that falls inside this band. */
  ratePercent?: Percent;
  /** For a banded FIXED rule, the amount charged on this slice. */
  amount?: number;
}

/**
 * An earning on a payslip.
 *
 * `isTaxable` and `isPensionable` are separate because in most jurisdictions they
 * genuinely differ — a housing benefit or a vehicle allowance is commonly taxable
 * but not contributable, or contributable but not taxed. One boolean cannot say
 * that, and guessing it wrong is a statutory error on a payslip.
 */
export interface PayEarning {
  code: string;
  name: string;
  amount: number;
  kind?: DeductionKind;
  /** Part of taxable pay. */
  isTaxable?: boolean;
  /** Part of contributable (pensionable / social-insurance) pay. */
  isPensionable?: boolean;
  accountCode?: string;
}

/** A standing employee arrangement — "this person gives 6% to the pension". */
export interface PayComponentInput {
  code: string;
  name: string;
  /** Percent of the base, or the amount for a fixed one. */
  percentage?: Percent;
  amount?: number;
  kind?: DeductionKind;
  accountCode?: string;
}

/** One resolved rule, as handed over by `PayrollRulesService`. */
export interface PayrollRuleInput {
  id: string;
  code: string;
  name: string;
  type: RuleType;
  base: CalculationBase;
  bearer: Bearer;
  ratePercent?: Percent | null;
  /** The flat amount a `FIXED` rule charges. Null on every other type. */
  amount?: number | null;
  /** Statutory floor on the base, applied before the rate. */
  minimumBaseAmount?: number | null;
  /** Statutory cap on the base, applied before the rate. */
  maximumBaseAmount?: number | null;
  /** Below this base, nothing is charged at all. */
  exemptBelowBaseAmount?: number | null;
  bands?: PayBand[] | null;
  periodMode?: PeriodMode;
  /** How many periods a year. 12 monthly, 26 weekly, 1 annual. */
  periodsPerYear?: number | null;
  kind?: DeductionKind;
  ledgerAccountCode?: string | null;
  sortOrder?: number;
}

export interface PayrollInput {
  /** The contractual base for the period. */
  basicSalary: number;
  /** Standing allowances and the like, beyond the basic. */
  earnings?: PayEarning[];
  /** The employee's own standing arrangements (pension, union, garnish). */
  components?: PayComponentInput[];
  /** Periods a year for this employee. Falls back to each rule's own value. */
  periodsPerYear?: number;
  locale?: string | null;
}

export interface ComputedLine {
  direction: LineDirection;
  code: string;
  name: string;
  amount: number;
  kind: DeductionKind;
  ruleId?: string;
  accountCode?: string;
  sortOrder: number;
  /**
   * Populated for a rule-derived line: what the engine did and why, so a payslip
   * can explain a figure to the employee asking about it and so a wrong number
   * can be traced to the rule that produced it rather than guessed at.
   */
  explanation?: string;
}

export interface PayrollTotals {
  /** Basic + every earning. */
  gross: number;
  /** What was actually withheld from the employee. */
  employeeDeductions: number;
  /** The employer's own statutory and voluntary cost. Not part of net. */
  employerContributions: number;
  /** `gross − employeeDeductions`. The only definition used anywhere. */
  net: number;
  /** Every rule that contributed, with the figure it produced. */
  applied: {
    code: string;
    name: string;
    ruleId: string;
    amount: number;
    bearer: Bearer;
  }[];
}

export interface ComputedPayslip {
  lines: ComputedLine[];
  totals: PayrollTotals;
  /**
   * Things that are wrong or worth a human's attention. Never throws — a payroll
   * run must not be blocked by one odd employee, it must *show* the odd
   * employee. An empty array is the only genuinely fine outcome.
   */
  warnings: PayrollWarning[];
}

export interface PayrollWarning {
  code:
    | 'NET_NEGATIVE'
    | 'NO_RULES_RESOLVED'
    | 'ZERO_GROSS'
    | 'BASE_ABOVE_CAP'
    | 'BASE_BELOW_FLOOR'
    | 'MISSING_PERIODS';
  message: string;
}

// ────────────────────────────────────────────────────────────── base figures

export interface BaseFigures {
  gross: number;
  basic: number;
  /** Gross less the non-taxable earnings. Cents. */
  taxable: number;
  /** Gross less the non-contributable earnings. Cents. */
  pensionable: number;
}

/**
 * Work out the four figures a rule's `base` can name.
 *
 * A rule cannot compute its own base, because the answer depends on what the
 * employee is actually being paid this period — which is exactly the input a rule
 * must not see.
 */
export function baseFigures(input: PayrollInput): BaseFigures {
  const basicCents = toCents(input.basicSalary);
  const earnings = input.earnings ?? [];

  let gross = basicCents;
  let taxable = 0;
  let pensionable = 0;

  for (const earning of earnings) {
    // A caller that described the basic as an earning has already had it
    // counted above. Adding it twice is how gross ends up exactly double, and
    // every percentage rule on the payslip then doubles with it.
    if (earning.code === 'BASIC') continue;

    const cents = toCents(earning.amount);
    gross += cents;
    // Default true: an earning that does not declare itself non-taxable is
    // taxable. The reverse default would quietly under-tax.
    if (earning.isTaxable !== false) taxable += cents;
    if (earning.isPensionable !== false) pensionable += cents;
  }

  // The basic salary is part of gross. Adding it to the two derived figures is
  // safe because the loop above skipped it.
  taxable += basicCents;
  pensionable += basicCents;

  return { gross, basic: basicCents, taxable, pensionable };
}

/** The figure a rule's `base` names, in cents. */
export function resolveBase(
  base: CalculationBase,
  figures: BaseFigures,
): number {
  switch (base) {
    case 'BASIC':
      return figures.basic;
    case 'TAXABLE':
      return figures.taxable;
    case 'GROSS':
    default:
      return figures.gross;
  }
}

// ───────────────────────────────────────────────────────────────── the rules

/**
 * Clamp the base into its statutory window and say which walls it hit.
 *
 * The floor and the cap belong to the **base**, not the result. That is what
 * reproduces a minimum contribution (everyone below the floor pays the same
 * minimum, because everyone below the floor is rated on the floor) rather than
 * approximating it.
 */
export function clampBase(
  baseCents: number,
  rule: PayrollRuleInput,
): { base: number; floored: boolean; capped: boolean } {
  const floor = rule.minimumBaseAmount ? toCents(rule.minimumBaseAmount) : null;
  const cap = rule.maximumBaseAmount ? toCents(rule.maximumBaseAmount) : null;

  let value = baseCents;
  let floored = false;
  let capped = false;

  if (floor !== null && value < floor) {
    value = floor;
    floored = true;
  }
  if (cap !== null && value > cap) {
    value = cap;
    capped = true;
  }

  return { base: value, floored, capped };
}

/** Progressive ladder, applied marginally, in cents in and cents out. */
export function applyBands(baseCents: number, bands: PayBand[]): number {
  if (bands.length === 0 || baseCents <= 0) return 0;

  let remaining = baseCents;
  let lower = 0;
  let total = 0;

  for (const band of bands) {
    if (remaining <= 0) break;

    if (band.upTo === null) {
      // The overflow band. Everything still left is charged at this rate.
      if (band.ratePercent) {
        total += Math.round((remaining * band.ratePercent) / 100);
      } else if (band.amount) {
        // A banded fixed amount charges the whole slice once.
        total += toCents(band.amount);
      }
      remaining = 0;
      break;
    }

    const upper = toCents(band.upTo);
    const slice = Math.min(remaining, Math.max(0, upper - lower));
    if (slice > 0) {
      if (band.ratePercent) {
        total += Math.round((slice * band.ratePercent) / 100);
      } else if (band.amount) {
        total += toCents(band.amount);
      }
    }

    remaining -= slice;
    lower = upper;
  }

  return total;
}

export interface RuleResult {
  /** What the employee bears, in cents. */
  employeeCents: number;
  /** What the employer bears, in cents. Never reduces net. */
  employerCents: number;
  explanation: string;
}

/**
 * One rule, one figure.
 *
 * `ANNUALISED` scales the base up by `periodsPerYear`, runs the rule on that, and
 * divides the answer back down — which is the method the legislation describes,
 * and the reason `periodsPerYear` is on both the rule and the employee: a
 * weekly-paid employee under annual income tax is taxed on 52 weeks, and 52/12
 * is materially more than 12 months of the same annual total.
 *
 * A worked example of why this is not pedantry. With bands of 6,000 at 0%, 16,000
 * at 10%, 31,000 at 15%, 56,000 at 20% and 25% above that, somebody on 16,000 a
 * month:
 *
 * - annualised → 192,000 a year → 0 + 1,000 + 2,250 + 5,000 + 34,000 = 42,250
 *   → 3,520.83 a month
 * - monthly walk → the salary sits exactly at the top of the relief band, so the
 *   year's entire relief is spent in January and every later month is taxed at
 *   nothing: 1,000 for the year
 *
 * A factor of three and a half, from two methods that look like the same
 * arithmetic. The annualised answer is the correct one because that is how the
 * bands are written; the monthly walk is not "differently rounded", it is wrong.
 */
export function applyRule(
  rule: PayrollRuleInput,
  figures: BaseFigures,
  employeePeriodsPerYear?: number,
): RuleResult {
  const rawBase = resolveBase(rule.base, figures);
  const clamped = clampBase(rawBase, rule);

  const exemption = rule.exemptBelowBaseAmount
    ? toCents(rule.exemptBelowBaseAmount)
    : null;
  if (exemption !== null && rawBase < exemption) {
    return {
      employeeCents: 0,
      employerCents: 0,
      explanation: `Not charged: the base is below the exemption threshold of ${fromCents(
        exemption,
      )}.`,
    };
  }

  const declared = rule.periodsPerYear ?? null;
  const periods =
    employeePeriodsPerYear && employeePeriodsPerYear > 0
      ? employeePeriodsPerYear
      : declared && declared > 0
        ? declared
        : 12;

  let computedCents: number;
  let explanation: string;

  if (rule.periodMode === 'ANNUALISED') {
    const annualBase = clamped.base * periods;
    const annualResult = computeOnBase(rule, annualBase);
    // Divided here and rounded once. Twelve monthly figures will not sum to the
    // annual figure exactly, and that is accepted deliberately: each month's
    // payslip is the document that has to add up, and it is the document an
    // employee can dispute.
    computedCents = Math.round(annualResult / periods);
    explanation = `Annualised: ${fromCents(clamped.base)} × ${periods} periods, taxed at the annual bands, then divided by ${periods}.`;
  } else {
    computedCents = computeOnBase(rule, clamped.base);
    explanation = `${rule.type === 'PERCENTAGE' ? `${rule.ratePercent}% of` : 'Applied to'} the ${rule.base.toLowerCase()} base of ${fromCents(
      clamped.base,
    )}.`;
  }

  if (clamped.floored) {
    explanation += ` Base floored at ${fromCents(toCents(rule.minimumBaseAmount))} (statutory minimum contributory wage).`;
  }
  if (clamped.capped) {
    explanation += ` Base capped at ${fromCents(toCents(rule.maximumBaseAmount))} (statutory ceiling).`;
  }

  return {
    employeeCents: rule.bearer === 'EMPLOYER' ? 0 : computedCents,
    employerCents: rule.bearer === 'EMPLOYEE' ? 0 : computedCents,
    explanation,
  };
}

function computeOnBase(rule: PayrollRuleInput, baseCents: number): number {
  if (baseCents <= 0) return 0;

  switch (rule.type) {
    case 'PERCENTAGE': {
      const rate = Number(rule.ratePercent ?? 0);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new RangeError(
          `Rule "${rule.code}" has an invalid ratePercent (${rule.ratePercent})`,
        );
      }
      return Math.round((baseCents * rate) / 100);
    }
    case 'PROGRESSIVE_BANDS': {
      const bands = rule.bands ?? [];
      if (bands.length === 0) return 0;
      return applyBands(baseCents, bands);
    }
    case 'FIXED':
    default: {
      // A banded fixed rule charges per band; a plain one charges the same
      // amount whatever the base is.
      if (rule.bands && rule.bands.length > 0) {
        return applyBands(baseCents, rule.bands);
      }
      return rule.amount ? toCents(rule.amount) : 0;
    }
  }
}

// ──────────────────────────────────────────────────────────── the whole run

/**
 * Calculate one payslip from the rules that apply.
 *
 * Line order on the output is deliberate: basic first, then allowances, then
 * deductions, then employer contributions. A payslip is read top to bottom and
 * the gross has to be visible before the things taken off it.
 */
export function computePayslip(
  input: PayrollInput,
  rules: PayrollRuleInput[],
): ComputedPayslip {
  const warnings: PayrollWarning[] = [];
  const figures = baseFigures(input);
  const lines: ComputedLine[] = [];
  const applied: PayrollTotals['applied'] = [];

  if (input.periodsPerYear != null && input.periodsPerYear <= 0) {
    warnings.push({
      code: 'MISSING_PERIODS',
      message:
        'Periods per year is zero or negative, so annualised rules fell back to 12. A payslip for somebody paid weekly would then be wrong.',
    });
  }

  if (figures.gross <= 0) {
    warnings.push({
      code: 'ZERO_GROSS',
      message:
        'Gross pay is zero, so every percentage-based deduction is zero too. That is almost always a missing salary rather than an intended result.',
    });
  }

  if (rules.length === 0) {
    warnings.push({
      code: 'NO_RULES_RESOLVED',
      message:
        "No statutory rules are configured for this organization's payroll jurisdiction, so nothing was withheld. Check the payroll rules screen before paying anybody — an unconfigured jurisdiction is a gap, not a zero.",
    });
  }

  // ── Earnings ───────────────────────────────────────────────────────────
  lines.push({
    direction: 'EARNING',
    code: 'BASIC',
    name: 'Basic salary',
    amount: fromCents(figures.basic),
    kind: 'COMPANY',
    sortOrder: 0,
    explanation: 'The contracted base for this period.',
  });

  let order = 1;
  for (const earning of input.earnings ?? []) {
    if (earning.code === 'BASIC') continue;
    lines.push({
      direction: 'EARNING',
      code: earning.code,
      name: earning.name,
      amount: fromCents(toCents(earning.amount)),
      kind: earning.kind ?? 'COMPANY',
      accountCode: earning.accountCode,
      sortOrder: order++,
    });
  }

  // ── Statutory and company rules ────────────────────────────────────────
  const ordered = [...rules].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  for (const rule of ordered) {
    const result = applyRule(rule, figures, input.periodsPerYear);

    if (result.employeeCents <= 0 && result.employerCents <= 0) continue;

    const kind = rule.kind ?? 'STATUTORY';
    const account = rule.ledgerAccountCode ?? undefined;

    if (result.employeeCents > 0) {
      lines.push({
        direction: 'EMPLOYEE_DEDUCTION',
        code: rule.code,
        name: rule.name,
        amount: fromCents(result.employeeCents),
        kind,
        ruleId: rule.id,
        accountCode: account,
        sortOrder: order++,
        explanation: result.explanation,
      });
    }

    if (result.employerCents > 0) {
      lines.push({
        direction: 'EMPLOYER_CONTRIBUTION',
        code: `${rule.code}_ER`,
        name: `${rule.name} (employer)`,
        amount: fromCents(result.employerCents),
        kind,
        ruleId: rule.id,
        accountCode: account,
        sortOrder: order++,
        explanation: result.explanation,
      });
    }

    applied.push({
      code: rule.code,
      name: rule.name,
      ruleId: rule.id,
      amount: fromCents(Math.max(result.employeeCents, result.employerCents)),
      bearer: rule.bearer,
    });

    const baseUsed = resolveBase(rule.base, figures);
    if (rule.maximumBaseAmount && baseUsed > toCents(rule.maximumBaseAmount)) {
      warnings.push({
        code: 'BASE_ABOVE_CAP',
        message: `${rule.name}: the ${rule.base.toLowerCase()} base of ${fromCents(
          baseUsed,
        )} is above the statutory ceiling, so this payslip is not the whole picture for a highly-paid employee. Check whether a per-employee cap or a second tier applies.`,
      });
    }
  }

  // ── The employee's own standing arrangements ───────────────────────────
  for (const component of input.components ?? []) {
    const base = figures.gross;
    let cents = 0;

    if (component.percentage != null) {
      cents = Math.round((base * Number(component.percentage)) / 100);
    } else if (component.amount != null) {
      cents = toCents(component.amount);
    }
    if (cents <= 0) continue;

    lines.push({
      direction: 'EMPLOYEE_DEDUCTION',
      code: component.code,
      name: component.name,
      amount: fromCents(cents),
      kind: component.kind ?? 'COMPANY',
      accountCode: component.accountCode,
      sortOrder: order++,
      explanation:
        component.percentage != null
          ? `${component.percentage}% of gross pay.`
          : 'A fixed amount agreed with the employee.',
    });
  }

  const totals: PayrollTotals = { ...totalsFromLines(lines), applied };

  if (totals.net < 0) {
    warnings.push({
      code: 'NET_NEGATIVE',
      message: `Deductions exceed gross pay, leaving net pay at ${totals.net}. An employee cannot be paid a negative amount, so either a deduction rule is misconfigured or a component was entered as an earning.`,
    });
  }

  return { lines, totals, warnings };
}

/**
 * The only definition of a payslip's figures anywhere in this module.
 *
 * Totals are a **sum of the lines**, never stored, for the same reason Module 11
 * stores no stock level: a `netSalary` column that can disagree with
 * `gross − deductions` is the bug, and it is the one nobody catches until a tax
 * audit. Given the lines, the figures are a pure function of them.
 */
export function totalsFromLines(lines: ComputedLine[]): PayrollTotals {
  let gross = 0;
  let employeeDeductions = 0;
  let employerContributions = 0;

  for (const line of lines) {
    const cents = toCents(line.amount);
    if (line.direction === 'EARNING') gross += cents;
    else if (line.direction === 'EMPLOYEE_DEDUCTION')
      employeeDeductions += cents;
    else if (line.direction === 'EMPLOYER_CONTRIBUTION')
      employerContributions += cents;
  }

  return {
    gross: fromCents(gross),
    employeeDeductions: fromCents(employeeDeductions),
    employerContributions: fromCents(employerContributions),
    net: fromCents(gross - employeeDeductions),
    applied: [],
  };
}

/**
 * The minimum a persisted payslip must expose to be grouped into a journal entry.
 *
 * Narrower than `ComputedLine` on purpose: this function reads four fields and
 * nothing else, so it accepts four fields and nothing else. Typing the parameter
 * as the full `ComputedLine` would force every caller to cast a Prisma row — and a
 * cast is where a fifth needed field would silently arrive as `undefined`.
 */
export interface JournalPayslip {
  lines: {
    direction: string;
    amount: number | string | { toString(): string };
    accountCode?: string | null;
    code?: string;
    kind?: string;
    name?: string;
  }[];
}

/**
 * Group a run's payslips into the ledger.
 *
 * One set of lines for the whole run rather than an entry per employee: a payroll
 * for forty staff is forty postings of the same four accounts, and forty entries
 * make the trial balance unreadable for no benefit.
 *
 * `gross` and the employer contributions are the **employer's cost of employing
 * people**, so both debit the salary expense. The employee deductions are money
 * held on somebody else's behalf and owe an authority, so they credit their
 * liability accounts — and the employer's matched contribution credits *its own*
 * account, because the employer's half of a social fund is a separate debt from
 * the employee's half. Net pay is what the organization owes its own staff.
 */
export function payrollJournalLines(
  payslips: JournalPayslip[],
  accounts: {
    salaryExpense: string;
    netPayable: string;
    /** Statutory liability account per rule code, or a single fallback. */
    statutoryAccount?: string;
  },
): {
  lines: {
    accountCode: string;
    debit: number;
    credit: number;
    description: string;
  }[];
  balanced: boolean;
  warning?: string;
} {
  const salaryExpenseAccount = accounts.salaryExpense;

  let grossTotal = 0;
  let employeeTotal = 0;

  /** account → running debit/credit, so forty staff produce four lines, not forty. */
  const byAccount = new Map<
    string,
    { debit: number; credit: number; label: string }
  >();

  for (const payslip of payslips) {
    const totals = totalsFromLines(
      payslip.lines.map((line) => ({
        direction: line.direction as LineDirection,
        code: line.name ?? '',
        name: line.name ?? '',
        amount: num(line.amount),
        kind: 'STATUTORY' as DeductionKind,
        sortOrder: 0,
      })),
    );
    grossTotal += toCents(totals.gross);
    employeeTotal += toCents(totals.employeeDeductions);

    // The salary cost is the gross *plus* what the employer adds on top. Both
    // debit the expense: an employer contribution is a cost of employing
    // somebody, which is why it never reduces net pay anywhere above either.
    const employerCost =
      toCents(totals.gross) + toCents(totals.employerContributions);
    const expense = byAccount.get(salaryExpenseAccount) ?? {
      debit: 0,
      credit: 0,
      label: 'Salary and employer costs',
    };
    expense.debit += employerCost;
    byAccount.set(salaryExpenseAccount, expense);

    for (const line of payslip.lines) {
      // Both sides credit a liability. The employee's withholding owes an
      // authority, and the employer's matched contribution owes the same
      // authority the other half — crediting only the employee side would
      // debit the employer cost against salary expense with nothing on the
      // other side, and the entry would not balance.
      if (
        line.direction !== 'EMPLOYEE_DEDUCTION' &&
        line.direction !== 'EMPLOYER_CONTRIBUTION'
      ) {
        continue;
      }

      const account = line.accountCode ?? accounts.statutoryAccount ?? '2310';
      const entry = byAccount.get(account) ?? {
        debit: 0,
        credit: 0,
        label: line.name ?? 'Statutory deduction',
      };
      entry.credit += toCents(line.amount);
      byAccount.set(account, entry);
    }
  }

  const netPayable = byAccount.get(accounts.netPayable) ?? {
    debit: 0,
    credit: 0,
    label: 'Net pay owed to employees',
  };
  // `grossTotal` and `employeeTotal` are already cents — each accumulates
  // `toCents(...)` of an amount that came out of `fromCents`. Converting them
  // again here is a factor-of-100 error that still produces a plausible-looking
  // entry, which is why it is spelled out rather than done.
  netPayable.credit += grossTotal - employeeTotal;
  byAccount.set(accounts.netPayable, netPayable);

  const lines = [...byAccount.entries()]
    .filter(([, entry]) => entry.debit !== 0 || entry.credit !== 0)
    .map(([accountCode, entry]) => ({
      accountCode,
      debit: fromCents(entry.debit),
      credit: fromCents(entry.credit),
      description: entry.label,
    }));

  const debits = lines.reduce((sum, line) => sum + toCents(line.debit), 0);
  const credits = lines.reduce((sum, line) => sum + toCents(line.credit), 0);

  return {
    lines,
    balanced: debits === credits,
    warning:
      debits === credits
        ? undefined
        : `The payroll entry does not balance: ${fromCents(
            debits,
          )} of debits against ${fromCents(
            credits,
          )} of credits. It has not been posted.`,
  };
}
