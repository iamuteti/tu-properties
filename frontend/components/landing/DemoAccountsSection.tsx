'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Shield,
  Building,
  Wrench,
  Calculator,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface DemoAccount {
  role: string;
  badge: string;
  email: string;
  password: string;
  organization: string;
  description: string;
  icon: React.ElementType;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'Organization Administrator',
    badge: 'Full Access',
    email: 'admin@westhill.co.ke',
    password: 'Password123!',
    organization: 'Westhill Properties (Professional)',
    description: 'Complete operational control across all 10 modules: properties, billing, leases, users & general ledger.',
    icon: Shield
  },
  {
    role: 'Property & Operations Manager',
    badge: 'Operations',
    email: 'manager@westhill.co.ke',
    password: 'Password123!',
    organization: 'Westhill Properties (Professional)',
    description: 'Tenant management, lease renewals, unit turnover, meter readings & maintenance oversight.',
    icon: Building
  },
  {
    role: 'Finance & Ledger Accountant',
    badge: 'Accounting',
    email: 'accountant@westhill.co.ke',
    password: 'Password123!',
    organization: 'Westhill Properties (Professional)',
    description: 'Double-entry general ledger, FIFO waterfall reconciliation, statutory tax, and landlord payout batches.',
    icon: Calculator
  },
  {
    role: 'Maintenance Lead & Triage',
    badge: 'Facilities',
    email: 'maintenance@rohi.co.ke',
    password: 'Password123!',
    organization: 'Rohi Estate Management (Enterprise)',
    description: 'Emergency work orders, contractor directory, RFQ multi-quotes, and asset preventive maintenance schedules.',
    icon: Wrench
  }
];

export const DemoAccountsSection: React.FC = () => {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <section id="demo-accounts" className="py-24 bg-slate-100/70 dark:bg-[#070B14] relative border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Instant Sandbox & Demo Access</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            Explore the live system with pre-seeded demo roles.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            No registration needed. Choose any seeded operational persona below to log in directly and test realistic workflows.
          </p>
        </div>

        {/* Demo Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {DEMO_ACCOUNTS.map((account) => {
            const Icon = account.icon;
            const isCopied = copiedEmail === account.email;

            return (
              <div
                key={account.email}
                className="group relative flex flex-col justify-between p-6 rounded-2xl bg-white dark:bg-[#0C1222] border border-slate-200/90 dark:border-slate-800 hover:border-amber-500/40 transition-all duration-200 shadow-xl hover:shadow-2xl hover:-translate-y-1"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {account.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    {account.role}
                  </h3>
                  <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5 mb-2">
                    {account.organization}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                    {account.description}
                  </p>
                </div>

                {/* Credentials & Quick Action */}
                <div className="space-y-3 pt-3 border-t border-slate-200/80 dark:border-slate-800/80 font-mono text-xs">
                  <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>Email:</span>
                      <button
                        onClick={() => handleCopy(account.email)}
                        className="text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 cursor-pointer font-sans text-[10px]"
                        title="Copy email"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-slate-900 dark:text-white font-semibold truncate select-all">
                      {account.email}
                    </div>

                    <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span>Password:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-sans text-[11px] font-semibold">
                        Password123!
                      </span>
                    </div>
                  </div>

                  {/* Direct Login Link */}
                  <Link
                    href={`/auth/login?email=${encodeURIComponent(account.email)}`}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <span>Log in as this role</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner with Super Admin & Registration link */}
        <div className="mt-10 p-5 rounded-2xl bg-white dark:bg-[#0C1222] border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Looking for Platform Super Admin or custom setup?
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Platform Super Admin credentials: <code className="font-mono text-amber-600 dark:text-amber-400">admin@tuproperties.co.ke</code> / <code className="font-mono text-amber-600 dark:text-amber-400">Password123!</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/auth/login"
              className="text-xs font-bold px-4 py-2.5 rounded-lg text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5"
            >
              <span>Go to Sign In Page</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
