import React, { useState } from 'react';
import { FEATURES, FEATURE_CATEGORIES } from './data/landingData';
import {
  Building2,
  FileCheck2,
  ReceiptText,
  Scale,
  CreditCard,
  Wrench,
  Zap,
  Users2,
  BarChart3,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  Target,
  Handshake,
  ShoppingCart,
  Boxes,
  CalendarCheck,
  FolderLock,
  BellRing,
  ClipboardCheck,
  ServerCog,
  PiggyBank
} from 'lucide-react';

interface FeaturesListProps {
  onOpenTrialModal: () => void;
  onExploreModule: (moduleId: string) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Building2: <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  FileCheck2: <FileCheck2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  ReceiptText: <ReceiptText className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Scale: <Scale className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  CreditCard: <CreditCard className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Wrench: <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Zap: <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Users2: <Users2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  BarChart3: <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  ShieldCheck: <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Target: <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Handshake: <Handshake className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  Boxes: <Boxes className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  CalendarCheck: <CalendarCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  FolderLock: <FolderLock className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  BellRing: <BellRing className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  ClipboardCheck: <ClipboardCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  ServerCog: <ServerCog className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  PiggyBank: <PiggyBank className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
};

/** Which feature ids belong to each filter tab. */
const CATEGORY_MEMBERS: Record<string, string[]> = {
  operations: [
    'property-units',
    'leasing-portal',
    'maintenance-engine',
    'security-deposits',
    'tenant-requests-moveouts'
  ],
  finance: [
    'owner-statements',
    'finance-accounting',
    'payments-allocation',
    'reports-analytics'
  ],
  'utilities-workforce': [
    'utilities-engine',
    'hr-payroll',
    'approvals-governance',
    'documents-legal'
  ],
  growth: ['crm-lead-capture', 'sales-pipeline', 'procurement', 'inventory'],
  platform: ['facilities-bookings', 'notifications-comms', 'platform-administration']
};

export const FeaturesList: React.FC<FeaturesListProps> = ({ onOpenTrialModal, onExploreModule }) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>('property-units');

  const filteredFeatures = FEATURES.filter((feat) => {
    if (activeCategory === 'all') return true;
    return (CATEGORY_MEMBERS[activeCategory] ?? []).includes(feat.id);
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section id="features" className="py-24 bg-slate-50 dark:bg-[#070B14] relative">
      {/* Background decoration */}
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
            <span>The 20 Core Modules</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight">
            Engineered with zero fluff.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">
              Every claim backed by real code.
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            Whether managing a boutique 12-unit residential apartment, a gated community, or a 50-story commercial tower — each module scales with zero configuration changes.
          </p>
        </div>

        {/* Category Filters */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {FEATURE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20'
                  : 'bg-white/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Feature Cards Grid / Rows */}
        <div className="mt-12 space-y-4">
          {filteredFeatures.map((feat) => {
            const isExpanded = expandedId === feat.id;

            return (
              <div
                key={feat.id}
                className={`transition-all duration-200 rounded-2xl border ${
                  isExpanded
                    ? 'bg-white/95 dark:bg-slate-900/95 border-amber-500/40 shadow-xl shadow-amber-500/5'
                    : 'bg-white/50 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-900/80'
                }`}
              >
                {/* Header row */}
                <div
                  onClick={() => toggleExpand(feat.id)}
                  className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-white dark:bg-[#0B1222] border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
                      {ICON_MAP[feat.iconName] || <Building2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                          MODULE {feat.number}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {feat.category}
                        </span>
                        <span className="text-slate-600 hidden sm:inline">•</span>
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                          {feat.architectureBadge}
                        </span>
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:hover:text-amber-300 transition-colors">
                        {feat.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        {feat.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Concrete proof point pill and accordion chevron */}
                  <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-200/80 dark:border-slate-800/80">
                    <span className="text-xs text-amber-600/90 dark:text-amber-400/90 font-medium font-mono hidden lg:inline">
                      Click to expand proof points
                    </span>
                    <button
                      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Concrete Proof Point Banner (Always visible or highlighted) */}
                <div className="px-5 sm:px-6 pb-4">
                  <div className="p-3.5 rounded-xl bg-white dark:bg-[#080D1A] border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                    <div className="mt-0.5 w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-0.5">
                        Exact Concrete Specification:
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-snug">
                        {feat.proofPoint}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Expanded Deep-Dive Details */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-[#0A1020]/60 rounded-b-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      {feat.details.map((detail, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800/90 space-y-1"
                        >
                          <div className="text-xs font-bold text-amber-600 dark:text-amber-300 flex items-center gap-1.5 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {detail.label}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                            {detail.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        Guaranteed in code & data schema — no manual workarounds needed
                      </span>
                      <button
                        onClick={() => onExploreModule(feat.id)}
                        className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Test this in Interactive Engine</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature Bottom CTA */}
        <div className="mt-12 text-center p-6 rounded-2xl bg-gradient-to-r from-white dark:from-slate-900 via-slate-100-[#0E1528] dark:via-[#0E1528] to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Every one of these 20 modules is included in all tiers.
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              No locked modules or surprise add-ons. Full general ledger, payment recording with FIFO allocation, and statutory payroll as dated rulesets.
            </p>
          </div>
          <button
            onClick={onOpenTrialModal}
            className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20 whitespace-nowrap cursor-pointer transition-all"
          >
            Start 14-day free trial
          </button>
        </div>
      </div>
    </section>
  );
};
