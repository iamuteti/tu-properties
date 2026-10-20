import React, { useMemo, useState } from 'react';
import {
  Building2,
  TrendingUp,
  CreditCard,
  FileText,
  Users,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Play,
  Globe2,
  Lock,
  Clock
} from 'lucide-react';
import {
  MARKETS,
  MARKET_CODES,
  getMarket,
  marketMidRent,
  formatMoney,
  type MarketProfile
} from './data/landingData';

interface HeroProps {
  onStartTrial: () => void;
  onSeeHowItWorks: () => void;
}

/** The public deployment origin (`DEPLOYMENT.md` → nginx `server_name`). */
const APP_ORIGIN = 'properties.tuhame.co.ke';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const Hero: React.FC<HeroProps> = ({ onStartTrial, onSeeHowItWorks }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'payouts'>('overview');
  const [marketCode, setMarketCode] = useState<string>(MARKET_CODES[0]);

  const market = useMemo(() => getMarket(marketCode), [marketCode]);
  const midRent = useMemo(() => marketMidRent(market), [market]);

  /** The portfolio rent roll the mockup shows: the market's own units and rent band. */
  const rentRoll = useMemo(
    () => market.properties.reduce((sum, property) => sum + property.unitCount, 0) * midRent,
    [market, midRent]
  );

  const money = (amount: number) => formatMoney(amount, market);

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden bg-slate-50 dark:bg-[#070B14]">
      {/* Background architectural glow gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[620px] pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[130px]" />
        <div className="absolute top-20 right-1/4 w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[140px]" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:4rem_4rem]"
          aria-hidden="true"
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-300/80 dark:border-slate-700/80 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              One Organization Per Market — {MARKETS.length} Jurisdictions
            </span>
          </div>

          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-300 text-xs font-medium">
            <Globe2 className="w-3.5 h-3.5" />
            <span className="font-mono">{MARKET_CODES.join(' · ')}</span>
          </div>
        </div>

        {/* Main Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.08] font-display">
            Run your entire property portfolio{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600">
              from one system.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 font-normal leading-relaxed max-w-3xl mx-auto">
            From <strong className="text-slate-900 dark:text-white font-semibold">boutique 12-unit residential apartments</strong> to <strong className="text-slate-900 dark:text-white font-semibold">multi-story residential towers and high-rise commercial complexes</strong>. Properties, tenants, money and staff unified in one platform where{' '}
            <strong className="text-slate-900 dark:text-white font-semibold">
              every market is its own organization
            </strong>{' '}
            with its own currency, locale, tax rules and telephone formats.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStartTrial}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-slate-950 font-extrabold text-base bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-xl shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Start free trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onSeeHowItWorks}
              className="w-full sm:w-auto px-7 py-4 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white font-bold text-base bg-white/90 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700/80 shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-amber-400/20" />
              <span>See how it works</span>
            </button>

            <a
              href="#demo-accounts"
              className="w-full sm:w-auto px-6 py-4 rounded-xl text-amber-600 dark:text-amber-400 hover:text-amber-500 font-bold text-base bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>Demo Logins</span>
            </a>
          </div>

          {/* Micro trust indicators below hero */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              14-day free trial per organization
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Strict tenant data isolation
            </span>
          </div>
        </div>

        {/* HERO DASHBOARD MOCKUP */}
        <div className="mt-14 max-w-6xl mx-auto">
          <div className="relative rounded-2xl p-1 md:p-2 bg-gradient-to-b from-slate-200/60 dark:from-slate-700/60 via-slate-100/40 dark:via-slate-800/40 to-amber-500/20 shadow-2xl shadow-black/80">
            <div className="rounded-xl bg-white dark:bg-[#0B1120] border border-slate-200/90 dark:border-slate-800/90 overflow-hidden text-slate-700 dark:text-slate-200">

              {/* Window Header bar */}
              <div className="bg-white dark:bg-[#080D1A] px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/70" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/70" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
                  </div>
                  <div className="h-4 w-px bg-slate-100 dark:bg-slate-800 hidden sm:block" />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    {APP_ORIGIN} / organization:{' '}
                    <span className="text-slate-700 dark:text-slate-200">{slugify(market.organization)}</span>
                  </span>
                </div>

                {/* Market selector & interactive switcher */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="hero-market-switcher"
                    className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:inline"
                  >
                    Active Market / Organization:
                  </label>
                  <select
                    id="hero-market-switcher"
                    value={market.code}
                    onChange={(event) => setMarketCode(event.target.value)}                    className="text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    {MARKETS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} — {option.country} ({option.currency})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub-navigation inside mockup */}
              <div className="px-5 py-3 bg-white dark:bg-[#0E1528] border-b border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'overview'
                        ? 'bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Portfolio & Live Occupancy
                  </button>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'payments'
                        ? 'bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Payment Recording & FIFO Allocation
                  </button>
                  <button
                    onClick={() => setActiveTab('payouts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'payouts'
                        ? 'bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Derived Owner Payouts
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  General Ledger: BALANCED (0.00 Diff)
                </div>
              </div>

              {/* Mockup Body Content */}
              <div className="p-5 md:p-6 space-y-6">

                {/* Top Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                      <span>Occupancy (Live Sync)</span>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white font-display">
                      94.2%
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span>Synced from 182 active leases</span>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                      <span>Monthly Rent Settled</span>
                      <CreditCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white font-display">
                      {money(rentRoll)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <span>FIFO allocation active</span>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                      <span>Statutory Withholding / Tax</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="mt-2 text-base md:text-xl font-extrabold text-slate-900 dark:text-white font-display">
                      {market.taxLabel}
                    </div>
                    <div className="mt-1 text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <span>Engine: Configured as data</span>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                      <span>Emergency Work Orders</span>
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white font-display">
                      0 Pending
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span>Avg response time: 24 mins</span>
                    </div>
                  </div>
                </div>

                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        Active Managed Properties ({market.code} · {market.city})
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        CSV dry-run: 0 errors on last sync
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium bg-white/40 dark:bg-slate-900/40">
                            <th className="py-2.5 px-3">Property Name</th>
                            <th className="py-2.5 px-3">Units & Type</th>
                            <th className="py-2.5 px-3">Live Occupancy</th>
                            <th className="py-2.5 px-3">Monthly Rent Roll</th>
                            <th className="py-2.5 px-3">Tax Status</th>
                            <th className="py-2.5 px-3 text-right">Audit State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-600 dark:text-slate-300">
                          {market.properties.map((property, index) => {
                            const occupancy = parseFloat(property.occupancy);
                            const isBoutique = property.unitCount <= 12;
                            return (
                              <tr
                                key={property.name}
                                className="hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors"
                              >
                                <td className="py-3 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                  {property.name}
                                </td>
                                <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">
                                  {isBoutique ? (
                                    <>
                                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                                        {property.unitCount} Units
                                      </span>{' '}
                                      (Boutique Multi-Family)
                                    </>
                                  ) : (
                                    <>
                                      {property.unitCount} Units ({property.type})
                                    </>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-400 rounded-full"
                                        style={{ width: `${occupancy}%` }}
                                      />
                                    </div>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                      {property.occupancy}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">
                                  {money(property.unitCount * midRent)}
                                </td>
                                <td className="py-3 px-3 font-sans">
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                                    {index === 3
                                      ? 'Direct Lease Ledger'
                                      : `${market.taxName} ${market.vatRate}% Configured`}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right font-sans">
                                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                    Verified Derived
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 2: Payments & FIFO */}
                {activeTab === 'payments' && (
                  <div className="space-y-4">
                    <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Payment Recording & Smart FIFO Allocation Engine
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 max-w-xl">
                          Every recorded payment — bank transfer, card, M-Pesa, cash, cheque, or paid
                          straight to the owner —
                          resolves the tenant&apos;s oldest invoice balance first. Any surplus is
                          instantly booked to the tenant&apos;s spendable wallet credit balance.
                        </p>
                      </div>
                      <div className="bg-white dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Auto-Reconciliation Rate
                        </span>
                        <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                          99.8% (1,420/1,423)
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-slate-900/40">
                            <th className="py-2 px-3">Payment Ref</th>
                            <th className="py-2 px-3">Tenant & Unit</th>
                            <th className="py-2 px-3">Amount Paid</th>
                            <th className="py-2 px-3">Invoice Settled</th>
                            <th className="py-2 px-3">Surplus to Credit</th>
                            <th className="py-2 px-3 text-right">Receipt PDF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-600 dark:text-slate-300">
                          <tr>
                            <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400">
                              {market.code === 'KE' ? 'MPESA_QM82K4' : 'BANK_TRF_99182'}
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              E. Thorne ({market.properties[0].name} #4B)
                            </td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">
                              {money(midRent)}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                              INV-2026-0042 (Oldest: {money(Math.round(midRent * 0.91))})
                            </td>
                            <td className="py-2.5 px-3 text-amber-600 dark:text-amber-400 font-semibold">
                              +{money(Math.round(midRent * 0.09))} Credit
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans hover:text-slate-900 dark:hover:text-white cursor-pointer underline">
                                REC-9281.pdf
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 text-blue-600 dark:text-blue-400">
                              CARD_4117_0082
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              M. Harrison ({market.properties[1].name} Unit 12A)
                            </td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">
                              {money(Math.round(midRent * 0.8))}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                              INV-2026-0089 (Full settlement)
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-semibold">
                              {money(0)} (Exact)
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans hover:text-slate-900 dark:hover:text-white cursor-pointer underline">
                                REC-1044.pdf
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 3: Owner Payouts */}
                {activeTab === 'payouts' && (
                  <div className="space-y-4">
                    <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          Owner Income Computation: Zero Manual Typing
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 max-w-xl">
                          Owner gross revenue is mathematically aggregated from matched payment rows.
                          Management fees and approved work order bills are automatically deducted to
                          generate net bank transfers.
                        </p>
                      </div>
                      <div className="bg-emerald-950/60 border border-emerald-800/80 px-3 py-2 rounded-lg text-right">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-300 block">
                          Bank Dispatch Status
                        </span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          All References Validated
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <OwnerPayoutCard
                        market={market}
                        propertyName={market.properties[0].name}
                        gross={market.properties[0].unitCount * midRent}
                        feeRate={0.08}
                        workOrders={market.properties[0].unitCount * midRent * 0.013}
                        taxOnFee={market.properties[0].unitCount * midRent * 0.08 * (market.vatRate / 100)}
                        taxLabel={`${market.taxName} on fee (${market.vatRate}%)`}
                        reserveLabel=""
                        reserve={0}
                      />

                      <OwnerPayoutCard
                        market={market}
                        propertyName={market.properties[1].name}
                        gross={market.properties[1].unitCount * midRent}
                        feeRate={0.075}
                        workOrders={market.properties[1].unitCount * midRent * 0.016}
                        taxOnFee={0}
                        taxLabel=""
                        reserveLabel="Escrow Reserve Contribution"
                        reserve={market.properties[1].unitCount * midRent * 0.023}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer status strip of the mockup */}
              <div className="bg-white dark:bg-[#080D1A] px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-500 dark:text-slate-400 font-mono">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Isolated Tenant DB: Secure
                  </span>
                  <span className="hidden sm:inline-block">•</span>
                  <span className="hidden sm:inline">13 System Roles Active</span>
                  <span className="hidden sm:inline-block">•</span>
                  <span className="hidden sm:inline">Audit Log: Append-Only</span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Derived Ledger • {market.timezone} • {market.locale}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

interface OwnerPayoutCardProps {
  market: MarketProfile;
  propertyName: string;
  gross: number;
  feeRate: number;
  workOrders: number;
  taxOnFee: number;
  taxLabel: string;
  reserveLabel: string;
  reserve: number;
}

/** One landlord's derived payout, priced in the active market's own currency. */
const OwnerPayoutCard: React.FC<OwnerPayoutCardProps> = ({
  market,
  propertyName,
  gross,
  feeRate,
  workOrders,
  taxOnFee,
  taxLabel,
  reserveLabel,
  reserve
}) => {
  const money = (amount: number) => formatMoney(amount, market, 2);
  const fee = gross * feeRate;
  const net = gross - fee - workOrders - taxOnFee - reserve;

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
      <div className="flex justify-between text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
        <span className="font-sans font-bold text-slate-900 dark:text-white">{market.organization}</span>
        <span>Property: {propertyName}</span>
      </div>
      <div className="flex justify-between text-slate-600 dark:text-slate-300">
        <span>Gross Collected (Derived):</span>
        <span className="text-slate-900 dark:text-white font-bold">{money(gross)}</span>
      </div>
      <div className="flex justify-between text-rose-400">
        <span>Management Fee ({(feeRate * 100).toFixed(1).replace(/\.0$/, '')}%):</span>
        <span>- {money(fee)}</span>
      </div>
      <div className="flex justify-between text-rose-400">
        <span>Maintenance Work Orders (2 bills):</span>
        <span>- {money(workOrders)}</span>
      </div>
      {taxOnFee > 0 ? (
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>{taxLabel}:</span>
          <span>- {money(taxOnFee)}</span>
        </div>
      ) : null}
      {reserve > 0 ? (
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>{reserveLabel}:</span>
          <span>- {money(reserve)}</span>
        </div>
      ) : null}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm">
        <span className="text-amber-600 dark:text-amber-400 font-sans">Net Payout Transferred:</span>
        <span className="text-emerald-600 dark:text-emerald-400">{money(net)}</span>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 font-sans flex items-center justify-between">
        <span>Transfer Ref: {market.code}-TRX-{slugify(propertyName).slice(0, 6).toUpperCase()}-99410</span>
        <span className="text-emerald-600 dark:text-emerald-400">Statement Sent via Email & SMS</span>
      </div>
    </div>
  );
};
