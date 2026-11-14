'use client';

import React, { useState } from 'react';
import { Mail, Send, CheckCircle2, MessageSquare } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3003';

const inputClass = 'w-full bg-surface border border-line-strong dark:border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none';
const labelClass = 'text-xs font-semibold text-ink-muted block mb-1';

/**
 * Public contact section — the landing page's "Contact us".
 *
 * Posts to the public `POST /platform/contact`, which stores the message as a
 * NEW `ContactInquiry` for the platform team. No `mailto:` cop-out and no
 * fake "we'll reply within 24 hours": the success state says the message is
 * recorded and where it goes (the operator queue), because a promise about
 * response time is the operator's to make, not the form's.
 */
export const ContactSection: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/platform/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = (await res.json()) as { message?: string | string[] };
      if (!res.ok) {
        setError(Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? 'Could not send your message.'));
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-24 bg-surface dark:bg-canvas relative border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-700 dark:text-brand-300 text-xs font-bold uppercase tracking-wider mb-4">
              <MessageSquare className="w-4 h-4" />
              Contact Us
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight leading-tight">Talk to a human about your portfolio.</h2>
            <p className="mt-4 text-base sm:text-lg text-ink-muted leading-relaxed">Pricing for multi-market groups, migration from your current system, a tax configuration question — write it here and it lands directly in the platform team&apos;s queue.</p>
            <a href="mailto:support@tuhame.co.ke" className="mt-6 flex items-center gap-3 p-5 rounded-2xl bg-canvas border border-line hover:border-brand-500/40 transition-all">
              <span className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-ink-subtle uppercase tracking-wider">Prefer email?</span>
                <span className="block text-sm font-bold text-ink">support@tuhame.co.ke</span>
              </span>
            </a>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-3xl p-6 sm:p-8 bg-canvas border border-line shadow-sm">
              {sent ? (
                <div className="text-center py-8">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-ink font-display">Message recorded</h3>
                  <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">It is sitting in the platform team&apos;s queue now — not in a void. If you left a reachable address, expect a reply there.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass} htmlFor="contact-name">
                        Your Name
                      </label>
                      <input id="contact-name" type="text" required maxLength={120} placeholder="Wanjiku Mwangi" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="contact-email">
                        Email Address
                      </label>
                      <input id="contact-email" type="email" required maxLength={160} placeholder="name@company.co.ke" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="contact-subject">
                      Subject
                    </label>
                    <input id="contact-subject" type="text" required maxLength={160} placeholder="e.g. Multi-market pricing" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
                  </div>

                  <div>
                    <label className={labelClass} htmlFor="contact-message">
                      Message
                    </label>
                    <textarea id="contact-message" required minLength={10} maxLength={2000} rows={5} placeholder="Tell us about your portfolio and what you need… (at least 10 characters)" value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} resize-y`} />
                  </div>

                  {error && <div className="rounded-xl border border-red-500/40 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</div>}

                  <button type="submit" disabled={loading} className="w-full sm:w-auto rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-400 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                    {loading ? (
                      'Sending…'
                    ) : (
                      <>
                        Send Message <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
