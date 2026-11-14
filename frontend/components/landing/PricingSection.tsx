'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PRICING_PLANS, PRICING_CURRENCIES, type PricingCurrency } from './data/landingData';
import { Check, ArrowRight } from 'lucide-react';

interface PlanPrice {
  monthly?: number;
  annual?: number;
}

interface DisplayPlan {
  id: string;
  name: string;
  badge: string;
  description: string;
  pricing: Record<string, PlanPrice>;
  features: string[];
  highlighted: boolean;
  cta: string;
}

interface PricingSectionProps {
  onStartTrial: (plan?: string, currency?: string) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003';

const CURRENCY_SYMBOLS: Record<string, string> = {
  KES: 'KES ',
  USD: '$',
};

export const PricingSection: React.FC<PricingSectionProps> = ({ onStartTrial }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [currency, setCurrency] = useState<PricingCurrency>(PRICING_CURRENCIES[0]);
  const [plans, setPlans] = useState<DisplayPlan[]>([]);

  /**
   * The product bills in two currencies, so both are always offered. The
   * visitor's IP used to be sent to `ipapi.co` to decide this; with two
   * currencies there is nothing to decide, and the call only leaked their
   * address to a third party.
   */
  const allowedCurrencies = PRICING_CURRENCIES;

  const activeCurrency: PricingCurrency = (allowedCurrencies as readonly string[]).includes(currency) ? currency : (allowedCurrencies[0] as PricingCurrency);

  // Fetch plans from backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/plans`);
        if (!res.ok) throw new Error('failed');
        const data: {
          id: string;
          name: string;
          description?: string;
          isActive: boolean;
          prices: Record<string, number>;
          features: string[];
          isPopular: boolean;
        }[] = await res.json();
        if (cancelled) return;
        const mapped: DisplayPlan[] = data
          .filter((p) => p.isActive !== false && String(p.name).toLowerCase() !== 'enterprise')
          .map((p) => {
            const prices = p.prices || {};
            const price = Number(prices[activeCurrency] ?? prices.USD ?? 0);
            return {
              id: p.id ?? p.name,
              name: p.name,
              badge: p.isPopular ? 'Popular' : 'Plan',
              description: p.description || '',
              pricing: { [activeCurrency]: { monthly: price, annual: price } },
              features: Array.isArray(p.features) ? p.features : [],
              highlighted: !!p.isPopular,
              cta: 'Start free trial',
            };
          });
        const enterprise = PRICING_PLANS.find((pl) => pl.name.toLowerCase() === 'enterprise');
        if (enterprise)
          mapped.push({
            ...enterprise,
            id: 'enterprise',
          } as unknown as DisplayPlan);
        setPlans(mapped.length ? mapped : (PRICING_PLANS as unknown as DisplayPlan[]));
      } catch {
        if (!cancelled) setPlans(PRICING_PLANS as unknown as DisplayPlan[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCurrency]);

  return (
    <section id="pricing" className="py-24 bg-canvas relative border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Transparent Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight">Predictable plans for growing portfolios.</h2>
          <p className="mt-4 text-base sm:text-lg text-ink-muted">
            Every plan includes our <strong>14-day free trial, no card required</strong>. Complete access from day one.
          </p>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex items-center p-1 bg-surface border border-line rounded-xl">
            <button onClick={() => setBillingCycle('monthly')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${billingCycle === 'monthly' ? 'bg-brand-500 text-white shadow-md' : 'text-ink-subtle hover:text-ink dark:hover:text-white'}`}>
              Monthly Billing
            </button>
            <button onClick={() => setBillingCycle('annual')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${billingCycle === 'annual' ? 'bg-brand-500 text-white shadow-md' : 'text-ink-subtle hover:text-ink dark:hover:text-white'}`}>
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-mono font-bold">Save 20%</span>
            </button>
          </div>
          {allowedCurrencies.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1 p-1 bg-surface border border-line rounded-xl">
              {allowedCurrencies.map((curr) => (
                <button key={curr} onClick={() => setCurrency(curr)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${activeCurrency === curr ? 'bg-canvas text-brand-700 dark:text-brand-300 border border-brand-500/30' : 'text-ink-subtle hover:text-ink dark:hover:text-white'}`}>
                  {curr}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {plans.map((plan, idx) => {
            const planPricing = plan.pricing[activeCurrency] ?? plan.pricing.USD ?? { monthly: 0, annual: 0 };
            const price = billingCycle === 'annual' ? planPricing.annual : planPricing.monthly;
            return (
              <div key={idx} className={`relative flex flex-col justify-between p-8 rounded-xl transition-colors ${plan.highlighted ? 'bg-surface-raised border-2 border-brand-500 lg:-translate-y-2' : 'bg-surface/60 border border-line hover:border-line-strong'}`}>
                {plan.highlighted && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-brand-700 dark:bg-brand-500 text-white font-semibold text-[11px] uppercase tracking-wider">Most Popular for Property Agencies</div>}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-ink">{plan.name}</h3>
                    <span className="text-[11px] font-mono text-brand-700 dark:text-brand-300 font-semibold px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">{plan.badge}</span>
                  </div>
                  <p className="text-xs text-ink-subtle min-h-[36px]">{plan.description}</p>
                  <div className="mt-6 pt-6 border-t border-line">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-extrabold text-ink font-display">
                        {CURRENCY_SYMBOLS[activeCurrency] ?? ''}
                        {(price ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-ink-subtle font-mono">/month {billingCycle === 'annual' && '(billed annually)'}</span>
                    </div>
                  </div>
                  <div className="mt-8 space-y-3">
                    <span className="text-[11px] font-bold text-ink-subtle uppercase tracking-wider block font-mono">What&apos;s Included:</span>
                    <ul className="space-y-2.5">
                      {plan.features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2.5 text-xs text-ink-muted">
                          <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-line">
                  <button onClick={() => onStartTrial(plan.id, activeCurrency)} className={`w-full py-3.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${plan.highlighted ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-sm' : 'bg-canvas hover:bg-line dark:hover:bg-line text-ink border border-line-strong'}`}>
                    <span>{plan.cta}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <p className="mt-2 text-center text-[10px] text-ink-subtle font-mono">14-day free trial, no card required</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-ink-subtle">
          Buying through procurement, or need an invoice rather than a card?{' '}
          <Link href="/contact" className="font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-7000 transition-colors">
            Talk to us
          </Link>
        </p>
      </div>
    </section>
  );
};
