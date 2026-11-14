import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Building2 } from 'lucide-react';

interface FinalCTAProps {
  onStartTrial: () => void;
}

/**
 * The page's last signup prompt. One button — the secondary "explore the engine"
 * exit that used to sit here duplicated the hero and sent visitors back up the
 * page. Procurement and invoicing go to /contact instead.
 *
 * Deliberately the plainest block on the page: a hairline panel, one fill, one
 * action. The previous version had a blurred amber glow behind a three-stop
 * gradient panel with a gradient button on top of it, which read as decoration
 * rather than as a decision.
 */
export const FinalCTA: React.FC<FinalCTAProps> = ({ onStartTrial }) => {
  return (
    <section className="py-24 bg-canvas">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-line bg-surface p-8 sm:p-14 text-center">
          <div className="inline-flex eyebrow mb-5">
            <Building2 className="w-4 h-4" />
            <span>Launch Your Organization Today</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-ink font-display tracking-[-0.02em] max-w-2xl mx-auto">Ready to run your property portfolio from one system?</h2>

          <p className="mt-5 text-base sm:text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed">Rent, invoices, owner statements and staff records in one audited ledger — by card, bank transfer, M-Pesa, cash, cheque, or paid straight to the owner.</p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3">
            <button onClick={onStartTrial} className="btn-primary w-full sm:w-auto">
              <span>Start 14-day free trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-xs text-ink-subtle">
              Need procurement review or an invoice instead of a card?{' '}
              <Link href="/contact" className="font-medium text-brand-700 dark:text-brand-300 hover:underline">
                Talk to us
              </Link>
            </p>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-subtle font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              14-day trial per organization
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              Zero data wipes upon conversion
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
