'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft, History, MapPin, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    MovementAmount,
    StockLevel,
    StockStatusBadge,
    movementErrorMessage,
} from '@/components/inventory/stock-display';
import { RecordMovementDialog } from '@/components/inventory/movement-dialogs';
import { inventoryApi } from '@/lib/api';
import { STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import type { WarehouseDetail } from '@/types';

/**
 * Module 11 — one store.
 *
 * Two panels earn their place here and the third that usually would not.
 *
 * `belowReorder` is **this store's** answer, not the organisation's: an item can be
 * comfortable in the main store and empty at the site store, and only the balance of
 * this store's own movements can tell you which. That is a different question from
 * the item list's, and answering it with the wrong one is how a van leaves for a
 * site with nothing to unload.
 *
 * `recentMovements` is the ledger restricted to this store. It is here so "what
 * happened to the shelf" is answerable without leaving the store, not as a
 * replacement for the full ledger — which is where the purchase-order and work-order
 * references live.
 */
export default function WarehouseDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const [store, setStore] = useState<WarehouseDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await inventoryApi.warehouse(id);
            setStore(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load this store',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const remove = async () => {
        setIsDeleting(true);
        try {
            await inventoryApi.deleteWarehouse(id);
            toast.success(`${store?.name ?? 'Store'} deleted`);
            router.push('/inventory/warehouses');
        } catch (err) {
            // The API's refusal is a sentence explaining that the ledger would lose
            // the record of where the stock was, so it is worth reading verbatim
            // rather than replacing with our own message.
            toast.error(movementErrorMessage(err, 'Could not delete this store'));
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the store…" />;
    if (error || !store) {
        return (
            <ErrorState
                message={error ?? 'Store not found'}
                onRetry={fetchData}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href="/inventory/warehouses"
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to the stores
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {store.code} — {store.name}
                    </h1>
                    <p className="text-muted-foreground">
                        {store.isDefault && (
                            <span className="mr-2 inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">
                                Default store
                            </span>
                        )}
                        {!store.isActive ? 'Deactivated' : 'Active'} ·{' '}
                        {store.distinctItems}{' '}
                        {store.distinctItems === 1 ? 'item' : 'items'} across{' '}
                        {store.unitsHeld.toLocaleString('en-KE', {
                            maximumFractionDigits: 2,
                        })}{' '}
                        units
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setIsRecording(true)}>
                        <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Add stock here
                    </Button>
                    <Button
                        onClick={() => router.push(`/inventory/warehouses/${store.id}/edit`)}
                    >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button
                        variant="outline"
                        disabled={isDeleting}
                        onClick={() => setIsConfirmingDelete(true)}
                    >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isDeleting ? 'Deleting…' : 'Delete'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Short at this store</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Counted against each item&apos;s reorder level{' '}
                                <strong className="font-medium text-foreground">
                                    in this store only
                                </strong>
                                {' — never summed across every store. An item can be '}
                                comfortable in the main store and empty at the site
                                store, and only this store&apos;s own movements can
                                tell you which.
                            </p>

                            {store.belowReorder.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {store.distinctItems === 0
                                        ? 'Nothing has ever been booked into this store, so there is nothing to be short of.'
                                        : 'Everything held here is at or above its reorder level.'}
                                </p>
                            ) : (
                                <>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>On hand here</TableHead>
                                                <TableHead className="text-right">
                                                    Short by
                                                </TableHead>
                                                <TableHead>State</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {store.belowReorder.map((item) => {
                                                const status =
                                                    item.onHand === 0
                                                        ? 'OUT_OF_STOCK'
                                                        : 'REORDER';
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">
                                                            <Link
                                                                href={`/inventory/items/${item.id}`}
                                                                className="underline-offset-4 hover:underline"
                                                            >
                                                                {item.name}
                                                            </Link>
                                                            <p className="text-xs text-muted-foreground">
                                                                {item.sku}
                                                            </p>
                                                        </TableCell>
                                                        <TableCell>
                                                            <StockLevel
                                                                quantity={item.onHand}
                                                                unitOfMeasure={
                                                                    item.unitOfMeasure
                                                                }
                                                                reorderLevel={
                                                                    item.reorderLevel
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {Math.max(
                                                                0,
                                                                item.reorderLevel -
                                                                    item.onHand,
                                                            ).toLocaleString('en-KE', {
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <StockStatusBadge
                                                                status={status}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                    {store.belowReorder.some(
                                        (item) => item.unitCost == null,
                                    ) && (
                                        <p className="text-xs text-muted-foreground">
                                            Some of these have no price on file, so what
                                            it would cost to top this store up is
                                            unknown rather than free.
                                        </p>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-4 w-4" aria-hidden="true" />
                                Recent movements in this store
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                The balance is the level <em>as of that movement</em>,
                                not today&apos;s — which is why the variances in a
                                filtered view still add up.
                            </p>

                            {store.recentMovements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing has moved through here yet. Deliveries booked
                                    in from a purchase order, or stock recorded by hand,
                                    will show up here.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>When</TableHead>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">
                                                Movement
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Balance after
                                            </TableHead>
                                            <TableHead>Reason</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {store.recentMovements.map((movement) => (
                                            <TableRow key={movement.id}>
                                                <TableCell className="whitespace-nowrap text-sm">
                                                    {new Date(
                                                        movement.createdAt,
                                                    ).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    <Link
                                                        href={`/inventory/items/${movement.itemId}`}
                                                        className="underline-offset-4 hover:underline"
                                                    >
                                                        {movement.item.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {movement.item.sku}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <MovementAmount
                                                        quantity={movement.quantity}
                                                        unitOfMeasure={
                                                            movement.item
                                                                .unitOfMeasure
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {movement.balanceAfter === null
                                                        ? '—'
                                                        : movement.balanceAfter.toLocaleString(
                                                              'en-KE',
                                                              {
                                                                  maximumFractionDigits: 2,
                                                              },
                                                          )}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    <span title={typeHint(movement)}>
                                                        {movement.reason ??
                                                            typeLabel(movement)}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}

                            <p className="text-sm">
                                <Link
                                    href={`/inventory/stock-movements?warehouseId=${store.id}`}
                                    className="underline-offset-4 hover:underline"
                                >
                                    Open the whole ledger for this store
                                </Link>
                                <span className="text-muted-foreground">
                                    {' '}
                                    — the purchase orders and work orders behind these
                                    movements are recorded there.
                                </span>
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <Row label="Code" value={store.code} />
                            <Row
                                label="Units held"
                                value={store.unitsHeld.toLocaleString('en-KE', {
                                    maximumFractionDigits: 2,
                                })}
                            />
                            <Row label="Different items" value={store.distinctItems} />
                            <Row
                                label="Default"
                                value={store.isDefault ? 'Yes' : 'No'}
                            />
                            <Row
                                label="In use"
                                value={store.isActive ? 'Yes' : 'Deactivated'}
                            />
                            <Row
                                label="Where it is"
                                value={
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                        />
                                        {store.address ?? '—'}
                                    </span>
                                }
                            />
                            <Row label="Contact" value={store.phone ?? '—'} />
                            <Row
                                label="Opened"
                                value={new Date(
                                    store.createdAt,
                                ).toLocaleDateString()}
                            />
                            {!store.isActive && (
                                <p className="pt-2 text-xs text-muted-foreground">
                                    Deactivated stores take no new stock. Every movement
                                    already recorded stays readable, because where
                                    something used to be kept is a fact.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {store.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-line text-sm">
                                    {store.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <RecordMovementDialog
                isOpen={isRecording}
                onClose={() => setIsRecording(false)}
                onRecorded={fetchData}
                defaultWarehouseId={store.id}
            />

            <ConfirmDialog
                isOpen={isConfirmingDelete}
                onClose={() => setIsConfirmingDelete(false)}
                onConfirm={remove}
                title={`Delete ${store.name}?`}
                message={`The API refuses to delete a store once anything has moved through it — the ledger would lose the record of where that stock was kept. If this store has held stock, deactivate it instead: that hides it from new stock and leaves every past movement readable. Deletion only works on a store nothing has ever touched.`}
                confirmText="Delete it"
            />
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <span className="text-right">{value}</span>
        </div>
    );
}

/**
 * A movement with no written reason — an opening balance, most often — shows its
 * kind instead of an em dash, and carries the kind's own explanation on hover.
 * "OPENING" alone does not say what the row is; `STOCK_MOVEMENT_TYPES` does, and
 * the ledger reads it from the same place so the two pages cannot disagree.
 */
function typeMeta(type: WarehouseDetail['recentMovements'][number]['type']) {
    return STOCK_MOVEMENT_TYPES.find((entry) => entry.value === type);
}

function typeLabel(movement: WarehouseDetail['recentMovements'][number]): string {
    return typeMeta(movement.type)?.label ?? movement.type;
}

function typeHint(movement: WarehouseDetail['recentMovements'][number]): string {
    return typeMeta(movement.type)?.hint ?? movement.type;
}