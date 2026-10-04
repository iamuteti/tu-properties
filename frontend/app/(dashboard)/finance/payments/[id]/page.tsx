"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { financeApi } from "@/lib/api";
import { Payment } from "@/types";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A single payment. The two things that can be done to it are both reversible
 * and neither is a delete: a wrong allocation is reversed, which re-opens the
 * invoice, and a wrong amount becomes a refund, which keeps the record that
 * money once arrived and then went back.
 */
export default function PaymentDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [payment, setPayment] = useState<Payment | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await financeApi.getPaymentById(params.id);
            setPayment(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load the payment",
            );
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleReverse = async () => {
        if (
            !confirm(
                "Reverse this payment? The invoice it was applied to will re-open for that amount. The payment record is kept, not deleted.",
            )
        ) {
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await financeApi.reversePayment(params.id);
            setNotice("Payment reversed. The invoice has re-opened for the amount.");
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to reverse the payment",
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div>Loading payment...</div>;
    if (!payment) return <div className="text-destructive">{error ?? "Payment not found"}</div>;

    const reversed = Boolean((payment as Payment & { isReversed?: boolean }).isReversed);

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/finance/payments")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Payments
            </Button>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {money(payment.amount)}
                    </h1>
                    <p className="text-muted-foreground">
                        {payment.paymentMethod?.replace(/_/g, " ")} ·{" "}
                        {new Date(payment.paymentDate).toLocaleDateString()}
                        {reversed && " · reversed"}
                    </p>
                </div>
                {!reversed && (
                    <Button variant="outline" onClick={handleReverse} disabled={isSaving}>
                        <Undo2 className="mr-2 h-4 w-4" /> Reverse payment
                    </Button>
                )}
            </div>

            {notice && (
                <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                    {notice}
                </div>
            )}
            {error && <div className="text-destructive text-sm">{error}</div>}

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Applied to</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {payment.invoice ? (
                            <Button
                                variant="ghost"
                                className="p-0 h-auto"
                                onClick={() =>
                                    router.push(`/finance/invoices/${payment.invoice!.id}`)
                                }
                            >
                                {payment.invoice.invoiceNumber}
                            </Button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-muted-foreground">
                                    Not allocated to an invoice.
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Any part that no invoice needs becomes the
                                    customer&rsquo;s credit, so the money is never lost.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div>
                            <p className="text-muted-foreground">Reference</p>
                            <p>{payment.paymentReference || "—"}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Recorded by</p>
                            <p>{payment.recordedBy || "—"}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Payee</p>
                            <p>{payment.payee || "—"}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            {payment.notes || "None"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {payment.rentalAgreement && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Lease</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Agreement</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead>Rent</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-mono">
                                        {payment.rentalAgreement.id.slice(-8)}
                                    </TableCell>
                                    <TableCell>
                                        {payment.rentalAgreement.unit?.name ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        {money(payment.rentalAgreement.rentAmount)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
