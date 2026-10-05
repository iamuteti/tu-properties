'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { LoadingState } from '@/components/ui/entity-states';
import { movementErrorMessage } from '@/components/inventory/stock-display';

interface FormState {
    code: string;
    name: string;
    address: string;
    phone: string;
    isDefault: boolean;
    notes: string;
    isActive: boolean;
}

const EMPTY: FormState = {
    code: '',
    name: '',
    address: '',
    phone: '',
    isDefault: false,
    notes: '',
    isActive: true,
};

/**
 * Store form (Module 11), shared by create and edit.
 *
 * The `isDefault` switch is the interesting one. It is a convenience — "book the
 * goods in without saying where" — and the API keeps exactly one store flagged per
 * organization, demoting the previous one rather than refusing. So making a store
 * the default is a decision somebody makes, not an error they trip over, and the
 * form says so instead of pretending it is a radio button.
 */
export function WarehouseForm({ warehouseId }: { warehouseId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(warehouseId);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isOnlyStore, setIsOnlyStore] = useState(false);

    useEffect(() => {
        if (!warehouseId) return;
        let cancelled = false;

        inventoryApi
            .warehouse(warehouseId)
            .then(({ data }) => {
                if (cancelled) return;
                setForm({
                    code: data.code ?? '',
                    name: data.name ?? '',
                    address: data.address ?? '',
                    phone: data.phone ?? '',
                    isDefault: data.isDefault ?? false,
                    notes: data.notes ?? '',
                    isActive: data.isActive ?? true,
                });
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                toast.error(movementErrorMessage(error, 'Could not load the store'));
                setIsLoading(false);
            });

        // The API refuses to delete the only store, so the form has to say so
        // before somebody tries. Two stores in an organization is the point of the
        // feature, so this is worth a sentence rather than a 409 at the end.
        inventoryApi
            .warehouses({ includeInactive: 'true' })
            .then(({ data }) => {
                if (!cancelled) setIsOnlyStore(data.length <= 1);
            })
            .catch(() => setIsOnlyStore(false));

        return () => {
            cancelled = true;
        };
    }, [warehouseId]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: '' }));
    };

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (!form.code.trim()) {
            nextErrors.code = 'A short code, so a delivery note can say it';
        }
        if (form.name.trim().length < 2) nextErrors.name = 'Name it';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        try {
            const payload: Parameters<typeof inventoryApi.createWarehouse>[0] & {
                isActive?: boolean;
            } = {
                code: form.code.trim(),
                name: form.name.trim(),
                isDefault: form.isDefault,
            };
            if (form.address.trim()) payload.address = form.address.trim();
            if (form.phone.trim()) payload.phone = form.phone.trim();
            if (form.notes.trim()) payload.notes = form.notes.trim();

            if (isEdit && warehouseId) {
                payload.isActive = form.isActive;
                await inventoryApi.updateWarehouse(warehouseId, payload);
                toast.success(`${form.code} updated`);
                router.push(`/inventory/warehouses/${warehouseId}`);
            } else {
                const response = await inventoryApi.createWarehouse(payload);
                toast.success(`${response.data.name} added`);
                router.push(`/inventory/warehouses/${response.data.id}`);
            }
        } catch (error) {
            toast.error(movementErrorMessage(error, 'Could not save the store'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the store…" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Where is it?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="warehouse-code">Code</Label>
                            <Input
                                id="warehouse-code"
                                value={form.code}
                                onChange={(event) => set('code', event.target.value)}
                                placeholder="e.g. MAIN"
                                aria-invalid={Boolean(errors.code)}
                                className="uppercase"
                            />
                            {errors.code ? (
                                <p className="text-sm text-destructive">{errors.code}</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Unique within your organisation, stored in upper case.
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="warehouse-name">Name</Label>
                            <Input
                                id="warehouse-name"
                                value={form.name}
                                onChange={(event) => set('name', event.target.value)}
                                placeholder="e.g. Main store — Westgate offices"
                                aria-invalid={Boolean(errors.name)}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="warehouse-address">Where it is</Label>
                        <Textarea
                            id="warehouse-address"
                            rows={2}
                            value={form.address}
                            onChange={(event) => set('address', event.target.value)}
                            placeholder="Which floor, which building, who holds the key."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="warehouse-phone">Contact</Label>
                        <Input
                            id="warehouse-phone"
                            value={form.phone}
                            onChange={(event) => set('phone', event.target.value)}
                            placeholder="Phone for whoever is holding it"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Behaviour</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Default store?</Label>
                        <Select
                            value={form.isDefault ? 'yes' : 'no'}
                            onChange={(event) =>
                                set('isDefault', event.target.value === 'yes')
                            }
                            options={[
                                { value: 'no', label: 'No' },
                                {
                                    value: 'yes',
                                    label: 'Yes — book stock here unless told otherwise',
                                },
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            Only one store can be the default. Making this one demotes the
                            previous one — it is a decision, not a clash.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="warehouse-notes">Notes</Label>
                        <Textarea
                            id="warehouse-notes"
                            rows={2}
                            value={form.notes}
                            onChange={(event) => set('notes', event.target.value)}
                            placeholder="Access, security, how often it is counted."
                        />
                    </div>

                    {isEdit && (
                        <div className="space-y-2">
                            <Label>Still in use?</Label>
                            <Select
                                value={form.isActive ? 'yes' : 'no'}
                                onChange={(event) =>
                                    set('isActive', event.target.value === 'yes')
                                }
                                options={[
                                    { value: 'yes', label: 'Yes' },
                                    {
                                        value: 'no',
                                        label: 'No — deactivated, keep the history',
                                    },
                                ]}
                            />
                            <p className="text-xs text-muted-foreground">
                                Deactivating hides it and stops new stock going in. Every
                                movement already recorded stays readable, because where
                                something used to be kept is a fact.
                            </p>
                        </div>
                    )}

                    {isEdit && isOnlyStore && (
                        <p className="text-xs text-muted-foreground">
                            This is the only store, so it cannot be deleted — goods receipts
                            and stock issues would have nowhere to go.
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add the store'}
                </Button>
            </div>
        </div>
    );
}