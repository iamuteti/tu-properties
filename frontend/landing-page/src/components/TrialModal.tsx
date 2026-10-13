import React, { useState } from 'react';
import { X, Building2, CheckCircle2, ArrowRight, ShieldCheck, Sparkles, Lock, MapPin } from 'lucide-react';

interface TrialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TrialModal: React.FC<TrialModalProps> = ({ isOpen, onClose }) => {
  const [orgName, setOrgName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [primaryHub, setPrimaryHub] = useState('Nairobi, Kenya');
  const [unitCount, setUnitCount] = useState('51 - 200 Units');
  const [isProvisioned, setIsProvisioned] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setIsProvisioned(true);
    }, 800);
  };

  const handleReset = () => {
    setIsProvisioned(false);
    setOrgName('');
    setWorkEmail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0A1020] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!isProvisioned ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-['Space_Grotesk']">
                  Start 14-Day Free Trial
                </h3>
                <p className="text-xs text-slate-400">
                  No credit card required. Full 10-module multi-branch access.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Organization / Agency Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Crest Property Managers"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Work Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.co.ke"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Primary African Hub
                  </label>
                  <select
                    value={primaryHub}
                    onChange={(e) => setPrimaryHub(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Nairobi, Kenya">Nairobi, Kenya (KRA preset)</option>
                    <option value="Lagos, Nigeria">Lagos, Nigeria (FIRS preset)</option>
                    <option value="Johannesburg, South Africa">Johannesburg, South Africa (SARS)</option>
                    <option value="Kigali, Rwanda">Kigali, Rwanda (RRA preset)</option>
                    <option value="Accra, Ghana">Accra, Ghana (GRA preset)</option>
                    <option value="Other">Other African Territory</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Portfolio Units
                  </label>
                  <select
                    value={unitCount}
                    onChange={(e) => setUnitCount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="1 - 50 Units">1 - 50 Units (Starter scale)</option>
                    <option value="51 - 200 Units">51 - 200 Units (Agency scale)</option>
                    <option value="201 - 1,000 Units">201 - 1,000 Units (Mid-tier)</option>
                    <option value="1,000+ Units">1,000+ Units (Enterprise)</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1 font-mono">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Tenant Isolation: Dedicated Partition Created</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Trial lasts 14 calendar days. Converts to paid subscription without data wipe.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 transition-all"
              >
                {loading ? (
                  <span>Provisioning Organization Workspace...</span>
                ) : (
                  <>
                    <span>Create Isolated Trial Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-bold text-white font-['Space_Grotesk']">
              Organization Provisioned!
            </h3>

            <p className="text-sm text-slate-300">
              Welcome to TU Properties. Your isolated tenant environment for{' '}
              <strong className="text-amber-300">{orgName || 'Your Agency'}</strong> is active.
            </p>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left font-mono text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Tenant Workspace ID:</span>
                <span className="text-amber-400 font-bold">org_trial_99214b</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Trial Expiration:</span>
                <span className="text-emerald-400">14 Days Remaining</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Primary Hub:</span>
                <span className="text-white">{primaryHub}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tax Preset Loaded:</span>
                <span className="text-white font-semibold">Active & Mapped</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleReset}
                className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
              >
                Enter Organization Dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
