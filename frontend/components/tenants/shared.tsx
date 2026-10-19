'use client';

import type { Agreement } from '@/types';

/**
 * Shared pieces for the tenant file.
 *
 * The tenant page is a *file* rather than a form: it is the one screen somebody
 * opens to answer a question about a person, and the questions span money,
 * utilities, requests and maintenance. These helpers exist so the five sections
 * read as one document — the same money formatting, the same date format, the
 * same colour for the same status — rather than five screens that happen to be
 * on one page.
 *
 * **There is deliberately no `money()` or `fmtDate()` here.** Both used to live
 * in this file, and both were a trap: a formatter with a fixed locale and no
 * currency is a Kenyan formatter wearing a disguise, and the only way to stop
 * the next person adding one is to make the correct one the only one. Money and
 * dates come from `useOrgFormat()`, which knows the organization's currency,
 * locale and timezone, and which still lets a record's own currency win.
 */

export const humanise = (value: string | null | undefined) =>
    value
        ? value
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
        : '—';

/**
 * The status colours.
 *
 * Deliberately a single map, because the same status means the same thing
 * wherever it appears — an invoice that is OVERDUE is amber whether it is on the
 * financial tab or on the tenancy history — and a screen that gives the same word
 * two colours is a screen nobody learns to read.
 */
const STATUS_STYLES: Record<string, string> = {
    // Money
    PAID: 'bg-emerald-100 text-emerald-700',
    PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
    OVERDUE: 'bg-red-100 text-red-700',
    PENDING: 'bg-amber-100 text-amber-800',
    DRAFT: 'bg-muted text-foreground',
    CANCELLED: 'bg-slate-100 text-slate-500',
    VOID: 'bg-red-100 text-red-700',
    ISSUED: 'bg-emerald-100 text-emerald-700',
    OPEN: 'bg-amber-100 text-amber-800',
    APPLIED: 'bg-emerald-100 text-emerald-700',
    PARTIALLY_APPLIED: 'bg-amber-100 text-amber-800',
    // Utilities
    INVOICED: 'bg-blue-100 text-blue-700',
    DIRECT_ACCOUNT: 'bg-sky-100 text-sky-800',
    RECONCILED: 'bg-emerald-100 text-emerald-700',
    // Tenancy
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    EXPIRED: 'bg-slate-100 text-slate-600',
    TERMINATED: 'bg-red-100 text-red-700',
    RENEWED: 'bg-blue-100 text-blue-700',
    // Move-out
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-700',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    WITHDRAWN: 'bg-slate-100 text-slate-700',
    // Work orders
    REQUESTED: 'bg-slate-100 text-slate-700',
    INSPECTION: 'bg-violet-100 text-violet-700',
    ASSIGNED: 'bg-cyan-100 text-cyan-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-800',
    CLOSED: 'bg-slate-800 text-white',
    // Inspections
    GOOD: 'bg-emerald-100 text-emerald-700',
    FAIR: 'bg-amber-100 text-amber-800',
    POOR: 'bg-red-100 text-red-700',
    DAMAGED: 'bg-red-200 text-red-800',
};

export function Pill({ status }: { status?: string | null }) {
    if (!status) return <span className="text-muted-foreground">—</span>;
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_STYLES[status] ?? 'bg-muted text-foreground'
            }`}
        >
            {humanise(status)}
        </span>
    );
}

/** A labelled value. The building block of every detail grid on the page. */
export function Detail({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {typeof value === 'string' || value === null || value === undefined ? (
                <p className="font-medium break-words">{value || '—'}</p>
            ) : (
                <div className="font-medium">{value}</div>
            )}
        </div>
    );
}

/**
 * When a tenancy ends.
 *
 * A rental agreement has no fixed end date - the real end comes from a move-out
 * request's `moveoutDate`, and without one the tenancy is open-ended. A
 * fixed-term lease keeps its `endDate`.
 *
 * It is asked in two places on this page (the current tenancy, and the tenancy
 * history), and the two answers must be the same, so it is answered once.
 */
export function agreementEndDate(a: Agreement): string | undefined {
    if (a.agreementType === 'RENTAL') {
        const moveout = (a.moveOutRequests ?? []).find((m) => m.moveoutDate);
        return moveout?.moveoutDate ?? undefined;
    }
    return a.endDate;
}

/** A small heading used above each block inside a section. */
export function SectionTitle({
    children,
    hint,
}: {
    children: React.ReactNode;
    hint?: React.ReactNode;
}) {
    return (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{children}</h3>
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
    );
}
