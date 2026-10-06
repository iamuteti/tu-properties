'use client';

import { CONTRACT_STATUS_HINTS, CONTRACT_STATUS_LABELS } from '@/lib/constants';
import type { ContractStatus } from '@/types';

/**
 * Module 15 - the status pill, and the one piece of the register's UI that had to be
 * built rather than reused.
 *
 * `StatusBadge` derives its label from the raw string, which renders `NOTICE_DUE` as
 * "Notice_due". That is not a formatting nit here: these statuses exist so a user acts
 * differently on each one, and the word is the message. "Notice period passed" tells
 * somebody the deadline has gone; "Notice_due" tells them to go and look.
 *
 * `CONTRACT_STATUS_LABELS` carries the wording, `CONTRACT_STATUS_HINTS` carries the
 * meaning, and the colour comes from the shared `STATUS_STYLES` map so a contract and a
 * purchase order that both mean "expired" look the same.
 */
export function ContractStatusBadge({
    status,
    showHint = false,
}: {
    status: ContractStatus | null | undefined;
    showHint?: boolean;
}) {
    if (!status) return <span className="text-muted-foreground">-</span>;

    const label = CONTRACT_STATUS_LABELS[status] ?? status;
    const hint = CONTRACT_STATUS_HINTS[status];

    return (
        <span className="inline-flex flex-col gap-0.5">
            <ContractStatusPill status={status} label={label} />
            {showHint && hint ? (
                <span className="text-xs text-muted-foreground">{hint}</span>
            ) : null}
        </span>
    );
}

/**
 * The pill alone, for table cells.
 *
 * Split from the hint so a row in a 24-row table is one line tall. The hint is for the
 * detail screen and the report, where there is room to explain.
 */
export function ContractStatusPill({
    status,
    label,
}: {
    status: ContractStatus;
    label?: string;
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
            title={CONTRACT_STATUS_HINTS[status]}
        >
            {label ?? CONTRACT_STATUS_LABELS[status] ?? status}
        </span>
    );
}

/**
 * Mirrors the contract keys in `entity-states.tsx`'s `STATUS_STYLES`.
 *
 * Duplicated rather than imported because that map is module-private and it is not
 * worth widening its API for one more consumer - `PENDING` in particular is shared with
 * Module 14 already, so the two maps agreeing is an invariant to keep by eye rather
 * than a coupling to introduce. If a status is added here it needs a colour there too.
 */
const STATUS_CLASS: Record<string, string> = {
    NOTICE_DUE: 'bg-red-100 text-red-700',
    EXPIRED: 'bg-red-50 text-red-600',
    EXPIRING_SOON: 'bg-amber-100 text-amber-800',
    PENDING: 'bg-amber-100 text-amber-800',
    OPEN_ENDED: 'bg-slate-100 text-slate-600',
    SUPERSEDED: 'bg-slate-200 text-slate-500',
    UNDATED: 'bg-yellow-50 text-yellow-700',
    ACTIVE: 'bg-green-100 text-green-800',
};

/**
 * "Ends in 42 days" / "Ended 12 days ago" / "No end date".
 *
 * The signed number is the point. `daysUntilExpiry` is derived server-side from the
 * clock, so this does no date arithmetic of its own - a client-side `differenceInDays`
 * would disagree with the server by a day at the boundary and the two numbers would sit
 * in the same table.
 */
export function ExpiryCell({
    expiresAt,
    daysUntilExpiry,
    noticeDueAt,
    noticeDays,
}: {
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    noticeDueAt?: string | null;
    noticeDays?: number | null;
}) {
    if (!expiresAt || daysUntilExpiry === null) {
        return (
            <span className="text-muted-foreground">
                No end date
            </span>
        );
    }

    const ended = daysUntilExpiry < 0;
    const soon = daysUntilExpiry <= 30;
    const pastNotice =
        noticeDueAt !== undefined &&
        noticeDueAt !== null &&
        noticeDays !== null &&
        noticeDays !== undefined &&
        new Date(noticeDueAt).getTime() <= Date.now() &&
        !ended;

    return (
        <span className="flex flex-col">
            <span
                className={
                    pastNotice
                        ? 'font-medium text-red-700'
                        : ended
                            ? 'text-muted-foreground'
                            : soon
                                ? 'font-medium text-amber-700'
                                : ''
                }
            >
                {ended
                    ? `Ended ${Math.abs(daysUntilExpiry)} day${Math.abs(daysUntilExpiry) === 1 ? '' : 's'} ago`
                    : `In ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`}
            </span>
            <span className="text-xs text-muted-foreground">
                {new Date(expiresAt).toLocaleDateString()}
                {noticeDays ? ` · ${noticeDays}d notice` : ''}
            </span>
        </span>
    );
}