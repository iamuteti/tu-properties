"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { Award, Building2, Star } from "lucide-react";
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { procurementApi } from "@/lib/api";
import type { ProcurementSupplier } from "@/types";

/**
 * Suppliers, from procurement's side (Module 10).
 *
 * The same rows accounts payable sees — one supplier table, one `SUP-NNNN`
 * sequence — with the figures a buyer actually judges a vendor on: on-time
 * delivery and how often they win. Both are derived on read from the orders and
 * quotations, because a stored score goes stale the first time a supplier is
 * late once and then nobody trusts it.
 *
 * `null` rates are not zero. A supplier who has never had a delivery recorded has
 * no on-time rate, and showing them 0% would be a lie about somebody who has
 * not been tried.
 */
const CATEGORY_LABELS: Record<string, string> = {
    PLUMBING: 'Plumbing',
    ELECTRICAL: 'Electrical',
    MECHANICAL: 'Mechanical',
    BUILDING_MATERIALS: 'Building materials',
    FURNITURE: 'Furniture',
    IT_AND_TECH: 'IT and tech',
    CLEANING: 'Cleaning',
    SECURITY: 'Security',
    PEST_CONTROL: 'Pest control',
    LANDSCAPING: 'Landscaping',
    PROFESSIONAL_SERVICES: 'Professional services',
    GENERAL: 'General',
};

const money = (value: number | string | null | undefined) =>
    value == null
        ? '—'
        : Number(value).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<ProcurementSupplier[]>([]);
    const [spend, setSpend] = useState<
        { supplierId: string; supplierName: string; total: number; orders: number }[]
    >([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState('');
    const [contractOnly, setContractOnly] = useState('');
    const [search, setSearch] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (category) params.category = category;
            if (contractOnly) params.contractOnly = contractOnly;
            if (search.trim()) params.search = search.trim();
            const [list, spendReport] = await Promise.all([
                procurementApi.suppliers(params),
                procurementApi.supplierSpend(),
            ]);
            setSuppliers(list.data);
            setSpend(spendReport.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load suppliers',
            );
        } finally {
            setIsLoading(false);
        }
    }, [category, contractOnly, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalSpend = useMemo(
        () => spend.reduce((sum, row) => sum + row.total, 0),
        [spend],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                    <p className="text-muted-foreground">
                        The same records accounts payable uses, with the delivery record a buyer
                        judges a vendor on
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/finance/suppliers">
                        Contact and banking details live in Finance
                    </Link>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Stat label="Suppliers" value={suppliers.length} />
                <Stat label="Spend, all time" value={money(totalSpend)} note="From purchase orders" />
                <Stat
                    label="Top supplier by spend"
                    value={spend[0]?.supplierName ?? '—'}
                    note={spend[0] ? money(spend[0].total) : undefined}
                />
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="supplierCategory">Supplies</Label>
                    <Select
                        name="supplierCategory"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        options={[
                            { value: '', label: 'Everything' },
                            ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                                value,
                                label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="contractOnly">Contracts</Label>
                    <Select
                        name="contractOnly"
                        value={contractOnly}
                        onChange={(event) => setContractOnly(event.target.value)}
                        options={[
                            { value: '', label: 'Any' },
                            { value: 'true', label: 'Under a live contract' },
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="supplierSearch">Search</Label>
                    <Input
                        id="supplierSearch"
                        value={search}
                        placeholder="Name, code or email"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading suppliers..." />
            ) : suppliers.length === 0 ? (
                <EmptyState
                    title="No suppliers yet"
                    description="Suppliers are created in accounts payable, because that is where their invoices and banking details live."
                    icon={<Building2 className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/finance/suppliers">Open accounts payable</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Supplies</TableHead>
                                    <TableHead className="text-center">Rating</TableHead>
                                    <TableHead className="text-right">Orders</TableHead>
                                    <TableHead className="text-right">Spend</TableHead>
                                    <TableHead className="text-right">On time</TableHead>
                                    <TableHead className="text-right">Quotation win rate</TableHead>
                                    <TableHead>Contract</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliers.map((supplier) => (
                                    <TableRow key={supplier.id}>
                                        <TableCell>
                                            <span className="font-medium">
                                                {supplier.name}
                                            </span>
                                            <p className="text-xs text-muted-foreground">
                                                {supplier.code}
                                                {supplier.city ? ` · ${supplier.city}` : ''}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {supplier.category
                                                ? (CATEGORY_LABELS[supplier.category] ??
                                                  supplier.category)
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {supplier.rating ? (
                                                <span className="inline-flex items-center gap-0.5">
                                                    {Array.from(
                                                        { length: supplier.rating },
                                                    ).map((_, index) => (
                                                        <Star
                                                            key={index}
                                                            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                                                            aria-hidden="true"
                                                        />
                                                    ))}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {supplier.performance.orders}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(supplier.performance.totalSpend)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {supplier.performance.onTimeRate === null ? (
                                                <span
                                                    className="text-muted-foreground"
                                                    title="No deliveries recorded yet"
                                                >
                                                    —
                                                </span>
                                            ) : (
                                                <span
                                                    className={
                                                        supplier.performance.onTimeRate >= 80
                                                            ? 'text-emerald-700'
                                                            : supplier.performance.onTimeRate >= 50
                                                              ? 'text-amber-700'
                                                              : 'text-red-700'
                                                    }
                                                >
                                                    {supplier.performance.onTimeRate}%
                                                </span>
                                            )}
                                        </TableCell>
<TableCell className="text-right">
                                            {supplier.performance.winRate === null ? (
                                                <span className="text-muted-foreground">
                                                    never quoted
                                                </span>
                                            ) : (
                                                `${supplier.performance.winRate}%`
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {supplier.contractEndDate ? (
                                                <span
                                                    className={
                                                        supplier.contractExpired
                                                            ? 'text-red-700'
                                                            : supplier.contractExpiringSoon
                                                              ? 'text-amber-700'
                                                              : ''
                                                    }
                                                >
                                                    {supplier.contractExpired ? 'Expired' : 'To'}{' '}
                                                    {new Date(
                                                        supplier.contractEndDate,
                                                    ).toLocaleDateString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    No contract
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <p className="flex items-start gap-2 text-sm text-muted-foreground">
<Award className="mt-0.5 h-4 w-4" aria-hidden="true" />
                Ratings are a buyer&apos;s own judgement, kept next to the numbers rather than
                replacing them — they disagree, and that disagreement is worth seeing.
                Every figure here is worked out from the orders and quotations rather than
                stored, so it cannot go stale.
            </p>
        </div>
    );
}

function Stat({
    label,
    value,
    note,
}: {
    label: string;
    value: number | string;
    note?: string;
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="truncate text-2xl font-semibold">{value}</p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}