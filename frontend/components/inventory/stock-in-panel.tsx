'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { ArrowDownToLine, PackageCheck, PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi, procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LoadingState } from '@/components/ui/entity-states';
import { movementErrorMessage } from '@/components/inventory/stock-display';
import type {
    InventoryItemRow,
    PendingStockInLine,
    StockInStatus,
    WarehouseRow,
} from '@/types';

/**
 * Module 11 — booking received goods onto a shelf, from the purchase order.
 *
 * This panel replaces a notice that said the inventory module did not exist yet.
 * The difference is not cosmetic: that notice was honest about not being able to
 * do the job, and this one does the job. The hard part it takes on is that
 * **a purchase order line and an inventory item are two different vocabularies**.
 * The order says "6 × 20mm compression coupling"; the store says `PLMB-0042`. Only
 * somebody holding both documents knows they are the same thing, so the mapping is
 * a per-line decision this form asks for and the backend validates — never
 * something it infers from matching words, because a description-similarity guess
 * that gets it wrong turns a delivery of the wrong fittings into the right stock.
 *
 * The third button matters as much as the first two: "not stock" is how a line
 * that will never go on a shelf — a laptop, a printer, a desk — stops being raised
 * as a question every morning for the life of the order.
 */
export function StockInPanel({ purchaseOrderId }: { purchaseOrderId: string }) {
    const [status, setStatus] = useState<StockInStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<InventoryItemRow[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    /** Per pending line: which item it is, and which store it went to. */
    const [choices, setChoices] = useState<
        Record<string, { inventoryItemId: string; warehouseId: string }>
    >({});

    const load = useCallback(async () => {
        setError(null);
        try {
            const [stockIn, itemList, warehouseList] = await Promise.all([
                procurementApi.pendingStockIn(purchaseOrderId),
                inventoryApi.items({ includeRetired: 'false' }),
                inventoryApi.warehouses(),
            ]);
            setStatus(stockIn.data);
            setItems(itemList.data);
            setWarehouses(warehouseList.data);

            // Pre-fill what the backend already knows: some lines were recorded by
            // somebody who said which item it was and never got to say where.
            const prefilled: typeof choices = {};
            for (const line of stockIn.data.pending) {
                prefilled[line.goodsReceiptLineId] = {
                    inventoryItemId: line.inventoryItem?.id ?? '',
                    warehouseId:
                        warehouseList.data.find((store) => store.isDefault)?.id ?? '',
                };
            }
            setChoices(prefilled);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load what is waiting to be booked in',
            );
        } finally {
            setIsLoading(false);
        }
        // `choices` is rebuilt from scratch on every load, so the order is the only
        // thing the load depends on.
    }, [purchaseOrderId]);

    useEffect(() => {
        load();
    }, [load]);

    const choose = (
        lineId: string,
        patch: Partial<{ inventoryItemId: string; warehouseId: string }>,
    ) =>
        setChoices((current) => ({
            ...current,
            [lineId]: {
                inventoryItemId:
                    patch.inventoryItemId ?? current[lineId]?.inventoryItemId ?? '',
                warehouseId:
                    patch.warehouseId ?? current[lineId]?.warehouseId ?? '',
            },
        }));

    const ready = useMemo(
        () =>
            (status?.pending ?? []).filter((line) => {
                const choice = choices[line.goodsReceiptLineId];
                return choice?.inventoryItemId && choice?.warehouseId;
            }),
        [status, choices],
    );

    const book = async () => {
        if (ready.length === 0) return;
        setIsSaving(true);
        try {
            const response = await inventoryApi.bookStockIn({
                purchaseOrderId,
                lines: ready.map((line) => ({
                    goodsReceiptLineId: line.goodsReceiptLineId,
                    inventoryItemId: choices[line.goodsReceiptLineId].inventoryItemId,
                    warehouseId: choices[line.goodsReceiptLineId].warehouseId,
                })),
            });
            const stores = new Set(
                ready.map((line) => choices[line.goodsReceiptLineId].warehouseId),
            ).size;
            toast.success(
                `${response.data.booked} line${response.data.booked === 1 ? '' : 's'} booked into ${stores} store${stores === 1 ? '' : 's'} — the shelf now reflects what arrived`,
            );
            await load();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not book that in'));
        } finally {
            setIsSaving(false);
        }
    };

    const markNotStock = async (line: PendingStockInLine) => {
        setIsSaving(true);
        try {
            await inventoryApi.markNotStock(line.goodsReceiptLineId);
            toast.success('Recorded as not going into stock');
            await load();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not record that'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <LoadingState label="Checking what still needs a home…" />;
    }

    if (error) {
        return (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                {error}
            </p>
        );
    }

    if (!status) return null;

    const pending = status.pending;
    const booked = status.booked;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <PackageCheck className="h-5 w-5" aria-hidden="true" />
                    Into the store
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{status.note}</p>

                {booked.length > 0 && (
                    <div className="space-y-1 text-sm">
                        <p className="font-medium">Already on a shelf</p>
                        <ul className="space-y-1 text-muted-foreground">
                            {booked.map((entry) => (
                                <li key={entry.goodsReceiptLineId}>
                                    <span className="text-foreground">
                                        {entry.inventoryItem?.sku ??
                                            'An item that has since been retired'}
                                    </span>{' '}
                                    — {entry.inventoryItem?.name ?? '—'}
                                    {entry.recordedAt && (
                                        <span className="text-xs">
                                            {' '}
                                            (
                                            {new Date(
                                                entry.recordedAt,
                                            ).toLocaleDateString()}
                                            )
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {pending.length === 0 ? (
                    <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Nothing is waiting. Every delivery on this order has been dealt
                        with — either it is on a shelf, or somebody recorded that it
                        never will be.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {pending.map((line) => {
                            const choice = choices[line.goodsReceiptLineId] ?? {
                                inventoryItemId: '',
                                warehouseId: '',
                            };

                            return (
                                <div
                                    key={line.goodsReceiptLineId}
                                    className="space-y-3 rounded-lg border p-3"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="font-medium">
                                                {line.description}
                                                {line.specification && (
                                                    <span className="font-normal text-muted-foreground">
                                                        {' '}
                                                        — {line.specification}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {line.quantity} arrived
                                                {line.deliveryNote
                                                    ? ` on ${line.deliveryNote}`
                                                    : ''}{' '}
                                                on{' '}
                                                {new Date(
                                                    line.receivedAt,
                                                ).toLocaleDateString()}
                                                {line.unitPrice > 0 &&
                                                    ` · ${line.unitPrice.toLocaleString(
                                                        'en-KE',
                                                    )} each`}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => markNotStock(line)}
                                            disabled={isSaving}
                                            title="Record that this will never go on a shelf — a laptop, a printer, a desk"
                                        >
                                            <PackageX
                                                className="mr-2 h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            Not stock
                                        </Button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">
                                                Which item is this?
                                            </Label>
                                            <Select
                                                value={choice.inventoryItemId}
                                                onChange={(event) =>
                                                    choose(line.goodsReceiptLineId, {
                                                        inventoryItemId:
                                                            event.target.value,
                                                    })
                                                }
                                                options={[
                                                    {
                                                        value: '',
                                                        label: 'Choose an item',
                                                    },
                                                    ...items.map((item) => ({
                                                        value: item.id,
                                                        label: `${item.sku} — ${item.name}`,
                                                    })),
                                                ]}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Only somebody holding both documents knows
                                                these are the same thing, so it is not
                                                guessed from the wording.
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">
                                                Which store did it go to?
                                            </Label>
                                            <Select
                                                value={choice.warehouseId}
                                                onChange={(event) =>
                                                    choose(line.goodsReceiptLineId, {
                                                        warehouseId: event.target.value,
                                                    })
                                                }
                                                options={[
                                                    {
                                                        value: '',
                                                        label: 'Choose a store',
                                                    },
                                                    ...warehouses.map((store) => ({
                                                        value: store.id,
                                                        label: store.isDefault
                                                            ? `${store.name} (default)`
                                                            : store.name,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-muted-foreground">
                                {ready.length} of {pending.length} ready
                            </p>
                            <Button onClick={book} disabled={isSaving || ready.length === 0}>
                                <ArrowDownToLine
                                    className="mr-2 h-4 w-4"
                                    aria-hidden="true"
                                />
                                {isSaving
                                    ? 'Booking in…'
                                    : `Book ${ready.length} in${
                                          ready.length === 1 ? '' : 's'
                                      }`}
                            </Button>
                        </div>
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    Booked stock becomes a movement in the{' '}
                    <Link
                        href="/inventory/stock-movements"
                        className="underline-offset-4 hover:underline"
                    >
                        stock ledger
                    </Link>
                    , at the price on this order — which is the price that will be on the
                    supplier&apos;s bill. Booking the same line twice is refused by the
                    database, not by a check that can be raced.
                </p>
            </CardContent>
        </Card>
    );
}