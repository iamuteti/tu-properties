/**
 * Module 5 — the deposit rule.
 *
 * A deposit is **one number**, and this file is the whole of the rule that
 * produces it. There is no components engine: a property says "one month's
 * rent" for its 1B units and "two months" for its 3B units, and that is the
 * entire vocabulary of what a deposit can be.
 *
 * The one piece of cleverness is `RENT_MONTHS`. "One month's rent" is not a
 * number, it is a rule that has to keep itself true: when the rent is
 * escalated, a fixed deposit quietly goes stale and stops securing anything.
 * So the rule remembers its basis, and the **number is worked out at the moment
 * an agreement starts** and copied onto that agreement. From then on it is a
 * fact about one resident, and a later change to the property's rule never
 * rewrites it.
 *
 * Pure on purpose: every rule here is arithmetic on two numbers, so it is
 * unit-tested rather than trusted, and the same function serves the agreement
 * form, the register and the seed.
 */

/** How a rule is expressed. */
export const DEPOSIT_BASIS = {
  /** The amount is the deposit. */
  FIXED: 'FIXED',
  /** The deposit is `months` of the agreement's rent. */
  RENT_MONTHS: 'RENT_MONTHS',
} as const;

export type DepositBasis = (typeof DEPOSIT_BASIS)[keyof typeof DEPOSIT_BASIS];

export interface DepositRule {
  /** The deposit, when the basis is FIXED. */
  amount: number;
  /** FIXED or RENT_MONTHS. */
  basis: string;
  /** How many months of rent, when the basis is RENT_MONTHS. */
  months?: number | null;
}

export interface DepositRuleView {
  /** The rule as stored, for the screens that edit it. */
  rule: DepositRule | null;
  /** What the rule works out to for a given rent. */
  amount: number;
  /**
   * False when there is no rule at all.
   *
   * This is not the same as "no deposit". A rule of zero means *this kind of
   * unit takes no deposit*, deliberately and on the record. No rule means
   * *nobody has decided yet*, and an agreement must not quietly become a
   * zero-deposit agreement because of it.
   */
  decided: boolean;
}

/**
 * What a rule works out to for a given rent.
 *
 * `FIXED` — the amount. `RENT_MONTHS` — that many months of the rent.
 */
export function computeDepositAmount(
  rule: DepositRule | null | undefined,
  rentAmount: number | null | undefined,
): number {
  if (!rule) return 0;

  const rent = Number(rentAmount ?? 0);

  if (rule.basis === DEPOSIT_BASIS.RENT_MONTHS) {
    const months = Number(rule.months ?? 0);
    if (!Number.isFinite(months) || months <= 0) return 0;
    return round2(months * (Number.isFinite(rent) ? rent : 0));
  }

  const amount = Number(rule.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return round2(amount);
}

/**
 * A rule, read for a particular rent.
 *
 * Returns the rule, what it works out to, and whether anyone has decided.
 */
export function resolveDepositRule(
  rule: DepositRule | null | undefined,
  rentAmount: number | null | undefined,
): DepositRuleView {
  const amount = computeDepositAmount(rule, rentAmount);
  return {
    rule: rule ?? null,
    amount,
    decided: Boolean(rule),
  };
}

/**
 * Whether a rule says this kind of unit takes no deposit.
 *
 * A rule of zero is a decision; no rule is an absence of one. They are
 * different facts and the screens say so.
 */
export function ruleTakesNoDeposit(
  rule: DepositRule | null | undefined,
): boolean {
  if (!rule) return false;
  if (rule.basis === DEPOSIT_BASIS.RENT_MONTHS) {
    return Number(rule.months ?? 0) <= 0;
  }
  return Number(rule.amount ?? 0) <= 0;
}

/**
 * Validate a rule someone is trying to save.
 *
 * The basis and its number travel together: a `RENT_MONTHS` rule with no
 * months is a rule that computes nothing, and a `FIXED` rule with a months
 * value is a rule with a number nobody reads.
 */
export function validateDepositRule(input: {
  amount?: number | null;
  basis?: string | null;
  months?: number | null;
}): { valid: boolean; reason?: string } {
  const basis = (input.basis ?? DEPOSIT_BASIS.FIXED).toUpperCase();

  if (basis !== DEPOSIT_BASIS.FIXED && basis !== DEPOSIT_BASIS.RENT_MONTHS) {
    return { valid: false, reason: 'Unknown deposit basis.' };
  }

  if (basis === DEPOSIT_BASIS.RENT_MONTHS) {
    // Zero months is a decision ("no deposit"); *no* months is an incomplete
    // rule that would compute nothing, so it is refused.
    if (input.months === undefined || input.months === null) {
      return {
        valid: false,
        reason: 'A rent-multiple deposit needs a number of months.',
      };
    }
    const months = Number(input.months);
    if (!Number.isFinite(months) || months < 0) {
      return {
        valid: false,
        reason: 'A rent-multiple deposit needs a number of months.',
      };
    }
    if (months > 12) {
      return {
        valid: false,
        reason:
          'A deposit of more than twelve months of rent is not a deposit.',
      };
    }
    return { valid: true };
  }

  // The same distinction the other way round: zero is a decision, no amount at
  // all is an incomplete rule.
  if (input.amount === undefined || input.amount === null) {
    return { valid: false, reason: 'A deposit needs an amount.' };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false, reason: 'A deposit cannot be negative.' };
  }
  if (amount > 100_000_000) {
    return { valid: false, reason: 'That deposit is larger than any deposit.' };
  }
  return { valid: true };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
