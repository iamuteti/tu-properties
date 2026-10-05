'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { PackageMinus, Undo2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi, maintenanceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { LoadingState } from '@/components/ui/entity-states';
import {
    MovementAmount,
    StockLevel,
    movementErrorMessage,
} from '@/components/inventory/stock-display';
import type {
    InventoryItemRow,
    StockMovementRow,
    WarehouseRow,
    WorkOrderMaterials,
} from '@/types';

const money = (value: number | null | undefined) =>
    value == null
        ? '—'
        : value.toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

/**
 * Module 11 — what a maintenance job consumed from the store.
 *
 * Deliberately a **read** of Module 11's ledger rather than a materials table of
 * this module's own. A second record of the same consumption is a second number
 * that can disagree with the stock balance, and "this job used four metres of
 * pipe" and "four metres left the shelf" have to be the same fact.
 *
 * So the panel shows two things that a materials table could not: the **net**,
 * which nets off anything put back (a part-used-and-returned job reads as the part
 * it actually kept), and each movement's **balance after**, which is the only way
 * to see whether the shelf agrees with the job.
 *
 * Issuing writes through the same ledger, so the reorder level for an item reacts
 * to consumption while the technician is still standing there.
 */
export function WorkOrderMaterialsPanel({ workOrderId }: { workOrderId: string }) {
    const [data, setData] = useState<WorkOrderMaterials | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<InventoryItemRow[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
    const [warehouseId, setWarehouseId] = useState('');
    const [itemId, setItemId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [note, setNote] = useState('');
    const [isIssuing, setIsIssuing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const response = await maintenanceApi.workOrderMaterials(workOrderId);
            setData(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load what this job consumed',
            );
        } finally {
            setIsLoading(false);
        }
    }, [workOrderId]);

    useEffect(() => {
        load();
    }, [load]);

    // The catalogue is only fetched once somebody opens the issue form: a reader
    // looking at what a past job used should not pay for a list of ten thousand
    // items.
    useEffect(() => {
        if (!isOpen || items.length > 0) return;
        Promise.all([
            inventoryApi.items({ includeRetired: 'false' }),
            inventoryApi.warehouses(),
        ])
            .then(([itemList, warehouseList]) => {
                setItems(itemList.data);
                setWarehouses(warehouseList.data);
                setWarehouseId(
                    warehouseList.data.find((store) => store.isDefault)?.id ?? '',
                );
            })
            .catch((error) =>
                toast.error(movementErrorMessage(error, 'Could not load the store')),
            );
    }, [isOpen, items.length]);

    const issue = async () => {
        const amount = Number(quantity);
        if (!itemId || !warehouseId || !Number.isFinite(amount) || amount <= 0) {
            toast.error('Choose the item, the store and how much');
            return;
        }

        setIsIssuing(true);
        try {
            await maintenanceApi.issueWorkOrderStock(workOrderId, {
                lines: [
                    {
                        inventoryItemId: itemId,
                        warehouseId,
                        quantity: amount,
                        ...(note.trim() ? { notes: note.trim() } : {}),
                    },
                ],
            });
            const item = items.find((candidate) => candidate.id === itemId);
            toast.success(
                `Recorded ${amount} ${item?.unitOfMeasure ?? 'unit'} of ${item?.sku ?? 'the item'} against this job`,
            );
            setItemId('');
            setQuantity('');
            setNote('');
            await load();
        } catch (error) {
            // The refusal is a sentence worth reading — "Only 3 is on hand here" tells
            // a technician standing at a shelf what to do next, and a code does not.
            toast.error(
                movementErrorMessage(error, 'Could not record what the job used'),
            );
        } finally {
            setIsIssuing(false);
        }
    };

    const putBack = async (movement: StockMovementRow) => {
        setIsIssuing(true);
        try {
            await maintenanceApi.returnWorkOrderStock(workOrderId, {
                movementIds: [movement.id],
            });
            toast.success(
                'Put back on the shelf. The issue stays on the record — the ledger now says it came back.',
            );
            await load();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not put that back'));
        } finally {
            setIsIssuing(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading what this job used…" />;

    if (error) {
        return (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                {error}
            </p>
        );
    }

    const consumed = data?.consumed ?? [];
    const movements = data?.movements ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Wrench className="h-5 w-5" aria-hidden="true" />
                    Material used
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {consumed.length === 0 && movements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing has been recorded against this job yet. If the technician
                        took a coupler off the shelf, recording it here is what makes the
                        shelf level true — and what triggers the reorder when the last one
                        goes.
                    </p>
                ) : (
                    <>
                        {consumed.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    Net consumed ({money(data?.totalEstimatedCost)}{' '}
                                    estimated)
                                </p>
                                <ul className="space-y-0.5 text-sm text-muted-foreground">
                                    {consumed.map((line) => (
                                        <li key={line.inventoryItemId}>
                                            <Link
                                                href={`/inventory/items/${line.inventoryItemId}`}
                                                className="text-foreground underline-offset-4 hover:underline"
                                            >
                                                {line.sku}
                                            </Link>{' '}
                                            — {line.name}:{' '}
                                            {Math.abs(line.quantity)}{' '}
                                            {line.unitOfMeasure}
                                            {line.estimatedCost != null &&
                                                ` (${money(line.estimatedCost)})`}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-muted-foreground">
                                    Net of anything put back, so a job where the wrong size
                                    came off the shelf reads as the part it actually kept.
                                    Costed at last known price, not this job&apos;s true
                                    cost.
                                </p>
                            </div>
                        )}

                        {movements.length > 0 && (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>When</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Store</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead className="text-right">
                                            Shelf after
                                        </TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {movements.map((movement) => (
                                        <TableRow
                                            key={movement.id}
                                            className={movement.isNew ? 'bg-emerald-50' : undefined}
                                        >
                                            <TableCell className="text-sm">
                                                {new Date(
                                                    movement.createdAt,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                <Link
                                                    href={`/inventory/items/${movement.itemId}`}
                                                    className="underline-offset-4 hover:underline"
                                                >
                                                    {movement.item.sku}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {movement.item.name}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {movement.warehouse.name}
                                            </TableCell>
                                            <TableCell>
                                                <MovementAmount
                                                    quantity={movement.quantity}
                                                    unitOfMeasure={
                                                        movement.item.unitOfMeasure
                                                    }
                                                />
                                                {movement.reason && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {movement.reason}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {movement.balanceAfter == null ? (
                                                    '—'
                                                ) : (
                                                    <StockLevel
                                                        quantity={
                                                            movement.balanceAfter
                                                        }
                                                        unitOfMeasure={
                                                            movement.item.unitOfMeasure
                                                        }
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {movement.type ===
                                                    'WORK_ORDER_ISSUE' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            putBack(movement)
                                                        }
                                                        disabled={isIssuing}
                                                        title="Record that this went back on the shelf. The issue stays on the record — the ledger gains a return row."
                                                    >
                                                        <Undo2
                                                            className="mr-2 h-4 w-4"
                                                            aria-hidden="true"
                                                        />
                                                        Put back
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </>
                )}

                {isOpen ? (
                    <div className="space-y-3 rounded-lg border p-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1 sm:col-span-1">
                                <Label className="text-xs">Item</Label>
                                <Select
                                    value={itemId}
                                    onChange={(event) =>
                                        setItemId(event.target.value)
                                    }
                                    options={[
                                        { value: '', label: 'Choose an item' },
                                        ...items.map((item) => ({
                                            value: item.id,
                                            label: `${item.sku} — ${item.name}`,
                                        })),
                                    ]}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">From which store</Label>
                                <Select
                                    value={warehouseId}
                                    onChange={(event) =>
                                        setWarehouseId(event.target.value)
                                    }
                                    options={[
                                        { value: '', label: 'Choose a store' },
                                        ...warehouses.map((store) => ({
                                            value: store.id,
                                            label: store.isDefault
                                                ? `${store.name} (default)`
                                                : store.name,
                                        })),
                                    ]}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">How much</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={quantity}
                                    onChange={(event) =>
                                        setQuantity(event.target.value)
                                    }
                                    autoFocus
                                />
                                {itemId && (
                                    <p className="text-xs text-muted-foreground">
                                        {items
                                            .find(
                                                (candidate) =>
                                                    candidate.id === itemId,
                                            )
                                            ?.quantityByWarehouse[warehouseId] ?? 0}{' '}
                                        in that store
                                    </p>
                                )}
                            </div>
                        </div>
                        <Textarea
                            rows={2}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Optional — what for, or where it is now."
                            aria-label="Note about what was issued"
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsOpen(false)}
                                disabled={isIssuing}
                            >
                                Cancel
                            </Button>
                            <Button size="sm" onClick={issue} disabled={isIssuing}>
                                <PackageMinus
                                    className="mr-2 h-4 w-4"
                                    aria-hidden="true"
                                />
                                {isIssuing ? 'Recording…' : 'Record it against the job'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsOpen(true)}
                        >
                            <PackageMinus
                                className="mr-2 h-4 w-4"
                                aria-hidden="true"
                            />
                            Record what the job used
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}