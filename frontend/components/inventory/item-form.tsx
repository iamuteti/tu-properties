'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi, procurementApi } from '@/lib/api';
import { INVENTORY_CATEGORIES, STOCK_UNITS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { LoadingState } from '@/components/ui/entity-states';
import { movementErrorMessage } from '@/components/inventory/stock-display';

interface FormState {
    sku: string;
    name: string;
    description: string;
    category: string;
    unitOfMeasure: string;
    unitCost: string;
    reorderLevel: string;
    reorderQuantity: string;
    preferredSupplierId: string;
    notes: string;
    isActive: boolean;
}

const EMPTY: FormState = {
    sku: '',
    name: '',
    description: '',
    category: 'OTHER',
    unitOfMeasure: 'unit',
    unitCost: '',
    reorderLevel: '',
    reorderQuantity: '',
    preferredSupplierId: '',
    notes: '',
    isActive: true,
};

/**
 * Item form (Module 11), shared by create and edit.
 *
 * Two things are absent from this form on purpose, and both absences are the
 * module's design rather than an oversight:
 *
 * 1. **No quantity field.** A stock level is the sum of the movements, and the
 *    only way to put stock on a new item is an `OPENING` movement through the
 *    ledger. An "initial quantity" box here would be a second writer for a number
 *    that has to agree with every movement ever recorded against the item.
 * 2. **No status field.** Retiring an item sets `isActive`; the API refuses to
 *    delete one that has any movements, because deleting it would take the balance
 *    with it.
 *
 * The reorder pair is explained inline rather than left as two bare numbers,
 * because "level 5, quantity 20" is meaningless until you know that the quantity
 * is a case size and the level is the point at which somebody has to notice.
 */
export function ItemForm({ itemId }: { itemId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(itemId);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [suppliers, setSuppliers] = useState<
        { id: string; name: string; code: string }[]
    >([]);

    useEffect(() => {
        // Suppliers come from Module 10's list. Loaded on mount rather than
        // through a hook because nothing here needs to be reactive.
        procurementApi
            .suppliers()
            .then((response) =>
                setSuppliers(
                    response.data.map((supplier) => ({
                        id: supplier.id,
                        name: supplier.name,
                        code: supplier.code,
                    })),
                ),
            )
            // A missing supplier list must not block the form: the item is still
            // a valid item, just one nobody has named a vendor for yet.
            .catch(() => setSuppliers([]));
    }, []);

    useEffect(() => {
        if (!itemId) return;
        let cancelled = false;

        inventoryApi
            .item(itemId)
            .then(({ data }) => {
                if (cancelled) return;
                const item = data;
                setForm({
                    sku: item.sku ?? '',
                    name: item.name ?? '',
                    description: item.description ?? '',
                    category: item.category ?? 'OTHER',
                    unitOfMeasure: item.unitOfMeasure ?? 'unit',
                    unitCost:
                        item.unitCost == null ? '' : String(Number(item.unitCost)),
                    reorderLevel: String(Number(item.reorderLevel ?? 0)),
                    reorderQuantity:
                        item.reorderQuantity == null
                            ? ''
                            : String(Number(item.reorderQuantity)),
                    preferredSupplierId: item.preferredSupplierId ?? '',
                    notes: item.notes ?? '',
                    isActive: item.isActive ?? true,
                });
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                toast.error(movementErrorMessage(error, 'Could not load the item'));
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [itemId]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: '' }));
    };

    const supplierOptions = useMemo(
        () =>
            suppliers.map((supplier) => ({
                value: supplier.id,
                label: `${supplier.code} — ${supplier.name}`,
            })),
        [suppliers],
    );

    const unitOptions = useMemo(
        () => STOCK_UNITS.map((unit) => ({ value: unit, label: unit })),
        [],
    );

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (!form.sku.trim()) nextErrors.sku = 'Give it a code people can say out loud';
        if (form.name.trim().length < 2) nextErrors.name = 'Name it';

        const cost = form.unitCost.trim() === '' ? null : Number(form.unitCost);
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
            nextErrors.unitCost = 'A price is a number, or leave it empty';
        }

        const level = form.reorderLevel.trim() === '' ? 0 : Number(form.reorderLevel);
        if (!Number.isFinite(level) || level < 0) {
            nextErrors.reorderLevel = 'The reorder level is a count, or zero for none';
        }

        const reorderQuantity =
            form.reorderQuantity.trim() === '' ? null : Number(form.reorderQuantity);
        if (
            reorderQuantity !== null &&
            (!Number.isFinite(reorderQuantity) || reorderQuantity <= 0)
        ) {
            nextErrors.reorderQuantity = 'A reorder quantity has to be more than nothing';
        }

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        try {
            // Typed as the API's payload rather than a loose record, so a renamed
            // field fails here instead of arriving as `undefined` at runtime.
            const payload: Parameters<typeof inventoryApi.createItem>[0] & {
                isActive?: boolean;
            } = {
                sku: form.sku.trim(),
                name: form.name.trim(),
                category: form.category,
                unitOfMeasure: form.unitOfMeasure,
                reorderLevel: level,
            };

            if (form.description.trim()) payload.description = form.description.trim();
            if (cost !== null) payload.unitCost = cost;
            if (reorderQuantity !== null) payload.reorderQuantity = reorderQuantity;
            if (form.preferredSupplierId) {
                payload.preferredSupplierId = form.preferredSupplierId;
            }
            if (form.notes.trim()) payload.notes = form.notes.trim();

            if (isEdit && itemId) {
                payload.isActive = form.isActive;
                await inventoryApi.updateItem(itemId, payload);
                toast.success(`${form.sku} updated`);
                router.push(`/inventory/items/${itemId}`);
            } else {
                const response = await inventoryApi.createItem(payload);
                toast.success(
                    `${response.data.name} added — it has no stock yet until you record an opening balance`,
                    { duration: 6000 },
                );
                router.push(`/inventory/items/${response.data.id}`);
            }
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not save the item'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the item…" />;

    const watching = Number(form.reorderLevel || 0) > 0;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>What is it?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="item-sku">Code</Label>
                            <Input
                                id="item-sku"
                                value={form.sku}
                                onChange={(event) => set('sku', event.target.value)}
                                placeholder="e.g. PLMB-CPL-020"
                                aria-invalid={Boolean(errors.sku)}
                            />
                            {errors.sku ? (
                                <p className="text-sm text-destructive">{errors.sku}</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Unique within your organisation, stored in upper case.
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-name">Name</Label>
                            <Input
                                id="item-name"
                                value={form.name}
                                onChange={(event) => set('name', event.target.value)}
                                placeholder="e.g. 20mm compression coupling"
                                aria-invalid={Boolean(errors.name)}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                                value={form.category}
                                onChange={(event) => set('category', event.target.value)}
                                options={INVENTORY_CATEGORIES.map((category) => ({
                                    value: category.value,
                                    label: category.label,
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                {INVENTORY_CATEGORIES.find(
                                    (category) => category.value === form.category,
                                )?.hint ?? 'What this is spent on'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-unit">Counted in</Label>
                            <Input
                                id="item-unit"
                                list="stock-units"
                                value={form.unitOfMeasure}
                                onChange={(event) =>
                                    set('unitOfMeasure', event.target.value)
                                }
                                placeholder="litre, box, roll…"
                            />
                            <datalist id="stock-units">
                                {unitOptions.map((option) => (
                                    <option key={option.value} value={option.value} />
                                ))}
                            </datalist>
                            <p className="text-xs text-muted-foreground">
                                The label a storekeeper would use. Anything is allowed, because
                                a conversion table is a second thing to keep correct.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="item-description">Description</Label>
                        <Textarea
                            id="item-description"
                            rows={2}
                            value={form.description}
                            onChange={(event) =>
                                set('description', event.target.value)
                            }
                            placeholder="Size, grade, anything that tells one of these from another."
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>When to order more</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="item-cost">Last price</Label>
                            <Input
                                id="item-cost"
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.unitCost}
                                onChange={(event) => set('unitCost', event.target.value)}
                                placeholder="0.00"
                                aria-invalid={Boolean(errors.unitCost)}
                            />
                            {errors.unitCost && (
                                <p className="text-sm text-destructive">
                                    {errors.unitCost}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-level">Reorder level</Label>
                            <Input
                                id="item-level"
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.reorderLevel}
                                onChange={(event) =>
                                    set('reorderLevel', event.target.value)
                                }
                                placeholder="0"
                                aria-invalid={Boolean(errors.reorderLevel)}
                            />
                            {errors.reorderLevel ? (
                                <p className="text-sm text-destructive">
                                    {errors.reorderLevel}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Below this, somebody is told. Zero means tracked but never
                                    alerted.
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="item-reorder-qty">Order this much</Label>
                            <Input
                                id="item-reorder-qty"
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.reorderQuantity}
                                onChange={(event) =>
                                    set('reorderQuantity', event.target.value)
                                }
                                placeholder="Twice the level"
                                aria-invalid={Boolean(errors.reorderQuantity)}
                            />
                            {errors.reorderQuantity ? (
                                <p className="text-sm text-destructive">
                                    {errors.reorderQuantity}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Leave empty to top up to twice the level. Set it when a case
                                    size beats that.
                                </p>
                            )}
                        </div>
                    </div>

                    {watching && (
                        <p className="text-sm text-muted-foreground">
                            At {form.reorderLevel || 0} {form.unitOfMeasure}, this gets
                            flagged as low.{' '}
                            {form.reorderQuantity.trim()
                                ? `The suggestion will be ${form.reorderQuantity} ${form.unitOfMeasure} — whatever is on the next order.`
                                : 'With no order quantity set, the suggestion tops it up to twice the level, so it does not come back next week.'}
                        </p>
                    )}

                    <div className="space-y-2">
                        <Label>Normally bought from</Label>
                        <Select
                            value={form.preferredSupplierId}
                            onChange={(event) =>
                                set('preferredSupplierId', event.target.value)
                            }
                            options={[
                                { value: '', label: 'Not decided' },
                                ...supplierOptions,
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            Named in the reorder alert so somebody does not have to remember.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="item-notes">Notes</Label>
                        <Textarea
                            id="item-notes"
                            rows={2}
                            value={form.notes}
                            onChange={(event) => set('notes', event.target.value)}
                            placeholder="Which van, which shelf, anything a new starter would need."
                        />
                    </div>

                    {isEdit && (
                        <div className="space-y-2">
                            <Label htmlFor="item-active">Still stocking it?</Label>
                            <Select
                                value={form.isActive ? 'yes' : 'no'}
                                onChange={(event) =>
                                    set('isActive', event.target.value === 'yes')
                                }
                                options={[
                                    { value: 'yes', label: 'Yes — in the catalogue' },
                                    {
                                        value: 'no',
                                        label: 'No — retired, keep the history',
                                    },
                                ]}
                            />
                            <p className="text-xs text-muted-foreground">
                                Retiring hides it from the list and stops anything moving
                                against it, but keeps every movement. Deleting is refused once
                                there are any, because that would take the balance with it.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {!isEdit && (
                <p className="text-sm text-muted-foreground">
                    The item is saved with no stock on it. Open it afterwards and record an
                    opening balance in its unit — that is the only way stock gets onto a
                    shelf, and it means the balance and the ledger can never disagree.
                </p>
            )}

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add the item'}
                </Button>
            </div>
        </div>
    );
}