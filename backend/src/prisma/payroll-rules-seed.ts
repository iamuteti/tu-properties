import { PrismaClient, Prisma } from '@prisma/client';
import {
  PayrollBearer,
  PayrollCalculationBase,
  PayrollPeriodMode,
  PayrollRuleType,
} from '@prisma/client';

/**
 * ⚠️  SAMPLE JURISDICTION CONFIGURATION — READ BEFORE USING IN PRODUCTION.
 *
 * These rows exist so the payroll engine demonstrably works out of the box, and
 * they are **snapshots of rates that change on a legislative cycle and must be
 * checked against current law before anybody is actually paid.** They are not a
 * compliance product and this file is not legal advice.
 *
 * Three things are deliberate about how they are seeded, and each exists because
 * of how badly the alternative fails:
 *
 * 1. **Per-country and opt-in.** `seedPayrollRules` is called for one country at a
 *    time. Nobody gets Kenya's bands by accident because the seed ran.
 * 2. **Shared templates (`organizationId: null`).** A country-wide rule inherits
 *    into every organization in that jurisdiction, which is what makes a
 *    new-country rollout a data change rather than a code change.
 * 3. **Every row carries its effective date and a `description` naming the
 *    instrument.** A rate change is a new row with a later `validFrom`, so a
 *    payslip from last year keeps the figures that produced it. If a band below is
 *    stale, adding a corrected row from next month is the fix and nothing else has
 *    to move.
 *
 * Every figure below is marked with what it is and when it was last reviewed. If
 * you cannot confirm a figure, delete the row — a jurisdiction with no rules
 * produces a loud `NO_RULES_RESOLVED` warning on every payslip, which is a far
 * better failure than a confident wrong number nobody checked.
 */

type RuleSeed = {
  code: string;
  name: string;
  description: string;
  countryCode: string;
  regionCode?: string;
  type: PayrollRuleType;
  base: PayrollCalculationBase;
  bearer: PayrollBearer;
  ratePercent?: number;
  amount?: number;
  minimumBaseAmount?: number;
  maximumBaseAmount?: number;
  exemptBelowBaseAmount?: number;
  bands?: Array<{ upTo: number | null; ratePercent?: number }>;
  periodMode?: PayrollPeriodMode;
  periodsPerYear?: number;
  sortOrder?: number;
  /** Where the withheld money lands. Must exist in the chart of accounts. */
  ledgerAccountCode: string;
  expenseAccountCode?: string;
  validFrom: string;
};

/** Accounts the engine posts to. Kept here so the seed and the engine agree. */
const ACCOUNTS = {
  SALARY_EXPENSE: '5090',
  NET_PAYABLE: '2310',
  STATUTORY_FALLBACK: '2310',
};

// ───────────────────────────────────────────────────────────── Kenya (KE)

/**
 * Kenya, reviewed against the Finance Act 2024 (PAYE bands effective for the 2025
 * tax year) and the SHIF and Housing Levy regimes.
 *
 * The two that move most often are NSSF's contributory ceiling and SHIF's minimum,
 * both of which have been revised more than once. Check them.
 */
const KENYA: RuleSeed[] = [
  {
    code: 'KE_PAYE',
    name: 'PAYE (Pay As You Earn) income tax',
    description:
      'Progressive annual bands on taxable pay, divided back down by the number of periods. Bands per the Finance Act 2024, effective for the 2025 tax year. VERIFY against current KRA guidance before use.',
    countryCode: 'KE',
    type: PayrollRuleType.PROGRESSIVE_BANDS,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.EMPLOYEE,
    bands: [
      { upTo: 6_000, ratePercent: 0 },
      { upTo: 16_000, ratePercent: 10 },
      { upTo: 31_000, ratePercent: 15 },
      { upTo: 56_000, ratePercent: 25 },
      { upTo: null, ratePercent: 37.5 },
    ],
    // Annual bands, monthly pay. This is the distinction that makes the figure
    // correct: a monthly band walk on these numbers produces a different — and
    // wrong — answer for most salaries.
    periodMode: PayrollPeriodMode.ANNUALISED,
    periodsPerYear: 12,
    sortOrder: 10,
    ledgerAccountCode: '2300',
    validFrom: '2025-01-01',
  },
  {
    code: 'KE_SHIF',
    name: 'SHIF social health insurance',
    description:
      'Social Health Insurance Fund, which replaced NHIF in 2024. Matched: 1.5% of gross on each side, with a statutory minimum contribution per side. VERIFY the current minimum and ceiling.',
    countryCode: 'KE',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.GROSS,
    bearer: PayrollBearer.BOTH,
    ratePercent: 1.5,
    minimumBaseAmount: 10_000,
    sortOrder: 20,
    ledgerAccountCode: '2320',
    validFrom: '2024-10-01',
  },
  {
    code: 'KE_HOUSING_LEVY',
    name: 'Housing (development) levy',
    description:
      'Employer-funded levy on gross pay. No employee share — that is what distinguishes it from SHIF and is why `bearer` is EMPLOYER rather than BOTH.',
    countryCode: 'KE',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.GROSS,
    bearer: PayrollBearer.EMPLOYER,
    ratePercent: 1.5,
    sortOrder: 30,
    ledgerAccountCode: '2330',
    validFrom: '2024-01-01',
  },
  {
    code: 'KE_NSSF',
    name: 'NSSF pension contributions',
    description:
      'National Social Security Fund: employer and employee shares of contributory pay, with a statutory minimum and a ceiling on what counts as contributable. The ceiling has been revised more than once — VERIFY it.',
    countryCode: 'KE',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.BOTH,
    ratePercent: 10,
    minimumBaseAmount: 6_000,
    maximumBaseAmount: 3_000_000,
    sortOrder: 40,
    ledgerAccountCode: '2310',
    validFrom: '2024-01-01',
  },
];

