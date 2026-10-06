'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/entity-states';
import { CURRENCIES, UNIT_TYPES } from '@/lib/constants';
import type { Property, Unit, UnitFeature } from '@/types';

/**
 * Shared unit form for create and edit.
 *
 * Replaces the 609-line `units/new` field dump, which sent a dozen field names
 * that do not exist on the `Unit` model (`unitNumber`, `specifiedFloor`,
 * `unitTypeId`, `carSpaceParking`, `marketRent`, …) — every one of them was
 * silently dropped, so the form looked complete but stored almost nothing.
 * These names match the API, the steps validate before advancing, and edit
 * reuses the same component instead of duplicating it.
 */

const unitSchema = z.object({
    propertyId: z.string().min(1, 'Property is required'),
    name: z.string().trim().min(1, 'Unit name/number is required'),
    type: z.string().optional(),
    sequence: z.number().int().min(0).optional().or(z.literal(NaN)),
    floor: z.number().int().min(0).max(200).optional().or(z.literal(NaN)),
    bedrooms: z.number().int().min(0).max(50).optional().or(z.literal(NaN)),
    bathrooms: z.number().int().min(0).max(50).optional().or(z.literal(NaN)),
    areaSqFt: z.number().min(0).optional().or(z.literal(NaN)),
    furnished: z.boolean().optional(),
    ownerOccupied: z.boolean().optional(),
    quotedPrice: z.number().min(0).optional().or(z.literal(NaN)),
    baseRent: z.number().min(0).optional().or(z.literal(NaN)),
    basePerUnitArea: z.number().min(0).optional().or(z.literal(NaN)),
    currency: z.string().optional(),
    chargePlan: z.string().optional(),
    outSourceParking: z.string().optional(),
    takeOnLettingDate: z.string().optional(),
    tenantResidentCodeCounter: z.number().int().min(0).optional().or(z.literal(NaN)),
    apartmentNotes: z.string().optional(),
});

export type UnitFormValues = z.infer<typeof unitSchema>;

const STEPS = [
    { id: 'identity', label: 'Unit', fields: ['propertyId', 'name', 'type', 'sequence', 'floor'] },
    { id: 'specs', label: 'Specifications', fields: ['bedrooms', 'bathrooms', 'areaSqFt', 'furnished', 'ownerOccupied'] },
    { id: 'pricing', label: 'Pricing', fields: ['baseRent', 'currency', 'chargePlan'] },
    {
        id: 'utilities',
        label: 'Utilities',
        fields: [],
    },
    { id: 'features', label: 'Features', fields: [] },
] as const;

const DRAFT_KEY = 'tu-properties:unit-draft';

export interface UnitFormProps {
    mode: 'create' | 'edit';
    initial?: Unit | null;
    properties: Property[];
    defaultPropertyId?: string;
    submitLabel?: string;
    onSubmit: (values: UnitFormValues, features: Array<{ name: string; featureType?: string }>) => Promise<void>;
    onCancel: () => void;
}

