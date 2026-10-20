'use client';

import React from 'react';
import { Globe2, Phone, Receipt, Coins, Percent } from 'lucide-react';
import { MARKETS, formatMoney, marketMidRent, numberWord } from './data/landingData';

/**
 * The market proof strip.
 *
 * Every value here is copied from the jurisdiction profiles the seeder uses
 * (`backend/src/prisma/jurisdictions.ts`). The strip exists to make one claim
 * checkable: jurisdiction is configuration, not code — a Kenyan organization
 * and an Indian one carry different currencies, locales, tax rates, telephone
 * formats, tax-ID shapes, utility tariffs and rent bands.
 */
export const MarketProofStrip: React.FC = () => {
  return (
    <section
      id="markets"
      className="py-24 bg-white dark:bg-[#080D1A] relative border-b border-slate-200 dark:border-slate-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <Globe2 className="w-3.5 h-3.5" />
            <span>
              {MARKETS.length} Market Profile{MARKETS.length === 1 ? '' : 's'}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            One platform, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600">
              {numberWord(MARKETS.length)} local realities.
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            Each market is a separate organization with its own currency, locale, timezone,
            consumption-tax rate, telephone format, landlord tax-ID shape, utility tariffs and
            residential rent band. These are the values the platform ships with — pick a market and
            check them against the configurator below.
          </p>
        </div>

        {/* The strip */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {MARKETS.map((market) => (
            <div
              key={market.code}
              className="group p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 transition-all shadow-sm hover:shadow-xl"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[11px] font-bold tracking-wider">
                  {market.code}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {market.country}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {market.currency} · {market.locale}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Percent className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <dt className="sr-only">Consumption tax</dt>
                  <dd className="font-mono">{market.taxLabel}</dd>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Phone className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <dt className="sr-only">Telephone format</dt>
                  <dd className="font-mono truncate">{market.phoneExample}</dd>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Receipt className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <dt className="sr-only">Landlord tax identifier</dt>
                  <dd className="font-mono truncate">
                    {market.taxIdLabel}: {market.taxIdExample}
                  </dd>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Coins className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <dt className="sr-only">Residential rent band</dt>
                  <dd className="font-mono truncate">
                    {formatMoney(market.rentMin, market)}–{formatMoney(market.rentMax, market)}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                Typical rent {formatMoney(marketMidRent(market), market)}
              </p>

              {market.hasDemoLogin ? (
                <a
                  href="#demo-accounts"
                  className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 transition-colors"
                >
                  <span>Open the {market.code} demo login</span>
                  <span aria-hidden="true">&rarr;</span>
                </a>
              ) : (
                <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                  Seeded as a market organization
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Statutory <em>rates</em> are configuration rows on top of these profiles: worked tax rules
          ship for Kenya, Germany, the United Kingdom and the United States (by state), and worked
          payroll rules for Kenya, Germany and the United Kingdom. Any other regime is a dated rule,
          not a code change.
        </p>
      </div>
    </section>
  );
};
