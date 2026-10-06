'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { facilitiesApi, propertiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/entity-states';
import { CURRENCIES, FACILITY_KINDS, FACILITY_SLOT_MINUTES } from '@/lib/constants';
import type { Property } from '@/types';

/**
 * Add or edit a facility.
 *
 * The form's state holds `string | undefined` for every optional field, never
 * `null`. That is not a style preference: the DTOs run `@CleanOptional()`, which
 * turns an empty string into `undefined` and treats a `null` as a validation
 * failure — so a form that sent `null` for a blank box would be refused by the API
 * over the difference of one character the user never typed.
 *
 * **Opening hours are typed as `HH:MM` and converted server-side** to the
 * minutes-from-midnight the database stores. The alternative — asking a person to
 * think in minutes since midnight — is a form nobody fills in correctly, and the
 * stored representation is what makes a 24-hour car park need no overnight special
 * case.
 *
 * The property picker is here rather than on the register page because a facility
 * always belongs to a building: there is no "unassigned" facility, and a create form
 * that defers that question to afterwards is a form that creates orphans.
 */
interface FacilityFormState {
    propertyId: string;
    name: string;
    kind: string;
    description: string;
    capacity: string;
    opensAt: string;
    closesAt: string;
    slotMinutes: string;
    maxAdvanceDays: string;
    requiresApproval: boolean;
    isBookable: boolean;
    bookingFee: string;
    bookingFeeCurrency: string;
    notes: string;
    isActive: boolean;
}

