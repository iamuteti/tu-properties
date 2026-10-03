'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Building2, Check, ChevronLeft, ChevronRight, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/entity-states';
import {
    ACCOUNT_LEDGER_TYPES,
    COUNTRIES,
    MULTI_STORY_TYPES,
    PENALTY_CHARGE_MODES,
    PROPERTY_CATEGORIES,
    PROPERTY_TYPES,
    SPECIFICATIONS,
} from '@/lib/constants';
import type { Branch, Landlord, Property, PropertyAmenity } from '@/types';

/**
 * Shared property form for create and edit.
 *
 * The previous implementation was an 831-line field dump shared by nothing:
 * `properties/new` had no edit counterpart, sent `categoryId`/`propertyTypeId`
 * columns that do not exist (so category and type were silently dropped), and
 * validated nothing until the final submit. This version is one component used
 * by both routes, walks the user through sections with validation before
 * advancing, keeps a local draft so a half-finished property is not lost, and
 * submits only fields the API actually accepts.
 */

const basicsSchema = z.object({
    code: z.string().trim().min(2, 'Property code is required'),
    name: z.string().trim().min(2, 'Property name is required'),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    type: z.string().optional(),
    category: z.string().optional(),
    landlordId: z.string().optional(),
    branchId: z.string().optional(),
    dateAcquired: z.string().optional(),
    lrNumber: z.string().optional(),
});

const locationSchema = z.object({
    country: z.string().optional(),
    estateArea: z.string().optional(),
    areaRegion: z.string().optional(),
    roadStreet: z.string().optional(),
    specification: z.string().optional(),
    latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional().or(z.literal(NaN)),
    longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional().or(z.literal(NaN)),
    notes: z.string().optional(),
    specificContactInfo: z.string().optional(),
});

const propertySchema = basicsSchema
    .merge(locationSchema)
    .merge(
        z.object({
            multiStoryType: z.string().optional(),
            numberOfFloors: z.number().int().min(0).optional().or(z.literal(NaN)),
            accountLedgerType: z.string().optional(),
            primaryBankAccount: z.string().optional(),
            alternativeTaxPin: z.string().optional(),
            propertyWorkingTaxPin: z.string().optional(),
            invoicePaymentInfo: z.string().optional(),
            holderPaymentTerms: z.string().optional(),
            mpesaPropertyPayNumber: z.string().optional(),
            disableMpesaStkPush: z.boolean().optional(),
            disableMpesaStkNarration: z.boolean().optional(),
            lpgExempted: z.boolean().optional(),
            penaltyChargeMode: z.string().optional(),
            penaltyDay: z.number().int().min(0).optional().or(z.literal(NaN)),
            landlordDrawerBank: z.string().optional(),
            landlordBankBranch: z.string().optional(),
            landlordAccountName: z.string().optional(),
            landlordAccountNumber: z.string().optional(),
            exemptAllSms: z.boolean().optional(),
            exemptInvoiceSms: z.boolean().optional(),
            exemptGeneralSms: z.boolean().optional(),
            exemptHagueSms: z.boolean().optional(),
            exemptBalanceSms: z.boolean().optional(),
            exemptAllEmail: z.boolean().optional(),
            exemptInvoiceEmail: z.boolean().optional(),
            exemptGeneralEmail: z.boolean().optional(),
            exemptReceiptEmail: z.boolean().optional(),
            exemptBalanceEmail: z.boolean().optional(),
            excludeInTwoSummaryReport: z.boolean().optional(),
        }),
    );

export type PropertyFormValues = z.infer<typeof propertySchema>;

type AmenityDraft = { name: string; category?: string };

const STEPS = [
    { id: 'basics', label: 'Basics', fields: ['code', 'name', 'type', 'category', 'landlordId', 'branchId', 'status'] },
    { id: 'location', label: 'Location', fields: ['country', 'estateArea', 'areaRegion', 'roadStreet', 'latitude', 'longitude', 'specification', 'numberOfFloors', 'multiStoryType'] },
    { id: 'amenities', label: 'Amenities', fields: [] },
    { id: 'accounting', label: 'Accounting', fields: ['accountLedgerType', 'primaryBankAccount', 'alternativeTaxPin', 'propertyWorkingTaxPin', 'mpesaPropertyPayNumber', 'penaltyChargeMode', 'penaltyDay'] },
    { id: 'preferences', label: 'Preferences', fields: ['exemptAllSms', 'exemptAllEmail', 'lpgExempted', 'excludeInTwoSummaryReport'] },
] as const;