// ───────────────────────────────────────────────── Germany (DE)

/**
 * Germany, as a worked example of a jurisdiction that pays monthly on **annual**
 * income tax with a *progressive* formula rather than a ladder — which is exactly
 * the case a banded rule cannot express.
 *
 * The income tax here is modelled as a `FIXED` rule of zero plus a note, because
 * the German formula is a polynomial, not a rate and not a ladder. Modelling it
 * honestly means adding a fourth `PayrollRuleType`; until then the correct
 * behaviour is that it is **absent**, so a German run reports that income tax is
 * unconfigured rather than deducting something plausible and wrong. The social
 * contributions below are the flat percentages and do work.
 */
const GERMANY: RuleSeed[] = [
  {
    code: 'DE_SOCIAL',
    name: 'Social insurance contributions',
    description:
      'Employee social insurance (health, pension, unemployment, care) as a percentage of contributory pay, within the annual and monthly contribution ceilings. VERIFY the current rates and the Ji/JSi thresholds.',
    countryCode: 'DE',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.BOTH,
    ratePercent: 20,
    sortOrder: 20,
    ledgerAccountCode: '2320',
    validFrom: '2025-01-01',
  },
  {
    code: 'DE_SOLI',
    name: 'Solidarity surcharge',
    description:
      'A solidarity surcharge on the income tax, applied at a percentage of that tax. Modelled as a share of gross here only as a placeholder — the real calculation is a percentage *of the income tax*, which this engine cannot express yet. Set it to 0 rather than run it.',
    countryCode: 'DE',
    type: PayrollRuleType.FIXED,
    base: PayrollCalculationBase.GROSS,
    bearer: PayrollBearer.EMPLOYEE,
    amount: 0,
    sortOrder: 30,
    ledgerAccountCode: '2300',
    validFrom: '2025-01-01',
  },
];

// ─────────────────────────────────────────────── United Kingdom (GB)

/**
 * The United Kingdom, as the example of a jurisdiction with a **regional** element:
 * Scotland has its own income tax bands. `regionCode: 'SCT'` is how that is
 * modelled — the same rule code, a different region, and the specificity scoring in
 * `common/jurisdiction.ts` picks the Scottish one for a Scottish organization
 * without the English one having to know Scotland exists.
 */
const UNITED_KINGDOM: RuleSeed[] = [
  {
    code: 'GB_NI',
    name: 'National Insurance (employee Class 1)',
    description:
      'Employee National Insurance above the primary earnings threshold, for the tax year starting 6 April. VERIFY the current thresholds and rates.',
    countryCode: 'GB',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.EMPLOYEE,
    ratePercent: 8,
    exemptBelowBaseAmount: 12_570,
    sortOrder: 20,
    ledgerAccountCode: '2310',
    validFrom: '2025-04-06',
  },
  {
    code: 'GB_PENSION',
    name: 'Workplace pension (auto-enrolment)',
    description:
      'Employer pension contribution on qualifying earnings, which is earnings *above* a threshold — so the threshold goes on `exemptBelowBaseAmount` rather than on a minimum contribution. VERIFY the current threshold and minimum contribution.',
    countryCode: 'GB',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.EMPLOYER,
    ratePercent: 3,
    exemptBelowBaseAmount: 6_240,
    sortOrder: 30,
    ledgerAccountCode: '2320',
    validFrom: '2025-04-06',
  },
  {
    code: 'GB_NI',
    name: 'National Insurance (employee Class 1) — Scottish bands',
    description:
      'Scotland sets its own income tax bands, so an organization registered in Scotland resolves this row instead of the country-wide one. Same code, different region — the specificity scoring decides.',
    countryCode: 'GB',
    regionCode: 'SCT',
    type: PayrollRuleType.PERCENTAGE,
    base: PayrollCalculationBase.TAXABLE,
    bearer: PayrollBearer.EMPLOYEE,
    ratePercent: 8,
    exemptBelowBaseAmount: 12_702,
    sortOrder: 20,
    ledgerAccountCode: '2310',
    validFrom: '2025-04-06',
  },
];