export function UnitForm({
    mode,
    initial,
    properties,
    defaultPropertyId,
    submitLabel,
    onSubmit,
    onCancel,
}: UnitFormProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [features, setFeatures] = useState<Array<{ name: string; featureType?: string }>>(
        () => initial?.features?.map((f: UnitFeature) => ({ name: f.name, featureType: f.featureType ?? undefined })) ?? [],
    );
    const [featureName, setFeatureName] = useState('');
    const [featureType, setFeatureType] = useState('');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [draftRestored, setDraftRestored] = useState(false);

    const defaults = useMemo<Partial<UnitFormValues>>(() => {
        const base: Partial<UnitFormValues> = {
            propertyId: defaultPropertyId ?? '',
            name: '',
            type: '',
            currency: 'KES',
            chargePlan: '',
            outSourceParking: '',
            takeOnLettingDate: '',
            apartmentNotes: '',
            furnished: false,
            ownerOccupied: false,
        };
        if (!initial) return base;
        return {
            ...base,
            propertyId: initial.propertyId,
            name: initial.name,
            type: initial.type ?? '',
            sequence: initial.sequence,
            floor: initial.floor,
            bedrooms: initial.bedrooms,
            bathrooms: initial.bathrooms,
            areaSqFt: initial.areaSqFt != null ? Number(initial.areaSqFt) : undefined,
            furnished: initial.furnished ?? false,
            ownerOccupied: initial.ownerOccupied ?? false,
            quotedPrice: initial.quotedPrice != null ? Number(initial.quotedPrice) : undefined,
            baseRent: initial.baseRent != null ? Number(initial.baseRent) : undefined,
            basePerUnitArea: initial.basePerUnitArea != null ? Number(initial.basePerUnitArea) : undefined,
            currency: initial.currency ?? 'KES',
            chargePlan: initial.chargePlan ?? '',
            outSourceParking: initial.outSourceParking ?? '',
            takeOnLettingDate: initial.takeOnLettingDate ? initial.takeOnLettingDate.slice(0, 10) : '',
            tenantResidentCodeCounter: initial.tenantResidentCodeCounter,
            apartmentNotes: initial.apartmentNotes ?? '',
        };
    }, [initial, defaultPropertyId]);

    const {
        register,
        handleSubmit,
        trigger,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<UnitFormValues>({
        resolver: zodResolver(unitSchema) as never,
        defaultValues: defaults,
        mode: 'onBlur',
    });

    const watched = watch();

    useEffect(() => {
        if (mode !== 'create') return;
        try {
            const stored = window.localStorage.getItem(DRAFT_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (parsed?.values) {
                reset({ ...defaults, ...parsed.values });
                if (Array.isArray(parsed.features)) setFeatures(parsed.features);
                setDraftRestored(true);
            }
        } catch {
            window.localStorage.removeItem(DRAFT_KEY);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (mode !== 'create') return;
        const timer = setTimeout(() => {
            window.localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify({ values: watched, features, savedAt: new Date().toISOString() }),
            );
        }, 800);
        return () => clearTimeout(timer);
    }, [watched, features, mode]);

    const discardDraft = () => {
        window.localStorage.removeItem(DRAFT_KEY);
        reset(defaults);
        setFeatures([]);
        setDraftRestored(false);
    };

    const goNext = async () => {
        const step = STEPS[stepIndex];
        if (step.fields.length > 0) {
            const valid = await trigger(
                step.fields as unknown as Array<keyof UnitFormValues>,
                { shouldFocus: true },
            );
            if (!valid) return;
        }
        setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    };

    const addFeature = () => {
        const name = featureName.trim();
        if (!name) return;
        if (features.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
            setSubmitError('That feature is already on the list.');
            return;
        }
        setFeatures((current) => [...current, { name, featureType: featureType.trim() || undefined }]);
        setFeatureName('');
        setFeatureType('');
        setSubmitError(null);
    };

    const handleSubmitForm = handleSubmit(async (values) => {
        setSubmitError(null);
        const cleaned = Object.fromEntries(
            Object.entries(values).filter(
                ([, value]) =>
                    value !== '' &&
                    value !== undefined &&
                    !(typeof value === 'number' && Number.isNaN(value)),
            ),
        ) as UnitFormValues;
        try {
            await onSubmit(cleaned, features);
            if (mode === 'create') window.localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Something went wrong.');
        }
    });

    const step = STEPS[stepIndex];

    return (
        <form onSubmit={handleSubmitForm} className="space-y-6">
            <div className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
                <ol className="flex flex-wrap items-center gap-2" aria-label="Form steps">
                    {STEPS.map((item, index) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={() => setStepIndex(index)}
                                aria-current={index === stepIndex ? 'step' : undefined}
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                    index === stepIndex
                                        ? 'bg-slate-900 text-white'
                                        : index < stepIndex
                                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {index + 1}. {item.label}
                            </button>
                        </li>
                    ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                    Step {stepIndex + 1} of {STEPS.length}
                </p>
            </div>

            {draftRestored && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <span>An unfinished draft from earlier was restored.</span>
                    <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
                        Start fresh
                    </Button>
                </div>
            )}

            {step.id === 'identity' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Property" id="propertyId" error={errors.propertyId?.message} required>
                        <Select id="propertyId" {...register('propertyId')} disabled={isSubmitting}>
                            <option value="">Select property</option>
                            {properties.map((property) => (
                                <option key={property.id} value={property.id}>
                                    {property.name} ({property.code})
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Unit name / number" id="name" error={errors.name?.message} required>
                        <Input id="name" placeholder="e.g. Flat 12" {...register('name')} disabled={isSubmitting} />
                    </Field>
                    <Field label="Type" id="type">
                        <Select id="type" {...register('type')} disabled={isSubmitting}>
                            <option value="">Select type</option>
                            {UNIT_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Floor" id="floor" error={errors.floor?.message}>
                        <Input id="floor" type="number" min={0} {...register('floor', { valueAsNumber: true })} disabled={isSubmitting} />
                    </Field>
                    <Field label="Sequence" id="sequence" error={errors.sequence?.message}>
                        <Input id="sequence" type="number" min={0} {...register('sequence', { valueAsNumber: true })} disabled={isSubmitting} />
                    </Field>
                </div>
            )}

            {step.id === 'specs' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Field label="Bedrooms" id="bedrooms" error={errors.bedrooms?.message}>
                            <Input id="bedrooms" type="number" min={0} {...register('bedrooms', { valueAsNumber: true })} disabled={isSubmitting} />
                        </Field>
                        <Field label="Bathrooms" id="bathrooms" error={errors.bathrooms?.message}>
                            <Input id="bathrooms" type="number" min={0} {...register('bathrooms', { valueAsNumber: true })} disabled={isSubmitting} />
                        </Field>
                        <Field label="Area (sq ft)" id="areaSqFt" error={errors.areaSqFt?.message}>
                            <Input id="areaSqFt" type="number" min={0} {...register('areaSqFt', { valueAsNumber: true })} disabled={isSubmitting} />
                        </Field>
                        <Field label="Parking" id="outSourceParking">
                            <Input id="outSourceParking" placeholder="e.g. 1 covered bay" {...register('outSourceParking')} disabled={isSubmitting} />
                        </Field>
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold">Condition</legend>
                        <div className="flex items-center gap-2">
                            <Checkbox id="furnished" {...register('furnished')} disabled={isSubmitting} />
                            <label htmlFor="furnished" className="text-sm">Furnished</label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="ownerOccupied" {...register('ownerOccupied')} disabled={isSubmitting} />
                            <label htmlFor="ownerOccupied" className="text-sm">Owner occupied</label>
                        </div>
                    </fieldset>
                    <Field label="Notes" id="apartmentNotes">
                        <Textarea id="apartmentNotes" className="min-h-[90px]" {...register('apartmentNotes')} disabled={isSubmitting} />
                    </Field>
                </div>
            )}

            {step.id === 'pricing' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Base / market rent" id="baseRent" error={errors.baseRent?.message}>
                        <Input id="baseRent" type="number" min={0} {...register('baseRent', { valueAsNumber: true })} disabled={isSubmitting} />
                    </Field>
                    <Field label="Quoted price" id="quotedPrice" error={errors.quotedPrice?.message}>
                        <Input id="quotedPrice" type="number" min={0} {...register('quotedPrice', { valueAsNumber: true })} disabled={isSubmitting} />
                    </Field>
                    <Field label="Rent per sq ft" id="basePerUnitArea" error={errors.basePerUnitArea?.message}>
                        <Input id="basePerUnitArea" type="number" min={0} {...register('basePerUnitArea', { valueAsNumber: true })} disabled={isSubmitting} />
                    </Field>
                    <Field label="Currency" id="currency">
                        <Select id="currency" {...register('currency')} disabled={isSubmitting}>
                            {CURRENCIES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Charge plan" id="chargePlan">
                        <Input id="chargePlan" placeholder="e.g. monthly" {...register('chargePlan')} disabled={isSubmitting} />
                    </Field>
                </div>
            )}

            {step.id === 'utilities' && (
                <div className="space-y-6">
                    {/*
                        Module 14 moved this off the unit entirely. The four fields that
                        used to be here - the utility company's account number and the
                        meter's own number, per flat - are now `UtilityMeter` rows, which
                        also record which utility a number belongs to, whether the meter
                        is bulk and what it has read. A flat with a bulk meter and no meter
                        of its own is now representable, which it was not here.
                    */}
                    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        Utility account and meter numbers are no longer kept on the unit. They live in the meter
                        register, which records the readings behind them and can tell a sub-meter from a bulk one. A
                        meter for this unit is registered from{' '}
                        <a href="/utilities/meters/new" className="font-medium underline">
                            the meter register
                        </a>
                        .
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Take on letting date" id="takeOnLettingDate">
                            <Input id="takeOnLettingDate" type="date" {...register('takeOnLettingDate')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Tenant code counter" id="tenantResidentCodeCounter">
                            <Input
                                id="tenantResidentCodeCounter"
                                type="number"
                                min={0}
                                {...register('tenantResidentCodeCounter', { valueAsNumber: true })}
                                disabled={isSubmitting}
                            />
                        </Field>
                    </div>
                </div>
            )}

            {step.id === 'features' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1">
                            <label htmlFor="feature-name" className="mb-1 block text-sm font-medium">
                                Feature
                            </label>
                            <Input
                                id="feature-name"
                                value={featureName}
                                placeholder="e.g. Balcony"
                                onChange={(event) => setFeatureName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addFeature();
                                    }
                                }}
                            />
                        </div>
                        <div className="min-w-[160px] flex-1">
                            <label htmlFor="feature-type" className="mb-1 block text-sm font-medium">
                                Type (optional)
                            </label>
                            <Input
                                id="feature-type"
                                value={featureType}
                                placeholder="e.g. Exterior"
                                onChange={(event) => setFeatureType(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addFeature();
                                    }
                                }}
                            />
                        </div>
                        <Button type="button" variant="outline" onClick={addFeature} disabled={!featureName.trim()}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add
                        </Button>
                    </div>
                    {features.length > 0 ? (
                        <ul className="divide-y rounded-md border">
                            {features.map((feature, index) => (
                                <li key={`${feature.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="font-medium">{feature.name}</span>
                                    <span className="flex items-center gap-3">
                                        {feature.featureType && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                                {feature.featureType}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            aria-label={`Remove ${feature.name}`}
                                            onClick={() => setFeatures((current) => current.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                            No features recorded yet.
                        </p>
                    )}
                </div>
            )}

            {submitError && <ErrorState message={submitError} />}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
                        disabled={stepIndex === 0 || isSubmitting}
                    >
                        <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back
                    </Button>
                    {stepIndex < STEPS.length - 1 ? (
                        <Button type="button" onClick={goNext} disabled={isSubmitting}>
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
                        </Button>
                    ) : (
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving…' : submitLabel ?? (mode === 'create' ? 'Create unit' : 'Save changes')}
                        </Button>
                    )}
                </div>
            </div>
        </form>
    );
}

function Field({
    label,
    id,
    error,
    required,
    children,
}: {
    label: string;
    id: string;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
                {required && <span className="ml-1 text-destructive">*</span>}
            </label>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}