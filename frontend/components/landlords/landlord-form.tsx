'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Landmark, Save } from 'lucide-react';
import { toast } from 'sonner';
import { landlordsApi } from '@/lib/api';
import { MANAGEMENT_FEE_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/entity-states';
import type { Landlord } from '@/types';

interface FormState {
    code: string;
    name: string;
    status: string;
    email: string;
    phone: string;
    alternativePhone: string;
    address: string;
    city: string;
    country: string;
    postalCode: string;
    bankName: string;
    bankBranch: string;
    accountName: string;
    accountNumber: string;
    taxPin: string;
    vatRegistered: boolean;
    managementFeeType: string;
    managementFeeRate: string;
    managementFeeAmount: string;
    notes: string;
}

const EMPTY: FormState = {
    code: '',
    name: '',
    status: 'ACTIVE',
    email: '',
    phone: '',
    alternativePhone: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    bankName: '',
    bankBranch: '',
    accountName: '',
    accountNumber: '',
    taxPin: '',
    vatRegistered: false,
    managementFeeType: 'PERCENTAGE',
    managementFeeRate: '',
    managementFeeAmount: '',
    notes: '',
};

function toForm(landlord: Landlord): FormState {
    return {
        code: landlord.code ?? '',
        name: landlord.name ?? '',
        status: landlord.status ?? 'ACTIVE',
        email: landlord.email ?? '',
        phone: landlord.phone ?? '',
        alternativePhone: landlord.alternativePhone ?? '',
        address: landlord.address ?? '',
        city: landlord.city ?? '',
        country: landlord.country ?? '',
        postalCode: landlord.postalCode ?? '',
        bankName: landlord.bankName ?? '',
        bankBranch: landlord.bankBranch ?? '',
        accountName: landlord.accountName ?? '',
        accountNumber: landlord.accountNumber ?? '',
        taxPin: landlord.taxPin ?? '',
        vatRegistered: landlord.vatRegistered ?? false,
        managementFeeType: landlord.managementFeeType ?? 'PERCENTAGE',
        managementFeeRate:
            landlord.managementFeeRate !== undefined
                ? String(landlord.managementFeeRate)
                : '',
        managementFeeAmount:
            landlord.managementFeeAmount !== undefined
                ? String(landlord.managementFeeAmount)
                : '',
        notes: landlord.notes ?? '',
    };
}

/**
 * Landlord profile form (Module 6), shared by create and edit.
 *
 * The management-agreement block is the part that matters for money: the fee
 * here is what every future owner statement deducts, so it sits with a note
 * saying so rather than buried as another tax field.
 */
export function LandlordForm({ landlordId }: { landlordId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(landlordId);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!landlordId) return;
        let cancelled = false;

        landlordsApi
            .findOne(landlordId)
            .then((response) => {
                if (cancelled) return;
                setForm(toForm(response.data));
            })
            .catch(() => {
                if (!cancelled) toast.error('Could not load this landlord');
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [landlordId]);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((previous) => ({ ...previous, [key]: value }));

    const validate = (): boolean => {
        const next: Record<string, string> = {};
        if (!form.name.trim()) next.name = 'A landlord needs a name';
        if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
            next.email = 'Enter a valid email address';
        }
        if (form.managementFeeType === 'PERCENTAGE') {
            const rate = Number(form.managementFeeRate);
            if (form.managementFeeRate && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
                next.managementFeeRate = 'Enter a percentage between 0 and 100';
            }
        } else {
            const amount = Number(form.managementFeeAmount);
            if (
                form.managementFeeAmount &&
                (Number.isNaN(amount) || amount < 0)
            ) {
                next.managementFeeAmount = 'Enter a fee amount';
            }
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!validate()) return;

        const payload = {
            name: form.name.trim(),
            status: form.status,
            email: form.email.trim(),
            phone: form.phone.trim(),
            alternativePhone: form.alternativePhone.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            country: form.country.trim(),
            postalCode: form.postalCode.trim(),
            bankName: form.bankName.trim(),
            bankBranch: form.bankBranch.trim(),
            accountName: form.accountName.trim(),
            accountNumber: form.accountNumber.trim(),
            taxPin: form.taxPin.trim(),
            vatRegistered: form.vatRegistered,
            managementFeeType: form.managementFeeType as Landlord['managementFeeType'],
            managementFeeRate: form.managementFeeRate === '' ? 0 : Number(form.managementFeeRate),
            managementFeeAmount:
                form.managementFeeAmount === '' ? 0 : Number(form.managementFeeAmount),
            notes: form.notes.trim(),
        };

        setIsSaving(true);
        try {
            if (isEdit && landlordId) {
                await landlordsApi.update(landlordId, payload);
                toast.success('Landlord updated');
                router.push(`/landlords/${landlordId}`);
            } else {
                const response = await landlordsApi.create(payload);
                toast.success('Landlord created');
                router.push(`/landlords/${response.data.id}`);
            }
        } catch (error) {
            const message =
                (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message;
            toast.error(
                Array.isArray(message)
                    ? message.join('. ')
                    : message || 'Could not save the landlord',
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading landlord…" />;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Landmark className="h-4 w-4" aria-hidden="true" />
                        Owner details
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            value={form.name}
                            onChange={(event) => set('name', event.target.value)}
                            placeholder="e.g. Miriam Odinga"
                            aria-invalid={Boolean(errors.name)}
                        />
                        {errors.name && (
                            <p className="text-xs text-destructive">{errors.name}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="code">Code</Label>
                        <Input
                            id="code"
                            value={form.code}
                            onChange={(event) => set('code', event.target.value)}
                            placeholder={isEdit ? form.code : 'Assigned automatically if left blank'}
                        />
                    </div>

<div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                            value={form.status}
                            options={[
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Inactive' },
                            ]}
                            onChange={(event) => set('status', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={form.email}
                            onChange={(event) => set('email', event.target.value)}
                            aria-invalid={Boolean(errors.email)}
                        />
                        {errors.email && (
                            <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                            id="phone"
                            value={form.phone}
                            onChange={(event) => set('phone', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="alternativePhone">Alternative phone</Label>
                        <Input
                            id="alternativePhone"
                            value={form.alternativePhone}
                            onChange={(event) => set('alternativePhone', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address">Address</Label>
                        <Input
                            id="address"
                            value={form.address}
                            onChange={(event) => set('address', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                            id="city"
                            value={form.city}
                            onChange={(event) => set('city', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                            id="country"
                            value={form.country}
                            onChange={(event) => set('country', event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="postalCode">Postal code</Label>
                        <Input
                            id="postalCode"
                            value={form.postalCode}
                            onChange={(event) => set('postalCode', event.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Payout details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="bankName">Bank</Label>
                        <Input
                            id="bankName"
                            value={form.bankName}
                            onChange={(event) => set('bankName', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bankBranch">Branch</Label>
                        <Input
                            id="bankBranch"
                            value={form.bankBranch}
                            onChange={(event) => set('bankBranch', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="accountName">Account name</Label>
                        <Input
                            id="accountName"
                            value={form.accountName}
                            onChange={(event) => set('accountName', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="accountNumber">Account number</Label>
                        <Input
                            id="accountNumber"
                            value={form.accountNumber}
                            onChange={(event) => set('accountNumber', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="taxPin">Tax PIN</Label>
                        <Input
                            id="taxPin"
                            value={form.taxPin}
                            onChange={(event) => set('taxPin', event.target.value)}
                        />
                    </div>
                    <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                id="vatRegistered"
                                checked={form.vatRegistered}
                                onCheckedChange={(checked) =>
                                    set('vatRegistered', checked === true)
                                }
                            />
                            VAT registered
                        </label>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                        Management agreement
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This fee is deducted from every owner statement generated for this
                        landlord.
                    </p>
                    <div className="grid gap-4 md:grid-cols-3">
<div className="space-y-2">
                            <Label htmlFor="managementFeeType">Fee basis</Label>
                            <Select
                                value={form.managementFeeType}
                                options={MANAGEMENT_FEE_TYPES}
                                onChange={(event) => set('managementFeeType', event.target.value)}
                            />
                        </div>

                        {form.managementFeeType === 'PERCENTAGE' ? (
                            <div className="space-y-2">
                                <Label htmlFor="managementFeeRate">Rate (%)</Label>
                                <Input
                                    id="managementFeeRate"
                                    inputMode="decimal"
                                    value={form.managementFeeRate}
                                    onChange={(event) =>
                                        set('managementFeeRate', event.target.value)
                                    }
                                    placeholder="e.g. 8.5"
                                    aria-invalid={Boolean(errors.managementFeeRate)}
                                />
                                {errors.managementFeeRate && (
                                    <p className="text-xs text-destructive">
                                        {errors.managementFeeRate}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="managementFeeAmount">Flat fee per period</Label>
                                <Input
                                    id="managementFeeAmount"
                                    inputMode="decimal"
                                    value={form.managementFeeAmount}
                                    onChange={(event) =>
                                        set('managementFeeAmount', event.target.value)
                                    }
                                    placeholder="e.g. 25000"
                                    aria-invalid={Boolean(errors.managementFeeAmount)}
                                />
                                {errors.managementFeeAmount && (
                                    <p className="text-xs text-destructive">
                                        {errors.managementFeeAmount}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                            id="notes"
                            rows={3}
                            value={form.notes}
                            onChange={(event) => set('notes', event.target.value)}
                            placeholder="Anything whoever runs this account should know"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isSaving}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create landlord'}
                </Button>
            </div>
        </form>
    );
}