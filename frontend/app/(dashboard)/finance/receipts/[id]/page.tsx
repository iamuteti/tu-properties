"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { Receipt } from "@/types";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A rent receipt: what was collected, by which method, and which invoices it
 * settled. Deleting one reverses its ledger entry and re-opens the invoices it
 * paid, so the money stops being counted twice — the record is removed because a
 * receipt that never happened should not appear to have happened.
 */
export default function ReceiptDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await financeApi.findOneReceipt(params.id);
            setReceipt(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load the receipt",
            );
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleDelete = async () => {
        if (
            !confirm(
                "Delete this receipt? Its ledger entry is reversed and any invoices it paid re-open.",
            )
        ) {
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            await financeApi.deleteReceipt(params.id);
            router.push("/finance/receipts");
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to delete the receipt",
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div>Loading receipt...</div>;
    if (!receipt) return <div className="text-destructive">{error ?? "Receipt not found"}</div>;

    const payments = receipt.payments ?? [];

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/finance/receipts")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Receipts
            </Button>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{receipt.receiptId}</h1>
                    <p className="text-muted-foreground">
                        {money(receipt.amountReceived)} ·{" "}
                        {new Date(receipt.recordingDate).toLocaleDateString()}
                    </p>
                </div>
                <Button variant="outline" onClick={handleDelete} disabled={isSaving}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete receipt
                </Button>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p className="text-2xl font-semibold">
                            {money(receipt.amountReceived)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Method</p>
                        <p className="text-2xl font-semibold">
                            {receipt.paymentMethod?.replace(/_/g, " ")}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Reference</p>
                        <p className="text-2xl font-semibold">{receipt.refNo || "—"}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Invoices paid</p>
                        <p className="text-2xl font-semibold">{payments.length}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Applied payments</CardTitle>
                </CardHeader>
                <CardContent>
                    {payments.length === 0 ? (
                        <p className="py-4 text-center text-muted-foreground">
                            This receipt was recorded on account and is not applied to an
                            invoice.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell className="font-mono">
                                            {payment.invoice?.invoiceNumber ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            {payment.paymentMethod?.replace(/_/g, " ")}
                                        </TableCell>
                                        <TableCell>
                                            {payment.paymentReference || "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(payment.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {receipt.notes && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">{receipt.notes}</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}