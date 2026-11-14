import React, { useState, useEffect } from 'react';
import { X, Building2, CheckCircle2, ArrowRight, ShieldCheck, Lock, Mail, RefreshCw } from 'lucide-react';
import { platformApi, authApi } from '@/lib/api';

interface TrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan?: string;
  selectedCurrency?: string;
}

interface SignupSuccess {
  organizationId: string;
  name: string;
  slug: string;
  adminEmail: string;
  plan: string;
  trialEndsAt: string | null;
  /** True when the account must confirm its email before it can log in. */
  emailVerificationRequired?: boolean;
}

const inputClass = 'w-full bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none';
const labelClass = 'text-xs font-semibold text-ink-muted block mb-1';

/**
 * Real trial signup — POSTs to the public `POST /platform/signup`, which creates
 * org + first admin + 14-day TRIALING subscription in one transaction.
 *
 * This replaced a simulated provisioning animation (fake org id after a timeout).
 * A button that pretends to create an account is worse than a form that can fail:
 * every error path here surfaces the server's answer — a taken email points at
 * sign-in, a rate limit says to wait, validation names the field.
 */
export const TrialModal: React.FC<TrialModalProps> = ({ isOpen, onClose, selectedPlan, selectedCurrency }) => {
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [created, setCreated] = useState<SignupSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [availablePlans, setAvailablePlans] = useState<
    {
      id: string;
      name: string;
      description?: string;
      prices?: Record<string, number>;
    }[]
  >([]);
  const [chosenPlan, setChosenPlan] = useState<string | undefined>(selectedPlan);
  const [effectiveCurrency, setEffectiveCurrency] = useState(selectedCurrency || 'USD');

  // When no explicit currency is passed (opened outside the pricing section),
  // default from the browser's own time zone. This used to call `ipapi.co`,
  // which sent every visitor's address to a third party to answer a question
  // with two possible answers.
  useEffect(() => {
    if (selectedCurrency) return;
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setEffectiveCurrency(zone === 'Africa/Nairobi' ? 'KES' : 'USD');
    } catch {
      setEffectiveCurrency('USD');
    }
  }, [selectedCurrency]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (error) {
      timer = setTimeout(() => setError(null), 5000);
    }
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003'}/plans`);
        if (res.ok) {
          const data: {
            id: string;
            name: string;
            description?: string;
            prices?: Record<string, number>;
          }[] = await res.json();
          setAvailablePlans(
            Array.isArray(data)
              ? data.map((p) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  prices: p.prices,
                }))
              : [],
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    setChosenPlan(selectedPlan);
  }, [selectedPlan]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEmailTaken(false);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }
    try {
      const res = await platformApi.signup({
        name: orgName.trim(),
        adminEmail: workEmail.trim(),
        adminFirstName: firstName.trim(),
        adminLastName: lastName.trim(),
        adminPassword: password,
        planId: chosenPlan ?? undefined,
        currency: effectiveCurrency === 'KES' ? 'KES' : 'USD',
      });
      const data = res.data as SignupSuccess;
      if (data.emailVerificationRequired) {
        setVerificationPending(true);
        setVerificationEmail(data.adminEmail);
        return;
      }
      setCreated(data);
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: unknown } })?.response;
      if (res) {
        const data = (res.data as { message?: string | string[] }) ?? {};
        const message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Signup failed');
        if (res.status === 409 && /email/i.test(message)) {
          setEmailTaken(true);
        }
        setError(message);
      } else {
        setError('Could not reach the server. Check your connection and retry.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!verificationEmail) return;
    setResending(true);
    setResendError(null);
    try {
      await authApi.resendVerification(verificationEmail);
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: unknown } })?.response;
      if (res) {
        const data = (res.data as { message?: string }) ?? {};
        setResendError(data.message ?? 'Could not resend the verification email.');
      } else {
        setResendError('Could not reach the server. Check your connection and retry.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleReset = () => {
    setCreated(null);
    setError(null);
    setEmailTaken(false);
    setVerificationPending(false);
    setVerificationEmail('');
    setResending(false);
    setResendError(null);
    setOrgName('');
    setFirstName('');
    setLastName('');
    setWorkEmail('');
    setPassword('');
    setConfirmPassword('');
    setAgreedToTerms(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/40 dark:bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-surface border border-brand-500/40 rounded-3xl p-6 sm:p-8 shadow-sm text-ink dark:text-ink max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl bg-surface border border-line text-ink-subtle hover:text-ink dark:hover:text-white cursor-pointer" aria-label="Close modal">
          <X className="w-5 h-5" />
        </button>

        {!created && !verificationPending ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-700 dark:text-brand-300 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink font-display">Start 14-Day Free Trial</h3>
                <p className="text-xs text-ink-subtle">No credit card required. Your organization is created immediately.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {availablePlans.length > 0 && (
                <div>
                  <label className={labelClass}>Plan</label>
                  <div className="flex flex-wrap gap-2">
                    {availablePlans.map((p) => {
                      const cur = effectiveCurrency;
                      const amt = p.prices?.[cur] ?? p.prices?.USD ?? p.prices?.KES;
                      const symbol = cur === 'USD' ? '$' : cur === 'KES' ? 'KES ' : `${cur} `;
                      const priceText = amt != null ? `${symbol}${Number(amt).toLocaleString()}` : 'Free';
                      return (
                        <button type="button" key={p.id} onClick={() => setChosenPlan(p.id)} className={`flex-1 min-w-[140px] text-left px-4 py-3 rounded-lg border-2 transition-all ${chosenPlan === p.id ? 'border-brand-400' : 'border-line'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm">{p.name}</span>
                            <span className="text-sm font-bold">{priceText}</span>
                          </div>
                          {p.description && <p className="text-xs text-ink-subtle mt-1">{p.description}</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className={labelClass} htmlFor="trial-org">
                  Organization / Agency Name
                </label>
                <input id="trial-org" type="text" required maxLength={120} placeholder="e.g. Apex Crest Property Managers" value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputClass} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="trial-first">
                    First Name
                  </label>
                  <input id="trial-first" type="text" required maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="trial-last">
                    Last Name
                  </label>
                  <input id="trial-last" type="text" required maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="trial-email">
                  Work Email Address
                </label>
                <input id="trial-email" type="email" required placeholder="name@company.co.ke" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} className={inputClass} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="trial-password">
                    Password
                  </label>
                  <input id="trial-password" type="password" required minLength={10} placeholder="At least 10 characters" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="trial-confirm-password">
                    Confirm Password
                  </label>
                  <input id="trial-confirm-password" type="password" required minLength={10} placeholder="Type it again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex items-start gap-2">
                <input id="trial-terms" type="checkbox" required checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 text-brand-700 rounded focus:ring-brand-500 bg-canvas border-gray-300 text-sm" />
                <label htmlFor="trial-terms" className="text-xs text-ink-muted leading-relaxed">
                  I agree to the{' '}
                  <a href="/terms" className="underline text-brand-700 hover:text-brand-7000 dark:text-brand-300">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" className="underline text-brand-700 hover:text-brand-7000 dark:text-brand-300">
                    Privacy Policy
                  </a>
                  . I am over 16 and authorized to create this organization.
                </label>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                  {error}{' '}
                  {emailTaken && (
                    <a href="/auth/login" className="underline font-semibold hover:text-ink dark:hover:text-white">
                      Sign in instead
                    </a>
                  )}
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-400 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                {loading ? (
                  'Creating your workspace…'
                ) : (
                  <>
                    Create My Workspace <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="flex items-center gap-2 text-xs text-ink-subtle">
                <Lock className="w-3.5 h-3.5" />
                Trial lasts 14 calendar days on the STARTER plan.
              </p>
            </form>
          </div>
        ) : verificationPending ? (
          <div className="text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-700 dark:text-brand-300 flex items-center justify-center mb-4">
              <Mail className="w-7 h-7" />
            </div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/20 px-4 py-3 text-sm text-brand-700 dark:text-brand-600 mb-4 max-w-xs mx-auto">Confirmation email sent — open your inbox and click the link to activate your account.</div>
            <h3 className="text-2xl font-bold text-ink font-display">Check your inbox</h3>
            <p className="text-sm text-ink-subtle mt-2 max-w-xs mx-auto">
              We sent a verification link to <span className="font-semibold text-ink">{verificationEmail}</span>. Open your email and confirm the address before signing in.
            </p>
            {resendError && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{resendError}</div>}
            <button onClick={handleResend} disabled={resending} className="mt-6 w-full rounded-xl border border-brand-400 px-4 py-3 text-sm font-bold text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
              {resending ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <>
                  Resend verification email <RefreshCw className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-subtle">
              Already verified?{' '}
              <a href="/auth/login" className="underline font-semibold text-ink dark:text-ink-muted hover:text-ink-muted dark:hover:text-white">
                Sign in
              </a>
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-bold text-ink font-display">{created!.name} is live</h3>
            <p className="text-sm text-ink-subtle mt-2">
              Workspace <span className="text-brand-700 dark:text-brand-300 font-bold">{created!.slug}</span>
              {trialEnd != null && (
                <>
                  {' '}
                  — trial runs to <span className="text-ink-muted font-semibold">{trialEnd}</span>
                </>
              )}
              . Sign in with <span className="text-ink-muted">{created!.adminEmail}</span> and the password you just chose.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <a href="/auth/login" className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-400">
                Sign In to Your Workspace
              </a>
              <button onClick={handleReset} className="rounded-xl border border-line-strong px-6 py-3 text-sm font-semibold text-ink-muted hover:text-ink dark:hover:text-white cursor-pointer">
                Done
              </button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-subtle">
              <ShieldCheck className="w-3.5 h-3.5" />
              Your data is isolated to your organization.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