const DRAFT_KEY = 'tu-properties:property-draft';

export interface PropertyFormProps {
    mode: 'create' | 'edit';
    initial?: Property | null;
    landlords: Landlord[];
    branches: Branch[];
    submitLabel?: string;
    onSubmit: (values: PropertyFormValues, amenities: AmenityDraft[]) => Promise<void>;
    onCancel: () => void;
}

export function PropertyForm({
    mode,
    initial,
    landlords,
    branches,
    submitLabel,
    onSubmit,
    onCancel,
}: PropertyFormProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [amenities, setAmenities] = useState<AmenityDraft[]>(
        () => initial?.amenities?.map((a: PropertyAmenity) => ({ name: a.name, category: a.category ?? undefined })) ?? [],
    );
    const [amenityName, setAmenityName] = useState('');
    const [amenityCategory, setAmenityCategory] = useState('');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [draftRestored, setDraftRestored] = useState(false);

    const defaults = useMemo((): Partial<PropertyFormValues> => {
        const base: Partial<PropertyFormValues> = {
            status: 'ACTIVE',
            type: '',
            category: '',
            landlordId: '',
            branchId: '',
            dateAcquired: '',
            lrNumber: '',
            country: '',
            estateArea: '',
            areaRegion: '',
            roadStreet: '',
            specification: '',
            notes: '',
            specificContactInfo: '',
            multiStoryType: '',
            accountLedgerType: '',
            primaryBankAccount: '',
            alternativeTaxPin: '',
            propertyWorkingTaxPin: '',
            invoicePaymentInfo: '',
            holderPaymentTerms: '',
            mpesaPropertyPayNumber: '',
            penaltyChargeMode: '',
            landlordDrawerBank: '',
            landlordBankBranch: '',
            landlordAccountName: '',
            landlordAccountNumber: '',
            disableMpesaStkPush: false,
            disableMpesaStkNarration: false,
            lpgExempted: false,
            exemptAllSms: false,
            exemptInvoiceSms: false,
            exemptGeneralSms: false,
            exemptHagueSms: false,
            exemptBalanceSms: false,
            exemptAllEmail: false,
            exemptInvoiceEmail: false,
            exemptGeneralEmail: false,
            exemptReceiptEmail: false,
            exemptBalanceEmail: false,
            excludeInTwoSummaryReport: false,
        };

        if (!initial) return base;

        return {
            ...base,
            code: initial.code,
            name: initial.name,
            status: initial.status ?? 'ACTIVE',
            type: initial.type ?? '',
            category: initial.category ?? '',
            landlordId: initial.landlordId ?? '',
            branchId: initial.branchId ?? '',
            dateAcquired: initial.dateAcquired ? initial.dateAcquired.slice(0, 10) : '',
            lrNumber: initial.lrNumber ?? '',
            country: initial.country ?? '',
            estateArea: initial.estateArea ?? '',
            areaRegion: initial.areaRegion ?? '',
            roadStreet: initial.roadStreet ?? '',
            specification: initial.specification ?? '',
            notes: initial.notes ?? '',
            specificContactInfo: initial.specificContactInfo ?? '',
            multiStoryType: initial.multiStoryType ?? '',
            numberOfFloors: initial.numberOfFloors,
            latitude: initial.latitude != null ? Number(initial.latitude) : undefined,
            longitude: initial.longitude != null ? Number(initial.longitude) : undefined,
            accountLedgerType: initial.accountLedgerType ?? '',
            primaryBankAccount: initial.primaryBankAccount ?? '',
            alternativeTaxPin: initial.alternativeTaxPin ?? '',
            propertyWorkingTaxPin: initial.propertyWorkingTaxPin ?? '',
            invoicePaymentInfo: initial.invoicePaymentInfo ?? '',
            holderPaymentTerms: initial.holderPaymentTerms ?? '',
            mpesaPropertyPayNumber: initial.mpesaPropertyPayNumber ?? '',
            disableMpesaStkPush: initial.disableMpesaStkPush ?? false,
            disableMpesaStkNarration: initial.disableMpesaStkNarration ?? false,
            lpgExempted: initial.lpgExempted ?? false,
            penaltyChargeMode: initial.penaltyChargeMode ?? '',
            penaltyDay: initial.penaltyDay,
            landlordDrawerBank: initial.landlordDrawerBank ?? '',
            landlordBankBranch: initial.landlordBankBranch ?? '',
            landlordAccountName: initial.landlordAccountName ?? '',
            landlordAccountNumber: initial.landlordAccountNumber ?? '',
            exemptAllSms: initial.exemptAllSms ?? false,
            exemptInvoiceSms: initial.exemptInvoiceSms ?? false,
            exemptGeneralSms: initial.exemptGeneralSms ?? false,
            exemptHagueSms: initial.exemptHagueSms ?? false,
            exemptBalanceSms: initial.exemptBalanceSms ?? false,
            exemptAllEmail: initial.exemptAllEmail ?? false,
            exemptInvoiceEmail: initial.exemptInvoiceEmail ?? false,
            exemptGeneralEmail: initial.exemptGeneralEmail ?? false,
            exemptReceiptEmail: initial.exemptReceiptEmail ?? false,
            exemptBalanceEmail: initial.exemptBalanceEmail ?? false,
            excludeInTwoSummaryReport: initial.excludeInTwoSummaryReport ?? false,
        };
    }, [initial]);

    const {
        register,
        handleSubmit,
        trigger,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<PropertyFormValues>({
        resolver: zodResolver(propertySchema) as never,
        defaultValues: defaults,
        mode: 'onBlur',
    });

    const watched = watch();

    // Restore an abandoned draft (create mode only — an edit form is seeded
    // from the record and must never be overwritten by a stale draft).
    useEffect(() => {
        if (mode !== 'create') return;
        try {
            const stored = window.localStorage.getItem(DRAFT_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored);
            if (parsed?.values) {
                reset({ ...defaults, ...parsed.values });
                if (Array.isArray(parsed.amenities)) {
                    setAmenities(parsed.amenities);
                }
                setDraftRestored(true);
            }
        } catch {
            window.localStorage.removeItem(DRAFT_KEY);
        }
        // Draft restore must run once, before the user edits anything.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Persist the draft as the user types.
    useEffect(() => {
        if (mode !== 'create') return;
        const timer = setTimeout(() => {
            window.localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify({ values: watched, amenities, savedAt: new Date().toISOString() }),
            );
        }, 800);
        return () => clearTimeout(timer);
    }, [watched, amenities, mode]);

    const discardDraft = useCallback(() => {
        window.localStorage.removeItem(DRAFT_KEY);
        reset(defaults);
        setAmenities([]);
        setDraftRestored(false);
    }, [defaults, reset]);

    const goNext = async () => {
        const step = STEPS[stepIndex];
        if (step.fields.length > 0) {
            const valid = await trigger(
                step.fields as unknown as Array<keyof PropertyFormValues>,
                { shouldFocus: true },
            );
            if (!valid) return;
        }
        setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    };

    const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

    const addAmenity = () => {
        const name = amenityName.trim();
        if (!name) return;
        if (amenities.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
            setSubmitError('That amenity is already on the list.');
            return;
        }
        setAmenities((current) => [
            ...current,
            { name, category: amenityCategory.trim() || undefined },
        ]);
        setAmenityName('');
        setAmenityCategory('');
        setSubmitError(null);
    };

    const handleSubmitForm = handleSubmit(async (values) => {
        setSubmitError(null);
        const cleaned = Object.fromEntries(
            Object.entries(values).filter(
                ([, value]) => value !== '' && value !== undefined && !(typeof value === 'number' && Number.isNaN(value)),
            ),
        ) as PropertyFormValues;

        try {
            await onSubmit(cleaned, amenities);
            if (mode === 'create') window.localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : 'Something went wrong. Please try again.',
            );
        }
    });

    const step = STEPS[stepIndex];

    return (
        <form onSubmit={handleSubmitForm} className="space-y-6">
            <div className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
                <ol className="flex flex-wrap items-center gap-2" aria-label="Form steps">
                    {STEPS.map((item, index) => {
                        const isCurrent = index === stepIndex;
                        const isDone = index < stepIndex;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => setStepIndex(index)}
                                    aria-current={isCurrent ? 'step' : undefined}
                                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                        isCurrent
                                            ? 'bg-slate-900 text-white'
                                            : isDone
                                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-[10px]">
                                        {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                                    </span>
                                    {item.label}
                                </button>
                            </li>
                        );
                    })}
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

            {step.id === 'basics' && (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="Property code" id="code" error={errors.code?.message} required>
                        <Input id="code" placeholder="e.g. PROP-001" {...register('code')} disabled={isSubmitting} />
                    </Field>
                    <Field label="Property name" id="name" error={errors.name?.message} required>
                        <Input id="name" placeholder="e.g. Sunset Apartments" {...register('name')} disabled={isSubmitting} />
                    </Field>
                    <Field label="Status" id="status">
                        <Select id="status" {...register('status')} disabled={isSubmitting}>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="ARCHIVED">Archived</option>
                        </Select>
                    </Field>
                    <Field label="Category" id="category">
                        <Select id="category" {...register('category')} disabled={isSubmitting}>
                            <option value="">Select category</option>
                            {PROPERTY_CATEGORIES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Type" id="type">
                        <Select id="type" {...register('type')} disabled={isSubmitting}>
                            <option value="">Select type</option>
                            {PROPERTY_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Landlord" id="landlordId">
                        <Select id="landlordId" {...register('landlordId')} disabled={isSubmitting}>
                            <option value="">No landlord</option>
                            {landlords.map((landlord) => (
                                <option key={landlord.id} value={landlord.id}>
                                    {landlord.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Branch" id="branchId">
                        <Select id="branchId" {...register('branchId')} disabled={isSubmitting}>
                            <option value="">No branch</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Date acquired" id="dateAcquired">
                        <Input id="dateAcquired" type="date" {...register('dateAcquired')} disabled={isSubmitting} />
                    </Field>
                    <Field label="LR number" id="lrNumber">
                        <Input id="lrNumber" placeholder="e.g. LR/12345/678" {...register('lrNumber')} disabled={isSubmitting} />
                    </Field>
                </section>
            )}

            {step.id === 'location' && (
                <section className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Field label="Country" id="country">
                            <Select id="country" {...register('country')} disabled={isSubmitting}>
                                <option value="">Select country</option>
                                {COUNTRIES.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Estate / area" id="estateArea">
                            <Input id="estateArea" placeholder="e.g. Westlands" {...register('estateArea')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Area / region" id="areaRegion">
                            <Input id="areaRegion" placeholder="e.g. Nairobi" {...register('areaRegion')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Road / street" id="roadStreet">
                            <Input id="roadStreet" placeholder="e.g. Waiyaki Way" {...register('roadStreet')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Specification" id="specification">
                            <Select id="specification" {...register('specification')} disabled={isSubmitting}>
                                <option value="">Select specification</option>
                                {SPECIFICATIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Number of floors" id="numberOfFloors" error={errors.numberOfFloors?.message}>
                            <Input
                                id="numberOfFloors"
                                type="number"
                                min={0}
                                {...register('numberOfFloors', { valueAsNumber: true })}
                                disabled={isSubmitting}
                            />
                        </Field>
                        <Field label="Multi-story type" id="multiStoryType">
                            <Select id="multiStoryType" {...register('multiStoryType')} disabled={isSubmitting}>
                                <option value="">Select type</option>
                                {MULTI_STORY_TYPES.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Latitude" id="latitude" error={errors.latitude?.message}>
                            <Input
                                id="latitude"
                                placeholder="e.g. -1.286389"
                                {...register('latitude', { valueAsNumber: true })}
                                disabled={isSubmitting}
                            />
                        </Field>
                        <Field label="Longitude" id="longitude" error={errors.longitude?.message}>
                            <Input
                                id="longitude"
                                placeholder="e.g. 36.817223"
                                {...register('longitude', { valueAsNumber: true })}
                                disabled={isSubmitting}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Notes" id="notes">
                            <Textarea id="notes" className="min-h-[100px]" {...register('notes')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Specific contact information" id="specificContactInfo">
                            <Textarea
                                id="specificContactInfo"
                                className="min-h-[100px]"
                                {...register('specificContactInfo')}
                                disabled={isSubmitting}
                            />
                        </Field>
                    </div>
                </section>
            )}

            {step.id === 'amenities' && (
                <section className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Amenities are stored as structured rows so they can be filtered and reported on — not as free text.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[200px] flex-1">
                            <label htmlFor="amenity-name" className="mb-1 block text-sm font-medium">
                                Amenity
                            </label>
                            <Input
                                id="amenity-name"
                                value={amenityName}
                                placeholder="e.g. Lift"
                                onChange={(event) => setAmenityName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addAmenity();
                                    }
                                }}
                            />
                        </div>
                        <div className="min-w-[160px] flex-1">
                            <label htmlFor="amenity-category" className="mb-1 block text-sm font-medium">
                                Category (optional)
                            </label>
                            <Input
                                id="amenity-category"
                                value={amenityCategory}
                                placeholder="e.g. Security"
                                onChange={(event) => setAmenityCategory(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addAmenity();
                                    }
                                }}
                            />
                        </div>
                        <Button type="button" variant="outline" onClick={addAmenity} disabled={!amenityName.trim()}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add
                        </Button>
                    </div>
                    {amenities.length > 0 ? (
                        <ul className="divide-y rounded-md border">
                            {amenities.map((amenity, index) => (
                                <li key={`${amenity.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="font-medium">{amenity.name}</span>
                                    <span className="flex items-center gap-3">
                                        {amenity.category && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                                {amenity.category}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            aria-label={`Remove ${amenity.name}`}
                                            onClick={() => setAmenities((current) => current.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                No amenities recorded yet.
                            </p>
                    )}
                </section>
            )}

            {step.id === 'accounting' && (
                <section className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Field label="Account ledger type" id="accountLedgerType">
                            <Select id="accountLedgerType" {...register('accountLedgerType')} disabled={isSubmitting}>
                                <option value="">Select</option>
                                {ACCOUNT_LEDGER_TYPES.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Primary bank account" id="primaryBankAccount">
                            <Input id="primaryBankAccount" {...register('primaryBankAccount')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Alternative tax PIN" id="alternativeTaxPin">
                            <Input id="alternativeTaxPin" {...register('alternativeTaxPin')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Property working tax PIN" id="propertyWorkingTaxPin">
                            <Input id="propertyWorkingTaxPin" {...register('propertyWorkingTaxPin')} disabled={isSubmitting} />
                        </Field>
                        <Field label="M-Pesa paybill" id="mpesaPropertyPayNumber">
                            <Input id="mpesaPropertyPayNumber" {...register('mpesaPropertyPayNumber')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Penalty charge mode" id="penaltyChargeMode">
                            <Select id="penaltyChargeMode" {...register('penaltyChargeMode')} disabled={isSubmitting}>
                                <option value="">Select mode</option>
                                {PENALTY_CHARGE_MODES.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Penalty day" id="penaltyDay" error={errors.penaltyDay?.message}>
                            <Input id="penaltyDay" type="number" min={0} {...register('penaltyDay', { valueAsNumber: true })} disabled={isSubmitting} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Invoice payment info" id="invoicePaymentInfo">
                            <Textarea id="invoicePaymentInfo" className="min-h-[90px]" {...register('invoicePaymentInfo')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Holder payment terms" id="holderPaymentTerms">
                            <Textarea id="holderPaymentTerms" className="min-h-[90px]" {...register('holderPaymentTerms')} disabled={isSubmitting} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Field label="Landlord bank" id="landlordDrawerBank">
                            <Input id="landlordDrawerBank" {...register('landlordDrawerBank')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Bank branch" id="landlordBankBranch">
                            <Input id="landlordBankBranch" {...register('landlordBankBranch')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Account name" id="landlordAccountName">
                            <Input id="landlordAccountName" {...register('landlordAccountName')} disabled={isSubmitting} />
                        </Field>
                        <Field label="Account number" id="landlordAccountNumber">
                            <Input id="landlordAccountNumber" {...register('landlordAccountNumber')} disabled={isSubmitting} />
                        </Field>
                    </div>
                </section>
            )}

            {step.id === 'preferences' && (
                <section className="space-y-6">
                    <fieldset className="space-y-3">
                        <legend className="text-sm font-semibold">Mobile money &amp; penalties</legend>
                        <Toggle id="disableMpesaStkPush" label="Disable M-Pesa STK push" {...register('disableMpesaStkPush')} disabled={isSubmitting} />
                        <Toggle id="disableMpesaStkNarration" label="Disable M-Pesa STK narration" {...register('disableMpesaStkNarration')} disabled={isSubmitting} />
                        <Toggle id="lpgExempted" label="LPG exempted" {...register('lpgExempted')} disabled={isSubmitting} />
                        <Toggle id="excludeInTwoSummaryReport" label="Exclude from two-summary report" {...register('excludeInTwoSummaryReport')} disabled={isSubmitting} />
                    </fieldset>
                    <fieldset className="space-y-3">
                        <legend className="text-sm font-semibold">SMS exemptions</legend>
                        <Toggle id="exemptAllSms" label="Exempt all SMS" {...register('exemptAllSms')} disabled={isSubmitting} />
                        <Toggle id="exemptInvoiceSms" label="Exempt invoice SMS" {...register('exemptInvoiceSms')} disabled={isSubmitting} />
                        <Toggle id="exemptGeneralSms" label="Exempt general SMS" {...register('exemptGeneralSms')} disabled={isSubmitting} />
                        <Toggle id="exemptHagueSms" label="Exempt legal notice SMS" {...register('exemptHagueSms')} disabled={isSubmitting} />
                        <Toggle id="exemptBalanceSms" label="Exempt balance SMS" {...register('exemptBalanceSms')} disabled={isSubmitting} />
                    </fieldset>
                    <fieldset className="space-y-3">
                        <legend className="text-sm font-semibold">Email exemptions</legend>
                        <Toggle id="exemptAllEmail" label="Exempt all email" {...register('exemptAllEmail')} disabled={isSubmitting} />
                        <Toggle id="exemptInvoiceEmail" label="Exempt invoice email" {...register('exemptInvoiceEmail')} disabled={isSubmitting} />
                        <Toggle id="exemptGeneralEmail" label="Exempt general email" {...register('exemptGeneralEmail')} disabled={isSubmitting} />
                        <Toggle id="exemptReceiptEmail" label="Exempt receipt email" {...register('exemptReceiptEmail')} disabled={isSubmitting} />
                        <Toggle id="exemptBalanceEmail" label="Exempt balance email" {...register('exemptBalanceEmail')} disabled={isSubmitting} />
                    </fieldset>
                </section>
            )}

            {submitError && <ErrorState message={submitError} />}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0 || isSubmitting}>
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
                            {isSubmitting ? 'Saving…' : submitLabel ?? (mode === 'create' ? 'Create property' : 'Save changes')}
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

function Toggle({
    id,
    label,
    ...props
}: { id: string; label: string } & React.ComponentProps<typeof Checkbox>) {
    return (
        <div className="flex items-center gap-2">
            <Checkbox id={id} {...props} />
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
        </div>
    );
}

/** Header used by both the create and edit routes. */
export function PropertyFormHeader({
    mode,
    property,
    onBack,
}: {
    mode: 'create' | 'edit';
    property?: Property | null;
    onBack: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <Building2 className="h-5 w-5" aria-hidden="true" />
                        {mode === 'create' ? 'Add property' : `Edit ${property?.name ?? 'property'}`}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {mode === 'create'
                            ? 'Work through each section — required fields are checked before you move on.'
                            : 'Changes save straight to the property record.'}
                    </p>
                </div>
            </div>
            {mode === 'create' && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Draft saved automatically in this browser
                </p>
            )}
        </div>
    );
}