/** `"08:30"` → `"08:30"`. Kept as a string so an untouched field stays empty. */
const minutesToClock = (minutes: number | null | undefined): string => {
    if (minutes == null) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const EMPTY: FacilityFormState = {
    propertyId: '',
    name: '',
    kind: 'MEETING_ROOM',
    description: '',
    capacity: '',
    opensAt: '08:00',
    closesAt: '18:00',
    slotMinutes: '60',
    maxAdvanceDays: '90',
    requiresApproval: false,
    isBookable: true,
    bookingFee: '',
    bookingFeeCurrency: '',
    notes: '',
    isActive: true,
};

interface FormErrors {
    [key: string]: string;
}

export function FacilityForm({ itemId }: { itemId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(itemId);

    const [form, setForm] = useState<FacilityFormState>(EMPTY);
    const [properties, setProperties] = useState<Property[]>([]);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        let cancelled = false;
        propertiesApi
            .findAll({ limit: 500 })
            .then(({ data }) => {
                // The list endpoint is paginated; only the first page is fetched, so
                // a create form on a large estate would hide most of its buildings.
                // Naming that is better than silently offering the first 10.
                if (!cancelled) {
                    setProperties(data?.data ?? data ?? []);
                }
            })
            .catch(() => {
                if (!cancelled) setProperties([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!itemId) return;
        let cancelled = false;

        facilitiesApi
            .facility(itemId)
            .then(({ data }) => {
                if (cancelled) return;
                setForm({
                    propertyId: data.property?.id ?? '',
                    name: data.name,
                    kind: data.kind,
                    description: data.description ?? '',
                    capacity: data.capacity != null ? String(data.capacity) : '',
                    opensAt: data.opensAtLabel || minutesToClock(data.opensAtMinutes),
                    closesAt: data.closesAtLabel || minutesToClock(data.closesAtMinutes),
                    slotMinutes: String(data.slotMinutes),
                    maxAdvanceDays: String(data.maxAdvanceDays),
                    requiresApproval: data.requiresApproval,
                    isBookable: data.isBookable,
                    bookingFee: data.bookingFee != null ? String(data.bookingFee) : '',
                    bookingFeeCurrency: data.bookingFeeCurrency ?? '',
                    notes: '',
                    isActive: data.isActive,
                });
            })
            .catch((err) => {
                if (!cancelled) {
                    setErrors({
                        form:
                            (err as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ?? 'Could not load the facility.',
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

    const set = <K extends keyof FacilityFormState>(
        key: K,
        value: FacilityFormState[K],
    ) => setForm((previous) => ({ ...previous, [key]: value }));

    const validate = (): boolean => {
        const next: FormErrors = {};

        if (form.name.trim().length < 2) {
            next.name = 'Give the facility a name the front desk would recognise.';
        }
        if (!isEdit && !form.propertyId) {
            next.propertyId = 'A facility belongs to a property. Pick the building it is in.';
        }
        if (!form.opensAt || !form.closesAt) {
            next.opensAt = 'Both an opening and a closing time are needed — they are what the diary is drawn from.';
        } else if (form.closesAt <= form.opensAt) {
            next.closesAt =
                'The closing time must be later than the opening time. A 24-hour facility opens at 00:00 and closes at 23:59.';
        }
        if (form.bookingFee.trim() !== '' && Number.isNaN(Number(form.bookingFee))) {
            next.bookingFee = 'The fee is a number, or leave it blank for free.';
        }
        if (form.capacity.trim() !== '' && Number(form.capacity) < 1) {
            next.capacity = 'Capacity is a number of people, or leave it blank.';
        }

        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!validate()) return;

        setIsSaving(true);
        try {
            /** Blanks become `undefined` so `@CleanOptional()` can tell
             * "left empty" from "not sent" — see the note at the top of this file. */
            const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());
            const numeric = (value: string) =>
                value.trim() === '' ? undefined : Number(value);

            const payload = {
                name: form.name.trim(),
                kind: form.kind,
                description: optional(form.description),
                capacity: numeric(form.capacity),
                opensAt: optional(form.opensAt),
                closesAt: optional(form.closesAt),
                slotMinutes: numeric(form.slotMinutes),
                maxAdvanceDays: numeric(form.maxAdvanceDays),
                requiresApproval: form.requiresApproval,
                isBookable: form.isBookable,
                bookingFee: numeric(form.bookingFee),
                bookingFeeCurrency: optional(form.bookingFeeCurrency),
                notes: optional(form.notes),
            };

            if (isEdit) {
                await facilitiesApi.updateFacility(itemId!, payload);
                toast.success(`${form.name} updated.`);
                router.push(`/facilities/${itemId}`);
            } else {
                const { data } = await facilitiesApi.createFacility(payload, form.propertyId);
                toast.success(`${data.name} added to the register.`);
                router.push(`/facilities/${data.id}`);
            }
        } catch (err) {
            setErrors({
                form:
                    (err as { response?: { data?: { message?: string } } })?.response?.data
                        ?.message ?? 'Could not save the facility.',
            });
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not save the facility.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the facility…" />;

    return (
        <form onSubmit={submit} className="space-y-6">
            {errors.form && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errors.form}
                </p>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>What it is</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Property" error={errors.propertyId} required>
                            <Select
                                name="facility-property"
                                value={form.propertyId}
                                disabled={isEdit}
                                onChange={(event) => set('propertyId', event.target.value)}
                                options={[
                                    { value: '', label: 'Choose a property…' },
                                    ...properties.map((property) => ({
                                        value: property.id,
                                        label: `${property.code} — ${property.name}`,
                                    })),
                                ]}
                            />
                            {isEdit && (
                                <p className="text-xs text-muted-foreground">
                                    A facility does not move between buildings. Retire it and
                                    add it to the other property instead — its bookings and
                                    closures belong to the building they were made against.
                                </p>
                            )}
                        </Field>

                        <Field label="Name" error={errors.name} required>
                            <Input
                                value={form.name}
                                placeholder="Residents Clubhouse"
                                onChange={(event) => set('name', event.target.value)}
                            />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Kind" hint="Groups and filters the register. 'Other' is a fine answer.">
                            <Select
                                name="facility-kind"
                                value={form.kind}
                                onChange={(event) => set('kind', event.target.value)}
                                options={FACILITY_KINDS.map((entry) => ({
                                    value: entry.value,
                                    label: entry.label,
                                }))}
                            />
                        </Field>

                        <Field label="Capacity" hint="Advisory. Shown on the booking screen rather than enforced.">
                            <Input
                                value={form.capacity}
                                inputMode="numeric"
                                placeholder="14"
                                onChange={(event) => set('capacity', event.target.value)}
                            />
                            {errors.capacity && (
                                <p className="text-xs text-destructive">{errors.capacity}</p>
                            )}
                        </Field>
                    </div>

                    <Field label="Description" hint="What somebody booking it needs to know before they ask.">
                        <Textarea
                            value={form.description}
                            placeholder="Main hall, kitchen and terrace. The caretaker needs the key by 08:00."
                            onChange={(event) => set('description', event.target.value)}
                        />
                    </Field>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>When it can be booked</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Opens" error={errors.opensAt} required>
                            <Input
                                type="time"
                                value={form.opensAt}
                                onChange={(event) => set('opensAt', event.target.value)}
                            />
                        </Field>

                        <Field label="Closes" error={errors.closesAt} required>
                            <Input
                                type="time"
                                value={form.closesAt}
                                onChange={(event) => set('closesAt', event.target.value)}
                            />
                        </Field>
                    </div>

                    <Field
                        label="Booking grid"
                        hint="The unit the diary is drawn in. A 15-minute facility can be booked at 10:15; a two-hour one cannot."
                    >
                        <Select
                            name="facility-slot"
                            value={form.slotMinutes}
                            onChange={(event) => set('slotMinutes', event.target.value)}
                            options={FACILITY_SLOT_MINUTES.map((entry) => ({
                                value: String(entry.value),
                                label: `${entry.label} — ${entry.hint}`,
                            }))}
                        />
                    </Field>

                    <Field label="Bookable up to" hint="How far ahead. Without it, 'this Sunday at 3am' is a legitimate request.">
                        <Input
                            value={form.maxAdvanceDays}
                            inputMode="numeric"
                            onChange={(event) => set('maxAdvanceDays', event.target.value)}
                        />
                    </Field>

                    <Toggle
                        checked={form.requiresApproval}
                        onChange={(value) => set('requiresApproval', value)}
                        label="Needs approval before the slot is held"
                        hint="A resident's own booking waits for somebody to agree. Staff booking on a resident's behalf is confirmed immediately either way — there is already a person in the loop who could refuse."
                    />

                    <Toggle
                        checked={form.isBookable}
                        onChange={(value) => set('isBookable', value)}
                        label="Bookable"
                        hint="Untick to put it on the register without letting anybody reserve it — a staff store whose access cards need something to point at, for instance."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Charge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Fee per booking"
                            error={errors.bookingFee}
                            hint="Recorded on each booking and reported. Not invoiced yet."
                        >
                            <Input
                                value={form.bookingFee}
                                inputMode="decimal"
                                placeholder="0"
                                onChange={(event) => set('bookingFee', event.target.value)}
                            />
                            {errors.bookingFee && (
                                <p className="text-xs text-destructive">{errors.bookingFee}</p>
                            )}
                        </Field>

                        <Field label="Currency" hint="Leave blank to use the organization's.">
                            <Select
                                name="facility-currency"
                                value={form.bookingFeeCurrency}
                                onChange={(event) => set('bookingFeeCurrency', event.target.value)}
                                options={[
                                    { value: '', label: "The organization's currency" },
                                    ...CURRENCIES.map((entry) => ({
                                        value: entry.value,
                                        label: entry.label,
                                    })),
                                ]}
                            />
                        </Field>
                    </div>

                    <Field label="Notes" hint="Anything the caretaker or the next manager needs.">
                        <Textarea
                            value={form.notes}
                            onChange={(event) => set('notes', event.target.value)}
                        />
                    </Field>
                </CardContent>
            </Card>

            {isEdit && (
                <Toggle
                    checked={form.isActive}
                    onChange={(value) => set('isActive', value)}
                    label="In service"
                    hint="Unticking retires it from the register without touching the bookings and closures it already has."
                />
            )}

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to the register'}
                </Button>
            </div>
        </form>
    );
}

function Field({
    label,
    hint,
    error,
    required,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <Label>
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            {children}
            {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

function Toggle({
    checked,
    onChange,
    label,
    hint,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    hint?: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-3">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
                <span className="text-sm font-medium">{label}</span>
                {hint && (
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                )}
            </span>
        </label>
    );
}
