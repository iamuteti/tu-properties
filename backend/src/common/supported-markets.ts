/**
 * The markets this deployment sells into, and the currency each bills in.
 *
 * Two, deliberately: Kenya and the United States. `src/prisma/jurisdictions.ts`
 * still carries fifteen complete profiles — tax rates, telephone formats,
 * utility tariffs, rent bands — and they stay there as dormant configuration so
 * a third market can be switched on without re-deriving any of it. What this
 * file says is narrower than what the codebase can model: it is the answer to
 * "what can a customer actually buy today".
 *
 * Keeping the list in one place means the landing page, the demo seed, the
 * organization profile and the plan catalogue agree about which currencies
 * exist. They are four different files and they have drifted before.
 */
export const SUPPORTED_MARKETS = [
  { code: 'KE', currency: 'KES' },
  { code: 'US', currency: 'USD' },
] as const;

export type SupportedMarketCode = (typeof SUPPORTED_MARKETS)[number]['code'];
export type SupportedCurrency = (typeof SUPPORTED_MARKETS)[number]['currency'];

export const SUPPORTED_MARKET_CODES: readonly SupportedMarketCode[] =
  SUPPORTED_MARKETS.map((market) => market.code);

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] =
  SUPPORTED_MARKETS.map((market) => market.currency);

export function isSupportedMarket(code: string): code is SupportedMarketCode {
  return (SUPPORTED_MARKET_CODES as readonly string[]).includes(
    code.toUpperCase(),
  );
}

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(
    code.toUpperCase(),
  );
}
