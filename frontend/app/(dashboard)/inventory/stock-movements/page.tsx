'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AxiosError } from 'axios';
import {
    ArrowRightLeft,
    BellRing,
    Download,
    PackagePlus,
    ScrollText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { MovementAmount } from '@/components/inventory/stock-display';
import {
    RecordMovementDialog,
    TransferStockDialog,
} from '@/components/inventory/movement-dialogs';
import { inventoryApi } from '@/lib/api';
import {
    STOCK_MOVEMENT_DIRECTIONS,
    STOCK_MOVEMENT_TYPES,
} from '@/lib/constants';
import type {
    StockMovementRow,
    StockMovementStats,
    StockMovementType,
    WarehouseRow,
} from '@/types';

/**
 * Module 11 — the ledger.
 *
 * This is the page a sceptic opens, so it is built to be argued with. Three things
 * make that possible.
 *
 * **`balanceAfter` is the level as of that movement, not today's.** It is computed
 * by walking the history per item per store, which is why a filtered view still
 * adds up: the numbers reconcile to the shelf as it stood at the time, and only
 * the newest row of a given item-and-store pair carries today's level.
 *
 * **Every row names what caused it.** A goods receipt points at the purchase order,
 * a work-order issue at the job, a transfer at the other half of the same trip. A
 * movement with no reference is a movement somebody typed by hand, and it says so
 * rather than looking like one that came from nowhere.
 *
 * **The type carries its own meaning.** "ADJUSTMENT" does not tell a reader whether
 * stock went up or down — the sign does, and the tooltip says why the row is allowed
 * to exist at all.
 */

/** Where the row's authority comes from, if anywhere. */
function referenceFor(movement: StockMovementRow) {
    if (movement.workOrder) {
        return {
            href: `/maintenance/work-orders/${movement.workOrder.id}`,
            label: movement.workOrder.reference,
            title: movement.workOrder.title,
        };
    }
    const purchaseOrder = movement.goodsReceiptLine?.goodsReceipt.purchaseOrder;
    if (purchaseOrder) {
        return {
            href: `/procurement/purchase-orders/${purchaseOrder.id}`,
            label: purchaseOrder.reference,
            title: movement.goodsReceiptLine?.goodsReceipt.deliveryNote ?? undefined,
        };
    }
    return null;
}

export default function StockMovementsPage() {
    const searchParams = useSearchParams();
    const [movements, setMovements] = useState<StockMovementRow[]>([]);
    const [stats, setStats] = useState<StockMovementStats | null>(null);
    const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSweeping, setIsSweeping] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);

    // Both ids can arrive as query parameters, so an item or a store can point here
    // to ask its own question of the ledger. `itemId` is read-only because the
    // on-page filter for an item is the SKU/name text search, not an id picker.
    const [itemId] = useState(() => searchParams.get('itemId') ?? '');
    const [warehouseId, setWarehouseId] = useState(
        () => searchParams.get('warehouseId') ?? '',
    );
    const [type, setType] = useState('');
    const [direction, setDirection] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [search, setSearch] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (itemId) params.itemId = itemId;
            if (warehouseId) params.warehouseId = warehouseId;
            if (type) params.type = type;
            if (direction) params.direction = direction;
            if (from) params.from = from;
            if (to) params.to = to;
            if (search.trim()) params.search = search.trim();

            const [list, summary] = await Promise.all([
                inventoryApi.movements(params),
                inventoryApi.movementStats(),
            ]);
            setMovements(list.data);
            setStats(summary.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load the stock movements',
            );
        } finally {
            setIsLoading(false);
        }
    }, [itemId, warehouseId, type, direction, from, to, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // The store list only fills a dropdown, so it is fetched once rather than on
    // every keystroke of the item search above it.
    useEffect(() => {
        let cancelled = false;
        inventoryApi
            .warehouses()
            .then(({ data }) => {
                if (!cancelled) setWarehouses(data);
            })
            .catch(() => {
                if (!cancelled) toast.error('Could not load the stores to filter by');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const runSweep = async () => {
        setIsSweeping(true);
        try {
            const { organizations, sent } = (
                await inventoryApi.runReorderSweep()
            ).data;
            if (sent === 0) {
                // Zero sent is two different things — nothing is low, or everyone
                // low has already been told today — and the daily cron is the other
                // thing that might have sent it.
                toast.info(
                    'Nothing new was sent: nothing is below its reorder level, or everyone short was already told today.',
                );
            } else {
                toast.success(
                    `${sent} reorder alert${sent === 1 ? '' : 's'} sent across ${organizations} organisation${organizations === 1 ? '' : 's'}`,
                );
            }
        } catch (err) {
            toast.error(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not run the reorder check',
            );
        } finally {
            setIsSweeping(false);
        }
    };

    const hasFilters =
        Boolean(search.trim()) ||
        Boolean(warehouseId) ||
        Boolean(type) ||
        Boolean(direction) ||
        Boolean(from) ||
        Boolean(to);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Stock movements
                    </h1>
                    <p className="text-muted-foreground">
                        Every movement, in the order it happened — the record the stock
                        levels are worked out from
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href={inventoryApi.movementsExportUrl({
                                itemId: itemId || undefined,
                                warehouseId: warehouseId || undefined,
                                type: type || undefined,
                                direction: direction || undefined,
                                from: from || undefined,
                                to: to || undefined,
                                search: search.trim() || undefined,
                            })}
                        >
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button
                        variant="outline"
                        disabled={isSweeping}
                        onClick={runSweep}
                    >
                        <BellRing
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        {isSweeping ? 'Checking…' : 'Check the reorder list now'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setIsTransferring(true)}
                    >
                        <ArrowRightLeft
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        Transfer between stores
                    </Button>
                    <Button onClick={() => setIsRecording(true)}>
                        <PackagePlus
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                        />
                        Record stock
                    </Button>
                </div>
            </div>

            <p className="text-sm text-muted-foreground">
                The reorder check is safe to press as often as you like: notifications
                are deduplicated per item per day, so this and the nightly cron cannot
                spam the same person about the same shelf.
            </p>

            {stats && (
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                        <Stat
                            label="Movements recorded"
                            value={stats.total.toLocaleString('en-KE')}
                        />
                        <Stat
                            label="Last 30 days"
                            value={stats.last30Days.toLocaleString('en-KE')}
                            note={
                                stats.total > 0
                                    ? `${Math.round(
                                          (stats.last30Days / stats.total) * 100,
                                      )}% of everything on this ledger`
                                    : undefined
                            }
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        {STOCK_MOVEMENT_TYPES.map((entry) => (
                            <TypeStat
                                key={entry.value}
                                label={entry.label}
                                hint={entry.hint}
                                count={stats.byType[entry.value as StockMovementType] ?? 0}
                                netUnits={
                                    stats.netUnitsByType[
                                        entry.value as StockMovementType
                                    ] ?? 0
                                }
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-60">
                    <Label htmlFor="movementSearch">Item</Label>
                    <Input
                        id="movementSearch"
                        value={search}
                        placeholder="SKU or name"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="movementWarehouse">Store</Label>
                    <Select
                        name="movementWarehouse"
                        value={warehouseId}
                        onChange={(event) => setWarehouseId(event.target.value)}
                        options={[
                            { value: '', label: 'Every store' },
                            ...warehouses.map((store) => ({
                                value: store.id,
                                label: store.isDefault
                                    ? `${store.name} (default)`
                                    : store.name,
                            })),
                        ]}
                    />
                </div>
                <div className="w-56">
                    <Label htmlFor="movementType">Kind</Label>
                    <Select
                        name="movementType"
                        value={type}
                        onChange={(event) => setType(event.target.value)}
                        options={[
                            { value: '', label: 'Every kind' },
                            ...STOCK_MOVEMENT_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="movementDirection">Way</Label>
                    <Select
                        name="movementDirection"
                        value={direction}
                        onChange={(event) => setDirection(event.target.value)}
                        options={STOCK_MOVEMENT_DIRECTIONS}
                    />
                </div>
                <div className="w-40">
                    <Label htmlFor="movementFrom">From</Label>
                    <Input
                        id="movementFrom"
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                        aria-invalid={Boolean(from && to && from > to)}
                    />
                </div>
                <div className="w-40">
                    <Label htmlFor="movementTo">To</Label>
                    <Input
                        id="movementTo"
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                        aria-invalid={Boolean(from && to && from > to)}
                    />
                </div>
            </div>

            {from && to && from > to && (
                <p className="text-sm text-destructive">
                    The start date is after the end date, so this range can never match.
                </p>
            )}

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading the ledger…" />
            ) : movements.length === 0 ? (
                <EmptyState
                    title={hasFilters ? 'Nothing matches those filters' : 'No movements yet'}
                    description={
                        hasFilters
                            ? 'Widen the dates or clear a filter — the ledger only holds what has actually been recorded.'
                            : 'Stock levels are worked out from these rows, so an empty ledger means every item reads zero. Open a store with an opening balance, or book goods in against a purchase order.'
                    }
                    icon={<ScrollText className="h-8 w-8" aria-hidden="true" />}
                    action={
                        hasFilters ? (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearch('');
                                    setWarehouseId('');
                                    setType('');
                                    setDirection('');
                                    setFrom('');
                                    setTo('');
                                }}
                            >
                                Clear the filters
                            </Button>
                        ) : (
                            <Button onClick={() => setIsRecording(true)}>
                                Record the first one
                            </Button>
                        )
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <p className="mb-3 text-sm text-muted-foreground">
                            <strong className="font-medium text-foreground">
                                Balance after
                            </strong>{' '}
                            is the level as of that movement, not today&apos;s — which
                            is why the rows in a filtered view still add up to the
                            shelf as it stood at the time.
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Item</TableHead>
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
                                {movements.map((movement) => {
                                    const reference = referenceFor(movement);
                                    const typeMeta = STOCK_MOVEMENT_TYPES.find(
                                        (entry) => entry.value === movement.type,
                                    );

                                    return (
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
                                            <TableCell className="text-sm">
                                                <Link
                                                    href={`/inventory/warehouses/${movement.warehouse.id}`}
                                                    className="underline-offset-4 hover:underline"
                                                >
                                                    {movement.warehouse.name}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {movement.warehouse.code}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <MovementAmount
                                                    quantity={movement.quantity}
                                                    unitOfMeasure={
                                                        movement.item.unitOfMeasure
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <span title={typeMeta?.hint}>
                                                    {typeMeta?.label ?? movement.type}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {movement.reason ??
                                                    movement.notes ??
                                                    '—'}
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
                                            <TableCell className="text-sm">
                                                {reference ? (
                                                    <Link
                                                        href={reference.href}
                                                        title={reference.title}
                                                        className="underline-offset-4 hover:underline"
                                                    >
                                                        {reference.label}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <RecordMovementDialog
                isOpen={isRecording}
                onClose={() => setIsRecording(false)}
                onRecorded={fetchData}
            />
            <TransferStockDialog
                isOpen={isTransferring}
                onClose={() => setIsTransferring(false)}
                onTransferred={fetchData}
            />
        </div>
    );
}

function Stat({
    label,
    value,
    note,
}: {
    label: string;
    value: string;
    note?: string;
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}

/**
 * The per-type breakdown.
 *
 * `netUnitsByType` is the signed sum — stock in minus stock out — so a
 * work-order issue reads negative, which is the truth about it. A transfer nets to
 * roughly nothing because it writes both halves, and that is the check that a
 * transfer really did leave one shelf and arrive at another.
 */
function TypeStat({
    label,
    hint,
    count,
    netUnits,
}: {
    label: string;
    hint: string;
    count: number;
    netUnits: number;
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground" title={hint}>
                    {label}
                </p>
                <p
                    className={`text-2xl font-semibold tabular-nums ${
                        count === 0 ? 'text-muted-foreground' : ''
                    }`}
                >
                    {count.toLocaleString('en-KE')}
                </p>
                <p
                    className="text-xs text-muted-foreground"
                    title="Stock in minus stock out for this kind of movement"
                >
                    {netUnits >= 0 ? '+' : '−'}
                    {Math.abs(netUnits).toLocaleString('en-KE', {
                        maximumFractionDigits: 2,
                    })}{' '}
                    net units
                </p>
            </CardContent>
        </Card>
    );
}