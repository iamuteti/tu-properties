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
    PAID: 'bg-success-soft text-success',
    PARTIALLY_PAID: 'bg-warning-soft text-warning',
    OVERDUE: 'bg-danger-soft text-danger',
    PENDING: 'bg-warning-soft text-warning',
    DRAFT: 'bg-muted text-foreground',
    CANCELLED: 'bg-muted text-muted-foreground',
    VOID: 'bg-danger-soft text-danger',
    ISSUED: 'bg-success-soft text-success',
    OPEN: 'bg-warning-soft text-warning',
    APPLIED: 'bg-success-soft text-success',
    PARTIALLY_APPLIED: 'bg-warning-soft text-warning',
    // Utilities
    INVOICED: 'bg-info-soft text-info',
    DIRECT_ACCOUNT: 'bg-stage-sky-soft text-stage-sky',
    RECONCILED: 'bg-success-soft text-success',
    // Tenancy
    ACTIVE: 'bg-success-soft text-success',
    EXPIRED: 'bg-muted text-foreground',
    TERMINATED: 'bg-danger-soft text-danger',
    RENEWED: 'bg-info-soft text-info',
    // Move-out
    APPROVED: 'bg-success-soft text-success',
    REJECTED: 'bg-danger-soft text-danger',
    COMPLETED: 'bg-success-soft text-success',
    WITHDRAWN: 'bg-muted text-foreground',
    // Work orders
    REQUESTED: 'bg-muted text-foreground',
    INSPECTION: 'bg-stage-violet-soft text-stage-violet',
    ASSIGNED: 'bg-stage-cyan-soft text-stage-cyan',
    IN_PROGRESS: 'bg-warning-soft text-warning',
    CLOSED: 'bg-foreground text-background',
    // Inspections
    GOOD: 'bg-success-soft text-success',
    FAIR: 'bg-warning-soft text-warning',
    POOR: 'bg-danger-soft text-danger',
    DAMAGED: 'bg-danger/25 text-danger',
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
