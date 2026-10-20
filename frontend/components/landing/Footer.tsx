import React from 'react';
import { Building2, Globe2, ShieldCheck, Lock, Mail, ArrowUp } from 'lucide-react';
import { MARKETS } from './data/landingData';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-100 dark:bg-[#050811] border-t border-slate-200/80 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md">
                <Building2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white font-display">
                TU Properties
              </span>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              The modern multi-market SaaS platform for property management companies, landlords, and institutional trusts worldwide. One organization per market, with its own currency, locale and tax rules. Run your properties, tenants, money, and staff from one audited system.
            </p>

            <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {MARKETS.map((market) => (
                <a
                  key={market.code}
                  href="#markets"
                  title={`${market.country} — ${market.currency}`}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  {market.code}
                </a>
              ))}
            </div>
          </div>

          {/* Col 1: Platform Modules */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono mb-3">
              Core Modules
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Property & Units (100+)
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Leasing & Tenant Portal
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Derived Owner Statements
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  General Ledger & Jurisdiction Tax
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Payment Recording & FIFO Allocation
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Maintenance & Response Tracking
                </a>
              </li>
            </ul>
          </div>

          {/* Col 2: Architecture & Security */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono mb-3">
              Architecture & Trust
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#trust" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Derived Accounting Guarantee
                </a>
              </li>
              <li>
                <a href="#trust" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  13 System Roles &amp; Boundary Control
                </a>
              </li>
              <li>
                <a href="#trust" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Append-Only Audit Logs
                </a>
              </li>
              <li>
                <a href="#saas" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Multi-Tenant DB Isolation
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#saas" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Lease Expiry Schedules (60/30/14/7d)
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  CSV Dry-Run Validation
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Company & Contact */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono mb-3">
              Get Started
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#pricing" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Pricing (14-Day Free Trial)
                </a>
              </li>
              <li>
                <a href="#demo-accounts" className="text-amber-600 dark:text-amber-400 hover:text-amber-500 font-semibold transition-colors flex items-center gap-1.5">
                  <span>Demo / Test Accounts</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Interactive Simulator
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  Technical FAQ
                </a>
              </li>
              <li className="pt-2 text-[11px] text-slate-500 font-mono">
                Inquiries: support@tuhame.co.ke
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <div>
            © {new Date().getFullYear()} TU Properties. All rights reserved. Numbers derived from transactional records.
          </div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Isolated Tenant DB
            </span>
            <span className="text-slate-500">•</span>
            <button
              onClick={scrollToTop}
              className="hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Back to top</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
