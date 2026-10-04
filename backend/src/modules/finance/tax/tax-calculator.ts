import { TaxBasis, TaxTreatment } from '@prisma/client';

/**
 * Module 7 — Finance & Accounting: tax calculation.
 *
 * Deliberately pure and country-agnostic. Nothing here knows what "VAT" is, let
 * alone what it costs in any particular country: the caller hands over the
 * rules that apply, and this decides the money. That separation is what lets
 * the same engine bill Kenya, Germany and California without a code change.
 *
 * All arithmetic is in integer cents. Floating-point tax is the classic source
 * of invoices that are off by a cent and cannot be reconciled, so cents are the
 * only currency this module counts in.
 */

export interface TaxableLine {
  /** Description, passed through untouched. */
  description: string;
  /** Quantity as entered; may be fractional. */
  quantity?: number;
  /**
   * The stated price for the whole line. Whether this contains tax is decided
   * by the rule's `basis`, not by the caller — that is the whole point of a
   * configurable engine.
   */
  amount: number;
  /**
   * What the line is for — a rent charge, a utility recharge, a parking fee.
   * Used to pick between variants of the same tax: a jurisdiction with a
   * standard and a reduced rate has both rules active, and applying both would
   * bill the tax twice. A rule with `appliesToCategory: '*'` matches anything.
   */
  category?: string;
}

export interface ApplicableTax {
  id: string;
  code: string;
  name: string;
  ratePercent: number;
  basis: TaxBasis;
  treatment: TaxTreatment;
  isCompound: boolean;
  /** The rule a compound tax stacks onto, when `isCompound`. */
  compoundOnCode?: string;
  ledgerAccountCode?: string;
  /**
   * Which kind of line this rate applies to. `'*'` matches every line, so a
   * jurisdiction with only one rate needs no category at all.
   */
  appliesToCategory: string;
}

export interface ComputedLineTax {
  code: string;
  name: string;
  ratePercent: number;
  basis: TaxBasis;
  treatment: TaxTreatment;
  ruleId: string;
  ledgerAccountCode?: string;
  /** Money this tax added on top of the net amount. */
  amount: number;
  isCompound: boolean;
  compoundOnCode?: string;
}

export interface ComputedLine extends TaxableLine {
  /** Price with every tax stripped out. */
  netAmount: number;
  /** Price plus charged taxes — what the customer is billed. */
  grossAmount: number;
  taxes: ComputedLineTax[];
}

export interface ComputedInvoice {
  lines: ComputedLine[];
  netAmount: number;
  /** Taxes added to the price, grouped by rule for the ledger. */
  chargedTax: number;
  /** Taxes deducted by us — never billed to the customer. */
  withheldTax: number;
  totalAmount: number;
  /** Per-rule totals, for the invoice snapshot and the journal entry. */
  summary: TaxSummaryEntry[];
  /**
   * True when the caller's stated amounts already included every tax, so the
   * grand total is unchanged by calculation.
   */
  totalsMatchStatedAmounts: boolean;
}

export interface TaxSummaryEntry {
  code: string;
  name: string;
  ratePercent: number;
  basis: TaxBasis;
  treatment: TaxTreatment;
  account: string;
  amount: number;
}

const toCents = (value: number) =>
  Math.round((Number(value) + Number.EPSILON) * 100);
const fromCents = (cents: number) => Math.round(cents) / 100;

/**
 * Tax on a net amount, in cents.
 *
 * `ratePercent` is a percentage (16 means 16%). Exclusive taxes are simply
 * net × rate; inclusive taxes are a share of a price that already contains them,
 * so the amount is derived back out of the gross rather than added to it.
 */
/**
 * Tax owed on a **net** amount, in cents.
 *
 * `ratePercent` is a percentage (16 means 16%). Whether the price the customer
 * sees contains the tax is not this function's problem — `computeLineTaxes`
 * strips an inclusive price first, so by the time an amount is net, the tax is
 * always `net × rate` whichever way the price was quoted.
 *
 * Cents in, cents out: the result is rounded once and never re-scaled.
 */
export function taxOnNetCents(netCents: number, ratePercent: number): number {
  if (netCents <= 0) return 0;
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new RangeError(
      `Tax rate must be a non-negative number, received ${ratePercent}`,
    );
  }
  return Math.round((netCents * rate) / 100);
}

