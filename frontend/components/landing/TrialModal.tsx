import React, { useState } from 'react';
import { X, Building2, CheckCircle2, ArrowRight, ShieldCheck, Lock } from 'lucide-react';

interface TrialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SignupSuccess {
  organizationId: string;
  name: string;
  slug: string;
  adminEmail: string;
  plan: string;
  trialEndsAt: string | null;
}

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003';

const inputClass =
  'w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:border-amber-400 focus:outline-none';
const labelClass =
  'text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1';

/**
 * Real trial signup — POSTs to the public `POST /platform/signup`, which creates
 * org + first admin + 14-day TRIALING subscription in one transaction.
 *
 * This replaced a simulated provisioning animation (fake org id after a timeout).
 * A button that pretends to create an account is worse than a form that can fail:
 * every error path here surfaces the server's answer — a taken email points at
 * sign-in, a rate limit says to wait, validation names the field.
 */
export const TrialModal: React.FC<TrialModalProps> = ({ isOpen, onClose }) => {
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<SignupSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEmailTaken(false);
    try {
      const res = await fetch(`${API_BASE}/platform/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          adminEmail: workEmail.trim(),
          adminFirstName: firstName.trim(),
          adminLastName: lastName.trim(),
          adminPassword: password,
        }),
      });
      const data = (await res.json()) as
        | SignupSuccess
        | { message: string | string[] };
      if (!res.ok) {
        const message = Array.isArray(
          (data as { message?: unknown }).message,
        )
          ? (data as { message: string[] }).message.join(', ')
          : ((data as { message?: string }).message ?? 'Signup failed');
        // An address that already owns an account is a sign-in hint, not a wall.
        if (res.status === 409 && /email/i.test(message)) {
          setEmailTaken(true);
        }
        setError(message);
        return;
      }
      setCreated(data as SignupSuccess);
    } catch {
      setError('Could not reach the server. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCreated(null);
    setError(null);
    setEmailTaken(false);
    setOrgName('');
    setFirstName('');
    setLastName('');
    setWorkEmail('');
    setPassword('');
    onClose();
  };

  const trialEnd =
    created?.trialEndsAt != null
      ? new Date(created.trialEndsAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 dark:bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0A1020] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!created ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-display">
                  Start 14-Day Free Trial
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No credit card required. Your organization is created
                  immediately.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className={labelClass} htmlFor="trial-org">
                  Organization / Agency Name
                </label>
                <input
                  id="trial-org"
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g. Apex Crest Property Managers"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="trial-first">
                    First Name
                  </label>
                  <input
                    id="trial-first"
                    type="text"
                    required
                    maxLength={60}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="trial-last">
                    Last Name
                  </label>
                  <input
                    id="trial-last"
                    type="text"
                    required
                    maxLength={60}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="trial-email">
                  Work Email Address
                </label>
                <input
                  id="trial-email"
                  type="email"
                  required
                  placeholder="name@company.co.ke"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="trial-password">
                  Password
                </label>
                <input
                  id="trial-password"
                  type="password"
                  required
                  minLength={10}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                  {error}{' '}
                  {emailTaken && (
                    <a
                      href="/auth/login"
                      className="underline font-semibold hover:text-slate-900 dark:hover:text-white"
                    >
                      Sign in instead
                    </a>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  'Creating your workspace…'
                ) : (
                  <>
                    Create My Workspace <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Lock className="w-3.5 h-3.5" />
                Trial lasts 14 calendar days on the STARTER plan.
              </p>
            </form>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
              {created.name} is live
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Workspace <span className="text-amber-600 dark:text-amber-400 font-bold">{created.slug}</span>
              {trialEnd != null && (
                <> — trial runs to <span className="text-slate-700 dark:text-slate-200 font-semibold">{trialEnd}</span></>
              )}
              . Sign in with <span className="text-slate-700 dark:text-slate-200">{created.adminEmail}</span> and
              the password you just chose.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/auth/login"
                className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300"
              >
                Sign In to Your Workspace
              </a>
              <button
                onClick={handleReset}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-6 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Done
              </button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5" />
              Your data is isolated to your organization.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
