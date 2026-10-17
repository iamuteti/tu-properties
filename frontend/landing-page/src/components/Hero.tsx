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
  const [activeBranch, setActiveBranch] = useState<'Nairobi' | 'Lagos' | 'Johannesburg'>('Nairobi');

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden bg-[#070B14]">
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-xs font-semibold text-slate-200">
              Built for African Property Management Portfolios
            </span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-medium">
            <Globe2 className="w-3.5 h-3.5" />
            <span>Nairobi • Lagos • Johannesburg • Kigali • Accra</span>
          </div>
        </div>

        {/* Main Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] font-['Space_Grotesk']">
            Run your entire property portfolio{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600">
              from one system.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 font-normal leading-relaxed max-w-3xl mx-auto">
            Properties, tenants, money, and staff unified in one audited platform — with{' '}
            <strong className="text-amber-300 font-semibold">multi-branch support</strong> across cities and{' '}
            <strong className="text-amber-300 font-semibold">multi-country tax configuration</strong> tailored to local statutory compliance.
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
              className="w-full sm:w-auto px-7 py-4 rounded-xl text-slate-200 hover:text-white font-bold text-base bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <Play className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              <span>See how it works</span>
            </button>
          </div>

          {/* Micro trust indicators below hero */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              14-day free trial per organization
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              Strict tenant data isolation
            </span>
          </div>
        </div>

        {/* HERO DASHBOARD MOCKUP */}
        <div className="mt-14 max-w-6xl mx-auto">
          <div className="relative rounded-2xl p-1 md:p-2 bg-gradient-to-b from-slate-700/60 via-slate-800/40 to-amber-500/20 shadow-2xl shadow-black/80">
            <div className="rounded-xl bg-[#0B1120] border border-slate-800/90 overflow-hidden text-slate-200">
              
              {/* Window Header bar */}
              <div className="bg-[#080D1A] px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/70" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/70" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
                  </div>
                  <div className="h-4 w-px bg-slate-800 hidden sm:block" />
                  <span className="text-xs font-semibold text-slate-400 font-mono flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    app.tuproperties.internal / tenant: <span className="text-slate-200">apex-realty-ke</span>
                  </span>
                </div>

                {/* Branch selector & interactive switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden md:inline">
                    Active Branch:
                  </span>
                  <div className="flex p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-medium">
                    {(['Nairobi', 'Lagos', 'Johannesburg'] as const).map((branch) => (
                      <button
                        key={branch}
                        onClick={() => setActiveBranch(branch)}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          activeBranch === branch
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {branch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sub-navigation inside mockup */}
              <div className="px-5 py-3 bg-[#0E1528] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'overview'
                        ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Portfolio & Live Occupancy
                  </button>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'payments'
                        ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    M-Pesa & FIFO Smart Allocation
                  </button>
                  <button
                    onClick={() => setActiveTab('payouts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'payouts'
                        ? 'bg-slate-800 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Derived Owner Payouts
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  General Ledger: BALANCED (0.00 Diff)
                </div>
              </div>

              {/* Mockup Body Content */}
              <div className="p-5 md:p-6 space-y-6">
                
                {/* Top Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Occupancy (Live Sync)</span>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-white font-['Space_Grotesk']">
                      94.2%
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                      <span>Synced from 182 active leases</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Monthly Rent Settled</span>
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-white font-['Space_Grotesk']">
                      {activeBranch === 'Nairobi' ? 'KES 14.8M' : activeBranch === 'Lagos' ? 'NGN 184.2M' : 'ZAR 2.3M'}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                      <span>FIFO auto-allocation active</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Statutory Withholding Tax</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-white font-['Space_Grotesk']">
                      {activeBranch === 'Nairobi' ? '10% KRA' : activeBranch === 'Lagos' ? '10% FIRS' : '15% SARS'}
                    </div>
                    <div className="mt-1 text-[11px] text-blue-400 flex items-center gap-1">
                      <span>Engine: Configured as data</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="flex items-center justify-between text-slate-400 text-xs">
                      <span>Emergency Work Orders</span>
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="mt-2 text-xl md:text-2xl font-extrabold text-white font-['Space_Grotesk']">
                      0 Pending
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                      <span>Avg response time: 24 mins</span>
                    </div>
                  </div>
                </div>

                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-400" />
                        Active Managed Properties ({activeBranch} Branch)
                      </h4>
                      <span className="text-[11px] text-slate-400 font-mono">
                        CSV dry-run: 0 errors on last sync
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-medium bg-slate-900/40">
                            <th className="py-2.5 px-3">Property Name</th>
                            <th className="py-2.5 px-3">Units & Type</th>
                            <th className="py-2.5 px-3">Live Occupancy</th>
                            <th className="py-2.5 px-3">Monthly Rent Roll</th>
                            <th className="py-2.5 px-3">Tax Status</th>
                            <th className="py-2.5 px-3 text-right">Audit State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                          <tr className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'Nairobi'
                                ? 'Westlands Ridge Towers'
                                : activeBranch === 'Lagos'
                                ? 'Victoria Crest Residences'
                                : 'Sandton View Suites'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-300">64 Units (Commercial/Res)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[96%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-400 font-bold">96.8%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-white font-bold">
                              {activeBranch === 'Nairobi' ? 'KES 4,850,000' : activeBranch === 'Lagos' ? 'NGN 62,400,000' : 'ZAR 780,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                WHT 10% Withheld
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>

                          <tr className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'Nairobi'
                                ? 'Kilimani Heights Apartments'
                                : activeBranch === 'Lagos'
                                ? 'Ikoyi Park Terraces'
                                : 'Rosebank Central Lofts'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-300">48 Units (Residential)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[92%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-400 font-bold">91.6%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-white font-bold">
                              {activeBranch === 'Nairobi' ? 'KES 3,240,000' : activeBranch === 'Lagos' ? 'NGN 41,500,000' : 'ZAR 520,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                16% VAT Configured
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-400 text-xs font-semibold">Verified Derived</span>
                            </td>
                          </tr>

                          <tr className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-sans font-semibold text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              {activeBranch === 'Nairobi'
                                ? 'Lavington Green Villas'
                                : activeBranch === 'Lagos'
                                ? 'Lekki Phase 1 Commercial Square'
                                : 'Bryanston Office Park'}
                            </td>
                            <td className="py-3 px-3 font-sans text-slate-300">24 Units (Mixed Use)</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="w-[100%] h-full bg-emerald-400 rounded-full" />
                                </div>
                                <span className="text-emerald-400 font-bold">100.0%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-white font-bold">
                              {activeBranch === 'Nairobi' ? 'KES 2,900,000' : activeBranch === 'Lagos' ? 'NGN 38,000,000' : 'ZAR 490,000'}
                            </td>
                            <td className="py-3 px-3 font-sans">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                WHT 10% Deducted
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <span className="text-emerald-400 text-xs font-semibold">Verified Derived</span>
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
                    <div className="bg-slate-900/90 border border-amber-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-emerald-400" />
                          M-Pesa STK Push & Smart FIFO Allocation Engine
                        </div>
                        <p className="mt-1 text-xs text-slate-300 max-w-xl">
                          Every incoming mobile or Stripe payment resolves the tenant&apos;s oldest invoice balance first. Any remaining surplus is instantly booked to the tenant&apos;s spendable wallet credit balance.
                        </p>
                      </div>
                      <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-right">
                        <span className="text-[10px] text-slate-400 block">Today&apos;s STK Success Rate</span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono">99.4% (214/215)</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40">
                            <th className="py-2 px-3">Gateway Ref</th>
                            <th className="py-2 px-3">Tenant & Unit</th>
                            <th className="py-2 px-3">Amount Paid</th>
                            <th className="py-2 px-3">Invoice Settled</th>
                            <th className="py-2 px-3">Surplus to Credit</th>
                            <th className="py-2 px-3 text-right">Receipt PDF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                          <tr>
                            <td className="py-2.5 px-3 text-emerald-400">MPESA_QKD92819</td>
                            <td className="py-2.5 px-3 font-sans">K. Mwangi (Unit 4B)</td>
                            <td className="py-2.5 px-3 text-white font-bold">KES 90,000</td>
                            <td className="py-2.5 px-3 font-sans text-slate-300">INV-2026-0042 (Oldest: KES 85,000)</td>
                            <td className="py-2.5 px-3 text-amber-400 font-semibold">+KES 5,000 Credit</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] text-slate-400 font-sans hover:text-white cursor-pointer underline">
                                REC-9281.pdf
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 text-blue-400">STRIPE_ch_3M48K</td>
                            <td className="py-2.5 px-3 font-sans">O. Adeleke (Unit 12A)</td>
                            <td className="py-2.5 px-3 text-white font-bold">NGN 1,200,000</td>
                            <td className="py-2.5 px-3 font-sans text-slate-300">INV-2026-0089 (Full settlement)</td>
                            <td className="py-2.5 px-3 text-slate-400 font-semibold">NGN 0.00 (Exact)</td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-[11px] text-slate-400 font-sans hover:text-white cursor-pointer underline">
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
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-amber-400" />
                          Owner Income Computation: Zero Manual Typing
                        </div>
                        <p className="mt-1 text-xs text-slate-300 max-w-xl">
                          Owner gross revenue is mathematically aggregated from matched payment rows. Management fees (8%) and approved work order bills are automatically deducted to generate net bank transfers.
                        </p>
                      </div>
                      <div className="bg-emerald-950/60 border border-emerald-800/80 px-3 py-2 rounded-lg text-right">
                        <span className="text-[10px] text-emerald-300 block">Bank Dispatch Status</span>
                        <span className="text-xs font-bold text-emerald-400">All References Validated</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-2">
                          <span className="font-sans font-bold text-white">Landlord: Dr. Geoffrey Kariuki</span>
                          <span>Property: Westlands Ridge</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Gross Collected (Derived):</span>
                          <span className="text-white font-bold">KES 4,850,000</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Management Fee (8%):</span>
                          <span>- KES 388,000</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Maintenance Work Orders (3 bills):</span>
                          <span>- KES 64,500</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Statutory WHT (10% on Fee):</span>
                          <span>- KES 38,800</span>
                        </div>
                        <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm">
                          <span className="text-amber-400 font-sans">Net Payout Transferred:</span>
                          <span className="text-emerald-400">KES 4,358,700</span>
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1 font-sans flex items-center justify-between">
                          <span>EFT Ref: KCB-TRX-882194B</span>
                          <span className="text-emerald-400">Statement Sent via Email/SMS</span>
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-2">
                          <span className="font-sans font-bold text-white">Landlord: Chief A. Okonjo</span>
                          <span>Property: Victoria Crest</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Gross Collected (Derived):</span>
                          <span className="text-white font-bold">NGN 62,400,000</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Management Fee (7.5%):</span>
                          <span>- NGN 4,680,000</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>Generator Servicing & Fuel:</span>
                          <span>- NGN 1,420,000</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>WHT Withheld on Services:</span>
                          <span>- NGN 468,000</span>
                        </div>
                        <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm">
                          <span className="text-amber-400 font-sans">Net Payout Transferred:</span>
                          <span className="text-emerald-400">NGN 55,832,000</span>
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1 font-sans flex items-center justify-between">
                          <span>NIBSS Ref: GTB-PAY-9920194</span>
                          <span className="text-emerald-400">Statement Sent via Email/SMS</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom footer status strip of the mockup */}
              <div className="bg-[#080D1A] px-5 py-3 border-t border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-400 font-mono">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Isolated Tenant DB: Secure
                  </span>
                  <span className="hidden sm:inline-block">•</span>
                  <span className="hidden sm:inline">12 Admin Roles Active</span>
                  <span className="hidden sm:inline-block">•</span>
                  <span className="hidden sm:inline">Audit Log: Append-Only</span>
                </div>
                <div className="text-slate-400 text-[11px]">
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
