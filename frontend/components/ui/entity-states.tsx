'use client';

import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

/**
 * Shared loading / empty / error states.
 *
 * `00-UX-CROSS-CUTTING-STANDARDS.md` requires every list and detail page to
 * have a real empty state, a loading indicator and a real error state instead
 * of a blank table or a silent failure. These three components are that
 * pattern so pages stop re-inventing it (or forgetting it).
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
    return (
        <div
            className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground"
            role="status"
            aria-live="polite"
        >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">{label}</p>
        </div>
    );
}

export function EmptyState({
    title,
    description,
    icon,
    action,
}: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
            {icon && <div className="text-slate-400">{icon}</div>}
            <h3 className="text-sm font-medium">{title}</h3>
            {description && (
                <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
            )}
            {action}
        </div>
    );
}

export function ErrorState({
    message,
    onRetry,
}: {
    message: string;
    onRetry?: () => void;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center"
            role="alert"
        >
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-destructive">{message}</p>
            {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Try again
                </Button>
            )}
        </div>
    );
}

const STATUS_STYLES: Record<string, string> = {
    // Properties
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
    ARCHIVED: 'bg-gray-200 text-gray-700',
    // Units
    VACANT: 'bg-green-100 text-green-800',
    OCCUPIED: 'bg-blue-100 text-blue-800',
    RESERVED: 'bg-purple-100 text-purple-800',
    MAINTENANCE: 'bg-yellow-100 text-yellow-800',
    // Unit types
    two: 'bg-slate-100 text-slate-700',
    one: 'bg-slate-100 text-slate-700',
    // Module 9: work-order pipeline. The order is the pipeline — grey while
    // nobody has looked at it, violet for the assessment, blue once it is
    // signed off, cyan when somebody owns it, amber while it is happening,
    // green when it is done and near-black when it is closed.
    REQUESTED: 'bg-slate-100 text-slate-700',
    INSPECTION: 'bg-violet-100 text-violet-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    ASSIGNED: 'bg-cyan-100 text-cyan-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-800',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    CLOSED: 'bg-slate-800 text-white',
    CANCELLED: 'bg-slate-100 text-slate-500',
    // Module 9: asset service state.
    OPERATIONAL: 'bg-emerald-100 text-emerald-700',
    SERVICE_DUE: 'bg-amber-100 text-amber-800',
    OUT_OF_SERVICE: 'bg-red-100 text-red-700',
    RETIRED: 'bg-slate-100 text-slate-500',
    // Module 10: procurement. Three pipelines that read left to right, so the
    // colours go grey → amber (waiting on somebody) → violet → blue (agreed) →
    // green (delivered) → near-black (closed), with one amber exception for
    // "part of it arrived", which is the state that most needs to stand out.
    DRAFT: 'bg-slate-100 text-slate-700',
    PENDING: 'bg-amber-100 text-amber-800',
    ISSUED: 'bg-amber-100 text-amber-800',
    QUOTES_RECEIVED: 'bg-violet-100 text-violet-700',
    REJECTED: 'bg-red-100 text-red-700',
    // CANCELLED and CLOSED already carry the same styles from the work-order
    // pipeline above — one terminal state, one look.
    SENT: 'bg-cyan-100 text-cyan-700',
    ACCEPTED: 'bg-blue-100 text-blue-700',
    PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800',
    RECEIVED: 'bg-emerald-100 text-emerald-700',
    // Quotes, invitations and suppliers.
    SUBMITTED: 'bg-blue-100 text-blue-700',
    SHORTLISTED: 'bg-violet-100 text-violet-700',
    AWARDED: 'bg-emerald-100 text-emerald-700',
    WITHDRAWN: 'bg-slate-100 text-slate-500',
    INVITED: 'bg-amber-100 text-amber-800',
    QUOTED: 'bg-blue-100 text-blue-700',
    DECLINED: 'bg-slate-100 text-slate-500',
    // Module 12: payroll runs. Grey → sky (figures exist, nobody signed off) →
    // violet (signed off, still nothing on the ledger) → emerald (posted *and*
    // paid) → red (superseded). Violet and emerald are deliberately far apart in
    // the scale: reading APPROVED as PAID is the mistake this ordering exists to
    // make visually obvious.
    CALCULATED: 'bg-sky-100 text-sky-800',
    PAID: 'bg-emerald-100 text-emerald-700',
    VOID: 'bg-red-100 text-red-700',
};

/** Coloured status pill, shared by property and unit lists/details. */
export function StatusBadge({ status }: { status?: string | null }) {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800';
    const label = status.charAt(0) + status.slice(1).toLowerCase();
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
        >
            {label}
        </span>
    );
}