'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { MAINTENANCE_CATEGORIES, WORK_ORDER_PRIORITIES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/entity-states';
import { useProperties } from '@/hooks/use-properties';
import { useUnits } from '@/hooks/use-units';
import { useAssets, useTechnicians } from '@/hooks/use-maintenance';

interface FormState {
    title: string;
    description: string;
    category: string;
    priority: string;
    propertyId: string;
    unitId: string;
    assetId: string;
    accessInstructions: string;
    estimatedCost: string;
    scheduledFor: string;
    assignedTechnicianId: string;
}

const EMPTY: FormState = {
    title: '',
    description: '',
    category: 'PLUMBING',
    priority: 'NORMAL',
    propertyId: '',
    unitId: '',
    assetId: '',
    accessInstructions: '',
    estimatedCost: '',
    scheduledFor: '',
    assignedTechnicianId: '',
};

/**
 * Work order form (Module 9), shared by create and edit.
 *
 * There is no status field here, deliberately — status only moves through the
 * action endpoints, which run the state machine. The property picker narrows the
 * unit list, because a work order filed against the wrong building is the one
 * mistake that sends a technician to the wrong address.
 *
 * The access-instructions box is treated as a first-class field rather than an
 * afterthought: a technician standing outside a locked door is the most common
 * cause of a wasted visit, and whoever knows the code is standing in the room.
 */