/**
 * Split a tax-inclusive price into its net portion and the tax inside it.
 * A €119 VAT-inclusive line at 19% is €100 net + €19 tax.
 */
export function extractInclusiveTaxCents(
  grossCents: number,
  ratePercent: number,
): { netCents: number; taxCents: number } {
  const rate = Number(ratePercent);
  if (grossCents <= 0) return { netCents: 0, taxCents: 0 };
  if (rate === 0) return { netCents: grossCents, taxCents: 0 };
  const netCents = Math.round((grossCents * 100) / (100 + rate));
  return { netCents, taxCents: grossCents - netCents };
}

/**
 * Order rules so a compound tax is always calculated after the tax it stacks
 * onto. A cycle would mean two taxes each taxing the other, so it is refused
 * rather than silently mis-ordered.
 */
export function orderTaxRules(rules: ApplicableTax[]): ApplicableTax[] {
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const ordered: ApplicableTax[] = [];
  const placed = new Set<string>();
  const visiting = new Set<string>();

  const place = (rule: ApplicableTax) => {
    if (placed.has(rule.code)) return;
    if (visiting.has(rule.code)) {
      throw new Error(
        `Compound tax cycle detected at "${rule.code}" — a tax cannot be calculated on top of itself`,
      );
    }
    visiting.add(rule.code);

    if (rule.isCompound && rule.compoundOnCode) {
      const base = byCode.get(rule.compoundOnCode);
      if (base) place(base);
    }

    visiting.delete(rule.code);
    placed.add(rule.code);
    ordered.push(rule);
  };

  for (const rule of rules) place(rule);
  return ordered;
}

/**
 * Choose the rules that apply to one line.
 *
 * A jurisdiction can have a standard and a reduced rate of the same tax — German
 * VAT at 19% and 7%, for instance. Both are active at once, and applying both
 * would bill the tax twice at two different rates. So within one tax code, a
 * rule aimed at this line's category wins over the general `'*'` rule, and two
 * rules aimed at different categories simply do not both match.
 */
export function rulesForLine(
  line: TaxableLine,
  rules: ApplicableTax[],
): ApplicableTax[] {
  const category = line.category ?? '*';
  const best = new Map<string, ApplicableTax>();

  for (const rule of rules) {
    if (rule.appliesToCategory !== '*' && rule.appliesToCategory !== category) {
      continue;
    }
    const current = best.get(rule.code);
    if (!current) {
      best.set(rule.code, rule);
      continue;
    }
    const currentIsSpecific = current.appliesToCategory === category;
    const candidateIsSpecific = rule.appliesToCategory === category;
    if (candidateIsSpecific && !currentIsSpecific) best.set(rule.code, rule);
  }

  return [...best.values()];
}

/**
 * Calculate one line's taxes.
 *
 * The pipeline, in order:
 *   1. a single inclusive tax is stripped out of the stated price,
 *   2. exclusive and withheld taxes are added to the net,
 *   3. each compound tax is then applied to everything accumulated so far.
 *
 * Withheld taxes are computed but kept out of the billed total — that money is
 * deducted from what we remit, and adding it to an invoice would be charging
 * the customer for our liability.
 */
