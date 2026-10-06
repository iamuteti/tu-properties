'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { accessCardsApi, propertiesApi, tenantsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ACCESS_CARD_TYPES } from '@/lib/constants';
import type { Property, Tenant } from '@/types';

/**
 * Issue a card.
 *
 * The form's shape follows the backend's rule rather than fighting it: **a card has
 * to open something, and which thing depends on its type.** A unit card with no unit
 * reads as valid in a list and fails at the gate, so the target picker changes with
 * the type instead of offering every option for every kind. A unit card also implies
 * its building, so the property is filled in server-side and does not need asking for
 * twice.
 *
 * Blanks go out as `undefined` — the DTO's `@CleanOptional()` reads `""` as "not
 * provided" and `null` as a validation failure.
 */
export default function NewAccessCardPage() {
    const router = useRouter();

    const [type, setType] = useState('BUILDING');
    const [cardNumber, setCardNumber] = useState('');
    const [propertyId, setPropertyId] = useState('');
    const [tenantId, setTenantId] = useState('');
    const [holderName, setHolderName] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [notes, setNotes] = useState('');

    const [properties, setProperties] = useState<Property[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        let cancelled = false;
        propertiesApi
            .findAll({ limit: 500 })
            .then(({ data }) => {
                if (!cancelled) setProperties(data?.data ?? data ?? []);
            })
            .catch(() => {
                if (!cancelled) setProperties([]);
            });
        tenantsApi
            .findAll({ limit: 500 })
            .then(({ data }) => {
                if (!cancelled) setTenants(data?.data ?? data ?? []);
            })
            .catch(() => {
                if (!cancelled) setTenants([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        const next: { [key: string]: string } = {};
        // Which target is required is a function of the type — the same rule the
        // backend enforces, mirrored here so the button is disabled rather than
        // sending a request that is certain to fail.
        if (type !== 'FACILITY' && !propertyId) {
            next.propertyId = 'Pick the property this card opens.';
        }
        if (type === 'UNIT' && !tenantId) {
            next.tenantId =
                'A unit card needs a resident on it, so the card can be found by searching for them.';
        }
        if (!holderName.trim() && !tenantId) {
            next.holderName =
                'Give the holder a name — it is what a guard reads off the card. Leaving it blank only works for a spare kept at the gate.';
        }
        if (expiresAt && new Date(expiresAt) <= new Date()) {
            next.expiresAt = 'A card cannot be issued with an expiry already in the past.';
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setIsSaving(true);
        try {
            const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());
            const { data } = await accessCardsApi.createAccessCard({
                type,
                cardNumber: optional(cardNumber),
                ...(propertyId ? { propertyId } : {}),
                ...(tenantId ? { tenantId } : {}),
                holderName: optional(holderName),
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                notes: optional(notes),
            });
            toast.success(`${data.cardNumber} issued to ${data.holderName}.`);
            router.push(`/facilities/access-cards/${data.id}`);
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                'Could not issue the card.';
            setErrors({ form: message });
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Issue an access card</h1>
                <p className="text-muted-foreground">
                    The number is allocated for you unless you type one. Cards are tracked
                    as data only &mdash; there is no reader integration yet, so this
                    records who holds what and when it stops being valid.
                </p>
            </div>

            {errors.form && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errors.form}
                </p>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>What it opens</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-card-type">Type</Label>
                        <Select
                            name="new-card-type"
                            value={type}
                            onChange={(event) => setType(event.target.value)}
                            options={ACCESS_CARD_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            The type decides what else is required. A card with nothing
                            attached to it reads as valid in a list and fails at the gate,
                            so the backend refuses it and this form will not send it.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-card-property">
                            Property {type !== 'FACILITY' && <span className="text-destructive">*</span>}
                        </Label>
                        <Select
                            name="new-card-property"
                            value={propertyId}
                            onChange={(event) => setPropertyId(event.target.value)}
                            options={[
                                { value: '', label: 'Choose a property…' },
                                ...properties.map((property) => ({
                                    value: property.id,
                                    label: `${property.code} — ${property.name}`,
                                })),
                            ]}
                        />
                        {errors.propertyId && (
                            <p className="text-xs text-destructive">{errors.propertyId}</p>
                        )}
                    </div>

                    {type === 'UNIT' && (
                        <div className="space-y-2">
                            <Label htmlFor="new-card-tenant">
                                Resident <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                name="new-card-tenant"
                                value={tenantId}
                                onChange={(event) => setTenantId(event.target.value)}
                                options={[
                                    { value: '', label: 'Choose a resident…' },
                                    ...tenants.map((tenant) => ({
                                        value: tenant.id,
                                        label: `${tenant.code} — ${[tenant.otherNames, tenant.surname]
                                            .filter(Boolean)
                                            .join(' ')}`,
                                    })),
                                ]}
                            />
                            <p className="text-xs text-muted-foreground">
                                The resident’s unit is picked up from their tenancy and their
                                name is filled in automatically — one fewer field for a user
                                to get wrong at a gate.
                            </p>
                            {errors.tenantId && (
                                <p className="text-xs text-destructive">{errors.tenantId}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Who holds it</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-card-number">
                            Card number{' '}
                            <span className="font-normal text-muted-foreground">
                                (optional)
                            </span>
                        </Label>
                        <Input
                            id="new-card-number"
                            value={cardNumber}
                            placeholder="Allocated for you"
                            onChange={(event) => setCardNumber(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Unique within the organization, not globally: card numbers come
                            off one printer per estate, so two estates legitimately both
                            start at 0001.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-card-holder">
                            Name on the card{' '}
                            {!tenantId && <span className="text-destructive">*</span>}
                        </Label>
                        <Input
                            id="new-card-holder"
                            value={holderName}
                            disabled={Boolean(tenantId)}
                            placeholder="Left blank, this is a spare kept at the gate"
                            onChange={(event) => setHolderName(event.target.value)}
                        />
                        {errors.holderName && (
                            <p className="text-xs text-destructive">{errors.holderName}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-card-expiry">
                            Expires{' '}
                            <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="new-card-expiry"
                            type="date"
                            value={expiresAt}
                            onChange={(event) => setExpiresAt(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            A date rather than a time of day, because the card stops working
                            when the date passes whether or not anybody is at a reader to
                            notice. Leaving it blank means it never expires.
                        </p>
                        {errors.expiresAt && (
                            <p className="text-xs text-destructive">{errors.expiresAt}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-card-notes">Notes</Label>
                        <Input
                            id="new-card-notes"
                            value={notes}
                            placeholder="Contractor access, week one only."
                            onChange={(event) => setNotes(event.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                    <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Issuing…' : 'Issue the card'}
                </Button>
            </div>
        </form>
    );
}
