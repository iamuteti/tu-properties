import React, { useState } from 'react';
import { PRICING_PLANS, PRICING_CURRENCIES, type PricingCurrency } from './data/landingData';
import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface PricingSectionProps {
  onStartTrial: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onStartTrial }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [currency, setCurrency] = useState<PricingCurrency>('USD');

  /**
   * The switcher only offers the currencies `NEXT_PUBLIC_LANDING_CURRENCIES`
   * enables. If the selected one is no longer on the list, fall back to the
   * first that is — so the card never shows a currency the switcher has
   * dropped.
   */
  const activeCurrency: PricingCurrency = PRICING_CURRENCIES.includes(currency)
    ? currency
    : PRICING_CURRENCIES[0];

  const CURRENCY_SYMBOLS: Record<PricingCurrency, string> = {
    USD: '$',
    KES: 'KES ',
    ZAR: 'R ',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'A$',
    EUR: '€',
    INR: '₹',
    JPY: '¥',
    CNY: 'CN¥',
    KRW: '₩',
    BRL: 'R$',
    MXN: 'MX$',
    AED: 'AED '
  };

  return (
    <section id="pricing" className="py-24 bg-white dark:bg-[#080D1A] relative border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Transparent Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            Predictable plans for growing portfolios.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            Every plan includes our <strong>14-day free trial, no card required</strong>. Complete access from day one.
          </p>
        </div>

        {/* Currency & Billing Cycle Controls */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          
          {/* Billing Cycle Toggle */}
          <div className="flex items-center p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                billingCycle === 'annual'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-mono font-bold">
                Save 20%
              </span>
            </button>
          </div>

          {/* Currency Switcher */}
          <div className="flex flex-wrap items-center justify-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            {PRICING_CURRENCIES.map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  activeCurrency === curr
                    ? 'bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-300 border border-amber-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {PRICING_PLANS.map((plan, idx) => {
            const planPricing = plan.pricing[activeCurrency] ?? plan.pricing.USD;
            const price = billingCycle === 'annual' ? planPricing.annual : planPricing.monthly;

            return (
              <div
                key={idx}
                className={`relative flex flex-col justify-between p-8 rounded-3xl transition-all ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-white dark:from-slate-900 via-slate-100-[#0D152A] dark:via-[#0D152A] to-white dark:to-slate-900 border-2 border-amber-400 shadow-2xl shadow-amber-500/10 lg:-translate-y-2'
                    : 'bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-extrabold text-[11px] uppercase tracking-wider shadow-md">
                    Most Popular for Property Agencies
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {plan.name}
                    </h3>
                    <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      {plan.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 min-h-[36px]">
                    {plan.description}
                  </p>

                  <div className="mt-6 pt-6 border-t border-slate-200/80 dark:border-slate-800/80">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white font-display">
                        {CURRENCY_SYMBOLS[activeCurrency]}
                        {price.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        /month {billingCycle === 'annual' && '(billed annually)'}
                      </span>
                    </div>
                  </div>

                  {/* Feature Checkmarks */}
                  <div className="mt-8 space-y-3">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-mono">
                      What&apos;s Included:
                    </span>
                    <ul className="space-y-2.5">
                      {plan.features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                          <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={onStartTrial}
                    className={`w-full py-3.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      plan.highlighted
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/25'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <span>{plan.cta}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <p className="mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    14-day free trial, no card required
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
