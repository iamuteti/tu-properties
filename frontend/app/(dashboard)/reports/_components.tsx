'use client'

import { AlertTriangle, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ReportPeriod } from '@/types';

/**
 * Shared pieces for the reports screens.
 *
 * Three of these exist because of specific defects in Module 16, and each would
 * otherwise be re-invented per report as a quiet lie:
 *
 * - **`Percent`** renders `null` as "—" and never as `0%`. An estate with no units
 *   has an *undefined* occupancy, not an empty one; the backend returns `null`
 *   precisely so the two cannot be confused.
 * - **`ClampedNotice`** surfaces `period.clamped`. The server reported `false`
 *   while handing back a window twelve months too wide (issue 115), so a report
 *   that quietly renders whatever period it was given will look correct either
 *   way. This puts the actual window on the page, always.
 * - **`ExclusionNote`** surfaces `unattributedCount`, for the same reason in the
 *   other direction: a revenue figure whose excluded rows nobody can see is a
 *   number nobody should act on.
 */

/**
 * A percentage that is allowed to be genuinely unknown.
 *
 * `after` is trailing *words*, not a replacement for the sign: the first version took a
 * `suffix` that overrode `%`, so "77.5 of invoiced" rendered with no percent sign on it.
 * The unit is not optional here — a bare number next to the word "percent" in a hint is
 * how a collection rate becomes ambiguous.
 */
export function Percent({
    value,
    digits = 1,
    after,
}: {
    value: number | null | undefined;
    digits?: number;
    after?: string;
}) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return (
            <span
                className="text-muted-foreground"
                title="Not measurable — there is nothing to divide by"
            >
                &mdash;
            </span>
        );
    }
    return (
        <>
            {`${value.toFixed(digits)}%`}
            {after ? <span className="font-normal text-muted-foreground"> {after}</span> : null}
        </>
    );
}

/** The window a report actually covered, stated plainly. */
export function PeriodCaption({ period }: { period?: ReportPeriod }) {
    if (!period) return null;
    const from = period.from.slice(0, 10);
    const to = period.to.slice(0, 10);
    return (
        <span className="text-xs text-muted-foreground">
            {from} &rarr; {to}
        </span>
    );
}

/**
 * Shown when the requested window was not the window served.
 *
 * The report is still correct — it is simply a different document from the one
 * that was asked for, and saying so belongs on the page rather than in a log.
 */
export function ClampedNotice({ period }: { period?: ReportPeriod }) {
    if (!period?.clamped) return null;
    return (
        <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
                This report covers <strong>{period.from.slice(0, 10)} &rarr; {period.to.slice(0, 10)}</strong>.
                The window you asked for was wider than a report will run, so the
                earliest date was moved. The figures are for the period above.
            </span>
        </div>
    );
}

/**
 * Money rows and payments with no organization, excluded from every figure.
 *
 * Excluding them is correct — money with no tenant belongs to no tenant — but the
 * count is the difference between "zero revenue" and "revenue we did not count".
 */
export function ExclusionNote({ count, noun = 'row' }: { count?: number; noun?: string }) {
    if (!count) return null;
    return (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
                {count} {noun}
                {count === 1 ? '' : 's'} with no organization {count === 1 ? 'was' : 'were'}{' '}
                excluded from every figure above.
            </span>
        </p>
    );
}

/**
 * A CSV export, as a plain link.
 *
 * Deliberately an `<a download>` rather than a button with a click handler: the
 * browser has to perform the download and the auth cookie travels with a normal
 * navigation, so an axios call would only hand the page a blob it then has to
 * invent a filename for.
 */
export function ExportButton({
    href,
    label = 'Export CSV',
    disabled,
    title,
}: {
    href: string;
    label?: string;
    disabled?: boolean;
    title?: string;
}) {
    if (disabled) {
        return (
            <Button variant="outline" size="sm" disabled title={title}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {label}
            </Button>
        );
    }
    return (
        <a
            href={href}
            download
            title={title}
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {label}
        </a>
    );
}

/**
 * A labelled figure. One component for all of them so a tile cannot drift from
 * the others in padding or in how it handles a missing value.
 */
export function MetricTile({
    label,
    value,
    hint,
    tone = 'default',
}: {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: 'default' | 'warn';
}) {
    return (
        <Card>
            <CardContent className="px-4 py-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                </p>
                <p
                    className={`mt-1 text-2xl font-semibold tabular-nums ${
                        tone === 'warn' ? 'text-destructive' : ''
                    }`}
                >
                    {value}
                </p>
                {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
            </CardContent>
        </Card>
    );
}

/** Money, in the currency the report itself reported. */
export function Money({
    value,
    currency = 'KES',
}: {
    value: number | null | undefined;
    currency?: string;
}) {
    if (value === null || value === undefined || Number.isNaN(value)) return <>&mdash;</>;
    return (
        <>
            {value.toLocaleString(undefined, {
                maximumFractionDigits: 0,
                minimumFractionDigits: 0,
            })}{' '}
            <span className="text-sm font-normal text-muted-foreground">{currency}</span>
        </>
    );
}
