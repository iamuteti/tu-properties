"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
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
import { payablesApi, SupplierBill } from "@/lib/api";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHODS = [
    { value: "BANK_TRANSFER", label: "Bank transfer" },
    { value: "MPESA", label: "M-Pesa" },
    { value: "CHEQUE", label: "Cheque" },
    { value: "CASH", label: "Cash" },
    { value: "CARD", label: "Card" },
];

const STATUS: Record<string, string> = {
    DRAFT: "Draft",
    OPEN: "Open",
    PARTIALLY_PAID: "Partly paid",
    PAID: "Paid",
    VOID: "Void",
};

/**
 * A supplier bill: what it is, what was paid, and the two actions that matter —
 * pay it, or void it. Paying more than the balance is allowed on purpose; the
 * surplus becomes credit the supplier owes us rather than being lost.
 */
export default function BillDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [bill, setBill] = useState<SupplierBill | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("BANK_TRANSFER");
    const [reference, setReference] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await payablesApi.findBill(params.id);
            setBill(response.data);
            setAmount(String(response.data.balanceAmount));
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load the bill",
            );
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    const handlePay = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!bill) return;
        setIsSaving(true);
        setError(null);
        setNotice(null);
        try {
            const response = await payablesApi.createPayment({
                billId: bill.id,
                amount: Number(amount),
                method,
                reference: reference || undefined,
            });
            const surplus = Number(amount) - Number(bill.balanceAmount);
            setNotice(
                surplus > 0
                    ? `Paid. ${money(surplus)} more than the bill needed is now credit ${bill.supplier?.name ?? "the supplier"} owes us.`
                    : "Payment recorded.",
            );
            setReference("");
            load();
            void response;
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to record the payment",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleVoid = async () => {
        if (!bill) return;
        if (!confirm(`Void ${bill.billNumber}? Its ledger entry will be reversed.`)) return;
        setIsSaving(true);
        try {
            await payablesApi.voidBill(bill.id);
            setNotice("Bill voided.");
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to void the bill",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleReversePayment = async (paymentId: string) => {
        if (!confirm("Reverse this payment? The bill will re-open for that amount.")) return;
        try {
            await payablesApi.reversePayment(paymentId);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to reverse the payment",
            );
        }
    };

    if (isLoading) return <div>Loading bill...</div>;
    if (!bill) return <div className="text-destructive">{error ?? "Bill not found"}</div>;

    const payable = bill.status === "OPEN" || bill.status === "PARTIALLY_PAID";

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/finance/payables")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Payables
            </Button>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{bill.billNumber}</h1>
                    <p className="text-muted-foreground">
                        {bill.supplier?.name} · {STATUS[bill.status] ?? bill.status}
                    </p>
                </div>
                {payable && (
                    <Button variant="outline" onClick={handleVoid} disabled={isSaving}>
                        Void bill
                    </Button>
                )}
            </div>

            {notice && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}
            {error && <div className="text-destructive text-sm">{error}</div>}

            <div className="grid gap-4 md:grid-cols-4">
                {[
                    { label: "Subtotal", value: bill.subtotal },
                    { label: "Tax", value: bill.taxAmount },
                    { label: "Paid", value: bill.paidAmount },
                    { label: "Balance", value: bill.balanceAmount },
                ].map((item) => (
                    <Card key={item.label}>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">{item.label}</p>
                            <p className="text-2xl font-semibold">{money(item.value)}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                    <div>
                        <p className="text-muted-foreground">Bill date</p>
                        <p>{new Date(bill.billDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Due date</p>
                        <p>{new Date(bill.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Supplier reference</p>
                        <p>{bill.supplierReference || "—"}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Category</p>
                        <p>{bill.category}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Lines</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Unit</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(bill.lines ?? []).map((line) => (
                                <TableRow key={line.id}>
                                    <TableCell>{line.description}</TableCell>
                                    <TableCell className="text-right">{Number(line.quantity)}</TableCell>
                                    <TableCell className="text-right">{money(line.unitPrice)}</TableCell>
                                    <TableCell className="text-right">{money(line.amount)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {payable && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Pay this bill</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handlePay} className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount</Label>
                                <Input
                                    id="amount"
                                    required
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Balance {money(bill.balanceAmount)}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Method</Label>
                                <Select
                                    name="method"
                                    value={method}
                                    onChange={(event) => setMethod(event.target.value)}
                                    options={METHODS}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reference">Reference</Label>
                                <Input
                                    id="reference"
                                    value={reference}
                                    onChange={(event) => setReference(event.target.value)}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Pay bill"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Payments</CardTitle>
                </CardHeader>
                <CardContent>
                    {(bill.payments ?? []).length === 0 ? (
                        <p className="py-4 text-center text-muted-foreground">No payments yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(bill.payments ?? []).map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell>
                                            {new Date(payment.paymentDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>{payment.method?.replace(/_/g, " ")}</TableCell>
                                        <TableCell>{payment.reference || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            {payment.isReversed ? "Reversed" : money(payment.amount)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {!payment.isReversed && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleReversePayment(payment.id)}
                                                >
                                                    Reverse
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}