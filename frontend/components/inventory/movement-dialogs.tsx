'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, ClipboardCheck, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi } from '@/lib/api';
import { MANUAL_MOVEMENT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { LoadingState } from '@/components/ui/entity-states';
import { movementErrorMessage } from '@/components/inventory/stock-display';
import type { InventoryItemRow, StockMovementRow, WarehouseRow } from '@/types';

/**
 * Module 11 — the three things a person does to stock by hand.
 *
 * They are three dialogs rather than one form with a type dropdown because they
 * ask genuinely different questions. An opening balance asks "how much is there";
 * a transfer asks "from where to where, for which items"; a stock take asks "what
 * did you count", which is a *measurement* rather than a change. Forcing all three
 * through one shape would push the stock take's meaning — that somebody walked the
 * shelf with a piece of paper — into a "quantity" box, which is exactly the
 * subtraction it is supposed to replace.
 *
 * All three share one thing: the caller never supplies a sign or a balance. The
 * backend derives both, and a refusal comes back as a sentence worth reading
 * ("Only 3 is on hand here, so 5 cannot go out") rather than a code.
 */

interface Catalog {
    items: InventoryItemRow[];
    warehouses: WarehouseRow[];
}

/**
 * Items and stores, fetched once and then reused.
 *
 * Both lists are read-only for this module's writers, so there is no reason for
 * them to be gated — a technician who can issue stock needs to know what is on
 * the shelf to issue it from.
 *
 * `ready` is never reset, so a dialog reopened later shows the last known shelf
 * immediately and is not worth a spinner for a catalogue that changes once a
 * quarter. The write endpoints return the movement they created, and the caller
 * refetches, so nothing is shown from a stale read that the module cannot correct.
 */
function useCatalog(open: boolean): Catalog & { loading: boolean } {
    const [catalog, setCatalog] = useState<Catalog>({ items: [], warehouses: [] });
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        Promise.all([
            inventoryApi.items({ includeRetired: 'false' }),
            inventoryApi.warehouses(),
        ])
            .then(([items, warehouses]) => {
                if (cancelled) return;
                setCatalog({ items: items.data, warehouses: warehouses.data });
            })
            .catch((error) => {
                if (cancelled) return;
                toast.error(
                    movementErrorMessage(error, 'Could not load the store contents'),
                );
            })
            .finally(() => {
                if (!cancelled) setReady(true);
            });

        return () => {
            cancelled = true;
        };
    }, [open]);

    return { ...catalog, loading: !ready };
}

