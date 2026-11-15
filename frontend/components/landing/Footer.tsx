import React from 'react';
import Link from 'next/link';
import { Building2, ShieldCheck, ArrowUp } from 'lucide-react';
import { MARKETS } from './data/landingData';

/** Footer links are routes, not anchors: deep material lives on its own pages. */
const MODULE_LINKS = ['Property & Units (100+)', 'Leasing & Tenant Portal', 'Derived Owner Statements', 'General Ledger & Jurisdiction Tax', 'Payment Recording & FIFO Allocation', 'Maintenance & Response Tracking'];

const TRUST_LINKS = ['Derived Accounting Guarantee', '13 System Roles & Boundary Control', 'Append-Only Audit Logs', 'Multi-Tenant DB Isolation', 'Lease Expiry Schedules (60/30/14/7d)', 'CSV Dry-Run Validation'];

const linkClass = 'hover:text-brand-700 dark:hover:text-brand-300 transition-colors';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-canvas border-t border-line text-ink-muted text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-700 dark:bg-brand-500 flex items-center justify-center text-white">
                <Building2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="font-semibold text-xl tracking-tight text-ink font-display">TU Properties</span>
            </Link>

            <p className="text-ink-muted text-xs sm:text-sm leading-relaxed max-w-sm">Property management software for owners, agencies and institutional trusts. Plans are priced in KES and USD; each organization keeps its own currency, locale, tax rules and telephone formats. Run your properties, tenants, money, and staff from one audited system.</p>

            <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono text-ink-subtle">
              {MARKETS.map((market) => (
                <Link key={market.code} href="/demo" title={`${market.country} — ${market.currency}`} className="px-2.5 py-1 rounded-md bg-surface border border-line text-ink-muted hover:border-brand-500/40 hover:text-brand-700 dark:hover:text-brand-300 transition-colors">
                  {market.code}
                </Link>
              ))}
            </div>
          </div>

          {/* Col 1: Platform Modules */}
          <div>
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono mb-3">Core Modules</h4>
            <ul className="space-y-2">
              {MODULE_LINKS.map((label) => (
                <li key={label}>
                  <Link href="/features" className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2: Architecture & Security */}
          <div>
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono mb-3">Architecture &amp; Trust</h4>
            <ul className="space-y-2">
              {TRUST_LINKS.map((label) => (
                <li key={label}>
                  <Link href="/security" className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/contact" className={linkClass}>
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Company & Contact */}
          <div>
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono mb-3">Get Started</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/#pricing" className={linkClass}>
                  Pricing (14-Day Free Trial)
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-brand-700 dark:text-brand-300 hover:text-brand-7000 font-semibold transition-colors flex items-center gap-1.5">
                  <span>Demo / Test Accounts</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className={linkClass}>
                  Interactive Simulator
                </Link>
              </li>
              <li>
                <Link href="/#faq" className={linkClass}>
                  Technical FAQ
                </Link>
              </li>
              <li>
                <Link href="/contact" className={linkClass}>
                  Contact
                </Link>
              </li>
              <li className="pt-2 text-[11px] text-ink-subtle font-mono">Inquiries: support@tuhame.co.ke</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-line dark:border-line flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-ink-subtle">
          <div>© {new Date().getFullYear()} TU Properties. All rights reserved. Numbers derived from transactional records.</div>

          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Isolated Tenant DB
            </span>
            <span className="text-ink-subtle">•</span>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer transition-colors">
              <span>Back to top</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
