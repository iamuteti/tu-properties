"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AxiosError } from "axios";
import { Download, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { ReceiptProgress } from "@/components/procurement/quote-comparison";
import { procurementApi } from "@/lib/api";
import type { PurchaseOrder, PurchaseOrderStats } from "@/types";

/**
 * Module 10 — purchase orders.
 *
 * An order is the document that commits money, so the two numbers that matter
 * operationally are on every row: how much has physically arrived, and whether
 * finance has been asked to bill for it. An order that is RECEIVED with no bill
 * is a real, common state — the goods came, the invoice has not — and it is the
 * one somebody has to notice, which is why `awaitingBill` leads the cards.
 */
const money = (value: number | string | null | undefined) =>
    value == null
        ? '—'
        : Number(value).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

export default function PurchaseOrdersPage() {
    const searchParams = useSearchParams();
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [stats, setStats] = useState<PurchaseOrderStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [hasBill, setHasBill] = useState('');
    const [search, setSearch] = useState('');
    const requestFilter = searchParams.get('purchaseRequestId') ?? '';

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (status) params.status = status;
            if (hasBill) params.hasBill = hasBill;
            if (search.trim()) params.search = search.trim();
            if (requestFilter) params.purchaseRequestId = requestFilter;
            const [list, summary] = await Promise.all([
                procurementApi.purchaseOrders(params),
                procurementApi.purchaseOrderStats(),
            ]);
            setOrders(list.data);
            setStats(summary.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load purchase orders',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status, hasBill, search, requestFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase orders</h1>
                    <p className="text-muted-foreground">
                        What has been committed to suppliers, and how much of it has arrived
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href={procurementApi.purchaseOrdersExportUrl({
                                status: status || undefined,
                                search: search.trim() || undefined,
                            })}
                        >
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/procurement/purchase-orders/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Raise an order
                        </Link>
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Stat label="Orders" value={stats.total} />
                    <Stat
                        label="Open value"
                        value={money(stats.openValue)}
                        note="Committed, not yet received"
                    />
                    <Stat
                        label="Overdue delivery"
                        value={stats.overdue}
                        tone={stats.overdue > 0 ? 'amber' : undefined}
                    />
                    <Stat
                        label="Received, not yet billed"
                        value={stats.awaitingBill}
                        tone={stats.awaitingBill > 0 ? 'amber' : undefined}
                        note="Goods came in; finance has not been asked"
                    />
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="poStatus">Status</Label>
                    <Select
                        name="poStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            { value: '', label: 'All orders' },
                            { value: 'DRAFT', label: 'Draft' },
                            { value: 'SENT', label: 'Sent' },
                            { value: 'ACCEPTED', label: 'Accepted' },
                            { value: 'PARTIALLY_RECEIVED', label: 'Part received' },
                            { value: 'RECEIVED', label: 'Received' },
                            { value: 'CLOSED', label: 'Closed' },
                            { value: 'CANCELLED', label: 'Cancelled' },
                        ]}
                    />
                </div>
                <div className="w-52">
                    <Label htmlFor="poBill">Billing</Label>
                    <Select
                        name="poBill"
                        value={hasBill}
                        onChange={(event) => setHasBill(event.target.value)}
                        options={[
                            { value: '', label: 'Any' },
                            { value: 'false', label: 'No bill raised yet' },
                            { value: 'true', label: 'Billed' },
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="poSearch">Search</Label>
                    <Input
                        id="poSearch"
                        value={search}
                        placeholder="Reference or supplier"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {requestFilter && (
                <p className="text-sm text-muted-foreground">
                    Filtered to one request.{' '}
                    <Link
                        href="/procurement/purchase-orders"
                        className="underline-offset-4 hover:underline"
                    >
                        Show all orders
                    </Link>
                </p>
            )}

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading purchase orders..." />
            ) : orders.length === 0 ? (
                <EmptyState
                    title="No purchase orders yet"
                    description="Orders are raised from an awarded quotation, so this fills up once something has been bought."
                    icon={<Truck className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/procurement/rfqs">See awarded rounds</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead className="text-right">Value</TableHead>
                                    <TableHead className="w-40">Received</TableHead>
                                    <TableHead>Promised</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Billing</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-medium">
                                            <Link
                                                href={`/procurement/purchase-orders/${order.id}`}
                                                className="underline-offset-4 hover:underline"
                                            >
                                                {order.reference}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{order.supplier?.name ?? '—'}</TableCell>
                                        <TableCell className="text-right">
                                            {money(order.totalAmount)}
                                        </TableCell>
                                        <TableCell>
                                            <ReceiptProgress
                                                receivedPercent={order.receivedPercent ?? 0}
                                                outstandingQuantity={
                                                    order.outstandingQuantity ?? 0
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {order.expectedDelivery
                                                ? new Date(
                                                      order.expectedDelivery,
                                                  ).toLocaleDateString()
                                                : '—'}
                                            {order.overdue && (
                                                <p className="text-xs text-amber-700">
                                                    {order.daysOverdue} days late
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={order.status} />
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {order.supplierBill ? (
                                                <span className="text-emerald-700">
                                                    {order.supplierBill.billNumber}
                                                </span>
                                            ) : order.status === 'RECEIVED' ? (
                                                <span className="text-amber-700">
                                                    awaiting bill
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
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

function Stat({
    label,
    value,
    note,
    tone,
}: {
    label: string;
    value: number | string;
    note?: string;
    tone?: 'amber';
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p
                    className={`text-2xl font-semibold ${
                        tone === 'amber' && Number(value) > 0 ? 'text-amber-700' : ''
                    }`}
                >
                    {value}
                </p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}