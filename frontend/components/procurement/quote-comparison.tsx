"use client";

import { AlertTriangle, Award, Check, Clock, ThumbsDown, Zap } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import type { QuoteComparison } from "@/types";

/**
 * Module 10 — the bid comparison.
 *
 * The table a buyer actually decides from, and the reason Module 10 exists. Two
 * rules it has to honour, both from `procurement-comparison.ts` on the server:
 *
 * 1. **Every figure is derived** from the quotations' own lines, so the total
 *    in a row always agrees with the lines underneath it. Nothing here is typed
 *    in or cached.
 * 2. **Nothing is recommended unless one quote wins on both price and lead
 *    time.** With a trade-off the table says so plainly rather than sorting by
 *    price and letting the first row look like a decision — the most expensive
 *    option is often right for a lift rope needed tomorrow, and a table that
 *    quietly implies otherwise is worse than no table.
 */

const money = (value: number | string | null | undefined) =>
    value === null || value === undefined
        ? "—"
        : Number(value).toLocaleString("en-KE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

export function formatMoney(value: number | string | null | undefined): string {
    return money(value);
}

export function QuoteComparisonTable({
    comparison,
    awardedQuoteId,
    onAward,
    awarding = false,
}: {
    comparison: QuoteComparison;
    /** The quote already awarded, if any — rendered as the winner. */
    awardedQuoteId?: string | null;
    onAward?: (quoteId: string) => void;
    /** Hide the award button when the round is closed or decided. */
    awarding?: boolean;
}) {
    const { rows } = comparison;

    return (
        <div className="space-y-4">
            <SummaryStrip comparison={comparison} />

            {comparison.singleSource && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                        Only one supplier was invited to this round, so nothing here has been
                        compared against an alternative. That is allowed — sometimes there is only
                        one supplier who does this work — but it should be a decision, not a
                        default.
                    </span>
                </p>
            )}

            {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No quotations yet. Record one as it arrives.
                </p>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">#</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead className="text-right">Quoted total</TableHead>
                                    <TableHead className="text-right">
                                        Against estimate
                                    </TableHead>
                                    <TableHead className="text-right">Lead time</TableHead>
                                    <TableHead>Covered</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => {
                                    const isAwarded = row.quoteId === awardedQuoteId;
                                    return (
                                        <TableRow
                                            key={row.quoteId}
                                            className={isAwarded ? "bg-emerald-50" : undefined}
                                        >
                                            <TableCell className="text-muted-foreground">
                                                {row.rank}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {row.supplierName}
                                                </span>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {row.cheapest && (
                                                        <Flag tone="green" icon={ThumbsDown}>
                                                            Cheapest
                                                        </Flag>
                                                    )}
                                                    {row.fastest && (
                                                        <Flag tone="blue" icon={Zap}>
                                                            Fastest
                                                        </Flag>
                                                    )}
                                                    {row.recommended && (
                                                        <Flag tone="violet" icon={Award}>
                                                            Best on both
                                                        </Flag>
                                                    )}
                                                    {isAwarded && (
                                                        <Flag tone="emerald" icon={Check}>
                                                            Awarded
                                                        </Flag>
                                                    )}
                                                    {row.expired && (
                                                        <Flag tone="slate" icon={Clock}>
                                                            Price expired
                                                        </Flag>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {money(row.totalAmount)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {row.variance === null ? (
                                                    <span className="text-muted-foreground">
                                                        no estimate
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={
                                                            row.variance > 0
                                                                ? "text-amber-700"
                                                                : "text-emerald-700"
                                                        }
                                                    >
                                                        {row.variance > 0 ? "+" : ""}
                                                        {money(row.variance)}
                                                        {row.variancePercent !== null &&
                                                            ` (${row.variancePercent > 0 ? "+" : ""}${row.variancePercent}%)`}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {row.leadTimeDays === null ? (
                                                    <span
                                                        className="text-muted-foreground"
                                                        title="They did not say"
                                                    >
                                                        not stated
                                                    </span>
                                                ) : (
                                                    `${row.leadTimeDays} days`
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {row.coversAllLines ? (
                                                    <span className="text-emerald-700">
                                                        all {row.linesTotal}
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-700">
                                                        {row.linesCovered} of {row.linesTotal}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {onAward && !isAwarded && (
                                                    <button
                                                        type="button"
                                                        className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                                                        disabled={awarding}
                                                        onClick={() => onAward(row.quoteId)}
                                                    >
                                                        Award
                                                    </button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {rows.length > 1 && !comparison.recommendedQuoteId && (
                <p className="text-sm text-muted-foreground">
                    No quote wins on both price and lead time here, so nothing is
                    recommended. Cheapest is {money(comparison.lowest)}, fastest is{" "}
                    {rows.find((row) => row.fastest)?.leadTimeDays ?? "—"} days — the trade-off
                    is yours to make.
                </p>
            )}
        </div>
    );
}

function SummaryStrip({ comparison }: { comparison: QuoteComparison }) {
    return (
        <div className="grid gap-3 sm:grid-cols-4">
            <Tile
                label="Lowest"
                value={money(comparison.lowest)}
                icon={ThumbsDown}
                hint={`${comparison.quotesRanked} of ${comparison.quotesReceived} quotations ranked`}
            />
            <Tile label="Highest" value={money(comparison.highest)} />
            <Tile label="Average" value={money(comparison.average)} />
            <Tile
                label="Recommended"
                value={comparison.recommendedQuoteId ? "Yes — one quote" : "None"}
                icon={comparison.recommendedQuoteId ? Award : undefined}
                hint={
                    comparison.recommendedQuoteId
                        ? "Cheapest and fastest"
                        : "A trade-off, or not enough quotations"
                }
            />
        </div>
    );
}

function Tile({
    label,
    value,
    hint,
    icon: Icon,
}: {
    label: string;
    value: string;
    hint?: string;
    icon?: React.ComponentType<{ className?: string }>;
}) {
    return (
        <div className="rounded-lg border px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Flag({
    children,
    tone,
    icon: Icon,
}: {
    children: React.ReactNode;
    tone: "green" | "blue" | "violet" | "emerald" | "slate";
    icon?: React.ComponentType<{ className?: string }>;
}) {
    const tones: Record<string, string> = {
        green: "bg-emerald-100 text-emerald-700",
        blue: "bg-blue-100 text-blue-700",
        violet: "bg-violet-100 text-violet-700",
        emerald: "bg-emerald-600 text-white",
        slate: "bg-slate-100 text-slate-600",
    };
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
        >
            {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
            {children}
        </span>
    );
}

/** Progress bar for how much of an order has physically arrived. */
export function ReceiptProgress({
    receivedPercent,
    outstandingQuantity,
}: {
    receivedPercent: number;
    outstandingQuantity: number;
}) {
    const pct = Math.max(0, Math.min(100, receivedPercent));
    return (
        <div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Received</span>
                <span className="font-medium">{pct}%</span>
            </div>
            <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Goods received against this order"
            >
                <div
                    className={`h-full rounded-full ${
                        pct >= 100 ? "bg-emerald-500" : "bg-amber-400"
                    }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            {outstandingQuantity > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                    {Number(outstandingQuantity)} still outstanding
                </p>
            )}
        </div>
    );
}

/**
 * @deprecated Removed in Module 11. This used to say "the Inventory module does not
 * exist yet" under the receipts on a purchase order, which was honest and was also
 * why Module 10 could not meet its own acceptance criterion: a goods receipt
 * recorded that the paint had arrived and nothing further happened.
 *
 * The replacement is `StockInPanel` (`@/components/inventory/stock-in-panel`), which
 * does the job: it asks which item each delivery became and which store it went to,
 * and writes the movements. Kept as a note rather than deleted silently, because
 * "the receipt screen says the module is missing" was a real state of this
 * codebase and somebody reading this later should know what replaced it and why.
 */
export type StockInNoticeRemoved = never;