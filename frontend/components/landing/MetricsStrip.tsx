import React from 'react';
import { METRICS } from './data/landingData';
import { Building, Users, Receipt, Info } from 'lucide-react';

export const MetricsStrip: React.FC = () => {
  return (
    <section className="relative border-y border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0A0F1F]/90 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold">
            Simulated Scale & Engine Load
          </p>
          <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white mt-1">
            Engineered to handle dense African multi-tenant portfolios with zero lag
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Card 1: Units */}
          <div className="relative group bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 text-center transition-all shadow-lg hover:shadow-amber-500/5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Building className="w-6 h-6" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
              {METRICS.units}
            </div>
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">
              Active Units Under Management
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Residential, commercial & mixed-use units
            </div>
          </div>

          {/* Card 2: Tenancies */}
          <div className="relative group bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 text-center transition-all shadow-lg hover:shadow-amber-500/5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
              {METRICS.tenancies}
            </div>
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">
              Active Tenancies & Leases
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              With automated digital renewal transitions
            </div>
          </div>

          {/* Card 3: Invoices */}
          <div className="relative group bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 text-center transition-all shadow-lg hover:shadow-amber-500/5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-6 h-6" />
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
              {METRICS.invoices}
            </div>
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">
              Invoices Processed & Reconciled
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Settled via M-Pesa STK push & Stripe cards
            </div>
          </div>
        </div>

        {/* MANDATORY CAPTION */}
        <div className="mt-6 flex items-center justify-center gap-2 text-center">
          <Info className="w-4 h-4 text-amber-600/80 dark:text-amber-400/80" />
          <span className="text-xs font-medium text-amber-600/90 dark:text-amber-300/90 tracking-wide bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
            {METRICS.caption}
          </span>
        </div>
      </div>
    </section>
  );
};
