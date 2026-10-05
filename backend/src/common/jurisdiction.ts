/**
 * Jurisdiction resolution, shared by the two configurable rules engines.
 *
 * Module 7 resolves tax rules and Module 12 resolves payroll rules, and they
 * answer the same question in the same way: *given an organization in a country
 * (sometimes a region), which of these candidate rule rows actually applies?*
 *
 * Two copies of that answer would drift, and the failure would be silent — a
 * slightly-wrong specificity score does not throw, it quietly applies the wrong
 * rate. So the scoring lives here, once, and both engines call it.
 */

export interface Jurisdiction {
  /** ISO-3166-1 alpha-2, or null when the organization has not said. */
  countryCode: string | null;
  /** The optional sub-national level: US state, German Bundesland, Brazilian
   *  estado, and a great many payroll jurisdictions that tax nationally but
   *  legislate leave provincially. */
  regionCode: string | null;
}

export interface ScoredRule {
  code: string;
  countryCode: string | null;
  regionCode: string | null;
  organizationId: string | null;
}

/**
 * How closely a rule matches a jurisdiction. Higher wins; `-1` means disqualified.
 *
 * The weights encode the precedence both engines document:
 *
 * | rule                                     | score |
 * |------------------------------------------|-------|
 * | org override, country + region           |  +7   |
 * | shared template, country + region        |  +6   |
 * | org override, country only               |  +3   |
 * | shared template, country only            |  +2   |
 * | org override, no country (the fallback)  |  +0   |
 * | shared template, no country              |  −1   |
 * | a region that is not ours                | −1 (disqualified) |
 *
 * The region check is a disqualifier rather than a penalty because a rule written
 * for another province is not a *less good* match — it is not a match at all, and
 * scoring it instead would let it beat the country-level fallback in an
 * organization with no rule of its own.
 *
 * An organization-specific rule always beats a shared template of the same
 * specificity, which is what makes "override the default for this employer" work.
 */
export function ruleSpecificity(
  rule: ScoredRule,
  jurisdiction: Jurisdiction,
): number {
  let score = 0;

  if (rule.countryCode && rule.countryCode === jurisdiction.countryCode)
    score += 2;
  // A rule with no country is the organization's fallback for anywhere it does
  // not have a more specific match, so it ranks below any real jurisdiction.
  if (rule.countryCode === null) score -= 1;

  if (rule.regionCode && rule.regionCode === jurisdiction.regionCode)
    score += 4;
  if (rule.regionCode && rule.regionCode !== jurisdiction.regionCode) return -1;

  if (rule.organizationId) score += 1;

  return score;
}

/** `KE-47` for a country and a region, `KE` for a country alone, `''` for neither. */
export function jurisdictionLabel(jurisdiction: Jurisdiction): string {
  if (jurisdiction.regionCode) {
    return `${jurisdiction.countryCode ?? ''}-${jurisdiction.regionCode}`;
  }
  return jurisdiction.countryCode ?? '';
}

/** A short human phrase for a screen that is about to ask somebody to choose. */
export function describeJurisdiction(jurisdiction: Jurisdiction): string {
  if (!jurisdiction.countryCode) return 'no jurisdiction set';
  return jurisdiction.regionCode
    ? `${jurisdiction.countryCode} (${jurisdiction.regionCode})`
    : jurisdiction.countryCode;
}

/**
 * Pick one rule per code, most specific first.
 *
 * Both engines need this and both need it to tie-break the same way, so it is
 * here rather than written twice. `candidates` may contain several versions of a
 * rule at different dates; the caller has already filtered those to the ones in
 * force, so exactly one survives per code.
 */
export function bestPerCode<T extends ScoredRule>(
  candidates: T[],
  jurisdiction: Jurisdiction,
): T[] {
  const best = new Map<string, { rule: T; score: number }>();

  for (const rule of candidates) {
    const score = ruleSpecificity(rule, jurisdiction);
    if (score < 0) continue;
    const current = best.get(rule.code);
    if (!current || score > current.score) best.set(rule.code, { rule, score });
  }

  return [...best.values()].map((entry) => entry.rule);
}

/** Is a rule in force at a moment? Both engines share this effective-window test. */
export function isInForceAt(
  rule: { validFrom: Date; validTo: Date | null },
  at: Date,
): boolean {
  return rule.validFrom <= at && (rule.validTo === null || rule.validTo > at);
}
