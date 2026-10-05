'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    Archive,
    ArchiveRestore,
    ArrowLeft,
    ArrowRightLeft,
    ClipboardCheck,
    History,
    PackagePlus,
    Pencil,
    Trash2,
    Warehouse,
    Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi } from '@/lib/api';
import { INVENTORY_CATEGORIES, STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import {
    EmptyState,
    ErrorState,
    LoadingState,
    StatusBadge,
} from '@/components/ui/entity-states';
import {
    MovementAmount,
    ReorderCallout,
    StockLevel,
    StockStatusBadge,
    StockValuationPanel,
    movementErrorMessage,
} from '@/components/inventory/stock-display';
import {
    RecordMovementDialog,
    StockTakeDialog,
    TransferStockDialog,
} from '@/components/inventory/movement-dialogs';
import type { InventoryItemDetail, StockMovementRow } from '@/types';

/**
 * One inventory item (Module 11).
 *
 * This is the only screen in the module that can answer "why does the books say
 * four", because it is the only one that shows the rows the level is summed from.
 * Everything above the ledger is derived from those rows and nothing else — which
 * is why there is no edit anywhere on this page that could set a quantity. The
 * ways to change the level are the three buttons at the top, and each of them
 * writes a movement that lands in the table below.
 */
const money = (value: number | null | undefined) =>
    value == null
        ? '—'
        : value.toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

const units = (value: number) =>
    value.toLocaleString('en-KE', { maximumFractionDigits: 2 });

const stamp = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

type Dialog = 'record' | 'transfer' | 'stocktake' | null;

export default function InventoryItemDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [item, setItem] = useState<InventoryItemDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await inventoryApi.item(id);
            setItem(response.data);
        } catch (err) {
            setError(movementErrorMessage(err, 'Could not load this item'));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Per-store balances, with the store's name taken from the movements
     * themselves. A store with no movements against this item has no balance to
     * show and no name here either, which is the same fact the row types describe.
     */
    const stores = useMemo(() => {
        if (!item) return [];
        const names = new Map<string, string>();
        for (const movement of item.movements) {
            names.set(
                movement.warehouse.id,
                `${movement.warehouse.code} · ${movement.warehouse.name}`,
            );
        }
        return Object.entries(item.quantityByWarehouse).map(([warehouseId, balance]) => ({
            warehouseId,
            label: names.get(warehouseId) ?? 'A store with no name on its movements',
            balance,
        }));
    }, [item]);

    const consumed = useMemo(
        () =>
            (item?.consumedBy ?? []).reduce(
                (sum, entry) => sum + Number(entry.quantity),
                0,
            ),
        [item],
    );

    if (isLoading) return <LoadingState label="Loading the item…" />;
    if (error || !item) {
        return <ErrorState message={error ?? 'Item not found'} onRetry={fetchData} />;
    }

    const reorderLevel = Number(item.reorderLevel);
    const categoryLabel =
        INVENTORY_CATEGORIES.find((entry) => entry.value === item.category)?.label ??
        item.category;

    const setActive = async (isActive: boolean) => {
        setIsBusy(true);
        try {
            await inventoryApi.updateItem(id, { isActive });
            toast.success(
                isActive
                    ? `${item.sku} is back in the catalogue`
                    : `${item.sku} retired — every movement stays exactly where it was`,
            );
            fetchData();
        } catch (err) {
            toast.error(movementErrorMessage(err, 'Could not change that'));
        } finally {
            setIsBusy(false);
        }
    };

    const remove = async () => {
        setIsBusy(true);
        try {
            await inventoryApi.deleteItem(id);
            toast.success(`${item.sku} deleted`);
            router.push('/inventory/items');
        } catch (err) {
            toast.error(movementErrorMessage(err, 'Could not delete this item'));
            setIsBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href="/inventory/items"
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to the items
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">
                            {item.sku} — {item.name}
                        </h1>
                        <StockStatusBadge
                            status={item.status}
                            muted={reorderLevel <= 0}
                        />
                        {!item.isActive && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                Retired
                            </span>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {categoryLabel} · counted in {item.unitOfMeasure} ·{' '}
                        {item.movementCount} movement
                        {item.movementCount === 1 ? '' : 's'} across {item.warehouses}{' '}
                        store{item.warehouses === 1 ? '' : 's'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/inventory/items/${item.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            Edit
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={() => setDialog('transfer')}>
                        <ArrowRightLeft
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        Move between stores
                    </Button>
                    <Button variant="outline" onClick={() => setDialog('stocktake')}>
                        <ClipboardCheck
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        Stock take
                    </Button>
                    <Button onClick={() => setDialog('record')}>
                        <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Record stock
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                Where this item stands
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-end gap-6">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        On hand
                                    </p>
                                    <StockLevel
                                        className="text-2xl"
                                        quantity={item.totalQuantity}
                                        unitOfMeasure={item.unitOfMeasure}
                                        reorderLevel={reorderLevel}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        Ordered again at
                                    </p>
                                    <p>
                                        below {units(reorderLevel)}{' '}
                                        {item.unitOfMeasure}
                                        {item.reorderQuantity == null
                                            ? ' — the suggestion tops it up to twice the level'
                                            : ` — order ${units(
                                                  Number(item.reorderQuantity),
                                              )} ${item.unitOfMeasure} each time`}
                                    </p>
                                </div>
                            </div>

                            <ReorderCallout reorder={item.reorder} />

                            <p className="text-sm text-muted-foreground">
                                Nothing on this page is a stored quantity. The level
                                above is the sum of the movements below, recalculated
                                on every read, so it cannot drift away from the rows
                                that justify it.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <History className="h-4 w-4" aria-hidden="true" />
                                Every movement
                                <span className="text-sm font-normal text-muted-foreground">
                                    {item.movements.length} row
                                    {item.movements.length === 1 ? '' : 's'},
                                    newest first
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                &ldquo;Balance after&rdquo; is the level <em>at that
                                moment</em> — the item&apos;s own total at the time of
                                that row, not today&apos;s. The bottom row of the table
                                is today&apos;s figure.
                            </p>

                            {item.movements.length === 0 ? (
                                <EmptyState
                                    title="No stock has ever moved"
                                    description="An item starts empty on purpose. Record an opening balance in its unit and the level becomes the sum of the movements."
                                    icon={<PackagePlus className="h-8 w-8" aria-hidden="true" />}
                                    action={
                                        <Button onClick={() => setDialog('record')}>
                                            Record an opening balance
                                        </Button>
                                    }
                                />
                            ) : (
                                <div className="max-h-[32rem] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>When</TableHead>
                                                <TableHead>Store</TableHead>
                                                <TableHead className="text-right">
                                                    Movement
                                                </TableHead>
                                                <TableHead>Kind</TableHead>
                                                <TableHead>Reason</TableHead>
                                                <TableHead className="text-right">
                                                    Balance after
                                                </TableHead>
                                                <TableHead>Reference</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {item.movements.map((movement) => (
                                                <MovementRow
                                                    key={movement.id}
                                                    movement={movement}
                                                    unitOfMeasure={
                                                        item.unitOfMeasure
                                                    }
                                                />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {item.movements.length > 0 && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href="/inventory/stock-movements">
                                        Every movement across all items
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Wrench className="h-4 w-4" aria-hidden="true" />
                                Used on jobs
                                <span className="text-sm font-normal text-muted-foreground">
                                    {units(consumed)} {item.unitOfMeasure} net of
                                    anything returned
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {item.consumedBy.length === 0 ? (
                                <EmptyState
                                    title="No job has taken any"
                                    description="When a maintenance job issues this item, it shows here with the job it went to."
                                    icon={<Wrench className="h-8 w-8" aria-hidden="true" />}
                                    action={
                                        <Button variant="outline" asChild>
                                            <Link href="/maintenance/work-orders">
                                                See work orders
                                            </Link>
                                        </Button>
                                    }
                                />
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {item.consumedBy.map((entry) => (
                                        <li
                                            key={entry.movementId}
                                            className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
                                        >
                                            <span>
                                                <Link
                                                    href={`/maintenance/work-orders/${entry.workOrder.id}`}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                >
                                                    {entry.workOrder.reference}
                                                </Link>{' '}
                                                {entry.workOrder.title}
                                            </span>
                                            <span className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(
                                                        entry.issuedAt,
                                                    ).toLocaleDateString()}
                                                </span>
                                                <MovementAmount
                                                    quantity={Number(
                                                        entry.quantity,
                                                    )}
                                                    unitOfMeasure={
                                                        item.unitOfMeasure
                                                    }
                                                />
                                                <StatusBadge
                                                    status={entry.workOrder.status}
                                                />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>What the shelf is worth</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <StockValuationPanel valuation={item.valuation} />
                            <p className="text-sm text-muted-foreground">
                                The item list shows a cheaper figure — quantity × the
                                item&apos;s last known price. This one is the weighted
                                average of what the deliveries actually cost, so the two
                                are meant to disagree and this is the one to trust.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Warehouse className="h-4 w-4" aria-hidden="true" />
                                Where it is
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {stores.length === 0 ? (
                                <p className="text-muted-foreground">
                                    Nowhere yet — no store has ever held any.
                                </p>
                            ) : (
                                stores.map((store) => (
                                    <div
                                        key={store.warehouseId}
                                        className="flex items-baseline justify-between gap-3"
                                    >
                                        <Link
                                            href={`/inventory/warehouses/${store.warehouseId}`}
                                            className="underline-offset-4 hover:underline"
                                        >
                                            {store.label}
                                        </Link>
                                        {/*
                                         * Not `StockLevel`: its "not watched" note is
                                         * about the item's reorder level, which is a
                                         * single number for every store and is already
                                         * said above.
                                         */}
                                        <span
                                            className={`font-medium tabular-nums ${
                                                store.balance < 0
                                                    ? 'text-red-700'
                                                    : ''
                                            }`}
                                        >
                                            {store.balance < 0 ? '−' : ''}
                                            {units(Math.abs(store.balance))}
                                            {item.unitOfMeasure !== 'unit' && (
                                                <span className="ml-1 font-normal text-muted-foreground">
                                                    {item.unitOfMeasure}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ))
                            )}
                            {stores.length > 1 && (
                                <p className="pt-1 text-xs text-muted-foreground">
                                    These add up to {units(item.totalQuantity)}{' '}
                                    {item.unitOfMeasure}, which is the item&apos;s
                                    level. A store the item has never been moved in
                                    or out of does not appear.
                                </p>
                            )}
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/inventory/warehouses">
                                    All stores
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <Row label="Code" value={item.sku} />
                            <Row label="Name" value={item.name} />
                            <Row
                                label="Category"
                                value={
                                    INVENTORY_CATEGORIES.find(
                                        (entry) => entry.value === item.category,
                                    )?.hint ?? categoryLabel
                                }
                            />
                            <Row label="Counted in" value={item.unitOfMeasure} />
                            <Row
                                label="Last price"
                                value={
                                    item.unitCost == null ? (
                                        <span className="text-muted-foreground">
                                            No price on file
                                        </span>
                                    ) : (
                                        `${money(Number(item.unitCost))} per ${item.unitOfMeasure}`
                                    )
                                }
                            />
                            <Row
                                label="Reorder level"
                                value={
                                    reorderLevel <= 0
                                        ? 'None — tracked but nothing alerts on it'
                                        : `${units(reorderLevel)} ${item.unitOfMeasure}`
                                }
                            />
                            <Row
                                label="Order quantity"
                                value={
                                    item.reorderQuantity == null
                                        ? 'Not set — twice the level is used'
                                        : `${units(Number(item.reorderQuantity))} ${item.unitOfMeasure}`
                                }
                            />
                            <Row
                                label="Supplier"
                                value={
                                    item.preferredSupplier ? (
                                        <>
                                            {item.preferredSupplier.name}
                                            {item.preferredSupplier.phone && (
                                                <p className="text-xs text-muted-foreground">
                                                    {item.preferredSupplier.phone}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            Not decided
                                        </span>
                                    )
                                }
                            />
                            <Row
                                label="Last movement"
                                value={
                                    item.lastMovementAt
                                        ? stamp(item.lastMovementAt)
                                        : '—'
                                }
                            />
                            {item.description && (
                                <Row label="Description" value={item.description} />
                            )}
                            {item.notes && <Row label="Notes" value={item.notes} />}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Keep it or retire it</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p className="text-muted-foreground">
                                Retiring takes it out of the list and stops anything
                                moving against it, but every movement and the balance
                                they add up to stay readable for as long as the
                                history matters.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    disabled={isBusy}
                                    onClick={() => void setActive(!item.isActive)}
                                >
                                    {item.isActive ? (
                                        <>
                                            <Archive
                                                className="mr-2 h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            Retire it
                                        </>
                                    ) : (
                                        <>
                                            <ArchiveRestore
                                                className="mr-2 h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            Put it back in the catalogue
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={isBusy}
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                    Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <RecordMovementDialog
                isOpen={dialog === 'record'}
                onClose={() => setDialog(null)}
                onRecorded={() => fetchData()}
                defaultItemId={item.id}
            />
            <TransferStockDialog
                isOpen={dialog === 'transfer'}
                onClose={() => setDialog(null)}
                onTransferred={() => fetchData()}
            />
            <StockTakeDialog
                isOpen={dialog === 'stocktake'}
                onClose={() => setDialog(null)}
                onRecorded={() => fetchData()}
            />

            <ConfirmDialog
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={() => void remove()}
                title={`Delete ${item.sku}?`}
                message={`The API refuses this once the item has any movements against it, because deleting it would take the stock balance with it. ${item.movementCount === 0 ? 'This one has none, so it can go.' : 'This one has movements, so retiring it is usually the right move and keeps the history readable.'}`}
                confirmText="Delete it"
            />
        </div>
    );
}

function MovementRow({
    movement,
    unitOfMeasure,
}: {
    movement: StockMovementRow;
    unitOfMeasure: string;
}) {
    const typeMeta = STOCK_MOVEMENT_TYPES.find(
        (entry) => entry.value === movement.type,
    );

    return (
        <TableRow>
            <TableCell className="whitespace-nowrap text-sm">
                {stamp(movement.createdAt)}
            </TableCell>
            <TableCell className="text-sm">
                {movement.warehouse.code}
                <p className="text-xs text-muted-foreground">
                    {movement.warehouse.name}
                </p>
            </TableCell>
            <TableCell className="text-right">
                <MovementAmount
                    quantity={movement.quantity}
                    unitOfMeasure={unitOfMeasure}
                />
            </TableCell>
            <TableCell className="text-sm" title={typeMeta?.hint}>
                {typeMeta?.label ?? movement.type}
                {movement.createdBy && (
                    <p className="text-xs text-muted-foreground">
                        {movement.createdBy.firstName}{' '}
                        {movement.createdBy.lastName}
                    </p>
                )}
            </TableCell>
            <TableCell className="text-sm">
                {movement.reason ?? movement.notes ?? '—'}
            </TableCell>
            <TableCell className="text-right text-sm tabular-nums">
                {movement.balanceAfter == null
                    ? '—'
                    : units(movement.balanceAfter)}
            </TableCell>
            <TableCell>
                <MovementReference movement={movement} />
            </TableCell>
        </TableRow>
    );
}

/**
 * Where the movement came from, as a link to the document that caused it.
 *
 * A movement with no reference is not a mistake to hide — it is somebody typing
 * a number in a box, and saying "typed in by hand" is more use to the next
 * person than a blank cell.
 */
function MovementReference({ movement }: { movement: StockMovementRow }) {
    const receipt = movement.goodsReceiptLine?.goodsReceipt;

    if (movement.workOrder) {
        return (
            <Link
                href={`/maintenance/work-orders/${movement.workOrder.id}`}
                className="text-sm underline-offset-4 hover:underline"
                title={movement.workOrder.title}
            >
                {movement.workOrder.reference}
            </Link>
        );
    }

    if (receipt) {
        return (
            <Link
                href={`/procurement/purchase-orders/${receipt.purchaseOrder.id}`}
                className="text-sm underline-offset-4 hover:underline"
                title={`Received ${stamp(receipt.receivedAt)}${
                    receipt.deliveryNote ? ` · ${receipt.deliveryNote}` : ''
                }`}
            >
                {receipt.purchaseOrder.reference}
            </Link>
        );
    }

    if (movement.transferGroup) {
        return (
            <span
                className="text-sm text-muted-foreground"
                title={`Half of one transfer · ${movement.transferGroup}`}
            >
                Between stores
            </span>
        );
    }

    return (
        <span className="text-sm text-muted-foreground">Typed in by hand</span>
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