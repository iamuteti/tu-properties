'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ui/entity-states';
import { CURRENCIES } from '@/lib/constants';
import type { Sale } from '@/types';

/**
 * Shared sale form for create and edit.
 *
 * Single screen rather than a wizard: a sale is opened in one sitting and every
 * field matters at that moment. The stage is not editable here — it moves
 * through the stage actions on the detail page so the server's gates apply.
 */
const saleSchema = z.object({
    propertyTitle: z.string().optional(),
    askingPrice: z.number().min(0).optional().or(z.literal(NaN)),
    agreedPrice: z.number().min(0).optional().or(z.literal(NaN)),
    bookingFee: z.number().min(0).optional().or(z.literal(NaN)),
    depositAmount: z.number().min(0).optional().or(z.literal(NaN)),
    commissionRate: z.number().min(0).max(100).optional().or(z.literal(NaN)),
    currency: z.string().optional(),
    notes: z.string().optional(),
});

export type SaleFormValues = z.infer<typeof saleSchema>;

export function SaleForm({
    mode,
    initial,
    submitLabel,
    onSubmit,
    onCancel,
    propertyId,
    onPropertyChange,
    propertyOptions,
    contactId,
    onContactChange,
    contactOptions,
    agentId,
    onAgentChange,
    agentOptions,
    requireProperty = false,
}: {
    mode: 'create' | 'edit';
    initial?: Sale | null;
    submitLabel?: string;
    onSubmit: (values: SaleFormValues) => Promise<void>;
    onCancel: () => void;
    propertyId?: string;
    onPropertyChange?: (id: string) => void;
    propertyOptions: Array<{ id: string; label: string }>;
    contactId?: string;
    onContactChange?: (id: string) => void;
    contactOptions: Array<{ id: string; label: string }>;
    agentId?: string;
    onAgentChange?: (id: string) => void;
    agentOptions: Array<{ id: string; label: string }>;
    requireProperty?: boolean;
}) {
    const [submitError, setSubmitError] = useState<string | null>(null);

    const defaults = useMemo(
        () => ({
            propertyTitle: initial?.propertyTitle ?? '',
            askingPrice:
                initial?.askingPrice != null ? Number(initial.askingPrice) : undefined,
            agreedPrice:
                initial?.agreedPrice != null ? Number(initial.agreedPrice) : undefined,
            bookingFee:
                initial?.bookingFee != null ? Number(initial.bookingFee) : undefined,
            depositAmount:
                initial?.depositAmount != null
                    ? Number(initial.depositAmount)
                    : undefined,
            commissionRate:
                initial?.commissionRate != null
                    ? Number(initial.commissionRate)
                    : undefined,
            currency: initial?.currency ?? 'KES',
            notes: initial?.notes ?? '',
        }),
        [initial],
    );

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<SaleFormValues>({
        resolver: zodResolver(saleSchema) as never,
        defaultValues: defaults,
    });

    useEffect(() => {
        reset(defaults);
    }, [defaults, reset]);

    const submit = handleSubmit(async (values) => {
        if (requireProperty && !propertyId) {
            setSubmitError('Choose the property being sold.');
            return;
        }
        setSubmitError(null);
        try {
            await onSubmit(values);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Something went wrong.');
        }
    });

    return (
        <form onSubmit={submit} className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field
                    label="Property"
                    id="sale-property"
                    required={requireProperty}
                    error={requireProperty && !propertyId ? 'Required' : undefined}
                >
                    <Select
                        id="sale-property"
                        value={propertyId ?? ''}
                        onChange={(e) => onPropertyChange?.(e.target.value)}
                        disabled={isSubmitting || mode === 'edit'}
                    >
                        <option value="">Select property</option>
                        {propertyOptions.map((property) => (
                            <option key={property.id} value={property.id}>
                                {property.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Title on the sale (optional)" id="sale-title">
                    <Input
                        id="sale-title"
                        placeholder="Defaults to the property name"
                        {...register('propertyTitle')}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Buyer" id="sale-buyer">
                    <Select
                        id="sale-buyer"
                        value={contactId ?? ''}
                        onChange={(e) => onContactChange?.(e.target.value)}
                        disabled={isSubmitting}
                    >
                        <option value="">No buyer yet</option>
                        {contactOptions.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                                {contact.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Agent" id="sale-agent">
                    <Select
                        id="sale-agent"
                        value={agentId ?? ''}
                        onChange={(e) => onAgentChange?.(e.target.value)}
                        disabled={isSubmitting}
                    >
                        <option value="">Unassigned</option>
                        {agentOptions.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                                {agent.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Currency" id="sale-currency">
                    <Select id="sale-currency" {...register('currency')} disabled={isSubmitting}>
                        {CURRENCIES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Commission rate %" id="sale-rate" error={errors.commissionRate?.message}>
                    <Input
                        id="sale-rate"
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        {...register('commissionRate', { valueAsNumber: true })}
                        disabled={isSubmitting}
                    />
                </Field>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Asking price" id="sale-asking" error={errors.askingPrice?.message}>
                    <Input
                        id="sale-asking"
                        type="number"
                        min={0}
                        {...register('askingPrice', { valueAsNumber: true })}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Agreed price" id="sale-agreed" error={errors.agreedPrice?.message}>
                    <Input
                        id="sale-agreed"
                        type="number"
                        min={0}
                        {...register('agreedPrice', { valueAsNumber: true })}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Booking fee" id="sale-booking" error={errors.bookingFee?.message}>
                    <Input
                        id="sale-booking"
                        type="number"
                        min={0}
                        {...register('bookingFee', { valueAsNumber: true })}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Deposit" id="sale-deposit" error={errors.depositAmount?.message}>
                    <Input
                        id="sale-deposit"
                        type="number"
                        min={0}
                        {...register('depositAmount', { valueAsNumber: true })}
                        disabled={isSubmitting}
                    />
                </Field>
            </section>

            <Field label="Notes" id="sale-notes">
                <Textarea
                    id="sale-notes"
                    className="min-h-[110px]"
                    placeholder="Terms discussed, conditions on the offer, legal counsel…"
                    {...register('notes')}
                    disabled={isSubmitting}
                />
            </Field>

            {submitError && <ErrorState message={submitError} />}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    The sale starts at Quotation; the stage moves from the detail page.
                </p>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? 'Saving…'
                            : submitLabel ?? (mode === 'create' ? 'Open sale' : 'Save changes')}
                    </Button>
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