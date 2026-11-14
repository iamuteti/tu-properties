import React, { useState } from 'react';
import { FEATURES, FEATURE_CATEGORIES } from './data/landingData';
import { Building2, FileCheck2, ReceiptText, Scale, CreditCard, Wrench, Zap, Users2, BarChart3, ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, ArrowRight, Target, Handshake, ShoppingCart, Boxes, CalendarCheck, FolderLock, BellRing, ClipboardCheck, ServerCog, PiggyBank } from 'lucide-react';

interface FeaturesListProps {
  onOpenTrialModal: () => void;
  onExploreModule: (moduleId: string) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Building2: <Building2 className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  FileCheck2: <FileCheck2 className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  ReceiptText: <ReceiptText className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Scale: <Scale className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  CreditCard: <CreditCard className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Wrench: <Wrench className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Zap: <Zap className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Users2: <Users2 className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  BarChart3: <BarChart3 className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  ShieldCheck: <ShieldCheck className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Target: <Target className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Handshake: <Handshake className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  Boxes: <Boxes className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  CalendarCheck: <CalendarCheck className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  FolderLock: <FolderLock className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  BellRing: <BellRing className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  ClipboardCheck: <ClipboardCheck className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  ServerCog: <ServerCog className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
  PiggyBank: <PiggyBank className="w-5 h-5 text-brand-700 dark:text-brand-300" />,
};

/** Which feature ids belong to each filter tab. */
const CATEGORY_MEMBERS: Record<string, string[]> = {
  operations: ['property-units', 'leasing-portal', 'maintenance-engine', 'security-deposits', 'tenant-requests-moveouts'],
  finance: ['owner-statements', 'finance-accounting', 'payments-allocation', 'reports-analytics'],
  'utilities-workforce': ['utilities-engine', 'hr-payroll', 'approvals-governance', 'documents-legal'],
  growth: ['crm-lead-capture', 'sales-pipeline', 'procurement', 'inventory'],
  platform: ['facilities-bookings', 'notifications-comms', 'platform-administration'],
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
    <section id="features" className="py-24 bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="eyebrow mb-3">
            <span>The 20 Core Modules</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-ink font-display tracking-[-0.02em]">
            Engineered with zero fluff. <span className="text-brand-700 dark:text-brand-300">Every claim backed by real code.</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-ink-muted">Whether managing a boutique 12-unit residential apartment, a gated community, or a 50-story commercial tower — each module scales with zero configuration changes.</p>
        </div>

        {/* Category Filters */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {FEATURE_CATEGORIES.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${activeCategory === cat.id ? 'bg-brand-500 text-white font-bold shadow-sm' : 'bg-surface/80 text-ink-muted hover:text-ink dark:hover:text-white border border-line hover:bg-canvas dark:hover:bg-canvas'}`}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Feature Cards Grid / Rows */}
        <div className="mt-12 space-y-4">
          {filteredFeatures.map((feat) => {
            const isExpanded = expandedId === feat.id;

            return (
              <div key={feat.id} className={`transition-all duration-200 rounded-2xl border ${isExpanded ? 'bg-surface border-brand-500/40 shadow-sm' : 'bg-surface/50 border-line hover:border-line-strong dark:hover:border-line-strong hover:bg-surface/80 dark:hover:bg-surface/80'}`}>
                {/* Header row */}
                <div onClick={() => toggleExpand(feat.id)} className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none">
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-surface-raised border border-brand-500/30 flex items-center justify-center shrink-0 shadow-inner">{ICON_MAP[feat.iconName] || <Building2 className="w-5 h-5 text-brand-700 dark:text-brand-300" />}</div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">MODULE {feat.number}</span>
                        <span className="text-ink-muted">•</span>
                        <span className="text-xs font-semibold text-ink-subtle uppercase tracking-wider">{feat.category}</span>
                        <span className="text-ink-muted hidden sm:inline">•</span>
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-canvas text-ink-muted border border-line-strong">{feat.architectureBadge}</span>
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold text-ink group-hover:text-brand-700 dark:hover:text-brand-300 transition-colors">{feat.title}</h3>
                      <p className="text-xs sm:text-sm text-ink-subtle mt-0.5">{feat.tagline}</p>
                    </div>
                  </div>

                  {/* Concrete proof point pill and accordion chevron */}
                  <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-line">
                    <span className="text-xs text-brand-700/90 dark:text-brand-300/90 font-medium font-mono hidden lg:inline">Click to expand proof points</span>
                    <button className="w-8 h-8 rounded-lg bg-canvas border border-line-strong flex items-center justify-center text-ink-muted hover:text-ink dark:hover:text-white" aria-label="Toggle details">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-700 dark:text-brand-300" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Concrete Proof Point Banner (Always visible or highlighted) */}
                <div className="px-5 sm:px-6 pb-4">
                  <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-start gap-3">
                    <div className="mt-0.5 w-4 h-4 rounded-full bg-brand-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-0.5">Exact Concrete Specification:</div>
                      <p className="text-sm font-semibold text-ink-muted leading-snug">{feat.proofPoint}</p>
                    </div>
                  </div>
                </div>

                {/* Expanded Deep-Dive Details */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-line bg-surface/60 rounded-b-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      {feat.details.map((detail, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl bg-surface/70 border border-line space-y-1">
                          <div className="text-xs font-bold text-brand-700 dark:text-brand-300 flex items-center gap-1.5 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                            {detail.label}
                          </div>
                          <p className="text-xs text-ink-muted leading-relaxed font-sans">{detail.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
                      <span className="text-xs font-mono text-ink-subtle flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        Guaranteed in code & data schema — no manual workarounds needed
                      </span>
                      <button onClick={() => onExploreModule(feat.id)} className="text-xs font-bold text-brand-700 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1.5 cursor-pointer">
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
        <div className="mt-12 text-center p-6 rounded-xl bg-surface border border-line flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left">
            <h4 className="text-base font-semibold text-ink">Every one of these 20 modules is included in all tiers.</h4>
            <p className="text-xs text-ink-muted mt-0.5">No locked modules or surprise add-ons. Full general ledger, payment recording with FIFO allocation, and statutory payroll as dated rulesets.</p>
          </div>
          <button onClick={onOpenTrialModal} className="btn-primary whitespace-nowrap">
            Start 14-day free trial
          </button>
        </div>
      </div>
    </section>
  );
};
