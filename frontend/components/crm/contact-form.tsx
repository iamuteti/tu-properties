'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/ui/entity-states';
import { CONTACT_TYPES } from '@/lib/constants';
import type { Contact, ContactType } from '@/types';

/** Shared contact form for create and edit. */
const contactSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    type: z.enum(['BUYER', 'TENANT', 'LANDLORD', 'INVESTOR', 'AGENT', 'LAWYER']).optional(),
    email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().trim().optional(),
    company: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactForm({
    mode,
    initial,
    submitLabel,
    onSubmit,
    onCancel,
}: {
    mode: 'create' | 'edit';
    initial?: Contact | null;
    submitLabel?: string;
    onSubmit: (values: ContactFormValues) => Promise<void>;
    onCancel: () => void;
}) {
    const [type, setType] = useState<ContactType>(initial?.type ?? 'BUYER');
    const [isActive, setIsActive] = useState(initial?.isActive ?? true);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const defaults = useMemo(
        () => ({
            firstName: initial?.firstName ?? '',
            lastName: initial?.lastName ?? '',
            email: initial?.email ?? '',
            phone: initial?.phone ?? '',
            company: initial?.company ?? '',
            notes: initial?.notes ?? '',
        }),
        [initial],
    );

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<ContactFormValues>({
        resolver: zodResolver(contactSchema) as never,
        defaultValues: defaults,
    });

    useEffect(() => {
        reset(defaults);
    }, [defaults, reset]);

    const submit = handleSubmit(async (values) => {
        setSubmitError(null);
        try {
            await onSubmit({ ...values, type, isActive });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Something went wrong.');
        }
    });

    return (
        <form onSubmit={submit} className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Field label="First name" id="contact-firstName" error={errors.firstName?.message} required>
                    <Input id="contact-firstName" {...register('firstName')} disabled={isSubmitting} />
                </Field>
                <Field label="Last name" id="contact-lastName" error={errors.lastName?.message} required>
                    <Input id="contact-lastName" {...register('lastName')} disabled={isSubmitting} />
                </Field>
                <Field label="Type" id="contact-type">
                    <Select
                        id="contact-type"
                        value={type}
                        onChange={(e) => setType(e.target.value as ContactType)}
                        disabled={isSubmitting}
                    >
                        {CONTACT_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Email" id="contact-email" error={errors.email?.message}>
                    <Input id="contact-email" type="email" {...register('email')} disabled={isSubmitting} />
                </Field>
                <Field label="Phone" id="contact-phone">
                    <Input id="contact-phone" {...register('phone')} disabled={isSubmitting} />
                </Field>
                <Field label="Company" id="contact-company">
                    <Input id="contact-company" {...register('company')} disabled={isSubmitting} />
                </Field>
            </section>

            <Field label="Notes" id="contact-notes">
                <Textarea
                    id="contact-notes"
                    className="min-h-[120px]"
                    placeholder="Preferences, budget, anything worth remembering that is not in the timeline."
                    {...register('notes')}
                    disabled={isSubmitting}
                />
            </Field>

            <div className="flex items-center gap-2">
                <Checkbox
                    id="contact-active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    disabled={isSubmitting}
                />
                <label htmlFor="contact-active" className="text-sm">
                    Active in the directory
                </label>
            </div>

            {submitError && <ErrorState message={submitError} />}

            <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                        ? 'Saving…'
                        : submitLabel ?? (mode === 'create' ? 'Add contact' : 'Save changes')}
                </Button>
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