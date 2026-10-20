'use client';

import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, Phone, Receipt, Coins, Percent, Zap, Droplets, Flame, Building2 } from 'lucide-react';
import { MARKETS, getMarket, marketMidRent, formatMoney } from './data/landingData';

/**
 * The jurisdiction configurator.
 *
 * Pick a market and the tenant's phone number, the landlord's tax identifier,
 * the rent, the currency and the utility tariffs are re-derived from that
 * market's profile. Nothing on this panel is typed in by hand: every value is
 * a function of the market you chose, which is the whole point of the model.
 */
export const JurisdictionConfigurator: React.FC = () => {
  const [code, setCode] = useState<string>(MARKETS[0].code);

  const market = useMemo(() => getMarket(code), [code]);
  const midRent = useMemo(() => marketMidRent(market), [market]);
  const money = (amount: number) => formatMoney(amount, market);

  const rows = [
    {
      icon: <Phone className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Tenant telephone',
      value: market.phoneExample,
      note: `${market.phoneCountryCode} · ${market.taxIdLabel === 'KRA PIN' ? 'Kenyan' : 'local'} numbering plan`
    },
    {
      icon: <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Landlord tax identifier',
      value: market.taxIdExample,
      note: `${market.taxIdLabel} · ${market.country}`
    },
    {
      icon: <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Typical residential rent',
      value: money(midRent),
      note: `Band ${money(market.rentMin)}–${money(market.rentMax)}`
    },
    {
      icon: <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Consumption tax',
      value: market.taxLabel,
      note: `${market.currency} · ${market.country}`
    },
    {
      icon: <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Electricity tariff',
      value: `${money(market.electricity.rate)} / ${market.electricity.unit}`,
      note: 'Installed as a tariff row with a validity window'
    },
    {
      icon: <Droplets className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Water tariff',
      value: `${money(market.water.rate)} / ${market.water.unit}`,
      note: 'Bulk meters apportioned against submeters'
    },
    {
      icon: <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
      label: 'Gas tariff',
      value: `${money(market.gas.rate)} / ${market.gas.unit}`,
      note: 'One bill per meter per calendar month'
    }
  ];

  return (
    <section
      id="jurisdiction"
      className="py-24 bg-slate-50 dark:bg-[#070B14] relative border-b border-slate-200 dark:border-slate-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Jurisdiction Configurator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            Change the market. Watch everything re-derive.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            The tenant&apos;s number, the landlord&apos;s tax identifier, the rent, the currency and the
            utility tariffs are all read from the market profile. No code changes, no forks, no
            spreadsheet in another language.
          </p>
        </div>

        {/* Market picker */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {MARKETS.map((option) => (
            <button
              key={option.code}
              onClick={() => setCode(option.code)}
              aria-pressed={option.code === market.code}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                option.code === market.code
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
              }`}
            >
              {option.code}
            </button>
          ))}
        </div>

        {/* Derived output */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/30 lg:col-span-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-mono">
              <Building2 className="w-4 h-4" />
              Active Market
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex h-10 w-14 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-sm font-bold tracking-wider">
                {market.code}
              </span>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{market.country}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{market.organization}</p>
              </div>
            </div>

            <dl className="mt-6 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Currency</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-white">{market.currency}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Locale</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-white">{market.locale}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Time zone</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-white">{market.timezone}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">City</dt>
                <dd className="font-mono font-bold text-slate-900 dark:text-white">{market.city}</dd>
              </div>
            </dl>

            <p className="mt-6 pt-4 border-t border-amber-500/20 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              These values are the seeded defaults for this organization. Rates, tariffs and rent
              bands are rows an administrator can edit — the engine reads them, it does not hardcode
              them.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-3">
            {rows.map((row) => (
              <div
                key={row.label}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    {row.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                      {row.label}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">
                      {row.value}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono sm:text-right shrink-0">
                  {row.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
