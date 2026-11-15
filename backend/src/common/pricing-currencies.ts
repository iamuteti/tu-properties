/**
 * The currencies the plan catalogue is priced in.
 *
 * Two, deliberately: Kenya bills in KES and the United States in USD. This file
 * answers only "which currencies does a self-serve signup have a price for" — it
 * is not a list of the countries the platform supports. The platform models
 * fifteen complete jurisdiction profiles in `src/prisma/jurisdictions.ts`, and
 * `Organization.currency` is a free ISO-4217 column, so an organization can be
 * onboarded into a currency that is not priced here; what it cannot do is buy a
 * plan over the public site in a currency no plan row quotes.
 *
 * The priced surfaces read this list: the landing pricing table, the trial
 * modal and `TrialSignupDto`. Nothing else should.
 */
export const PRICED_CURRENCIES = ['KES', 'USD'] as const;

export type PricedCurrency = (typeof PRICED_CURRENCIES)[number];

/**
 * The markets the demo seed covers when `DEMO_COUNTRIES` is unset.
 *
 * A seed default, not a restriction: `DEMO_COUNTRIES=KE,ZA,IN` seeds those
 * markets instead, and every profile in `jurisdictions.ts` still seeds when
 * named explicitly.
 */
export const DEFAULT_DEMO_MARKETS = ['KE', 'US'] as const;
