"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft, Ban, CheckCircle2, FileText, Send, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { QuoteComparisonTable } from "@/components/procurement/quote-comparison";
import { procurementApi } from "@/lib/api";
import type { Rfq } from "@/types";

/**
 * One quotation round (Module 10).
 *
 * The comparison is the page. Invitations are listed above it with their
 * outcome — including the ones that declined, because a supplier who quietly
 * stopped answering is how a single-source purchase happens without anybody
 * deciding it.
 *
 * Awarding is a deliberate click on a row, not a sort order: the API refuses a
 * second award, and it is the only thing that turns a round into an order.
 */
export default function RfqDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [rfq, setRfq] = useState<Rfq | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [showCancel, setShowCancel] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await procurementApi.rfq(id);
            setRfq(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Could not load this round",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        setActionError(null);
        try {
            await action();
            await fetchData();
        } catch (err) {
            setActionError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "That action could not be completed",
            );
        } finally {
            setBusy(null);
        }
    };

    const award = (quoteId: string) => {
        const row = rfq?.comparison?.rows.find((entry) => entry.quoteId === quoteId);
        const supplier = row?.supplierName ?? 'this supplier';
        if (
            !confirm(
                `Award this round to ${supplier}? The other quotations are recorded as considered, and a purchase order can be raised from it.`,
            )
        ) {
            return;
        }
        void run(`award:${quoteId}`, () =>
            procurementApi.awardQuote(id, quoteId),
        );
    };

    if (isLoading) return <LoadingState label="Loading the round..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;
    if (!rfq) return null;

    const invited = rfq.invitations.filter((row) => row.status === 'INVITED');
    const declined = rfq.invitations.filter((row) => row.status === 'DECLINED');

    return (
        <div className="space-y-6">
            <div>
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/procurement/rfqs">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        All quotation rounds
                    </Link>
                </Button>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">{rfq.title}</h1>
                            <StatusBadge status={rfq.status} />
                            {rfq.overdue && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                    {rfq.daysOverdue} days past the quote deadline
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground">
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
                        </p>
                        {rfq.notes && (
                            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                                {rfq.notes}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(rfq.availableActions ?? []).includes('ISSUE') && (
                            <Button
                                disabled={busy === 'issue'}
                                onClick={() =>
                                    void run('issue', () => procurementApi.issueRfq(id))
                                }
                            >
                                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                                Issue to suppliers
                            </Button>
                        )}
                        {(rfq.availableActions ?? []).includes('CLOSE') && (
                            <Button
                                variant="outline"
                                disabled={busy === 'close'}
                                onClick={() => {
                                    if (
                                        !confirm(
                                            'Close this round without awarding it? The quotations are kept as a record.',
                                        )
                                    ) {
                                        return;
                                    }
                                    void run('close', () => procurementApi.closeRfq(id));
                                }}
                            >
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Close round
                            </Button>
                        )}
                        {(rfq.availableActions ?? []).includes('REOPEN') && (
                            <Button
                                variant="outline"
                                disabled={busy === 'reopen'}
                                onClick={() =>
                                    void run('reopen', () => procurementApi.reopenRfq(id))
                                }
                            >
                                <Unlock className="mr-2 h-4 w-4" aria-hidden="true" />
                                Reopen
                            </Button>
                        )}
                        {(rfq.availableActions ?? []).includes('CANCEL') &&
                            !showCancel && (
                                <Button variant="ghost" onClick={() => setShowCancel(true)}>
                                    <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                                    Cancel round
                                </Button>
                            )}
                    </div>
                </div>
            </div>

            {actionError && <ErrorState message={actionError} />}

            {showCancel && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Cancel this round</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Cancelling is recorded, and the reason is what a supplier who was
                            asked would read. Closing is the alternative when nobody is being told
                            anything.
                        </p>
                        <div>
                            <Label htmlFor="cancelReason">Reason</Label>
                            <Textarea
                                id="cancelReason"
                                rows={3}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="We are sourcing this differently this year."
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="destructive"
                                disabled={busy === 'cancel' || reason.trim().length < 5}
                                onClick={() =>
                                    void run('cancel', async () => {
                                        await procurementApi.cancelRfq(id, reason.trim());
                                        setShowCancel(false);
                                        setReason('');
                                    })
                                }
                            >
                                Cancel the round
                            </Button>
                            <Button variant="ghost" onClick={() => setShowCancel(false)}>
                                Keep it open
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Who was asked</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {rfq.invitations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nobody has been invited yet, so there is nobody to ask.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {rfq.invitations.map((invitation) => (
                                    <li
                                        key={invitation.id}
                                        className="rounded-md border px-3 py-2"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">
                                                {invitation.supplier?.name ?? 'Unknown supplier'}
                                            </span>
                                            <StatusBadge status={invitation.status} />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Invited{' '}
                                            {new Date(invitation.invitedAt).toLocaleDateString()}
                                            {invitation.respondedAt &&
                                                ` · answered ${new Date(invitation.respondedAt).toLocaleDateString()}`}
                                        </p>
                                        {invitation.declineReason && (
                                            <p className="mt-1 text-xs italic text-muted-foreground">
                                                “{invitation.declineReason}”
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {invited.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {invited.length} supplier{invited.length === 1 ? ' has' : 's have'}{' '}
                                not answered.
                            </p>
                        )}
                        {declined.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {declined.length} declined, with the reason recorded — a supplier
                                who stops answering is otherwise invisible.
                            </p>
                        )}

                        {rfq.quotesDueAt && (
                            <p className="text-sm text-muted-foreground">
                                Quotes were due {new Date(rfq.quotesDueAt).toLocaleString()}.
                                A late answer is still welcome while the round is open.
                            </p>
                        )}

                        {rfq.awardedQuote && (
                            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
                                <p className="text-sm font-medium text-emerald-800">
                                    Awarded —{' '}
                                    {
                                        rfq.quotes.find(
                                            (quote) => quote.id === rfq.awardedQuoteId,
                                        )?.supplier?.name
                                    }
                                </p>
                                {rfq.orders && rfq.orders.length > 0 ? (
                                    rfq.orders.map((order) => (
                                        <Link
                                            key={order.id}
                                            href={`/procurement/purchase-orders/${order.id}`}
                                            className="text-sm underline-offset-4 hover:underline"
                                        >
                                            Purchase order {order.reference}
                                        </Link>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No order raised from it yet.
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6 lg:col-span-2">
                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Comparison</h2>
                        {rfq.comparison ? (
                            <QuoteComparisonTable
                                comparison={rfq.comparison}
                                awardedQuoteId={rfq.awardedQuoteId}
                                onAward={
                                    (rfq.availableActions ?? []).includes('AWARD')
                                        ? award
                                        : undefined
                                }
                                awarding={busy?.startsWith('award') ?? false}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No quotations to compare yet.
                            </p>
                        )}
                    </div>

                    {rfq.purchaseRequest?.lines && rfq.purchaseRequest.lines.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">What was asked for</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead className="text-right">Estimate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rfq.purchaseRequest.lines.map((line) => (
                                            <TableRow key={line.id}>
                                                <TableCell>
                                                    {line.description}
                                                    {line.specification && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {line.specification}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {Number(line.quantity)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {line.estimatedAmount != null
                                                        ? Number(line.estimatedAmount).toLocaleString(
                                                              'en-KE',
                                                          )
                                                        : '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {rfq.purchaseRequest.estimatedAmount != null && (
                                    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                        <FileText className="h-4 w-4" aria-hidden="true" />
                                        Requested estimate{' '}
                                        {Number(
                                            rfq.purchaseRequest.estimatedAmount,
                                        ).toLocaleString('en-KE')}{' '}
                                        {rfq.purchaseRequest.currency} — the comparison measures
                                        every quotation against this.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <div className="flex justify-end">
                <Button variant="outline" asChild>
                    <Link href="/procurement/rfqs">Back to rounds</Link>
                </Button>
            </div>
        </div>
    );
}