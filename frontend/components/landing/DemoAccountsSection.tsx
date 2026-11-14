'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Shield, Building, Wrench, Calculator, ShoppingCart, FileSignature, HardHat, UserRound, ArrowRight, Copy, Check, Sparkles, ExternalLink, Globe2 } from 'lucide-react';
import { MARKET_CODES } from './data/landingData';

interface DemoAccount {
  role: string;
  badge: string;
  email: string;
  description: string;
  icon: React.ElementType;
  /** A resident login opens the portal, not the back office. */
  kind?: 'staff' | 'portal';
}

interface DemoMarket {
  code: string;
  country: string;
  organization: string;
  plan: string;
  currency: string;
  locale: string;
  /** What is in this organization's data — the thing that makes the tab worth clicking. */
  summary: string;
  accounts: DemoAccount[];
}

const DEMO_PASSWORD = 'Password123!';

/**
 * The sandbox logins, by market.
 *
 * Every market is a separate organization with its own currency, locale, tax
 * rules and tenant isolation, so the same screens read differently in each one
 * — a rand invoice in Johannesburg is not a dollar invoice in Boston with the
 * label changed. Kenya is the deep one (Rohi carries the full dataset and every
 * operational role); the other markets are a working organization each, with
 * the administrator and a resident.
 *
 * These addresses are fixed by the seed, not randomized, so they can be printed
 * here and linked to directly.
 */
const ALL_DEMO_MARKETS: DemoMarket[] = [
  {
    code: 'KE',
    country: 'Kenya',
    organization: 'Rohi Estate Management',
    plan: 'Enterprise',
    currency: 'KES',
    locale: 'en-KE',
    summary: 'The full dataset: 100 properties, ~2,500 units, ~1,900 tenants and 15,000+ invoices — plus payroll, utilities, procurement, maintenance, owner statements and approval workflows.',
    accounts: [
      {
        role: 'Organization Administrator',
        badge: 'Full Access',
        email: 'admin@rohi.co.ke',
        description: 'Complete operational control across every module: properties, billing, leases, users and the general ledger.',
        icon: Shield,
      },
      {
        role: 'Property & Operations Manager',
        badge: 'Operations',
        email: 'manager@rohi.co.ke',
        description: 'Tenant management, lease renewals, unit turnover, meter readings and maintenance oversight.',
        icon: Building,
      },
      {
        role: 'Finance & Ledger Accountant',
        badge: 'Accounting',
        email: 'finance@rohi.co.ke',
        description: 'Double-entry general ledger, FIFO waterfall reconciliation, statutory tax and landlord payout batches.',
        icon: Calculator,
      },
      {
        role: 'Maintenance Lead & Triage',
        badge: 'Facilities',
        email: 'maintenance@rohi.co.ke',
        description: 'Emergency work orders, contractor directory, RFQ multi-quotes and asset preventive maintenance schedules.',
        icon: Wrench,
      },
      {
        role: 'Procurement & Vendors',
        badge: 'Procurement',
        email: 'procurement@rohi.co.ke',
        description: 'Purchase requests, RFQ award, purchase orders, goods receipt and supplier bill entry.',
        icon: ShoppingCart,
      },
      {
        role: 'Leasing & Tenant Relations',
        badge: 'Leasing',
        email: 'leasing@rohi.co.ke',
        description: 'Applicant pipeline, renewal offers, move-in handovers and resident request approvals.',
        icon: FileSignature,
      },
      {
        role: 'Field Technician',
        badge: 'Field',
        email: 'technician@rohi.co.ke',
        description: 'Work order execution, asset history — and the technician’s own payslips and leave requests.',
        icon: HardHat,
      },
      {
        role: 'Resident Portal',
        badge: 'Portal',
        email: 'tenant@rohi.co.ke',
        description: 'The resident’s own view: invoices, receipts, documents and repair requests. Nothing else.',
        icon: UserRound,
        kind: 'portal',
      },
    ],
  },
  {
    code: 'US',
    country: 'United States',
    organization: 'Liberty Property Group',
    plan: 'Professional',
    currency: 'USD',
    locale: 'en-US',
    summary: 'A working American organization: US addresses, +1 telephone numbers, an EIN-shaped landlord tax ID and invoices priced in dollars.',
    accounts: [
      {
        role: 'Organization Administrator',
        badge: 'Full Access',
        email: 'admin@liberty-property-group-us.com',
        description: 'Full access to the United States organization — properties, leases, billing, maintenance and the resident portal.',
        icon: Shield,
      },
      {
        role: 'Resident Portal',
        badge: 'Portal',
        email: 'tenant@liberty-property-group-us.com',
        description: 'The tenant’s own view: USD invoices, receipts and repair requests, scoped to one resident.',
        icon: UserRound,
        kind: 'portal',
      },
    ],
  },
  {
    code: 'GB',
    country: 'United Kingdom',
    organization: 'Thames Property Group',
    plan: 'Professional',
    currency: 'GBP',
    locale: 'en-GB',
    summary: 'The same product in sterling: UK addresses and telephone formats, and a landlord whose tax ID is a UK shape rather than a Kenyan one.',
    accounts: [
      {
        role: 'Organization Administrator',
        badge: 'Full Access',
        email: 'admin@thames-property-group-gb.co.uk',
        description: 'Full access to the United Kingdom organization — properties, leases, billing, maintenance and the resident portal.',
        icon: Shield,
      },
      {
        role: 'Resident Portal',
        badge: 'Portal',
        email: 'tenant@thames-property-group-gb.co.uk',
        description: 'The tenant’s own view: GBP invoices, receipts and repair requests, scoped to one resident.',
        icon: UserRound,
        kind: 'portal',
      },
    ],
  },
  {
    code: 'AU',
    country: 'Australia',
    organization: 'Sydney Property Group',
    plan: 'Professional',
    currency: 'AUD',
    locale: 'en-AU',
    summary: 'A third currency and a third calendar: Australian addresses, telephone formats and landlord tax IDs, with the same screens behind them.',
    accounts: [
      {
        role: 'Organization Administrator',
        badge: 'Full Access',
        email: 'admin@sydney-property-group-au.com.au',
        description: 'Full access to the Australian organization — properties, leases, billing, maintenance and the resident portal.',
        icon: Shield,
      },
      {
        role: 'Resident Portal',
        badge: 'Portal',
        email: 'tenant@sydney-property-group-au.com.au',
        description: 'The tenant’s own view: AUD invoices, receipts and repair requests, scoped to one resident.',
        icon: UserRound,
        kind: 'portal',
      },
    ],
  },
];

