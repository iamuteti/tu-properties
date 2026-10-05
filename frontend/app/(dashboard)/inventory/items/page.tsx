'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ClipboardList,
    Download,
    PackagePlus,
    Pencil,
    Plus,
    Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
    StockLevel,
    StockStatusBadge,
    movementErrorMessage,
} from '@/components/inventory/stock-display';
import { inventoryApi } from '@/lib/api';
import { INVENTORY_CATEGORIES, STOCK_STATUS_FILTERS } from '@/lib/constants';
import type { InventoryItemRow, InventoryStats } from '@/types';

/**
 * Module 11 — the item catalogue.
 *
 * Every level on this screen is the sum of an item's movements, worked out by the
 * server on the read that produced it. There is no quantity column behind these
 * numbers, which is why nothing here offers to type one: an editor that could set
 * a level would be a second writer for a figure that has to agree with every
 * movement ever recorded, and two writers is how a stock figure starts lying.
 *
 * The screen a buyer opens is the reorder view, so it is one click away and
 * ordered by how badly each item needs buying rather than alphabetically.
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

export default function InventoryItemsPage() {
    const [items, setItems] = useState<InventoryItemRow[]>([]);
    const [stats, setStats] = useState<InventoryStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [includeRetired, setIncludeRetired] = useState(false);
    const [reorderOnly, setReorderOnly] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [list, summary] = await Promise.all([
                reorderOnly
                    ? inventoryApi.reorderList()
                    : inventoryApi.items({
                          category: category || undefined,
                          status: status || undefined,
                          search: search.trim() || undefined,
                          includeRetired: includeRetired ? 'true' : undefined,
                      }),
                inventoryApi.itemStats(),
            ]);
            setItems(list.data);
            setStats(summary.data);
        } catch (err) {
            setError(movementErrorMessage(err, 'Could not load the item list'));
        } finally {
            setIsLoading(false);
        }
    }, [category, status, search, includeRetired, reorderOnly]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * The reorder endpoint takes no filters, so search is applied here in that one
     * view. Dropping rows cannot change the order the API chose, which is the one
     * thing this view exists to keep.
     */
    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!reorderOnly || !term) return items;
        return items.filter(
            (item) =>
                item.sku.toLowerCase().includes(term) ||
                item.name.toLowerCase().includes(term) ||
                (item.description ?? '').toLowerCase().includes(term),
        );
    }, [items, reorderOnly, search]);

    const clearFilters = () => {
        setCategory('');
        setStatus('');
        setSearch('');
    };

    const categoryOptions = useMemo(
        () => [
            { value: '', label: 'All categories' },
            ...INVENTORY_CATEGORIES.map((entry) => ({
                value: entry.value,
                label: entry.label,
            })),
        ],
        [],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventory items</h1>
                    <p className="text-muted-foreground">
                        What the stores hold — every level below is the sum of that
                        item&apos;s movements, worked out fresh on each read
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href={inventoryApi.itemsExportUrl({
                                category: category || undefined,
                                status: status || undefined,
                                search: search.trim() || undefined,
                            })}
                        >
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Download
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/inventory/items/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add an item
                        </Link>
                    </Button>
                </div>
            </div>

            {reorderOnly && (
                <p className="text-sm text-muted-foreground">
                    This is a view of the same items, so Download still exports the
                    whole list rather than the ordering below.
                </p>
            )}

            {stats && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Stat
                        label="Items"
                        value={stats.items}
                        note={`${units(stats.totalMovements)} movements behind them`}
                    />
                    <Stat label="Stores" value={stats.warehouses} />
                    <Stat
                        label="Units on hand"
                        value={units(stats.totalUnits)}
                        note="Sum of every signed movement"
                    />
                    <Stat
                        label="Needs ordering"
                        value={stats.needsReorder}
                        tone={stats.needsReorder > 0 ? 'amber' : undefined}
                        note={`${stats.belowReorder} low · ${stats.outOfStock} empty`}
                    />
                    <Stat
                        label="Empty shelves"
                        value={stats.outOfStock}
                        tone={stats.outOfStock > 0 ? 'amber' : undefined}
                        note="Nothing left of the watched items"
                    />
                    <Stat
                        label="Stock value at last price"
                        value={
                            stats.stockValueAtUnitCost == null
                                ? '—'
                                : money(stats.stockValueAtUnitCost)
                        }
                        note={
                            stats.stockValueAtUnitCost == null
                                ? 'Null, not zero — no item has a price on file, which is a different fact from stock being worthless'
                                : `${stats.pricedItems} priced · ${stats.itemsWithoutPrice} without a price`
                        }
                    />
                    {stats.negativeBalances > 0 && (
                        <Stat
                            label="Books say negative"
                            value={stats.negativeBalances}
                            tone="amber"
                            note="The books say there is less than nothing here — a stock take settles that"
                        />
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <Button
                    className="h-10"
                    variant={reorderOnly ? 'default' : 'outline'}
                    aria-pressed={reorderOnly}
                    onClick={() => setReorderOnly((current) => !current)}
                >
                    <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
                    {reorderOnly ? 'Show every item' : 'Only what needs ordering'}
                </Button>

                {!reorderOnly && (
                    <>
                        <div className="w-52">
                            <Label htmlFor="invCategory">Category</Label>
                            <Select
                                name="invCategory"
                                value={category}
                                onChange={(event) =>
                                    setCategory(event.target.value)
                                }
                                options={categoryOptions}
                            />
                        </div>
                        <div className="w-64">
                            <Label htmlFor="invStatus">Stock level</Label>
                            <Select
                                name="invStatus"
                                value={status}
                                onChange={(event) => setStatus(event.target.value)}
                                options={STOCK_STATUS_FILTERS}
                            />
                        </div>
                    </>
                )}

                <div className="w-64">
                    <Label htmlFor="invSearch">Search</Label>
                    <Input
                        id="invSearch"
                        value={search}
                        placeholder="Code, name or description"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                {!reorderOnly && (
                    <div className="flex items-center gap-2 pb-2">
                        <Checkbox
                            id="invRetired"
                            checked={includeRetired}
                            onCheckedChange={(checked) =>
                                setIncludeRetired(checked)
                            }
                        />
                        <Label htmlFor="invRetired" className="text-sm font-normal">
                            Include retired
                        </Label>
                    </div>
                )}
            </div>

            {reorderOnly && (
                <p className="text-sm text-muted-foreground">
                    Worst shortfall first: the shelf that is empty outranks the one
                    that is nearly empty, because that is the order a buyer can act
                    on. Category, level and retired belong to the full list — this
                    view is one fixed ordering.
                </p>
            )}

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading what the stores hold…" />
            ) : rows.length === 0 ? (
                <ItemEmptyState
                    reorderOnly={reorderOnly}
                    hasItems={stats ? stats.items > 0 : false}
                    includeRetired={includeRetired}
                    searching={search.trim().length > 0}
                    onShowAll={() => setReorderOnly(false)}
                    onClearFilters={clearFilters}
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead>On hand</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Ordering</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Last movement</TableHead>
                                    <TableHead className="text-right">
                                        Ledger
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((item) => {
                                    const reorderLevel = Number(item.reorderLevel);
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Link
                                                    href={`/inventory/items/${item.id}`}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                >
                                                    {item.sku}
                                                </Link>
                                                <p className="text-sm text-muted-foreground">
                                                    {item.name}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                <StockLevel
                                                    quantity={item.totalQuantity}
                                                    unitOfMeasure={
                                                        item.unitOfMeasure
                                                    }
                                                    reorderLevel={reorderLevel}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
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
                                            </TableCell>
                                            <TableCell>
                                                <ReorderHint item={item} />
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {item.preferredSupplier?.name ?? (
                                                    <span className="text-muted-foreground">
                                                        Not decided
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {item.lastMovementAt ? (
                                                    <>
                                                        {new Date(
                                                            item.lastMovementAt,
                                                        ).toLocaleDateString()}
                                                        <p className="text-xs text-muted-foreground">
                                                            {item.movementCount}{' '}
                                                            movement
                                                            {item.movementCount ===
                                                            1
                                                                ? ''
                                                                : 's'}
                                                            {' · '}
                                                            {item.warehouses}{' '}
                                                            store
                                                            {item.warehouses === 1
                                                                ? ''
                                                                : 's'}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        Nothing recorded
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-3 text-sm">
                                                    <Link
                                                        href={`/inventory/items/${item.id}/edit`}
                                                        className="inline-flex items-center underline-offset-4 hover:underline"
                                                    >
                                                        <Pencil
                                                            className="mr-1 h-3.5 w-3.5"
                                                            aria-hidden="true"
                                                        />
                                                        Edit
                                                        <span className="sr-only">
                                                            {' '}
                                                            {item.sku}
                                                        </span>
                                                    </Link>
                                                    <Link
                                                        href={`/inventory/items/${item.id}`}
                                                        className="underline-offset-4 hover:underline"
                                                    >
                                                        Open
                                                        <span className="sr-only">
                                                            {' '}
                                                            the ledger for{' '}
                                                            {item.sku}
                                                        </span>
                                                    </Link>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * The callout is too heavy for a table cell, so the suggestion is compressed into
 * the sentence a buyer actually reads off the list: how much, and what it will
 * cost. No price on file says so rather than showing a zero, because an unknown
 * cost and a free item are different facts when deciding whether to raise a
 * purchase request.
 */
function ReorderHint({ item }: { item: InventoryItemRow }) {
    if (!item.reorder.needsReorder) {
        return <span className="text-sm text-muted-foreground">—</span>;
    }

    return (
        <span className="text-sm text-amber-800">
            order {units(item.reorder.suggestedQuantity)}{' '}
            {item.reorder.unitOfMeasure}
            {item.reorder.estimatedCost == null
                ? ' · no price on file'
                : ` · est ${item.reorder.estimatedCost.toLocaleString('en-KE', {
                      maximumFractionDigits: 0,
                  })}`}
        </span>
    );
}

function ItemEmptyState({
    reorderOnly,
    hasItems,
    includeRetired,
    searching,
    onShowAll,
    onClearFilters,
}: {
    reorderOnly: boolean;
    hasItems: boolean;
    includeRetired: boolean;
    searching: boolean;
    onShowAll: () => void;
    onClearFilters: () => void;
}) {
    if (reorderOnly && !searching) {
        return (
            <EmptyState
                title="Nothing needs ordering"
                description="Every watched item is above its reorder level. An item with the level left at zero is never flagged — it is tracked, not watched."
                icon={<ClipboardList className="h-8 w-8" aria-hidden="true" />}
                action={
                    <Button variant="outline" onClick={onShowAll}>
                        See every item
                    </Button>
                }
            />
        );
    }

    if (!hasItems && !includeRetired) {
        return (
            <EmptyState
                title="No items in the catalogue"
                description="Add what the stores keep — paint, fittings, safety gear. An item is saved with nothing on the shelf, and stock arrives as an opening balance movement."
                icon={<PackagePlus className="h-8 w-8" aria-hidden="true" />}
                action={
                    <Button asChild>
                        <Link href="/inventory/items/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add an item
                        </Link>
                    </Button>
                }
            />
        );
    }

    return (
        <EmptyState
            title="Nothing matches these filters"
            description="No item in the catalogue matches what you have narrowed it to."
            icon={<Search className="h-8 w-8" aria-hidden="true" />}
            action={
                <div className="flex flex-wrap justify-center gap-2">
                    {reorderOnly && (
                        <Button variant="outline" onClick={onShowAll}>
                            See every item
                        </Button>
                    )}
                    <Button onClick={onClearFilters}>Clear the filters</Button>
                </div>
            }
        />
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