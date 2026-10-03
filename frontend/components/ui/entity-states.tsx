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