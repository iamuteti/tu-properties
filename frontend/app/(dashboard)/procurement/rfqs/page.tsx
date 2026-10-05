"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Download, FileStack, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { QuoteComparisonTable } from "@/components/procurement/quote-comparison";
import { procurementApi } from "@/lib/api";
import type { Rfq, RfqStats } from "@/types";

/**
 * Module 10 — quotation rounds (RFQs).
 *
 * This list is the comparison, not just a list of them: each row carries its own
 * rank order and cheapest/fastest flags, because the question a buyer opens this
 * page to answer is "what did each of them say?" rather than "what rounds exist".
 *
 * A round that was never sent to a second supplier is flagged rather than
 * blocked — see `QuoteComparisonTable` for why the module refuses to recommend
 * a purchase without showing that.
 */
export default function RfqsPage() {
    const [rfqs, setRfqs] = useState<Rfq[]>([]);
    const [stats, setStats] = useState<RfqStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [search, setSearch] = useState("");

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (status) params.status = status;
            if (search.trim()) params.search = search.trim();
            const [list, summary] = await Promise.all([
                procurementApi.rfqs(params),
                procurementApi.rfqStats(),
            ]);
            setRfqs(list.data);
            setStats(summary.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Could not load quotation rounds",
            );
        } finally {
            setIsLoading(false);
        }
    }, [status, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // The row's own comparison is already attached, so the "top of the table"
    // strip can be built without another request per round.
    const cheapestOverall = useMemo(() => {
        const withComparison = rfqs.filter((rfq) => (rfq.comparison?.rows.length ?? 0) > 0);
        if (withComparison.length === 0) return null;
        return withComparison.reduce((best, rfq) =>
            Number(rfq.comparison!.lowest ?? Infinity) <
            Number(best.comparison!.lowest ?? Infinity)
                ? rfq
                : best,
        );
    }, [rfqs]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Quotations</h1>
                    <p className="text-muted-foreground">
                        One round per purchase — several suppliers asked, their answers compared
                        side by side
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={procurementApi.purchaseRequestsExportUrl({ status: "APPROVED" })}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Approved requests
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/procurement/rfqs/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Ask for quotations
                        </Link>
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Stat label="Rounds" value={stats.total} />
                    <Stat label="Still collecting" value={stats.open} />
                    <Stat
                        label="Nobody has quoted yet"
                        value={stats.awaitingQuotes}
                        tone={stats.awaitingQuotes > 0 ? "amber" : undefined}
                    />
                    <Stat
                        label="Past the quote deadline"
                        value={stats.overdue}
                        tone={stats.overdue > 0 ? "amber" : undefined}
                    />
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="rfqStatus">Status</Label>
                    <Select
                        name="rfqStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            { value: "", label: "All rounds" },
                            { value: "DRAFT", label: "Draft" },
                            { value: "ISSUED", label: "Issued" },
                            { value: "QUOTES_RECEIVED", label: "Quotations received" },
                            { value: "CLOSED", label: "Closed" },
                            { value: "AWARDED", label: "Awarded" },
                            { value: "CANCELLED", label: "Cancelled" },
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="rfqSearch">Search</Label>
                    <Input
                        id="rfqSearch"
                        value={search}
                        placeholder="Reference or title"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading quotation rounds..." />
            ) : rfqs.length === 0 ? (
                <EmptyState
                    title="No quotation rounds yet"
                    description="Approve a purchase request, then ask suppliers to quote for it. Comparing two answers is the only way to know a price is fair."
                    icon={<FileStack className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/procurement/purchase-requests?status=APPROVED">
                                See approved requests
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-6">
                    {rfqs.map((rfq) => (
                        <RoundCard key={rfq.id} rfq={rfq} />
                    ))}
                </div>
            )}

            {cheapestOverall && (
                <p className="text-sm text-muted-foreground">
                    Across the rounds on screen, the lowest quotation is{" "}
                    {cheapestOverall.comparison!.lowest?.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                    })}{" "}
                    from {cheapestOverall.reference}.
                </p>
            )}
        </div>
    );
}

function RoundCard({ rfq }: { rfq: Rfq }) {
    return (
        <Card>
            <div className="border-b px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                href={`/procurement/rfqs/${rfq.id}`}
                                className="text-lg font-semibold hover:underline"
                            >
                                {rfq.title}
                            </Link>
                            <StatusBadge status={rfq.status} />
                            {rfq.overdue && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                    {rfq.daysOverdue} days past the deadline
                                </span>
                            )}
                            {rfq.singleSource && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                    Single source
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {rfq.reference}
                            {rfq.purchaseRequest && (
                                <>
                                    {" · from request "}
                                    <Link
                                        href={`/procurement/purchase-requests/${rfq.purchaseRequest.id}`}
                                        className="underline-offset-4 hover:underline"
                                    >
                                        {rfq.purchaseRequest.reference}
                                    </Link>
                                </>
                            )}
                            {` · ${rfq.invitations.length} invited, ${rfq.quotes.length} quoted`}
                            {rfq.quotesDueAt &&
                                ` · quotes due ${new Date(rfq.quotesDueAt).toLocaleDateString()}`}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href={`/procurement/rfqs/${rfq.id}`}>Open round</Link>
                    </Button>
                </div>
            </div>
            {rfq.comparison && rfq.comparison.rows.length > 0 ? (
                <CardContent className="pt-6">
                    <QuoteComparisonTable comparison={rfq.comparison} />
                </CardContent>
            ) : (
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                        No quotations recorded yet.
                        {rfq.invitations.length > 0
                            ? ` ${rfq.invitations.length} supplier${rfq.invitations.length === 1 ? " has" : "s have"} been asked.`
                            : " Nobody has been invited."}
                    </p>
                </CardContent>
            )}
        </Card>
    );
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone?: "amber";
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p
                    className={`text-2xl font-semibold ${
                        tone === "amber" && value > 0 ? "text-amber-700" : ""
                    }`}
                >
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}