import React, { useState } from 'react';
import { FAQS } from './data/landingData';
import { ChevronDown, ChevronUp, HelpCircle, CheckCircle2 } from 'lucide-react';

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-24 bg-canvas relative border-b border-line">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider mb-3">
            <span>Direct Answers</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight">Frequently Asked Questions</h2>
          <p className="mt-4 text-base sm:text-lg text-ink-muted">Clear, technical answers to the 5 questions property managers ask us first.</p>
        </div>

        {/* 4 Accordion Items */}
        <div className="mt-14 space-y-4">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;

            return (
              <div key={idx} className={`rounded-2xl border transition-all ${isOpen ? 'bg-surface/90 border-brand-500/40 shadow-sm' : 'bg-surface/40 border-line hover:border-line-strong dark:hover:border-line-strong'}`}>
                <button onClick={() => toggle(idx)} className="w-full text-left p-6 sm:p-7 flex items-center justify-between gap-4 cursor-pointer select-none">
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0 font-mono text-xs font-bold">Q{idx + 1}</div>
                    <h3 className="text-base sm:text-lg font-bold text-ink">{faq.question}</h3>
                  </div>

                  <div className="w-7 h-7 rounded-lg bg-canvas flex items-center justify-center text-ink-muted shrink-0">{isOpen ? <ChevronUp className="w-4 h-4 text-brand-700 dark:text-brand-300" /> : <ChevronDown className="w-4 h-4" />}</div>
                </button>

                {isOpen && (
                  <div className="px-6 sm:px-7 pb-7 pt-1 border-t border-line">
                    <p className="text-sm sm:text-base text-ink-muted leading-relaxed font-sans">{faq.answer}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-mono text-brand-700/90 dark:text-brand-300/90">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Validated against the seeded demo organizations</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
