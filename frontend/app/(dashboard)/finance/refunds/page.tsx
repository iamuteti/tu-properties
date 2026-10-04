"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { Undo2 } from "lucide-react";
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
import { financeApi, PaymentRefund, refundsApi } from "@/lib/api";
import { Payment } from "@/types";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Refunds (Module 8). A payment is never deleted to undo money — a refund
 * records the direction, issues a credit note, and re-opens exactly the invoice
 * balance it closed. Only payments that are live and still have refundable
 * money are offered here.
 */
export default function RefundsPage() {
    const [refunds, setRefunds] = useState<PaymentRefund[]>([]);
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
            const [refundsResponse, paymentsResponse] = await Promise.all([
                refundsApi.findAll(),
                financeApi.findAllPayments(),
            ]);
            setRefunds(refundsResponse.data);
            setPayments(paymentsResponse.data);
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
            await refundsApi.create({
                paymentId: selectedPaymentId,
                amount: Number(amount),
                reason,
                refundReference: reference || undefined,
            });
            setAmount("");
            setReason("");
            setReference("");
            setSelectedPaymentId("");
            fetchData();
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
                    <CardTitle className="text-lg">Record a refund</CardTitle>
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
                                {isSubmitting ? "Recording..." : "Record refund"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading refunds...</div>
            ) : refunds.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No refunds recorded.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
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
