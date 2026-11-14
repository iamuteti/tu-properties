'use client';

import React, { useState } from 'react';
import { TRUST_POINTS, ADMIN_ROLES, ROLE_PERMISSIONS } from './data/landingData';
import { ShieldCheck, Lock, FileCode, CheckCircle, Database, UserCheck, Eye, Terminal } from 'lucide-react';

export const TrustSection: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<string>('Accountant');

  const activeRoleData = ROLE_PERMISSIONS[selectedRole] ?? ROLE_PERMISSIONS['Accountant'];

  return (
    <section id="trust" className="py-24 bg-canvas border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Trust Banner */}
        <div className="relative rounded-xl p-8 sm:p-12 bg-surface border border-line overflow-hidden">
          <div className="max-w-3xl">
            <div className="eyebrow mb-4">
              <ShieldCheck className="w-4 h-4 text-brand-700 dark:text-brand-300" />
              <span>Core Architectural Guarantee</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-ink font-display tracking-tight leading-tight">&ldquo;Every figure is computed from records that already exist.&rdquo;</h2>

            <p className="mt-4 text-base sm:text-lg text-ink-muted leading-relaxed">
              In TU Properties, numbers are <strong>derived, never typed</strong>. Owner statements flow mathematically from reconciled tenant payments; tenant balances flow from invoices and credit rows; tax withholdings calculate from verified rates. No manual overrides, no duplicate spreadsheets, no ghost balances.
            </p>
          </div>

          {/* 4 Pillars of Trust */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_POINTS.map((point, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-surface/80 dark:bg-canvas/80 border border-line space-y-2 hover:border-brand-500/40 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/20">{point.badge}</span>
                  <CheckCircle className="w-4 h-4 text-brand-700 dark:text-brand-300" />
                </div>
                <h3 className="text-sm font-bold text-ink pt-1">{point.title}</h3>
                <p className="text-xs text-ink-subtle leading-relaxed font-sans">{point.description}</p>
              </div>
            ))}
          </div>

          {/* 13 System Roles Matrix */}
          <div className="mt-12 pt-10 border-t border-line">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold text-ink flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-brand-700 dark:text-brand-300" />
                  13 System Roles &amp; Strict Boundary Control
                </h3>
                <p className="text-xs sm:text-sm text-ink-subtle mt-1">These are the roles the platform actually seeds into every organization. Click any one to inspect the boundary it enforces.</p>
              </div>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1 rounded-lg">Tenant Isolation: Schema Partitioned</span>
            </div>

            {/* Role Pills */}
            <div className="flex flex-wrap gap-2">
              {ADMIN_ROLES.map((role) => (
                <button key={role} onClick={() => setSelectedRole(role)} className={`px-3 py-1.5 rounded-xl text-xs font-medium font-mono cursor-pointer transition-all ${selectedRole === role ? 'bg-brand-500 text-white font-bold shadow-md' : 'bg-surface text-ink-muted hover:text-ink dark:hover:text-white border border-line'}`}>
                  {role}
                </button>
              ))}
            </div>

            {/* Selected Role Capabilities Card */}
            <div className="mt-5 p-5 rounded-2xl bg-surface/90 dark:bg-canvas/90 border border-line">
              <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
                <div className="text-sm font-bold text-ink flex items-center gap-2">
                  <span>Inspecting Role:</span>
                  <span className="text-brand-700 dark:text-brand-300 font-mono">{selectedRole}</span>
                </div>
                <span className="text-xs text-ink-subtle font-mono">Enforced at Database &amp; API Layer</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                {/* Read Scope */}
                <div className="p-3 rounded-xl bg-surface border border-line space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Authorized Read Permissions:</span>
                  <ul className="space-y-1 text-ink-muted">
                    {activeRoleData.read.map((item, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Write Scope */}
                <div className="p-3 rounded-xl bg-surface border border-line space-y-1.5">
                  <span className="text-[11px] font-bold text-brand-700 dark:text-brand-300 uppercase tracking-wider block">Authorized Write Actions:</span>
                  <ul className="space-y-1 text-ink-muted">
                    {activeRoleData.write.map((item, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Restricted Scope */}
                <div className="p-3 rounded-xl bg-surface border border-rose-900/40 space-y-1.5">
                  <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">Hard Boundary Restrictions:</span>
                  <ul className="space-y-1 text-rose-300">
                    {activeRoleData.restricted.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-500 font-bold shrink-0">✕</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Audit Log Spec Terminal */}
            <div className="mt-6 p-4 rounded-xl bg-black border border-line font-mono text-xs text-ink-subtle space-y-1">
              <div className="flex items-center gap-2 text-ink-subtle pb-1 border-b border-line">
                <Terminal className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300" />
                <span>Live Immutable Audit Trail Sample (Tenant ID: org_4892)</span>
              </div>
              <p className="text-ink-muted pt-1">
                <span className="text-emerald-600 dark:text-emerald-400">[2026-10-11 11:04:12 UTC]</span> ACTOR: usr_fd_8192 (Accountant) | ACTION: APPROVE_PAYOUT | ENTITY: payout_8819 | TARGET: Client Escrow (GBP 147,020.00) | STATUS: COMMITTED
              </p>
              <p className="text-ink-muted">
                <span className="text-emerald-600 dark:text-emerald-400">[2026-10-11 11:08:45 UTC]</span> ACTOR: usr_la_1042 (Leasing Officer) | ACTION: RENEW_LEASE | ENTITY: lease_0042 | PREV_EXPIRY: 2026-12-31 | NEW_EXPIRY: 2027-12-31 | STATUS: COMMITTED
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
