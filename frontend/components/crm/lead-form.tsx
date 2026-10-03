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
import { LEAD_SOURCES } from '@/lib/constants';
import type { Lead } from '@/types';

/**
 * Shared lead form for capture and edit.
 *
 * Capture is deliberately a single screen: a lead arrives hot (someone just
 * filled in a form or walked in) and must be savable in seconds, so unlike the
 * property/unit forms there is no step wizard here — validation happens on
 * submit and the message from the field is shown inline.
 */
const leadSchema = z
    .object({
        firstName: z.string().trim().min(1, 'First name is required'),
        lastName: z.string().optional(),
        email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
        phone: z.string().trim().optional(),
        source: z
            .enum(['WEBSITE', 'FACEBOOK', 'WHATSAPP', 'WALK_IN', 'REFERRAL', 'OTHER'])
            .optional(),
        sourceDetail: z.string().optional(),
        message: z.string().optional(),
    })
    .refine((values) => Boolean(values.email || values.phone), {
        message: 'Add an email address or a phone number so the lead can be worked',
        path: ['email'],
    });

export type LeadFormValues = z.infer<typeof leadSchema>;

export interface LeadFormProps {
    mode: 'create' | 'edit';
    initial?: Lead | null;
    properties: Array<{ id: string; name: string; code: string }>;
    agents: Array<{ id: string; label: string }>;
    defaultPropertyId?: string;
    submitLabel?: string;
    onSubmit: (values: LeadFormValues & { interestedPropertyId?: string | null; assignedAgentId?: string | null }) => Promise<void>;
    onCancel: () => void;
}

export function LeadForm({
    mode,
    initial,
    properties,
    agents,
    defaultPropertyId,
    submitLabel,
    onSubmit,
    onCancel,
}: LeadFormProps) {
    const [propertyId, setPropertyId] = useState(initial?.interestedPropertyId ?? defaultPropertyId ?? '');
    const [agentId, setAgentId] = useState(initial?.assignedAgentId ?? '');
    const [submitError, setSubmitError] = useState<string | null>(null);

    const defaults = useMemo(
        () => ({
            firstName: initial?.firstName ?? '',
            lastName: initial?.lastName ?? '',
            email: initial?.email ?? '',
            phone: initial?.phone ?? '',
            source: initial?.source ?? 'WALK_IN',
            sourceDetail: initial?.sourceDetail ?? '',
            message: initial?.message ?? '',
        }),
        [initial],
    );

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<LeadFormValues>({
        resolver: zodResolver(leadSchema) as never,
        defaultValues: defaults,
    });

    useEffect(() => {
        reset(defaults);
    }, [defaults, reset]);

    const submit = handleSubmit(async (values) => {
        setSubmitError(null);
        try {
            await onSubmit({
                ...values,
                interestedPropertyId: propertyId || null,
                assignedAgentId: agentId || null,
            });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Something went wrong.');
        }
    });

    return (
        <form onSubmit={submit} className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="First name" id="lead-firstName" error={errors.firstName?.message} required>
                    <Input id="lead-firstName" {...register('firstName')} disabled={isSubmitting} />
                </Field>
                <Field label="Last name" id="lead-lastName">
                    <Input id="lead-lastName" {...register('lastName')} disabled={isSubmitting} />
                </Field>
                <Field label="Email" id="lead-email" error={errors.email?.message}>
                    <Input id="lead-email" type="email" {...register('email')} disabled={isSubmitting} />
                </Field>
                <Field label="Phone" id="lead-phone">
                    <Input id="lead-phone" {...register('phone')} disabled={isSubmitting} />
                </Field>
                <Field label="Source" id="lead-source">
                    <Select id="lead-source" {...register('source')} disabled={isSubmitting}>
                        {LEAD_SOURCES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Source detail" id="lead-sourceDetail">
                    <Input
                        id="lead-sourceDetail"
                        placeholder="e.g. Kileleshi page, referred by Mr Ochieng"
                        {...register('sourceDetail')}
                        disabled={isSubmitting}
                    />
                </Field>
                <Field label="Interested in" id="lead-property">
                    <Select
                        id="lead-property"
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        disabled={isSubmitting}
                    >
                        <option value="">Not specific yet</option>
                        {properties.map((property) => (
                            <option key={property.id} value={property.id}>
                                {property.name} ({property.code})
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Assigned agent" id="lead-agent">
                    <Select
                        id="lead-agent"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        disabled={isSubmitting}
                    >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                                {agent.label}
                            </option>
                        ))}
                    </Select>
                </Field>
            </section>

            <Field label="What are they asking for?" id="lead-message">
                <Textarea
                    id="lead-message"
                    className="min-h-[120px]"
                    placeholder="Bedrooms, budget, move-in date, anything that saves a phone call later."
                    {...register('message')}
                    disabled={isSubmitting}
                />
            </Field>

            {submitError && <ErrorState message={submitError} />}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    The enquiry is logged as the first entry on the lead timeline.
                </p>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? 'Saving…'
                            : submitLabel ?? (mode === 'create' ? 'Add lead' : 'Save changes')}
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