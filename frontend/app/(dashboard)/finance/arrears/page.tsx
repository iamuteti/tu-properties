"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { financeApi } from "@/lib/api";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Arrears {
    asOf: string;
    buckets: {
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        over90: number;
        total: number;
        overdue: number;
    };
    byTenant: {
        tenantId: string;
        tenantName: string;
        phone: string | null;
        total: number;
        overdue: number;
        invoices: { id: string; invoiceNumber: string; dueDate: string; balance: number }[];
    }[];
}

/**
 * Arrears: who owes what, and how stale (Module 17, alongside the reminders
 * that act on it). Ordered by overdue amount rather than total, because a tenant
 * owing a large sum that is not yet late is not a collections call.
 */
export default function ArrearsPage() {
    const [data, setData] = useState<Arrears | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await financeApi.arrears();
            setData(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load arrears",
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const worstBucket = useMemo(() => {
        if (!data) return null;
        const entries = [
            { label: "1–30 days", value: data.buckets.days1to30 },
            { label: "31–60 days", value: data.buckets.days31to60 },
            { label: "61–90 days", value: data.buckets.days61to90 },
            { label: "Over 90 days", value: data.buckets.over90 },
        ];
        return entries.reduce((worst, entry) => (entry.value > worst.value ? entry : worst));
    }, [data]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Arrears</h1>
                <p className="text-muted-foreground">
                    Rent owed and how late it is — the same buckets as the payables aging
                    report, on the receivables side
                </p>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading arrears...</div>
            ) : !data ? (
                <div className="text-muted-foreground">No data.</div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-sm text-muted-foreground">Total outstanding</p>
                                <p className="text-2xl font-semibold">{money(data.buckets.total)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-sm text-muted-foreground">Past due</p>
                                <p className="text-2xl font-semibold text-destructive">
                                    {money(data.buckets.overdue)}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-sm text-muted-foreground">Tenants in arrears</p>
                                <p className="text-2xl font-semibold">{data.byTenant.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-sm text-muted-foreground">Worst bucket</p>
                                <p className="text-2xl font-semibold">
                                    {worstBucket ? worstBucket.label : "—"}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {data.buckets.over90 > 0 && (
                        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                            <AlertTriangle className="h-4 w-4" />
                            {money(data.buckets.over90)} is more than 90 days past due.
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">By age</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-5">
                                {[
                                    { label: "Current", value: data.buckets.current },
                                    { label: "1–30 days", value: data.buckets.days1to30 },
                                    { label: "31–60 days", value: data.buckets.days31to60 },
                                    { label: "61–90 days", value: data.buckets.days61to90 },
                                    { label: "Over 90 days", value: data.buckets.over90 },
                                ].map((bucket) => (
                                    <div key={bucket.label}>
                                        <p className="text-sm text-muted-foreground">
                                            {bucket.label}
                                        </p>
                                        <p className="text-lg font-semibold">
                                            {money(bucket.value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                <TrendingDown className="mr-2 inline h-5 w-5" />
                                Who owes, worst first
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {data.byTenant.length === 0 ? (
                                <p className="py-6 text-center text-muted-foreground">
                                    Nothing outstanding.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Tenant</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead className="text-right">Overdue</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.byTenant.map((tenant) => (
                                            <Fragment key={tenant.tenantId}>
                                                <TableRow>
                                                    <TableCell className="font-medium">
                                                        {tenant.tenantName || "Unnamed"}
                                                    </TableCell>
                                                    <TableCell>{tenant.phone || "—"}</TableCell>
                                                    <TableCell className="text-right text-destructive">
                                                        {money(tenant.overdue)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {money(tenant.total)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                setExpanded((current) =>
                                                                    current === tenant.tenantId
                                                                        ? null
                                                                        : tenant.tenantId,
                                                                )
                                                            }
                                                        >
                                                            {tenant.invoices.length} invoice
                                                            {tenant.invoices.length === 1 ? "" : "s"}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                                {expanded === tenant.tenantId && (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="bg-muted/30">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Invoice</TableHead>
                                                                        <TableHead>Due</TableHead>
                                                                        <TableHead className="text-right">
                                                                            Balance
                                                                        </TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {tenant.invoices.map((invoice) => (
                                                                        <TableRow key={invoice.id}>
                                                                            <TableCell>
                                                                                <Link
                                                                                    href={`/finance/invoices/${invoice.id}`}
                                                                                    className="font-mono hover:underline"
                                                                                >
                                                                                    {invoice.invoiceNumber}
                                                                                </Link>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {new Date(
                                                                                    invoice.dueDate,
                                                                                ).toLocaleDateString()}
                                                                            </TableCell>
                                                                            <TableCell className="text-right">
                                                                                {money(invoice.balance)}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}