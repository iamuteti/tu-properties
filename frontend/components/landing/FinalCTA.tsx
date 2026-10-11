import React from 'react';
import { ArrowRight, CheckCircle, ShieldCheck, Sparkles, Building2 } from 'lucide-react';

interface FinalCTAProps {
  onStartTrial: () => void;
  onSeeHowItWorks: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onStartTrial, onSeeHowItWorks }) => {
  return (
    <section className="py-24 bg-[#080D1A] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="rounded-3xl p-8 sm:p-14 bg-gradient-to-b from-[#0F172E] via-[#0B1124] to-[#0A0F1E] border border-amber-500/30 text-center shadow-2xl">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider mb-4">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>Launch Your Organization Today</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white font-display tracking-tight max-w-2xl mx-auto">
            Ready to run your property portfolio from one unified system?
          </h2>

          <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Eliminate manual calculations, dispatch automated owner statements, and collect rent via M-Pesa STK push and Stripe in minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onStartTrial}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-slate-950 font-extrabold text-base bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-xl shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Start 14-day free trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onSeeHowItWorks}
              className="w-full sm:w-auto px-7 py-4 rounded-xl text-slate-200 hover:text-white font-bold text-base bg-slate-900 hover:bg-slate-800 border border-slate-700 shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Explore Interactive Engine</span>
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              14-day trial per organization
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
              Zero data wipes upon conversion
            </span>
          </div>

        </div>
      </div>
    </section>
  );
};
