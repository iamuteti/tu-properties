"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { Clock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { financeApi, PaymentRefund, refundsApi, workflowsApi } from "@/lib/api";
import { WORKFLOW_STATUS_META } from "@/lib/constants";
import { Payment, WorkflowInstance } from "@/types";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Refunds (Module 8), routed through the approval engine (Module 18).
 *
 * A payment is never deleted to undo money — a refund records the direction,
 * issues a credit note, and re-opens exactly the invoice balance it closed.
 *
 * What changed in Module 18 is *who decides*. This form used to move money on
 * submit, which made the person pressing the button the person signing it off.
 * It now raises a request: the refund itself is issued when the last level
 * approves, inside the same transaction as that decision. Where no policy is
 * configured it is processed directly, exactly as before — so this is not a gate
 * an organization cannot open.
 *
 * Requests still waiting are listed above the ones already issued, because a
 * request that has not moved money is not a refund and must not look like one.
 */
export default function RefundsPage() {
    const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
    const [pending, setPending] = useState<WorkflowInstance[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedPaymentId, setSelectedPaymentId] = useState("");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [reference, setReference] = useState("");

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [refundsResponse, paymentsResponse, instances] = await Promise.all([
                refundsApi.findAll(),
                financeApi.findAllPayments(),
                // Requests that have not been decided yet. Best-effort: a viewer
                // without `workflows.view` should still see the refund list.
                workflowsApi.instances({
                    entityType: 'REFUND',
                    status: 'IN_PROGRESS',
                    limit: 20,
                }).catch(() => null),
            ]);
            setRefunds(refundsResponse.data);
            setPayments(paymentsResponse.data);
            if (instances) setPending(instances.data.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load refunds",
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refundable = useMemo(
        () =>
            payments
                .filter((payment) => !(payment as Payment & { isReversed?: boolean }).isReversed)
                .map((payment) => {
                    const alreadyRefunded = refunds
                        .filter((refund) => refund.payment?.id === payment.id)
                        .reduce((sum, refund) => sum + Number(refund.amount), 0);
                    const outstanding = money(Number(payment.amount) - alreadyRefunded);
                    return { payment, outstanding: Number(outstanding) };
                })
                .filter((entry) => entry.outstanding > 0),
        [payments, refunds],
    );

    const selected = refundable.find(
        (entry) => entry.payment.id === selectedPaymentId,
    );

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedPaymentId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const created = (await refundsApi.create({
                paymentId: selectedPaymentId,
                amount: Number(amount),
                reason,
                refundReference: reference || undefined,
            })).data;
            setAmount("");
            setReason("");
            setReference("");
            setSelectedPaymentId("");
            await fetchData();
            // Money going back out is the one thing in this module worth two
            // people agreeing to, so the request now waits for a decision
            // instead of moving on the spot. Say which of the two happened —
            // "recorded" would be a lie when it is still waiting.
            if (created.autoApproved) {
                toast.success("Refund recorded", {
                    description:
                        created.note ??
                        "No approval policy applied, so it was processed directly.",
                });
            } else {
                toast.success("Refund requested", {
                    description: "It is now waiting for approval. Nothing has moved yet.",
                });
                setPending((list) => [created, ...list]);
            }
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to record the refund",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Refunds</h1>
                <p className="text-muted-foreground">
                    Money returned to customers, each with a credit note behind it
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Request a refund</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="payment">Payment</Label>
                            <Select
                                name="payment"
                                value={selectedPaymentId}
                                placeholder="Select a payment"
                                search
                                onChange={(event) => {
                                    setSelectedPaymentId(event.target.value);
                                    const entry = refundable.find(
                                        (item) => item.payment.id === event.target.value,
                                    );
                                    setAmount(entry ? String(entry.outstanding) : "");
                                }}
                                options={refundable.map((entry) => ({
                                    value: entry.payment.id,
                                    label: `${money(entry.payment.amount)} — ${
                                        entry.payment.paymentMethod?.replace(/_/g, " ") ?? ""
                                    } — refundable ${money(entry.outstanding)}`,
                                }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                required
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                            />
                            {selected && (
                                <p className="text-xs text-muted-foreground">
                                    Up to {money(selected.outstanding)}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reference">Reference (optional)</Label>
                            <Input
                                id="reference"
                                value={reference}
                                placeholder="Bank reference"
                                onChange={(event) => setReference(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2 md:col-span-3">
                            <Label htmlFor="reason">Reason</Label>
                            <Input
                                id="reason"
                                required
                                value={reason}
                                placeholder="Why is this being returned?"
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </div>
                        <div className="flex items-end">
                            <Button type="submit" disabled={isSubmitting || !selectedPaymentId}>
                                <Undo2 className="mr-2 h-4 w-4" />
                                {isSubmitting ? "Requesting..." : "Request refund"}
                            </Button>
                        </div>
                    </form>
                    <p className="mt-3 text-sm text-muted-foreground">
                        This does not move money on its own. It asks whoever your
                        approval policy names to sign it off; the refund is issued when
                        they do.
                    </p>
                </CardContent>
            </Card>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {pending.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            Awaiting approval
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Requested</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pending.map((request) => {
                                    const meta = WORKFLOW_STATUS_META[request.status];
                                    return (
                                        <TableRow key={request.id}>
                                            <TableCell>
                                                {new Date(request.startedAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {String(request.context?.reason ?? "—")}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                        meta?.className ?? "bg-slate-100"
                                                    }`}
                                                >
                                                    {meta?.label ?? request.status}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {money(String(request.context?.amount ?? 0))}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                        <p className="mt-3 text-sm text-muted-foreground">
                            Nothing here has moved money yet.{" "}
                            <Link href="/approvals" className="underline">
                                Open approvals
                            </Link>{" "}
                            to follow them.
                        </p>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div>Loading refunds...</div>
            ) : refunds.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No refunds recorded yet.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Refunds issued</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Credit note</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {refunds.map((refund) => (
                                    <TableRow key={refund.id}>
                                        <TableCell>
                                            {new Date(refund.processedAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="font-mono">
                                            {refund.creditNote?.creditNoteNumber ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            {refund.payment?.paymentMethod?.replace(/_/g, " ") ?? "—"}
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {refund.reason}
                                        </TableCell>
                                        <TableCell>{refund.refundReference || "—"}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {money(refund.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