/**
 * The demo market tabs, limited to the markets this deployment offers.
 *
 * Kenya and the United States are what the seeder creates (`DEMO_COUNTRIES`
 * defaults to `KE,US`), so those are the only tabs whose logins actually work.
 * The other entries stay in the list as dormant data: switching a market on
 * needs no rewrite here, only that market in `SUPPORTED_MARKET_CODES`.
 */
const OFFERED_DEMO_MARKETS = ALL_DEMO_MARKETS.filter((market) => MARKET_CODES.includes(market.code));

export const DEMO_MARKETS: DemoMarket[] = OFFERED_DEMO_MARKETS.length > 0 ? OFFERED_DEMO_MARKETS : ALL_DEMO_MARKETS.slice(0, 1);

/**
 * The platform super admin is deliberately not advertised here — a public
 * landing page should not hand out the account that can see every tenant.
 */
const SHOW_SUPER_ADMIN = false;

export const DemoAccountsSection: React.FC = () => {
  const [activeCode, setActiveCode] = useState(DEMO_MARKETS[0].code);
  const [copied, setCopied] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const active = DEMO_MARKETS.find((market) => market.code === activeCode) ?? DEMO_MARKETS[0];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // Arrow keys move between tabs, as a tab strip is expected to.
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = DEMO_MARKETS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    setActiveCode(DEMO_MARKETS[next].code);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="demo-accounts" className="py-24 bg-canvas relative border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider mb-3">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Instant Sandbox & Demo Access</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight">Explore the live system with pre-seeded demo roles.</h2>
          <p className="mt-4 text-base sm:text-lg text-ink-muted">No registration needed. Pick a market, choose a seeded persona, and test realistic workflows — each one is a separate organization with its own currency, locale and tax rules.</p>
        </div>

        {/* Market Tabs */}
        <div role="tablist" aria-label="Demo markets" className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {DEMO_MARKETS.map((market, index) => {
            const isActive = market.code === active.code;
            return (
              <button
                key={market.code}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                id={`demo-tab-${market.code}`}
                aria-selected={isActive}
                aria-controls={`demo-panel-${market.code}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveCode(market.code)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`group text-left px-4 py-3 rounded-xl border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${isActive ? 'bg-surface-raised border-brand-500/60 shadow-sm -translate-y-0.5' : 'bg-surface/60 dark:bg-surface-raised/60 border-line hover:border-brand-500/40 hover:bg-surface dark:hover:bg-surface-raised'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex h-8 w-11 items-center justify-center rounded-lg border font-mono text-[11px] font-bold tracking-wider ${isActive ? 'bg-brand-500/10 border-brand-500/30 text-brand-700 dark:text-brand-300' : 'bg-canvas border-line text-ink-subtle'}`}>{market.code}</span>
                  <span className={`text-sm font-bold leading-tight ${isActive ? 'text-ink' : 'text-ink-muted'}`}>{market.country}</span>
                </div>
                <div className="mt-1.5 text-[11px] font-medium text-ink-subtle truncate">
                  {market.organization} · {market.currency}
                </div>
              </button>
            );
          })}
        </div>

        {/* Market Panels
 Every panel is rendered, and the inactive ones are hidden rather
 than unmounted — so a login for every market is in the page source
 rather than only in the JavaScript bundle, and switching tabs
 costs nothing. */}
        {DEMO_MARKETS.map((market) => {
          const isActive = market.code === active.code;
          return (
            <div key={market.code} role="tabpanel" id={`demo-panel-${market.code}`} aria-labelledby={`demo-tab-${market.code}`} hidden={!isActive} className={isActive ? 'mt-10' : 'hidden'}>
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-line">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                    <Globe2 className="w-4 h-4" />
                    <span>{market.country}</span>
                  </div>
                  <h3 className="mt-2 text-xl sm:text-2xl font-bold text-ink font-display">{market.organization}</h3>
                  <p className="mt-2 text-sm text-ink-muted leading-relaxed">{market.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{market.plan}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wide text-ink-muted">{market.currency}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wide text-ink-muted">{market.locale}</span>
                </div>
              </div>

              {/* Accounts */}
              <div className={`mt-8 grid grid-cols-1 gap-6 ${market.accounts.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
                {market.accounts.map((account) => {
                  const Icon = account.icon;
                  const isCopied = copied === account.email;
                  const isPortal = account.kind === 'portal';

                  return (
                    <div key={account.email} className={`group relative flex flex-col justify-between p-6 rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-sm  ${isPortal ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/90 dark:border-emerald-900/60 hover:border-emerald-400/50' : 'bg-surface-raised border-line/90 dark:border-line hover:border-brand-500/40'}`}>
                      <div>
                        {/* Card Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isPortal ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-brand-500/10 border-brand-500/25 text-brand-700 dark:text-brand-300'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-canvas text-ink-muted border border-line dark:border-line-strong">{account.badge}</span>
                        </div>

                        <h4 className="text-base font-bold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">{account.role}</h4>
                        <div className="text-[11px] font-medium text-brand-700 dark:text-brand-300 mt-0.5 mb-2">{market.organization}</div>
                        <p className="text-xs text-ink-subtle leading-relaxed mb-4">{account.description}</p>
                      </div>

                      {/* Credentials & Quick Action */}
                      <div className="space-y-3 pt-3 border-t border-line font-mono text-xs">
                        <div className="bg-canvas p-2.5 rounded-lg border border-line space-y-1.5">
                          <div className="flex items-center justify-between text-ink-subtle text-[11px]">
                            <span>Email:</span>
                            <button onClick={() => handleCopy(account.email)} className="text-ink-muted hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-sans text-[10px]" title="Copy email">
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
                          <div className="text-ink font-semibold truncate select-all">{account.email}</div>

                          <div className="flex items-center justify-between text-ink-subtle text-[11px] pt-1 border-t border-line">
                            <span>Password:</span>
                            <span className="text-ink-muted font-sans text-[11px] font-semibold">{DEMO_PASSWORD}</span>
                          </div>
                        </div>

                        {/* Direct Login Link */}
                        <Link href={`/auth/login?email=${encodeURIComponent(account.email)}`} className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${isPortal ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-brand-500 hover:bg-brand-400 text-white'}`}>
                          <span>Log in as this role</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Bottom Banner with Super Admin & Registration link */}
        {SHOW_SUPER_ADMIN && (
          <div className="mt-10 p-5 rounded-2xl bg-surface-raised border border-line flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">Looking for Platform Super Admin or custom setup?</h4>
                <p className="text-xs text-ink-subtle">
                  Platform Super Admin credentials: <code className="font-mono text-brand-700 dark:text-brand-300">admin@tuproperties.co.ke</code> / <code className="font-mono text-brand-700 dark:text-brand-300">Password123!</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link href="/auth/login" className="text-xs font-bold px-4 py-2.5 rounded-lg text-ink-muted hover:text-ink dark:hover:text-white bg-canvas hover:bg-line dark:hover:bg-line border border-line dark:border-line-strong transition-all flex items-center gap-1.5">
                <span>Go to Sign In Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-ink-subtle">
          Every login above uses the password <span className="font-mono font-semibold text-ink-muted">{DEMO_PASSWORD}</span>. Market tabs appear when the sandbox is seeded with those jurisdictions.
        </p>
      </div>
    </section>
  );
};