export function computeLineTaxes(
  line: TaxableLine,
  rules: ApplicableTax[],
): ComputedLine {
  const amountCents = toCents(line.amount ?? 0);
  const ordered = orderTaxRules(rulesForLine(line, rules));

  let netCents = amountCents;
  let grossCents = amountCents;

  // Step 1 — a price that already contains tax.
  const inclusive = ordered.filter(
    (rule) => rule.basis === TaxBasis.INCLUSIVE && !rule.isCompound,
  );
  if (inclusive.length > 0) {
    // A price that already contains tax: strip it out before anything is added.
    const factor = inclusive.reduce(
      (product, rule) => product * (1 + Number(rule.ratePercent) / 100),
      1,
    );
    netCents = Math.round(amountCents / factor);
    grossCents = amountCents;
  }

  const taxes: ComputedLineTax[] = [];

  for (const rule of ordered) {
    // Exclusive, or inclusive when the price already excluded it.
    const isInclusiveApplied =
      rule.basis === TaxBasis.INCLUSIVE && !rule.isCompound;
    const isWithheld = rule.treatment === TaxTreatment.WITHHELD;
    // Withholding is a deduction from the charge itself (rent withholding tax is
    // a percentage of the rent), so it is computed on the net — never on the
    // total including the very VAT being withheld alongside it.
    const base =
      rule.isCompound || isWithheld || isInclusiveApplied
        ? isWithheld && !rule.isCompound
          ? netCents
          : grossCents
        : netCents;

    let amountCentsForRule: number;
    if (inclusive.length > 0) {
      // Recovered from the gross: the whole inclusive slice, split between the
      // inclusive rules that produced it.
      const inclusiveTotal = grossCents - netCents;
      const share =
        inclusive.reduce((sum, item) => sum + Number(item.ratePercent), 0) || 1;
      amountCentsForRule = Math.round(
        (inclusiveTotal * Number(rule.ratePercent)) / share,
      );
    } else {
      amountCentsForRule = taxOnNetCents(base, Number(rule.ratePercent));
    }

    if (amountCentsForRule <= 0 && !isInclusiveApplied) continue;

    taxes.push({
      code: rule.code,
      name: rule.name,
      ratePercent: Number(rule.ratePercent),
      basis: rule.basis,
      treatment: rule.treatment,
      ruleId: rule.id,
      ledgerAccountCode: rule.ledgerAccountCode,
      amount: fromCents(amountCentsForRule),
      isCompound: rule.isCompound,
      compoundOnCode: rule.compoundOnCode,
    });

    if (isWithheld) {
      // Recorded on the line's tax, never added to the gross: the customer does
      // not pay it, we remit it.
    } else if (!isInclusiveApplied) {
      // An inclusive tax is already inside the stated price, so adding it again
      // would bill it twice.
      grossCents += amountCentsForRule;
    }
  }

  return {
    ...line,
    netAmount: fromCents(netCents),
    grossAmount: fromCents(grossCents),
    taxes,
  };
}

/**
 * Calculate an invoice from its lines, grouping the result per rule so the
 * ledger gets one liability line per tax type rather than one blended figure.
 */
export function computeInvoiceTax(
  lines: TaxableLine[],
  rules: ApplicableTax[],
): ComputedInvoice {
  const computedLines = lines.map((line) => computeLineTaxes(line, rules));

  const summaryByCode = new Map<string, TaxSummaryEntry>();
  let netCents = 0;
  let chargedCents = 0;
  let withheldCents = 0;

  for (const line of computedLines) {
    netCents += toCents(line.netAmount);
    for (const tax of line.taxes) {
      const cents = toCents(tax.amount);
      if (tax.treatment === TaxTreatment.WITHHELD) withheldCents += cents;
      else chargedCents += cents;

      const existing = summaryByCode.get(tax.code);
      if (existing) {
        existing.amount = fromCents(toCents(existing.amount) + cents);
      } else {
        summaryByCode.set(tax.code, {
          code: tax.code,
          name: tax.name,
          ratePercent: tax.ratePercent,
          basis: tax.basis,
          treatment: tax.treatment,
          account: tax.ledgerAccountCode ?? '2100',
          amount: fromCents(cents),
        });
      }
    }
  }

  const statedCents = lines.reduce(
    (sum, line) => sum + toCents(line.amount),
    0,
  );
  const totalCents = netCents + chargedCents;

  return {
    lines: computedLines,
    netAmount: fromCents(netCents),
    chargedTax: fromCents(chargedCents),
    withheldTax: fromCents(withheldCents),
    totalAmount: fromCents(totalCents),
    summary: [...summaryByCode.values()],
    // Only meaningful when the caller passed inclusive prices; with exclusive
    // ones the total is expected to grow.
    totalsMatchStatedAmounts: totalCents === statedCents,
  };
}

/**
 * Infer an inclusive gross from a net amount — the inverse of what a customer
 * sees on a shelf. Useful for a quote where the net figure is agreed first.
 */
export function addInclusiveTax(
  netAmount: number,
  ratePercent: number,
): number {
  const netCents = toCents(netAmount);
  return fromCents(Math.round(netCents * (1 + Number(ratePercent) / 100)));
}
