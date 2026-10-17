import React from 'react';
import { NOTIFICATION_SCHEDULE } from './data/landingData';
import {
  Bell,
  Clock,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  CalendarClock,
  Mail,
  Smartphone,
  AlertCircle
} from 'lucide-react';

interface SaaSSectionProps {
  onStartTrial: () => void;
}

export const SaaSSection: React.FC<SaaSSectionProps> = ({ onStartTrial }) => {
  return (
    <section id="saas" className="py-24 bg-white dark:bg-[#080D1A] relative border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <span>SaaS Architecture & Lifecycle</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            Built for enterprise organization governance.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            From 14-day isolated trials to multi-cadence automated lease lifecycle notifications.
          </p>
        </div>

        {/* 3 Pillars of SaaS Governance */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. 14-day free trial */}
          <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4 hover:border-amber-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold font-mono">
              14d
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              14-Day Free Trial Per Organization
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Every newly created organization receives full unconstrained access to all 10 modules, multi-branch provisioning, and live payment gateway hooks. No credit card required to begin.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Full feature availability from minute one</span>
            </div>
          </div>

          {/* 2. Trial-to-paid conversion */}
          <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4 hover:border-amber-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Trial-to-Paid Conversion
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Zero data wipes upon upgrading. All created properties, verified lease agreements, tenant balances, and custom tax rules persist seamlessly into your production subscription.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs font-mono text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>100% data continuity guaranteed</span>
            </div>
          </div>

          {/* 3. Suspension handling */}
          <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-4 hover:border-amber-500/40 transition-all">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Organization Suspension Handling
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Graceful degradation: if a subscription lapses, organizations enter a protected read-only state. Data remains securely preserved and immediately restores the moment payment clears.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Grace period with zero catastrophic data loss</span>
            </div>
          </div>

        </div>

        {/* Automated Notification Engine Showcase */}
        <div className="mt-14 p-6 sm:p-8 rounded-3xl bg-white/90 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-amber-600 dark:text-amber-400">
                <Bell className="w-4 h-4" />
                <span>Automated Email & In-App Notification Schedules</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                Lease Expiry Escalation: 60, 30, 14, and 7-Day Triggers
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              Multi-Channel: Portal + Email + SMS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {NOTIFICATION_SCHEDULE.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 space-y-2 hover:border-amber-500/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                    {item.days}
                  </span>
                  <CalendarClock className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white pt-1">
                  {item.trigger}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">Channels:</span>
                    <span>{item.channel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Recipients:</span>
                    <span className="text-slate-600 dark:text-slate-300">{item.target}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reminders are dispatched deterministically according to your branch time zone.
            </p>
            <button
              onClick={onStartTrial}
              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Provision an organization and test notifications</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </section>
  );
};
