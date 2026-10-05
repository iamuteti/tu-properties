'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { Download, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { inventoryApi } from '@/lib/api';
import type { WarehouseRow } from '@/types';

/**
 * Module 11 — the stores.
 *
 * A store is a place, not a category, so the only two things worth putting on
 * every row are the two the backend derived for it: how many units are held here
 * and how many different things those are. Both come from the movements rather
 * than from anything anybody typed, which is the whole point of the module.
 *
 * `unitsHeld` deliberately gets no unit label. It is a sum over items measured in
 * tins, metres and bags, and "1,240 units" is the only honest way to add those
 * together.
 */
export default function WarehousesPage() {
    const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [includeInactive, setIncludeInactive] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await inventoryApi.warehouses({
                includeInactive: includeInactive ? 'true' : undefined,
            });
            setWarehouses(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load the stores',
            );
        } finally {
            setIsLoading(false);
        }
    }, [includeInactive]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Stores</h1>
                    <p className="text-muted-foreground">
                        Where the company keeps things — the main store, a site store,
                        the cupboard under the stairs
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={inventoryApi.warehousesExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/inventory/warehouses/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add a store
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <input
                        id="include-inactive"
                        type="checkbox"
                        checked={includeInactive}
                        onChange={(event) => setIncludeInactive(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                    />
                    <Label htmlFor="include-inactive" className="text-sm font-normal">
                        Include deactivated
                    </Label>
                </div>
            </div>

            <p className="text-sm text-muted-foreground">
                A store with movements against it is deactivated rather than deleted,
                because where something used to be kept is a fact — deleting it would
                take that out of the ledger. Deactivating hides it from new stock and
                leaves every past movement readable.
            </p>

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading the stores…" />
            ) : warehouses.length === 0 ? (
                <EmptyState
                    title={includeInactive ? 'No stores at all' : 'No active stores'}
                    description={
                        includeInactive
                            ? 'Nothing has been set up yet.'
                            : 'Every store is deactivated. Turn the filter on above to see them, or add a new one.'
                    }
                    icon={<WarehouseIcon className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/inventory/warehouses/new">Add a store</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Store</TableHead>
                                    <TableHead>Where it is</TableHead>
                                    <TableHead className="text-right">Units held</TableHead>
                                    <TableHead className="text-right">Items</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {warehouses.map((store) => (
                                    <TableRow key={store.id}>
                                        <TableCell className="font-medium">
                                            <Link
                                                href={`/inventory/warehouses/${store.id}`}
                                                className="underline-offset-4 hover:underline"
                                            >
                                                {store.name}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {store.code}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {store.address ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {store.unitsHeld.toLocaleString('en-KE', {
                                                maximumFractionDigits: 2,
                                            })}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {store.distinctItems}
                                        </TableCell>
                                        <TableCell>
                                            <StoreStatus store={store} />
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

/**
 * Two facts, side by side, because they are different and both are load-bearing:
 * whether stock can still be booked in here, and where goods land when nobody says.
 */
function StoreStatus({ store }: { store: WarehouseRow }) {
    if (!store.isActive) {
        return (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                Deactivated
            </span>
        );
    }

    return (
        <span className="flex flex-wrap items-center gap-1.5">
            {store.isDefault && (
                <span
                    className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800"
                    title="Goods are booked in here when nobody says where — it is the answer the API uses when the store is left out"
                >
                    Default
                </span>
            )}
            <span className="text-xs text-muted-foreground">
                {store.hasStock ? 'In use' : 'Empty'}
            </span>
        </span>
    );
}