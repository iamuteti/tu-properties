"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, RefreshCw, Trash2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { financeApi } from "@/lib/api";
import { Invoice } from "@/types";

const STATUS_STYLES: Record<Invoice["status"], string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    PENDING: "bg-blue-100 text-blue-800",
    PARTIALLY_PAID: "bg-yellow-100 text-yellow-800",
    PAID: "bg-green-100 text-green-800",
    OVERDUE: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
};

function StatusBadge({ status }: { status: Invoice["status"] }) {
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status] || "bg-gray-100 text-gray-800"}`}>
            {status}
        </span>
    );
}

export default function InvoiceDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const loadInvoice = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const res = await financeApi.findOneInvoice(id);
            setInvoice(res.data);
        } catch (err: any) {
            if (err.response?.status === 404) {
                setError("Invoice not found. It may have been deleted.");
            } else {
                setError(err.response?.data?.message || "Failed to load invoice. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadInvoice();
    }, [loadInvoice]);

    const runStatusChange = async (status: Invoice["status"]) => {
        if (!invoice) return;
        const confirmText: Record<string, string> = {
            PAID: `Mark ${invoice.invoiceNumber} as fully paid?`,
            CANCELLED: `Cancel ${invoice.invoiceNumber}? This cannot be undone from the list.`,
            PENDING: `Reopen ${invoice.invoiceNumber} as pending?`,
        };
        if (!confirm(confirmText[status])) return;
        setIsBusy(true);
        setActionError(null);
        try {
            await financeApi.updateInvoice(invoice.id, { status });
            await loadInvoice();
        } catch (err: any) {
            setActionError(err.response?.data?.message || "Failed to update invoice status.");
        } finally {
            setIsBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!invoice) return;
        if (!confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
        setIsBusy(true);
        setActionError(null);
        try {
            await financeApi.deleteInvoice(invoice.id);
            router.push("/finance/invoices");
        } catch (err: any) {
            setActionError(err.response?.data?.message || "Failed to delete invoice.");
            setIsBusy(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading invoice…</span>
                </div>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">Invoice</h1>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-12">
                        <XCircle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={loadInvoice}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry
                            </Button>
                            <Link href="/finance/invoices">
                                <Button variant="ghost">Back to Invoices</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const currency = invoice.currency || "KES";
    const fmt = (n: number | string | undefined) => Number(n ?? 0).toFixed(2);
    const tenant = invoice.rentalAgreement?.tenant;
    const unit = invoice.rentalAgreement?.unit;
    const payments = invoice.payments || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/finance/invoices")}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
                            <StatusBadge status={invoice.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {tenant
                                ? `Tenant: ${tenant.surname} ${tenant.otherNames || ""}`.trim()
                                : invoice.landlord
                                    ? `Landlord: ${invoice.landlord.name}`
                                    : "No tenant or landlord linked"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID" || invoice.status === "OVERDUE") && (
                        <Button onClick={() => runStatusChange("PAID")} disabled={isBusy}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Mark as Paid
                        </Button>
                    )}
                    {invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
                        <Button variant="outline" onClick={() => runStatusChange("CANCELLED")} disabled={isBusy}>
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel
                        </Button>
                    )}
                    {invoice.status === "PAID" && (
                        <Button variant="outline" onClick={() => runStatusChange("PENDING")} disabled={isBusy}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reopen
                        </Button>
                    )}
                    <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </Button>
                </div>
            </div>

            {actionError && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{actionError}</div>
            )}

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currency} {fmt(invoice.totalAmount)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-700">{currency} {fmt(invoice.paidAmount)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Balance Due</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{currency} {fmt(invoice.balanceAmount)}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Invoice Details</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4 text-sm">
                    <div>
                        <p className="text-muted-foreground">Issue Date</p>
                        <p className="font-medium">{new Date(invoice.issueDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Due Date</p>
                        <p className="font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Unit</p>
                        <p className="font-medium">{unit?.name || "—"}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Property</p>
                        <p className="font-medium">{unit?.property?.name || "—"}</p>
                    </div>
                    {invoice.memo && (
                        <div className="col-span-2 md:col-span-4">
                            <p className="text-muted-foreground">Memo</p>
                            <p className="font-medium">{invoice.memo}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Line items */}
            {invoice.invoiceItems && invoice.invoiceItems.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Line Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Unit Price</TableHead>
                                    <TableHead className="text-right">VAT</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoice.invoiceItems.map((item: any, idx: number) => (
                                    <TableRow key={item.id || idx}>
                                        <TableCell>{item.description || "—"}</TableCell>
                                        <TableCell className="text-right">{Number(item.quantity ?? 0)}</TableCell>
                                        <TableCell className="text-right">{currency} {fmt(item.unitPrice)}</TableCell>
                                        <TableCell className="text-right">{item.vatAmount ? `${currency} ${fmt(item.vatAmount)}` : "—"}</TableCell>
                                        <TableCell className="text-right font-medium">{currency} {fmt(item.amount)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Payments */}
            <Card>
                <CardHeader>
                    <CardTitle>Payments ({payments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {payments.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Method</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment: any) => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                                        <TableCell>{payment.paymentMethod}</TableCell>
                                        <TableCell>{payment.paymentReference || "—"}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {payment.currency || currency} {fmt(payment.amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                            No payments recorded against this invoice yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
