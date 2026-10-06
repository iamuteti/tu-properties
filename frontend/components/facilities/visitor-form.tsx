'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { visitorsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/entity-states';

/**
 * Add or edit a visitor.
 *
 * The interesting omission is the **barred flag**. It is not on this form because a
 * `PATCH { isBlacklisted: true }` is a decision with a legal flavour, it needs a
 * reason, and it should be one audited action rather than a checkbox that a save can
 * flip as an afterthought. Barring lives on the visitor's own page.
 *
 * State holds `string` for every optional field and sends `undefined` for a blank
 * one: the DTO runs `@CleanOptional()`, which reads `""` as &ldquo;not provided&rdquo;
 * and `null` as a validation failure.
 *
 * `idType` is a free-text field rather than a dropdown on purpose. "National ID",
 * "NIN", "SIN", "passport" and "CPF" are five names for the same check, and an enum
 * would mean a migration every time the company hires a guard in a new country.
 */
interface VisitorFormState {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    company: string;
    idType: string;
    idNumber: string;
    notes: string;
}

const EMPTY: VisitorFormState = {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    company: '',
    idType: '',
    idNumber: '',
    notes: '',
};

interface FormErrors {
    [key: string]: string;
}

export function VisitorForm({ itemId }: { itemId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(itemId);

    const [form, setForm] = useState<VisitorFormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        if (!itemId) return;
        let cancelled = false;

        visitorsApi
            .visitor(itemId)
            .then(({ data }) => {
                if (cancelled) return;
                setForm({
                    firstName: data.firstName,
                    lastName: data.lastName,
                    phone: data.phone ?? '',
                    email: data.email ?? '',
                    company: data.company ?? '',
                    idType: data.idType ?? '',
                    idNumber: data.idNumber ?? '',
                    notes: data.notes ?? '',
                });
            })
            .catch((err) => {
                if (!cancelled) {
                    setErrors({
                        form:
                            (err as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ?? 'Could not load the visitor.',
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [itemId]);

    const set = (key: keyof VisitorFormState, value: string) =>
        setForm((previous) => ({ ...previous, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        const next: FormErrors = {};
        if (form.firstName.trim().length === 0) {
            next.firstName = 'A gate reads a name, not a blank.';
        }
        if (form.lastName.trim().length === 0) {
            next.lastName = 'A gate reads a name, not a blank.';
        }
        if (form.email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
            next.email = 'That does not look like an email address.';
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setIsSaving(true);
        try {
            const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());
            const payload = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                phone: optional(form.phone),
                email: optional(form.email),
                company: optional(form.company),
                idType: optional(form.idType),
                idNumber: optional(form.idNumber),
                notes: optional(form.notes),
            };

            if (isEdit) {
                await visitorsApi.updateVisitor(itemId!, payload);
                toast.success(`${payload.firstName} ${payload.lastName} updated.`);
                router.push(`/facilities/visitors/${itemId}`);
            } else {
                const { data } = await visitorsApi.createVisitor(payload);
                toast.success(`${data.displayName} added to the directory.`);
                router.push(`/facilities/visitors/${data.id}`);
            }
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Could not save the visitor.';
            setErrors({ form: message });
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the visitor…" />;

    return (
        <form onSubmit={submit} className="space-y-6">
            {errors.form && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errors.form}
                </p>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Who they are</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="visitor-first">
                                First name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="visitor-first"
                                value={form.firstName}
                                onChange={(event) => set('firstName', event.target.value)}
                            />
                            {errors.firstName && (
                                <p className="text-xs text-destructive">{errors.firstName}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="visitor-last">
                                Last name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="visitor-last"
                                value={form.lastName}
                                onChange={(event) => set('lastName', event.target.value)}
                            />
                            {errors.lastName && (
                                <p className="text-xs text-destructive">{errors.lastName}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="visitor-company">Company</Label>
                            <Input
                                id="visitor-company"
                                value={form.company}
                                placeholder="Brightpath Fit-Outs"
                                onChange={(event) => set('company', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="visitor-phone">Phone</Label>
                            <Input
                                id="visitor-phone"
                                value={form.phone}
                                placeholder="+254…"
                                onChange={(event) => set('phone', event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="visitor-email">Email</Label>
                        <Input
                            id="visitor-email"
                            value={form.email}
                            onChange={(event) => set('email', event.target.value)}
                        />
                        {errors.email && (
                            <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>What the gate checks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="visitor-idtype">Identification type</Label>
                            <Input
                                id="visitor-idtype"
                                value={form.idType}
                                placeholder="National ID"
                                onChange={(event) => set('idType', event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Free text on purpose. &ldquo;National ID&rdquo;, &ldquo;NIN&rdquo;,
                                &ldquo;SIN&rdquo;, &ldquo;passport&rdquo; and &ldquo;CPF&rdquo; are
                                five names for one check, and a dropdown would mean a change
                                every time the company hires a guard in a new country.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="visitor-idnumber">Identification number</Label>
                            <Input
                                id="visitor-idnumber"
                                value={form.idNumber}
                                onChange={(event) => set('idNumber', event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="visitor-notes">Notes</Label>
                        <Textarea
                            id="visitor-notes"
                            value={form.notes}
                            placeholder="Always comes for the lift service. Prefers the morning."
                            onChange={(event) => set('notes', event.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to the directory'}
                </Button>
            </div>
        </form>
    );
}
