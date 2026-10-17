import React, { useState } from 'react';
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
  Sparkles,
  Smartphone,
  Globe2,
  Lock,
  ChevronRight,
  Clock,
  Layers
} from 'lucide-react';

interface HeroProps {
  onStartTrial: () => void;
  onSeeHowItWorks: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onStartTrial, onSeeHowItWorks }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'payouts'>('overview');
  const [activeBranch, setActiveBranch] = useState<'London' | 'New York' | 'Nairobi' | 'Dubai'>('London');

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
              Built for Modern Multi-Entity Property Portfolios
            </span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-300 text-xs font-medium">
            <Globe2 className="w-3.5 h-3.5" />
            <span>London • New York • Dubai • Nairobi • Singapore</span>
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
            From <strong className="text-slate-900 dark:text-white font-semibold">boutique 12-unit residential apartments</strong> to <strong className="text-slate-900 dark:text-white font-semibold">multi-story residential towers and high-rise commercial complexes</strong>. Properties, tenants, money, and staff unified in one audited platform with multi-branch and multi-currency controls.
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
                    app.tuproperties.com / organization: <span className="text-slate-700 dark:text-slate-200">apex-holdings-global</span>
                  </span>
                </div>

                {/* Branch selector & interactive switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:inline">
                    Active Entity / Branch:
                  </span>
                  <div className="flex p-0.5 bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded-lg text-xs font-medium">
                    {(['London', 'New York', 'Nairobi', 'Dubai'] as const).map((branch) => (
                      <button
                        key={branch}
                        onClick={() => setActiveBranch(branch)}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          activeBranch === branch
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        {branch}
                      </button>
                    ))}
                  </div>
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
                    Global Payments & FIFO Allocation
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
                      {activeBranch === 'London'
                        ? '£482,500'
                        : activeBranch === 'New York'
                        ? '$628,400'
                        : activeBranch === 'Nairobi'
                        ? 'KES 14.8M'
                        : 'AED 2,340,000'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <span>FIFO auto-allocation active</span>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                      <span>Statutory Withholding / Tax</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white font-display">
                      {activeBranch === 'London'
                        ? '20% HMRC VAT'
                        : activeBranch === 'New York'
                        ? 'State & City Tax'
                        : activeBranch === 'Nairobi'
                        ? '10% KRA WHT'
                        : '5% FTA VAT'}
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
                        Active Managed Properties ({activeBranch} Branch)
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
                          <tr className="hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'London'
                                ? 'Mayfair Central Residences'
                                : activeBranch === 'New York'
                                ? 'Manhattan View Tower'
                                : activeBranch === 'Nairobi'
                                ? 'Westlands Ridge Towers'
                                : 'Marina Gateway Heights'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">64 Units (Commercial/Res)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[96%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">96.8%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">
                              {activeBranch === 'London'
                                ? '£165,000'
                                : activeBranch === 'New York'
                                ? '$215,000'
                                : activeBranch === 'Nairobi'
                                ? 'KES 4,850,000'
                                : 'AED 820,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                                {activeBranch === 'London' ? 'VAT 20% Standard' : activeBranch === 'New York' ? 'Direct Ledger Sync' : activeBranch === 'Nairobi' ? 'WHT 10% Withheld' : 'VAT 5% FTA Compliant'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>

                          <tr className="hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'London'
                                ? 'Kensington Park Lofts'
                                : activeBranch === 'New York'
                                ? 'Brooklyn Heights Suites'
                                : activeBranch === 'Nairobi'
                                ? 'Kilimani Heights Apartments'
                                : 'Downtown Boulevard Suites'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">48 Units (Residential)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[92%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">91.6%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">
                              {activeBranch === 'London'
                                ? '£128,000'
                                : activeBranch === 'New York'
                                ? '$164,000'
                                : activeBranch === 'Nairobi'
                                ? 'KES 3,240,000'
                                : 'AED 610,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                                {activeBranch === 'London' ? 'Residential Exempt' : activeBranch === 'New York' ? 'Property Tax Accrual' : activeBranch === 'Nairobi' ? '16% VAT Configured' : 'FTA Audited'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>

                          <tr className="hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'London'
                                ? 'Canary Wharf Commercial Plaza'
                                : activeBranch === 'New York'
                                ? 'Hudson Yards Mixed Center'
                                : activeBranch === 'Nairobi'
                                ? 'Lavington Green Villas'
                                : 'Business Bay Executive Hub'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">24 Units (Mixed Use)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[100%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">100.0%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">
                              {activeBranch === 'London'
                                ? '£189,500'
                                : activeBranch === 'New York'
                                ? '$249,400'
                                : activeBranch === 'Nairobi'
                                ? 'KES 2,900,000'
                                : 'AED 910,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                                {activeBranch === 'London' ? 'Option to Tax Elect' : activeBranch === 'New York' ? 'Commercial Rent Tax' : activeBranch === 'Nairobi' ? 'WHT 10% Deducted' : 'Reverse Charge VAT'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>

                          <tr className="hover:bg-slate-100/30 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'London'
                                ? 'Chelsea Mews Boutique Apartments'
                                : activeBranch === 'New York'
                                ? 'Greenwich Village Brownstone'
                                : activeBranch === 'Nairobi'
                                ? 'Riverside Courtyard Apartments'
                                : 'Jumeirah Palm Residences'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">
                              <span className="font-semibold text-amber-600 dark:text-amber-400">12 Units</span> (Boutique Multi-Family)
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[100%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">100.0%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">
                              {activeBranch === 'London'
                                ? '£28,800'
                                : activeBranch === 'New York'
                                ? '$36,000'
                                : activeBranch === 'Nairobi'
                                ? 'KES 720,000'
                                : 'AED 144,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 font-medium">
                                Direct Lease Ledger
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>
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
                          Multi-Rail Payments & Smart FIFO Allocation Engine
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 max-w-xl">
                          Every incoming payment (Stripe, Direct Debit, Card, or Mobile Money) resolves the tenant&apos;s oldest invoice balance first. Any surplus is instantly booked to the tenant&apos;s spendable wallet credit balance.
                        </p>
                      </div>
                      <div className="bg-white dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Auto-Reconciliation Rate</span>
                        <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">99.8% (1,420/1,423)</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-slate-900/40">
                            <th className="py-2 px-3">Gateway Ref</th>
                            <th className="py-2 px-3">Tenant & Unit</th>
                            <th className="py-2 px-3">Amount Paid</th>
                            <th className="py-2 px-3">Invoice Settled</th>
                            <th className="py-2 px-3">Surplus to Credit</th>
                            <th className="py-2 px-3 text-right">Receipt PDF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-600 dark:text-slate-300">
                          <tr>
                            <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400">STRIPE_pi_3N92k</td>
                            <td className="py-2.5 px-3 font-sans">E. Thorne (Mayfair #4B)</td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">£3,500.00</td>
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">INV-2026-0042 (Oldest: £3,200)</td>
                            <td className="py-2.5 px-3 text-amber-600 dark:text-amber-400 font-semibold">+£300.00 Credit</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans hover:text-slate-900 dark:hover:text-white cursor-pointer underline">
                                REC-9281.pdf
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 text-blue-600 dark:text-blue-400">ACH_SEC_99182</td>
                            <td className="py-2.5 px-3 font-sans">M. Harrison (Unit 12A)</td>
                            <td className="py-2.5 px-3 text-slate-900 dark:text-white font-bold">$4,800.00</td>
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">INV-2026-0089 (Full settlement)</td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-semibold">$0.00 (Exact)</td>
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
                          Owner gross revenue is mathematically aggregated from matched payment rows. Management fees and approved work order bills are automatically deducted to generate net bank transfers.
                        </p>
                      </div>
                      <div className="bg-emerald-950/60 border border-emerald-800/80 px-3 py-2 rounded-lg text-right">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-300 block">Bank Dispatch Status</span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">All References Validated</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                          <span className="font-sans font-bold text-slate-900 dark:text-white">Owner: Grosvenor Real Estate LLP</span>
                          <span>Property: Mayfair Central</span>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>Gross Collected (Derived):</span>
                          <span className="text-slate-900 dark:text-white font-bold">£165,000.00</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Management Fee (8%):</span>
                          <span>- £13,200.00</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Maintenance Work Orders (2 bills):</span>
                          <span>- £2,140.00</span>
                        </div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>VAT on Fee (20% HMRC):</span>
                          <span>- £2,640.00</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm">
                          <span className="text-amber-600 dark:text-amber-400 font-sans">Net Payout Transferred:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">£147,020.00</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 font-sans flex items-center justify-between">
                          <span>BACS Ref: BARC-TRX-99410</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Statement Sent via Email Portal</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                          <span className="font-sans font-bold text-slate-900 dark:text-white">Owner: Hudson River Capital LLC</span>
                          <span>Property: Manhattan View</span>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>Gross Collected (Derived):</span>
                          <span className="text-slate-900 dark:text-white font-bold">$215,000.00</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Management Fee (7.5%):</span>
                          <span>- $16,125.00</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>HVAC Servicing Work Order:</span>
                          <span>- $3,450.00</span>
                        </div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Escrow Reserve Contribution:</span>
                          <span>- $5,000.00</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold text-sm">
                          <span className="text-amber-600 dark:text-amber-400 font-sans">Net Payout Transferred:</span>
                          <span className="text-emerald-600 dark:text-emerald-400">$190,425.00</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 font-sans flex items-center justify-between">
                          <span>Fedwire Ref: JPMC-WIRE-204192</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Statement Sent via Email Portal</span>
                        </div>
                      </div>
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
                  <span className="hidden sm:inline">12 Admin Roles Active</span>
                  <span className="hidden sm:inline-block">•</span>
                  <span className="hidden sm:inline">Audit Log: Append-Only</span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                  TU Properties Engine v4.2 • High-Availability Cloud
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