export function WorkOrderForm({ workOrderId }: { workOrderId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(workOrderId);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { properties } = useProperties({ limit: 200 });
    const { units } = useUnits({
        limit: 200,
        ...(form.propertyId ? { propertyId: form.propertyId } : {}),
    });
    const { assets } = useAssets({ ...(form.propertyId ? { propertyId: form.propertyId } : {}) });
    const { technicians } = useTechnicians();

    useEffect(() => {
        if (!workOrderId) return;
        let cancelled = false;

        maintenanceApi
            .workOrder(workOrderId)
            .then((response) => {
                if (cancelled) return;
                const record = response.data;
                setForm({
                    title: record.title ?? '',
                    description: record.description ?? '',
                    category: record.category ?? 'PLUMBING',
                    priority: record.priority ?? 'NORMAL',
                    propertyId: record.propertyId ?? '',
                    unitId: record.unitId ?? '',
                    assetId: record.assetId ?? '',
                    accessInstructions: record.accessInstructions ?? '',
                    estimatedCost:
                        record.estimatedCost !== undefined && record.estimatedCost !== null
                            ? String(record.estimatedCost)
                            : '',
                    scheduledFor: record.scheduledFor
                        ? record.scheduledFor.slice(0, 10)
                        : '',
                    assignedTechnicianId: record.assignedTechnicianId ?? '',
                });
            })
            .catch(() => toast.error('Could not load this work order'))
            .finally(() => !cancelled && setIsLoading(false));

        return () => {
            cancelled = true;
        };
    }, [workOrderId]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: '' }));
    };

    const unitOptions = useMemo(
        () =>
            units.map((unit) => ({
                value: unit.id,
                label: unit.name,
            })),
        [units],
    );

    const submit = async () => {
        const nextErrors: Record<string, string> = {};
        if (form.title.trim().length < 3) nextErrors.title = 'Give this a short, searchable title';
        if (form.description.trim().length < 5)
            nextErrors.description = 'Describe what is wrong — a technician reads this first';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim(),
                category: form.category,
                priority: form.priority,
                ...(form.propertyId ? { propertyId: form.propertyId } : {}),
                ...(form.unitId ? { unitId: form.unitId } : {}),
                ...(form.assetId ? { assetId: form.assetId } : {}),
                ...(form.accessInstructions.trim()
                    ? { accessInstructions: form.accessInstructions.trim() }
                    : {}),
                ...(form.estimatedCost.trim()
                    ? { estimatedCost: Number(form.estimatedCost) }
                    : {}),
                ...(form.scheduledFor
                    ? { scheduledFor: new Date(form.scheduledFor).toISOString() }
                    : {}),
                ...(form.assignedTechnicianId && !isEdit
                    ? { assignedTechnicianId: form.assignedTechnicianId }
                    : {}),
            };

            if (isEdit && workOrderId) {
                await maintenanceApi.updateWorkOrder(workOrderId, payload);
                toast.success('Work order updated');
                router.push(`/maintenance/work-orders/${workOrderId}`);
            } else {
                const response = await maintenanceApi.createWorkOrder(payload);
                toast.success(`${response.data.reference} raised`);
                router.push(`/maintenance/work-orders/${response.data.id}`);
            }
        } catch (err) {
            toast.error(apiMessage(err, 'Could not save the work order'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the work order…" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>What is wrong?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="wo-title">Title</Label>
                        <Input
                            id="wo-title"
                            value={form.title}
                            onChange={(event) => set('title', event.target.value)}
                            placeholder="e.g. Kitchen tap dripping"
                            aria-invalid={Boolean(errors.title)}
                        />
                        {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="wo-description">Description</Label>
                        <Textarea
                            id="wo-description"
                            rows={4}
                            value={form.description}
                            onChange={(event) => set('description', event.target.value)}
                            placeholder="What is happening, since when, and anything you have already tried."
                            aria-invalid={Boolean(errors.description)}
                        />
                        {errors.description && (
                            <p className="text-sm text-destructive">{errors.description}</p>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Trade</Label>
                            <Select
                                value={form.category}
                                onChange={(event) => set('category', event.target.value)}
                                options={MAINTENANCE_CATEGORIES}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select
                                value={form.priority}
                                onChange={(event) => set('priority', event.target.value)}
                                options={WORK_ORDER_PRIORITIES.map((priority) => ({
                                    value: priority.value,
                                    label: `${priority.label} — respond within ${priority.window}`,
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                Emergency work can be dispatched before it is inspected;
                                everything else waits for an assessment.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Where is it?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Property</Label>
                            <Select
                                value={form.propertyId}
                                onChange={(event) => {
                                    setForm((current) => ({
                                        ...current,
                                        propertyId: event.target.value,
                                        // Clearing these avoids saving a unit or asset
                                        // from the previous building against a new one.
                                        unitId: '',
                                        assetId: '',
                                    }));
                                }}
                                options={[
                                    { value: '', label: 'No property (site-wide)' },
                                    ...properties.map((property) => ({
                                        value: property.id,
                                        label: property.name,
                                    })),
                                ]}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Unit</Label>
                            <Select
                                value={form.unitId}
                                onChange={(event) => set('unitId', event.target.value)}
                                options={[
                                    { value: '', label: form.propertyId ? 'Whole property' : 'Choose a property first' },
                                    ...unitOptions,
                                ]}
                                disabled={!form.propertyId}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Plant / asset (optional)</Label>
                        <Select
                            value={form.assetId}
                            onChange={(event) => set('assetId', event.target.value)}
                            options={[
                                { value: '', label: 'Not about a specific machine' },
                                ...assets.map((asset) => ({
                                    value: asset.id,
                                    label: `${asset.assetTag ? `${asset.assetTag} · ` : ''}${asset.name}`,
                                })),
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            Attaching the fault to a machine is what builds the service
                            history a plant register is for.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="wo-access">How does somebody get in?</Label>
                        <Textarea
                            id="wo-access"
                            rows={2}
                            value={form.accessInstructions}
                            onChange={(event) => set('accessInstructions', event.target.value)}
                            placeholder="Gate code, key holder, which neighbour has the spare."
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Cost and dispatch</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="wo-cost">Estimated cost (optional)</Label>
                        <Input
                            id="wo-cost"
                            inputMode="decimal"
                            value={form.estimatedCost}
                            onChange={(event) => set('estimatedCost', event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Blank is honest. An estimate is what the approver reads.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="wo-scheduled">Scheduled for</Label>
                        <Input
                            id="wo-scheduled"
                            type="date"
                            value={form.scheduledFor}
                            onChange={(event) => set('scheduledFor', event.target.value)}
                        />
                    </div>
                    {!isEdit && (
                        <div className="space-y-2">
                            <Label>Assign now (optional)</Label>
                            <Select
                                value={form.assignedTechnicianId}
                                onChange={(event) =>
                                    set('assignedTechnicianId', event.target.value)
                                }
                                options={[
                                    { value: '', label: 'Leave it in the queue' },
                                    ...technicians.map((technician) => ({
                                        value: technician.id,
                                        label: `${technician.firstName} ${technician.lastName}`,
                                    })),
                                ]}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isSaving}
                >
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving
                        ? 'Saving…'
                        : isEdit
                          ? 'Save changes'
                          : 'Raise work order'}
                </Button>
            </div>

            {isEdit && (
                <p className="text-xs text-muted-foreground">
                    <Wrench className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    Status, assignment and cost actuals are not editable here: they move
                    through the actions on the work order so each one is recorded with an
                    actor and a reason.
                </p>
            )}
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