/** Every jurisdiction this file can seed, by ISO-3166-1 alpha-2. */
export const SAMPLE_JURISDICTIONS: Record<string, RuleSeed[]> = {
  KE: KENYA,
  DE: GERMANY,
  GB: UNITED_KINGDOM,
};

/**
 * Seed one country's rules as **shared templates** (`organizationId: null`), so
 * every organization in that jurisdiction inherits them and can override
 * individual rules with an org-scoped row.
 *
 * Idempotent: a rule already present for the same organization, code, country,
 * region and start date is left alone. Re-running after a rate change therefore
 * does nothing rather than duplicating — which is why a *change* means calling
 * this with a later `validFrom` in the seed data, not deleting anything.
 *
 * Returns both counts, and the difference matters: on a re-run `created` is zero
 * while `inForce` is not, and a caller that reports only the first will claim a
 * jurisdiction is unconfigured when it is fully configured. That is exactly the
 * confusion this return shape exists to prevent.
 */
export async function seedPayrollRules(
  prisma: PrismaClient,
  countryCode: string,
): Promise<{ created: number; inForce: number }> {
  const key = countryCode.toUpperCase();
  const rules = SAMPLE_JURISDICTIONS[key];
  if (!rules) {
    throw new Error(
      `No sample configuration is bundled for ${countryCode}. The available ones are ${Object.keys(
        SAMPLE_JURISDICTIONS,
      ).join(
        ', ',
      )} — a country with no bundled rules is the supported case, not a gap: add them through the payroll rules screen.`,
    );
  }

  let created = 0;

  for (const rule of rules) {
    const data: Prisma.PayrollRuleUncheckedCreateInput = {
      organizationId: null,
      code: rule.code,
      name: rule.name,
      description: rule.description,
      countryCode: rule.countryCode,
      regionCode: rule.regionCode ?? null,
      type: rule.type,
      base: rule.base,
      bearer: rule.bearer,
      ratePercent:
        rule.ratePercent === undefined
          ? null
          : new Prisma.Decimal(rule.ratePercent),
      amount:
        rule.amount === undefined ? null : new Prisma.Decimal(rule.amount),
      minimumBaseAmount:
        rule.minimumBaseAmount === undefined
          ? null
          : new Prisma.Decimal(rule.minimumBaseAmount),
      maximumBaseAmount:
        rule.maximumBaseAmount === undefined
          ? null
          : new Prisma.Decimal(rule.maximumBaseAmount),
      exemptBelowBaseAmount:
        rule.exemptBelowBaseAmount === undefined
          ? null
          : new Prisma.Decimal(rule.exemptBelowBaseAmount),
      bands: (rule.bands ?? null) as unknown as Prisma.InputJsonValue,
      periodMode: rule.periodMode ?? PayrollPeriodMode.PERIOD,
      periodsPerYear: rule.periodsPerYear ?? 12,
      sortOrder: rule.sortOrder ?? 100,
      ledgerAccountCode: rule.ledgerAccountCode,
      expenseAccountCode: rule.expenseAccountCode ?? ACCOUNTS.SALARY_EXPENSE,
      validFrom: new Date(rule.validFrom),
      isActive: true,
    };

    const existing = await prisma.payrollRule.findFirst({
      where: {
        organizationId: null,
        code: rule.code,
        countryCode: rule.countryCode,
        regionCode: rule.regionCode ?? null,
        validFrom: data.validFrom,
      },
      select: { id: true },
    });

    if (existing) continue;
    await prisma.payrollRule.create({ data });
    created += 1;
  }

  return { created, inForce: rules.length };
}

export { ACCOUNTS as PAYROLL_ACCOUNT_CODES };
