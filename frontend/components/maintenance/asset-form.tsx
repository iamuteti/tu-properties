'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { ASSET_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { LoadingState } from '@/components/ui/entity-states';
import { useProperties } from '@/hooks/use-properties';
import { useUnits } from '@/hooks/use-units';
import { useAsset } from '@/hooks/use-maintenance';

interface FormState {
    propertyId: string;
    unitId: string;
    type: string;
    name: string;
    assetTag: string;
    serialNumber: string;
    manufacturer: string;
    model: string;
    location: string;
    capacity: string;
    installedAt: string;
    warrantyExpiresAt: string;
    notes: string;
}

const EMPTY: FormState = {
    propertyId: '',
    unitId: '',
    type: 'OTHER',
    name: '',
    assetTag: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    location: '',
    capacity: '',
    installedAt: '',
    warrantyExpiresAt: '',
    notes: '',
};

/**
 * Asset form (Module 9), shared by create and edit.
 *
 * The asset tag is what a technician is given at the door ("go to GEN-01"), so it
 * is unique per organization when present — the API refuses a duplicate, and a
 * duplicate tag is worse than no tag at all.
 */
export function AssetForm({ assetId }: { assetId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(assetId);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { properties } = useProperties({ limit: 200 });
    const { units } = useUnits({
        limit: 200,
        ...(form.propertyId ? { propertyId: form.propertyId } : {}),
    });
    const { asset } = useAsset(assetId);

    useEffect(() => {
        if (!asset) return;
        setForm({
            propertyId: asset.propertyId ?? '',
            unitId: asset.unitId ?? '',
            type: asset.type ?? 'OTHER',
            name: asset.name ?? '',
            assetTag: asset.assetTag ?? '',
            serialNumber: asset.serialNumber ?? '',
            manufacturer: asset.manufacturer ?? '',
            model: asset.model ?? '',
            location: asset.location ?? '',
            capacity: asset.capacity ?? '',
            installedAt: asset.installedAt ? asset.installedAt.slice(0, 10) : '',
            warrantyExpiresAt: asset.warrantyExpiresAt
                ? asset.warrantyExpiresAt.slice(0, 10)
                : '',
            notes: asset.notes ?? '',
        });
        setIsLoading(false);
    }, [asset]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: '' }));
    };

    const unitOptions = useMemo(
        () => units.map((unit) => ({ value: unit.id, label: unit.name })),
        [units],
    );

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (!form.propertyId) nextErrors.propertyId = 'Plant belongs to a property';
        if (form.name.trim().length < 2) nextErrors.name = 'Name it';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        try {
            const payload: Record<string, string | undefined> = {
                propertyId: form.propertyId,
                type: form.type,
                name: form.name.trim(),
            };
            for (const [key, value] of Object.entries({
                unitId: form.unitId,
                assetTag: form.assetTag,
                serialNumber: form.serialNumber,
                manufacturer: form.manufacturer,
                model: form.model,
                location: form.location,
                capacity: form.capacity,
                installedAt: form.installedAt,
                warrantyExpiresAt: form.warrantyExpiresAt,
                notes: form.notes,
            })) {
                if (value) payload[key] = value;
            }

            if (isEdit && assetId) {
                await maintenanceApi.updateAsset(assetId, payload);
                toast.success('Asset updated');
                router.push(`/maintenance/assets/${assetId}`);
            } else {
                const response = await maintenanceApi.createAsset(payload);
                toast.success(`${response.data.name} added to the register`);
                router.push(`/maintenance/assets/${response.data.id}`);
            }
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the asset'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the asset…" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>What is it?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Property</Label>
                            <Select
                                value={form.propertyId}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        propertyId: event.target.value,
                                        unitId: '',
                                    }))
                                }
                                options={[
                                    { value: '', label: 'Choose a property' },
                                    ...properties.map((property) => ({
                                        value: property.id,
                                        label: property.name,
                                    })),
                                ]}
                            />
                            {errors.propertyId && (
                                <p className="text-sm text-destructive">{errors.propertyId}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Unit (optional)</Label>
                            <Select
                                value={form.unitId}
                                onChange={(event) => set('unitId', event.target.value)}
                                options={[
                                    { value: '', label: 'Shared plant' },
                                    ...unitOptions,
                                ]}
                                disabled={!form.propertyId}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                                value={form.type}
                                onChange={(event) => set('type', event.target.value)}
                                options={ASSET_TYPES}
                            />
                            <p className="text-xs text-muted-foreground">
                                The type decides which trade a scheduled service is booked
                                against, and how it appears on the register.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="asset-name">Name</Label>
                            <Input
                                id="asset-name"
                                value={form.name}
                                onChange={(event) => set('name', event.target.value)}
                                placeholder="e.g. Diesel standby generator"
                                aria-invalid={Boolean(errors.name)}
                            />
                            {errors.name && (
                                <p className="text-sm text-destructive">{errors.name}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="asset-tag">Asset tag</Label>
                            <Input
                                id="asset-tag"
                                value={form.assetTag}
                                onChange={(event) => set('assetTag', event.target.value)}
                                placeholder="e.g. GEN-01"
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique per organization. What a technician is told at the door.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="asset-location">Location</Label>
                            <Input
                                id="asset-location"
                                value={form.location}
                                onChange={(event) => set('location', event.target.value)}
                                placeholder="e.g. Basement plant room"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="asset-manufacturer">Manufacturer</Label>
                        <Input
                            id="asset-manufacturer"
                            value={form.manufacturer}
                            onChange={(event) => set('manufacturer', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset-model">Model</Label>
                        <Input
                            id="asset-model"
                            value={form.model}
                            onChange={(event) => set('model', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset-serial">Serial number</Label>
                        <Input
                            id="asset-serial"
                            value={form.serialNumber}
                            onChange={(event) => set('serialNumber', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset-capacity">Capacity / rating</Label>
                        <Input
                            id="asset-capacity"
                            value={form.capacity}
                            onChange={(event) => set('capacity', event.target.value)}
                            placeholder="e.g. 80 kVA"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset-installed">Installed</Label>
                        <Input
                            id="asset-installed"
                            type="date"
                            value={form.installedAt}
                            onChange={(event) => set('installedAt', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="asset-warranty">Warranty expires</Label>
                        <Input
                            id="asset-warranty"
                            type="date"
                            value={form.warrantyExpiresAt}
                            onChange={(event) => set('warrantyExpiresAt', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2 sm:col-span-3">
                        <Label htmlFor="asset-notes">Notes</Label>
                        <Textarea
                            id="asset-notes"
                            rows={3}
                            value={form.notes}
                            onChange={(event) => set('notes', event.target.value)}
                            placeholder="Access details, quirks, who holds the keys."
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to register'}
                </Button>
            </div>
        </div>
    );
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
