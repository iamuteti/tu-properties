'use client';

import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

/**
 * Shared loading / empty / error states.
 *
 * `GUIDE.md` §8 (Frontend standards) requires every list and detail page to
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
            {icon && <div className="text-muted-foreground">{icon}</div>}
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
    ACTIVE: 'bg-success-soft text-success',
    INACTIVE: 'bg-muted text-foreground',
    ARCHIVED: 'bg-muted text-foreground',
    // Units
    VACANT: 'bg-success-soft text-success',
    OCCUPIED: 'bg-info-soft text-info',
    RESERVED: 'bg-stage-violet-soft text-stage-violet',
    MAINTENANCE: 'bg-warning-soft text-warning',
    // Unit types
    two: 'bg-muted text-foreground',
    one: 'bg-muted text-foreground',
    // Module 9: work-order pipeline. The order is the pipeline — muted while
    // nobody has looked at it, violet for the assessment, blue once it is
    // signed off, cyan when somebody owns it, warning while it is happening,
    // success when it is done and max-contrast when it is closed.
    REQUESTED: 'bg-muted text-foreground',
    INSPECTION: 'bg-stage-violet-soft text-stage-violet',
    APPROVED: 'bg-info-soft text-info',
    ASSIGNED: 'bg-stage-cyan-soft text-stage-cyan',
    IN_PROGRESS: 'bg-warning-soft text-warning',
    COMPLETED: 'bg-success-soft text-success',
    CLOSED: 'bg-foreground text-background',
    CANCELLED: 'bg-muted text-muted-foreground',
    // Module 9: asset service state.
    OPERATIONAL: 'bg-success-soft text-success',
    SERVICE_DUE: 'bg-warning-soft text-warning',
    OUT_OF_SERVICE: 'bg-danger-soft text-danger',
    RETIRED: 'bg-muted text-muted-foreground',
    // Module 10: procurement. Three pipelines that read left to right, so the
    // colours go muted → warning (waiting on somebody) → violet → blue (agreed)
    // → success (delivered) → max-contrast (closed), with one warning exception
    // for "part of it arrived", which is the state that most needs to stand out.
    DRAFT: 'bg-muted text-foreground',
    // NOTE: `PENDING` is shared deliberately. It is the warning role here for a
    // purchase order awaiting approval and it is the right colour for a contract whose
    // term has not started - both mean "real, but not running yet", and a second
    // identical key would be a compile error that only exists to be worked around.
    PENDING: 'bg-warning-soft text-warning',
    ISSUED: 'bg-warning-soft text-warning',
    QUOTES_RECEIVED: 'bg-stage-violet-soft text-stage-violet',
    REJECTED: 'bg-danger-soft text-danger',
    // CANCELLED and CLOSED already carry the same styles from the work-order
    // pipeline above — one terminal state, one look.
    SENT: 'bg-stage-cyan-soft text-stage-cyan',
    ACCEPTED: 'bg-info-soft text-info',
    PARTIALLY_RECEIVED: 'bg-warning-soft text-warning',
    RECEIVED: 'bg-success-soft text-success',
    // Quotes, invitations and suppliers.
    SUBMITTED: 'bg-info-soft text-info',
    SHORTLISTED: 'bg-stage-violet-soft text-stage-violet',
    AWARDED: 'bg-success-soft text-success',
    WITHDRAWN: 'bg-muted text-muted-foreground',
    INVITED: 'bg-warning-soft text-warning',
    QUOTED: 'bg-info-soft text-info',
    DECLINED: 'bg-muted text-muted-foreground',
    // Module 12: payroll runs. Muted → sky (figures exist, nobody signed off) →
    // violet (signed off, still nothing on the ledger) → success (posted *and*
    // paid) → danger (superseded). Violet and success are deliberately far apart
    // in the scale: reading APPROVED as PAID is the mistake this ordering exists
    // to make visually obvious.
    CALCULATED: 'bg-stage-sky-soft text-stage-sky',
    PAID: 'bg-success-soft text-success',
    VOID: 'bg-danger-soft text-danger',
    // Module 15: contract statuses, which are **derived on read** rather than stored,
    // so these describe a comparison against the clock rather than a state anybody set.
    // The ordering here is the urgency ordering, and it is deliberately not a gradient:
    // NOTICE_DUE is danger because a contract past its notice deadline is already
    // committed and cannot be stopped, which is a different and worse thing than
    // EXPIRING_SOON at 14 days where there is still time to negotiate.
    NOTICE_DUE: 'bg-danger-soft text-danger',
    EXPIRED: 'bg-danger-soft text-danger',
    EXPIRING_SOON: 'bg-warning-soft text-warning',
    OPEN_ENDED: 'bg-muted text-muted-foreground',
    SUPERSEDED: 'bg-muted text-muted-foreground',
    UNDATED: 'bg-warning-soft text-warning',
};

/** Coloured status pill, shared by property and unit lists/details. */
export function StatusBadge({ status }: { status?: string | null }) {
    if (!status) return <span className="text-muted-foreground">—</span>;
    const style = STATUS_STYLES[status] ?? 'bg-muted text-foreground';
    const label = status.charAt(0) + status.slice(1).toLowerCase();
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
        >
            {label}
        </span>
    );
}