function warehouseOptions(warehouses: WarehouseRow[]) {
    return [
        { value: '', label: 'Choose a store' },
        ...warehouses.map((warehouse) => ({
            value: warehouse.id,
            label: warehouse.isDefault
                ? `${warehouse.name} (default)`
                : warehouse.name,
        })),
    ];
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Record a movement by hand
// ═══════════════════════════════════════════════════════════════════════

export function RecordMovementDialog({
    isOpen,
    onClose,
    onRecorded,
    /** Pre-selected when opened from an item's page. */
    defaultItemId,
    defaultWarehouseId,
    /** Pre-selected type, when the button that opened it implies one. */
    defaultType,
}: {
    isOpen: boolean;
    onClose: () => void;
    onRecorded?: (movement: StockMovementRow) => void;
    defaultItemId?: string;
    defaultWarehouseId?: string;
    defaultType?: 'OPENING' | 'ADJUSTMENT' | 'RETURN';
}) {
    const { items, warehouses, loading } = useCatalog(isOpen);
    const [itemId, setItemId] = useState(defaultItemId ?? '');
    const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? '');
    const [type, setType] = useState<string>(defaultType ?? 'OPENING');
    const [quantity, setQuantity] = useState('');
    /**
     * `'inherit'` means "whatever the type usually is" — the field shows that as a
     * third option rather than being pre-filled, so a caller who never touches it
     * gets the sensible default and somebody who does touch it sees what they
     * changed.
     */
    const [direction, setDirection] = useState<'IN' | 'OUT' | 'inherit'>(
        'inherit',
    );
    const [reason, setReason] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setItemId(defaultItemId ?? '');
        setWarehouseId(defaultWarehouseId ?? '');
        setType(defaultType ?? 'OPENING');
        setQuantity('');
        setDirection('inherit');
        setReason('');
        setUnitCost('');
    }, [isOpen, defaultItemId, defaultWarehouseId, defaultType]);

    // Defaults to the store the org flagged, which is the answer nine times out of
    // ten and saves a scroll.
    useEffect(() => {
        if (!isOpen || warehouseId) return;
        const fallback = warehouses.find((warehouse) => warehouse.isDefault);
        if (fallback) setWarehouseId(fallback.id);
    }, [isOpen, warehouses, warehouseId]);

    // An opening balance and a return nearly always come in; a correction nearly
    // always goes out. Deriving it means the field only has to be touched when
    // the unusual case happens.
    const resolvedDirection: 'IN' | 'OUT' =
        direction === 'inherit'
            ? type === 'OPENING' || type === 'RETURN'
                ? 'IN'
                : 'OUT'
            : direction;

    const item = items.find((candidate) => candidate.id === itemId);
    const unit = item?.unitOfMeasure ?? 'unit';

    /** Only warehouses the item actually has stock in are worth offering. */
    const storesWithStock = useMemo(
        () =>
            warehouses.filter(
                (warehouse) =>
                    item && item.quantityByWarehouse[warehouse.id] !== undefined,
            ),
        [warehouses, item],
    );

    const submit = async () => {
        if (!itemId || !warehouseId || !quantity) {
            toast.error('Choose the item, the store and how much');
            return;
        }
        const amount = Number(quantity);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('A movement needs a quantity above zero');
            return;
        }
        if (type === 'ADJUSTMENT' && !reason.trim()) {
            // Checked here as well as on the server: the server's message is the
            // real one, this is just the same rule said sooner.
            toast.error('A stock take correction needs a reason');
            return;
        }

        setIsSaving(true);
        try {
            const storeName = warehouses.find((w) => w.id === warehouseId)?.name;
            const response = await inventoryApi.recordMovement({
                itemId,
                warehouseId,
                type: type as 'OPENING' | 'ADJUSTMENT' | 'RETURN',
                quantity: amount,
                direction: resolvedDirection,
                reason: reason.trim() || undefined,
                unitCost: unitCost.trim() ? Number(unitCost) : undefined,
            });
            toast.success(
                resolvedDirection === 'OUT'
                    ? `${amount} ${unit} out of ${storeName}`
                    : `${amount} ${unit} in to ${storeName}`,
            );
            onRecorded?.(response.data);
            onClose();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not record that movement'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Record stock by hand"
            size="lg"
        >
            {loading ? (
                <LoadingState label="Loading what is on the shelf…" />
            ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    There is nothing in the catalogue yet. Add an item first — and give it
                    an opening balance, or its level will be zero until it does.
                </p>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        For goods arriving on an order, or material a job used, use the
                        purchase order and the work order instead. Those write the reference
                        that makes the movement explainable later.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Item</Label>
                            <Select
                                value={itemId}
                                onChange={(event) => setItemId(event.target.value)}
                                options={[
                                    { value: '', label: 'Choose an item' },
                                    ...items.map((candidate) => ({
                                        value: candidate.id,
                                        label: `${candidate.sku} — ${candidate.name}`,
                                    })),
                                ]}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Store</Label>
                            <Select
                                value={warehouseId}
                                onChange={(event) => setWarehouseId(event.target.value)}
                                options={warehouseOptions(warehouses)}
                            />
                        </div>
                    </div>

                    {item && (
                        <p className="text-sm text-muted-foreground">
                            {item.sku} has{' '}
                            <span className="font-medium text-foreground">
                                {item.totalQuantity} {item.unitOfMeasure}
                            </span>{' '}
                            across {item.warehouses}{' '}
                            {item.warehouses === 1 ? 'store' : 'stores'}
                            {storesWithStock.length > 0 && (
                                <>
                                    {' — in '}
                                    {storesWithStock
                                        .map(
                                            (store) =>
                                                `${store.code} ${item.quantityByWarehouse[store.id]}`,
                                        )
                                        .join(', ')}
                                </>
                            )}
                            .
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>What kind</Label>
                            <Select
                                value={type}
                                onChange={(event) => setType(event.target.value)}
                                options={MANUAL_MOVEMENT_TYPES.map((option) => ({
                                    value: option.value,
                                    label: option.label,
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                {MANUAL_MOVEMENT_TYPES.find(
                                    (option) => option.value === type,
                                )?.hint}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Which way</Label>
                            <Select
                                value={direction}
                                onChange={(event) =>
                                    setDirection(
                                        event.target.value as
                                            | 'IN'
                                            | 'OUT'
                                            | 'inherit',
                                    )
                                }
                                options={[
                                    {
                                        value: 'inherit',
                                        label: 'Usual for this kind',
                                    },
                                    { value: 'IN', label: 'Coming in' },
                                    { value: 'OUT', label: 'Going out' },
                                ]}
                            />
                            <p className="text-xs text-muted-foreground">
                                {resolvedDirection === 'IN'
                                    ? 'This will be recorded as coming in.'
                                    : 'This will be recorded as going out.'}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="movement-quantity">How much ({unit})</Label>
                            <Input
                                id="movement-quantity"
                                type="number"
                                step="0.01"
                                min="0"
                                value={quantity}
                                onChange={(event) => setQuantity(event.target.value)}
                                autoFocus
                            />
                            <p className="text-xs text-muted-foreground">
                                Always positive. The direction above decides which way it
                                goes, so a receipt cannot be recorded as a return by
                                accident.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="movement-cost">
                                Price paid ({unit} only)
                            </Label>
                            <Input
                                id="movement-cost"
                                type="number"
                                step="0.01"
                                min="0"
                                value={unitCost}
                                onChange={(event) => setUnitCost(event.target.value)}
                                placeholder={
                                    item?.unitCost != null
                                        ? String(Number(item.unitCost))
                                        : 'No price on file'
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Only for stock coming in. An issue consumes a price that was
                                already paid for; it does not create a new one.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="movement-reason">
                            Reason {type === 'ADJUSTMENT' ? '' : '(optional)'}
                        </Label>
                        <Textarea
                            id="movement-reason"
                            rows={2}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder={
                                type === 'ADJUSTMENT'
                                    ? 'The count disagreed with the books — say by how much and why.'
                                    : 'Anything the next reader would want to know.'
                            }
                            aria-required={type === 'ADJUSTMENT'}
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={isSaving}>
                            <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            {isSaving ? 'Recording…' : 'Record it'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Transfer between stores
// ═══════════════════════════════════════════════════════════════════════

interface TransferLine {
    key: string;
    itemId: string;
    warehouseId: string;
    quantity: string;
}

/**
 * A transfer is **two rows**, one out of the source and one into the
 * destination, sharing a transfer group. The form asks for the source once and
 * the destination once because that is how a transfer happens in the world — a van
 * load of paint going from the main store to the site store is not four separate
 * decisions, it is one trip.
 */
export function TransferStockDialog({
    isOpen,
    onClose,
    onTransferred,
}: {
    isOpen: boolean;
    onClose: () => void;
    onTransferred?: () => void;
}) {
    const { items, warehouses, loading } = useCatalog(isOpen);
    const [fromWarehouseId, setFromWarehouseId] = useState('');
    const [toWarehouseId, setToWarehouseId] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<TransferLine[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setFromWarehouseId(
            warehouses.find((warehouse) => warehouse.isDefault)?.id ?? '',
        );
        setToWarehouseId('');
        setNotes('');
        setLines([
            { key: 'line-0', itemId: '', warehouseId: '', quantity: '' },
        ]);
    }, [isOpen, warehouses]);

    const addLine = () =>
        setLines((current) => [
            ...current,
            {
                key: `line-${Date.now()}-${current.length}`,
                itemId: '',
                warehouseId: '',
                quantity: '',
            },
        ]);

    const removeLine = (key: string) =>
        setLines((current) =>
            current.length === 1 ? current : current.filter((line) => line.key !== key),
        );

    const submit = async () => {
        if (!fromWarehouseId || !toWarehouseId) {
            toast.error('Choose where it is going from and to');
            return;
        }
        if (fromWarehouseId === toWarehouseId) {
            toast.error('Source and destination are the same store');
            return;
        }

        const filled = lines
            .filter((line) => line.itemId && Number(line.quantity) > 0)
            .map((line) => ({
                itemId: line.itemId,
                // An empty store line means "wherever the source is" — a transfer
                // line that exists because somebody put four of them in a van.
                warehouseId: line.warehouseId || fromWarehouseId,
                quantity: Number(line.quantity),
            }));

        if (filled.length === 0) {
            toast.error('Add at least one item with a quantity');
            return;
        }

        setIsSaving(true);
        try {
            const response = await inventoryApi.transferStock({
                fromWarehouseId,
                toWarehouseId,
                lines: filled,
                notes: notes.trim() || undefined,
            });
            const label = warehouses.find((w) => w.id === toWarehouseId)?.name;
            toast.success(
                `${response.data.lines.length} item${response.data.lines.length === 1 ? '' : 's'} moved to ${label} (${response.data.transferGroup})`,
            );
            onTransferred?.();
            onClose();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not move that stock'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Move stock between stores" size="xl">
            {loading ? (
                <LoadingState label="Loading the stores…" />
            ) : warehouses.length < 2 ? (
                <p className="text-sm text-muted-foreground">
                    A transfer needs two stores. Add a site store before moving anything —
                    one store has nothing to move between.
                </p>
            ) : (
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>From</Label>
                            <Select
                                value={fromWarehouseId}
                                onChange={(event) =>
                                    setFromWarehouseId(event.target.value)
                                }
                                options={warehouseOptions(warehouses)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>To</Label>
                            <Select
                                value={toWarehouseId}
                                onChange={(event) => setToWarehouseId(event.target.value)}
                                options={[
                                    { value: '', label: 'Choose a destination' },
                                    ...warehouses
                                        .filter(
                                            (warehouse) =>
                                                warehouse.id !== fromWarehouseId,
                                        )
                                        .map((warehouse) => ({
                                            value: warehouse.id,
                                            label: warehouse.name,
                                        })),
                                ]}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>What is moving</Label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={addLine}
                                disabled={!fromWarehouseId}
                            >
                                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                                Add a line
                            </Button>
                        </div>

                        {fromWarehouseId ? (
                            <p className="text-xs text-muted-foreground">
                                Only items with stock in this store are listed, and the
                                balance shown is what is there now — a transfer cannot take
                                what is not there.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Choose the source store first.
                            </p>
                        )}

                        <div className="space-y-2">
                            {lines.map((line, index) => {
                                const held =
                                    items.find(
                                        (candidate) => candidate.id === line.itemId,
                                    )?.quantityByWarehouse[fromWarehouseId];
                                const quantity = Number(line.quantity);

                                return (
                                    <div
                                        key={line.key}
                                        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
                                    >
                                        <div className="min-w-[220px] flex-1 space-y-1">
                                            <Label className="text-xs">
                                                Item {index + 1}
                                            </Label>
                                            <Select
                                                value={line.itemId}
                                                onChange={(event) =>
                                                    setLines((current) =>
                                                        current.map((candidate) =>
                                                            candidate.key === line.key
                                                                ? {
                                                                      ...candidate,
                                                                      itemId: event
                                                                          .target
                                                                          .value,
                                                                  }
                                                                : candidate,
                                                        ),
                                                    )
                                                }
                                                options={[
                                                    {
                                                        value: '',
                                                        label: 'Choose an item',
                                                    },
                                                    ...items
                                                        .filter(
                                                            (candidate) =>
                                                                candidate
                                                                    .quantityByWarehouse[
                                                                    fromWarehouseId
                                                                ] !== undefined,
                                                        )
                                                        .map((candidate) => ({
                                                            value: candidate.id,
                                                            label: `${candidate.sku} — ${candidate.name}`,
                                                        })),
                                                ]}
                                            />
                                            {held !== undefined && (
                                                <p
                                                    className={`text-xs ${
                                                        quantity > held
                                                            ? 'text-destructive'
                                                            : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {held} {candidateUnit(items, line.itemId)}{' '}
                                                    in this store
                                                    {quantity > held &&
                                                        ' — more than is here'}
                                                </p>
                                            )}
                                        </div>

                                        <div className="w-40 space-y-1">
                                            <Label className="text-xs">How much</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={line.quantity}
                                                onChange={(event) =>
                                                    setLines((current) =>
                                                        current.map((candidate) =>
                                                            candidate.key === line.key
                                                                ? {
                                                                      ...candidate,
                                                                      quantity:
                                                                          event
                                                                              .target
                                                                              .value,
                                                                  }
                                                                : candidate,
                                                        ),
                                                    )
                                                }
                                            />
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLine(line.key)}
                                            disabled={lines.length === 1}
                                            aria-label={`Remove line ${index + 1}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="transfer-notes">Note</Label>
                        <Textarea
                            id="transfer-notes"
                            rows={2}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Who took it, on what."
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={isSaving}>
                            <ArrowRightLeft
                                className="mr-2 h-4 w-4"
                                aria-hidden="true"
                            />
                            {isSaving ? 'Moving…' : 'Move it'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

function candidateUnit(items: InventoryItemRow[], itemId: string): string {
    return items.find((candidate) => candidate.id === itemId)?.unitOfMeasure ?? 'unit';
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Stock take
// ═══════════════════════════════════════════════════════════════════════

interface CountLine {
    key: string;
    itemId: string;
    /** Prefilled from the item's balance, so the common case is "correct it". */
    quantity: string;
    reason: string;
}

/**
 * The count.
 *
 * This dialog asks for **what is on the shelf**, and the backend works out the
 * difference. That inversion is the whole feature: a stock take entered as an
 * adjustment is a subtraction somebody had to get right, and a subtraction somebody
 * had to get right is not repeatable by the next person to count. Entered as a
 * measurement, somebody else can redo it tomorrow and get the same answer.
 *
 * Lines that come out matching are reported back as "matched" rather than written
 * as zero-quantity rows. A row that changes nothing is a row that looks like an
 * event and is not one.
 */
export function StockTakeDialog({
    isOpen,
    onClose,
    onRecorded,
    defaultWarehouseId,
}: {
    isOpen: boolean;
    onClose: () => void;
    onRecorded?: () => void;
    defaultWarehouseId?: string;
}) {
    const { items, warehouses, loading } = useCatalog(isOpen);
    const [storeId, setStoreId] = useState('');
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState<CountLine[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setStoreId(defaultWarehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? '');
        setNotes('');
        setLines([]);
    }, [isOpen, defaultWarehouseId, warehouses]);

    const stocked = useMemo(
        () =>
            items.filter((candidate) => {
                if (!storeId) return false;
                return candidate.quantityByWarehouse[storeId] !== undefined;
            }),
        [items, storeId],
    );

    const addLine = (itemId?: string) =>
        setLines((current) => [
            ...current,
            { key: `count-${Date.now()}-${current.length}`, itemId: itemId ?? '', quantity: '', reason: '' },
        ]);

    const submit = async () => {
        const filled = lines
            .filter((line) => line.itemId && line.quantity.trim() !== '')
            .map((line) => ({
                itemId: line.itemId,
                warehouseId: storeId,
                quantity: Number(line.quantity),
                reason: line.reason.trim() || undefined,
            }));

        if (!storeId || filled.length === 0) {
            toast.error('Choose the store and count at least one item');
            return;
        }
        if (filled.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0)) {
            toast.error('A count cannot be negative — if there is nothing there, enter zero');
            return;
        }

        setIsSaving(true);
        try {
            const response = await inventoryApi.recordStockTake({
                lines: filled,
                notes: notes.trim() || undefined,
            });
            const { variances, matched, counted } = response.data;
            toast.success(
                variances === 0
                    ? `Counted ${counted} — all ${matched} matched the books`
                    : `Counted ${counted}: ${variances} disagreed with the books and were recorded`,
            );
            onRecorded?.();
            onClose();
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not record the count'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Stock take"
            size="xl"
        >
            {loading ? (
                <LoadingState label="Loading the shelf…" />
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Enter <span className="font-medium">what you counted</span>, not
                        what changed. Anything that disagrees with the books is recorded as
                        a correction, with a note saying by how much.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Which store did you count?</Label>
                            <Select
                                value={storeId}
                                onChange={(event) => {
                                    setStoreId(event.target.value);
                                    setLines([]);
                                }}
                                options={warehouseOptions(warehouses)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Quick add</Label>
                            <Select
                                value=""
                                onChange={(event) => {
                                    if (event.target.value) addLine(event.target.value);
                                }}
                                options={[
                                    { value: '', label: 'Add an item to the count…' },
                                    ...stocked.map((candidate) => ({
                                        value: candidate.id,
                                        label: `${candidate.sku} — ${candidate.name}`,
                                    })),
                                ]}
                            />
                        </div>
                    </div>

                    {lines.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                            {storeId
                                ? 'Nothing counted yet. Pick items from the second box above.'
                                : 'Choose the store first.'}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {lines.map((line, index) => {
                                const item = items.find(
                                    (candidate) => candidate.id === line.itemId,
                                );
                                const expected = item?.quantityByWarehouse[storeId];
                                const counted =
                                    line.quantity.trim() === ''
                                        ? null
                                        : Number(line.quantity);
                                const difference =
                                    expected !== undefined && counted !== null
                                        ? Math.round((counted - expected) * 100) / 100
                                        : null;

                                return (
                                    <div
                                        key={line.key}
                                        className="space-y-2 rounded-lg border p-3"
                                    >
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div className="min-w-[220px] flex-1 space-y-1">
                                                <Label className="text-xs">
                                                    Item {index + 1}
                                                </Label>
                                                <Select
                                                    value={line.itemId}
                                                    onChange={(event) =>
                                                        setLines((current) =>
                                                            current.map((candidate) =>
                                                                candidate.key === line.key
                                                                    ? {
                                                                          ...candidate,
                                                                          itemId: event
                                                                              .target
                                                                              .value,
                                                                      }
                                                                    : candidate,
                                                            ))
                                                        }
                                                    options={[
                                                        { value: '', label: 'Choose an item' },
                                                        ...stocked.map((candidate) => ({
                                                            value: candidate.id,
                                                            label: `${candidate.sku} — ${candidate.name}`,
                                                        })),
                                                    ]}
                                                />
                                                {expected !== undefined && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Books say {expected}{' '}
                                                        {item?.unitOfMeasure}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="w-40 space-y-1">
                                                <Label className="text-xs">
                                                    You counted
                                                </Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={line.quantity}
                                                    onChange={(event) =>
                                                        setLines((current) =>
                                                            current.map((candidate) =>
                                                                candidate.key === line.key
                                                                    ? {
                                                                          ...candidate,
                                                                          quantity:
                                                                              event
                                                                                  .target
                                                                                  .value,
                                                                      }
                                                                    : candidate,
                                                            ))
                                                        }
                                                    placeholder="0"
                                                    autoFocus={index === 0}
                                                />
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                    setLines((current) =>
                                                        current.filter(
                                                            (candidate) =>
                                                                candidate.key !== line.key,
                                                        ),
                                                    )
                                                }
                                                aria-label={`Remove line ${index + 1}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        {difference !== null && difference !== 0 && (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-xs font-medium text-amber-700">
                                                    {difference > 0
                                                        ? `${difference} ${item?.unitOfMeasure} more than the books say`
                                                        : `${Math.abs(difference)} ${item?.unitOfMeasure} missing`}
                                                </p>
                                                <Input
                                                    className="min-w-[200px] flex-1"
                                                    value={line.reason}
                                                    onChange={(event) =>
                                                        setLines((current) =>
                                                            current.map((candidate) =>
                                                                candidate.key === line.key
                                                                    ? {
                                                                          ...candidate,
                                                                          reason: event
                                                                              .target
                                                                              .value,
                                                                      }
                                                                    : candidate,
                                                            ))
                                                        }
                                                    placeholder="Why (e.g. broken, never signed out)"
                                                    aria-label="Reason for the difference"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="stocktake-notes">Note</Label>
                        <Textarea
                            id="stocktake-notes"
                            rows={2}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Who counted, when."
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={isSaving}>
                            <ClipboardCheck
                                className="mr-2 h-4 w-4"
                                aria-hidden="true"
                            />
                            {isSaving ? 'Recording…' : 'Record the count'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}