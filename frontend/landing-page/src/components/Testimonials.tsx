import React from 'react';
import { TESTIMONIALS } from '../data/landingData';
import { Quote, MapPin, Building, Info } from 'lucide-react';

export const Testimonials: React.FC = () => {
  return (
    <section className="py-24 bg-[#070B14] relative border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <span>African Operational Perspectives</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white font-['Space_Grotesk'] tracking-tight">
            Built for the reality of managing African property.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            How multi-branch companies in Nairobi and Lagos replace manual spreadsheets with derived ledgers.
          </p>
        </div>

        {/* 2 Testimonials Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {TESTIMONIALS.map((item, idx) => (
            <div
              key={idx}
              className="relative flex flex-col justify-between p-8 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-amber-500/40 transition-all shadow-xl"
            >
              <div>
                <Quote className="w-10 h-10 text-amber-400/40 mb-4" />
                <p className="text-sm sm:text-base text-slate-200 leading-relaxed italic">
                  &ldquo;{item.quote}&rdquo;
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-white">
                      {item.author}
                    </h4>
                    <p className="text-xs text-amber-300 font-medium">
                      {item.role} • {item.company}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    {item.city}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-500" />
                    {item.unitsManaged}
                  </span>
                </div>

                {/* MANDATORY LABEL: "Illustrative example" under each testimonial */}
                <div className="pt-2 flex items-center gap-1.5 text-xs text-amber-400/90 font-mono">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span className="bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded text-[11px] font-semibold">
                    {item.mandatoryLabel}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
