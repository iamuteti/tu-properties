'use client';

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import type { ReorderSuggestion, StockStatus, StockValuation } from '@/types';

/**
 * Module 11 — the small pieces of stock furniture that several pages share.
 *
 * The statuses here are **derived on the server** from the sum of the movements,
 * and they are the same three values everywhere. That is worth having in one file:
 * a store that is "empty" in the reorder list and "low" in a badge two screens
 * away is worse than no badge at all.
 */

const STATUS_STYLE: Record<StockStatus, string> = {
    OUT_OF_STOCK: 'bg-red-100 text-red-700',
    REORDER: 'bg-amber-100 text-amber-800',
    OK: 'bg-emerald-100 text-emerald-700',
};

/**
 * `OK` renders green for a plain badge but the caller can pass `muted`, which is
 * what a tracked-but-never-reordered item (reorder level zero) should look like.
 * An item with no reorder level is not "comfortably stocked" — nothing is watching
 * it — and painting it green says something untrue.
 */
export function StockStatusBadge({
    status,
    label,
    muted = false,
}: {
    status: StockStatus;
    label?: string;
    muted?: boolean;
}) {
    const text = label ?? (status === 'OUT_OF_STOCK' ? 'Empty' : status === 'REORDER' ? 'Low' : 'In stock');
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                muted ? 'bg-slate-100 text-slate-600' : STATUS_STYLE[status]
            }`}
        >
            {text}
        </span>
    );
}

/**
 * A stock level, in its unit.
 *
 * Three cases a plain `toFixed` gets wrong, which is why this exists:
 * a **negative** balance (the books are wrong, and saying "−5" quietly is not the
 * same as saying the books are wrong), a **zero** reorder level (not a stock of
 * zero — no watch on it), and a quantity that **is not a round number** (paint
 * goes in half tins).
 */
export function StockLevel({
    quantity,
    unitOfMeasure,
    reorderLevel,
    className = '',
}: {
    quantity: number;
    unitOfMeasure: string;
    /** Omit when the item has no reorder level; the display changes with it. */
    reorderLevel?: number | null;
    className?: string;
}) {
    const negative = quantity < 0;
    const watched = reorderLevel != null && Number(reorderLevel) > 0;

    return (
        <span className={className}>
            <span
                className={`font-medium tabular-nums ${negative ? 'text-red-700' : ''}`}
            >
                {negative ? '−' : ''}
                {Math.abs(quantity).toLocaleString('en-KE', { maximumFractionDigits: 2 })}
            </span>
            {unitOfMeasure && unitOfMeasure !== 'unit' && (
                <span className="ml-1 text-muted-foreground">{unitOfMeasure}</span>
            )}
            {!watched && (
                <span
                    className="ml-2 text-xs text-muted-foreground"
                    title="No reorder level set — this is tracked but nothing will alert on it"
                >
                    not watched
                </span>
            )}
        </span>
    );
}

/** A signed movement, with the direction visible rather than implied. */
export function MovementAmount({
    quantity,
    unitOfMeasure,
}: {
    quantity: number;
    unitOfMeasure?: string;
}) {
    const incoming = quantity >= 0;
    const Icon = incoming ? ArrowUpRight : ArrowDownRight;

    return (
        <span
            className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
                incoming ? 'text-emerald-700' : 'text-slate-900'
            }`}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {incoming ? '+' : '−'}
            {Math.abs(quantity).toLocaleString('en-KE', { maximumFractionDigits: 2 })}
            {unitOfMeasure && unitOfMeasure !== 'unit' && (
                <span className="ml-1 font-normal text-muted-foreground">
                    {unitOfMeasure}
                </span>
            )}
        </span>
    );
}

const money = (value: number | null | undefined) =>
    value == null
        ? '—'
        : value.toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

/**
 * What the shelf is worth.
 *
 * This is the **weighted average** the backend walks the movement history for,
 * and it is not the same number as the item list's `valuationValue` (which is
 * quantity × today's unit cost). Showing both on one screen is the point: the
 * list figure is a cheap approximation and this one is what the shelf is actually
 * worth at the prices it was bought at.
 *
 * `averageUnitCost: null` on an empty shelf and `movementsWithoutCost > 0` are
 * both surfaced rather than smoothed over, because an average that is partly
 * assumed should say so.
 */
export function StockValuationPanel({ valuation }: { valuation: StockValuation }) {
    return (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
                <Scale className="h-4 w-4" aria-hidden="true" />
                What this is worth
            </p>
            <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                    <dt className="text-xs text-muted-foreground">Value on the shelf</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                        {money(valuation.value)}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Average unit cost</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                        {valuation.averageUnitCost == null
                            ? '—'
                            : money(valuation.averageUnitCost)}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Counted</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                        {valuation.quantity.toLocaleString('en-KE', {
                            maximumFractionDigits: 2,
                        })}
                    </dd>
                </div>
            </dl>
            <p className="text-xs text-muted-foreground">
                Weighted average of what each delivery actually cost, worked out by
                walking the movements in order — not today&apos;s price applied to
                everything on the shelf.
            </p>
            {valuation.movementsWithoutCost > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {valuation.movementsWithoutCost} movement
                    {valuation.movementsWithoutCost === 1 ? '' : 's'} carried no price, so
                    that part of the average is carried forward from the last known
                    cost rather than measured.
                </p>
            )}
        </div>
    );
}

/**
 * "Order 6 tins" — the sentence a reorder list is read in.
 *
 * Shows the shortfall, the suggestion and the estimated cost only when there is a
 * price to estimate with. `null` cost means "we have not priced this item", which
 * is a different statement from "this item is free", and the difference matters
 * when somebody is deciding whether to raise a purchase request.
 */
export function ReorderCallout({ reorder }: { reorder: ReorderSuggestion }) {
    if (!reorder.needsReorder) return null;

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <p className="font-medium text-amber-900">
                Order {reorder.suggestedQuantity.toLocaleString('en-KE', {
                    maximumFractionDigits: 2,
                })}{' '}
                {reorder.unitOfMeasure}
                {reorder.status === 'OUT_OF_STOCK' ? ' — nothing left' : ''}
            </p>
            {reorder.reason && (
                <p className="mt-1 text-amber-800">{reorder.reason}</p>
            )}
            <p className="mt-1 text-xs text-amber-800">
                {reorder.estimatedCost == null
                    ? 'No price on file, so the cost is unknown.'
                    : `Estimated cost ${money(reorder.estimatedCost)}.`}
            </p>
        </div>
    );
}

/**
 * Pull a human sentence out of the API's `rejection` message.
 *
 * The services refuse bad movements with a sentence rather than a code, because
 * the person who triggered it is usually standing at a shelf with a van waiting —
 * "Only 3 is on hand here" tells them what to do next, `INSUFFICIENT_STOCK` does
 * not. A toast is the right home for it.
 */
export function movementErrorMessage(error: unknown, fallback: string): string {
    const payload = (
        error as {
            response?: { data?: { message?: string | string[] } };
        }
    )?.response?.data;

    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}