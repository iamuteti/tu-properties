'use client';

import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { landlordChargesApi } from '@/lib/api';
import { CHARGE_CATEGORIES } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { Landlord, LandlordCharge, ChargeCategory, Property } from '@/types';

const categoryLabel = (value: string) =>
    CHARGE_CATEGORIES.find((option) => option.value === value)?.label ?? value;

/**
 * Charge a cost to a landlord — repairs carried out, utilities advanced,
 * insurance. The amount is deducted from their next owner statement, so the form
 * says so on the amount field rather than leaving it to be discovered later.
 */
export function ChargeFormDialog({
    isOpen,
    onClose,
    landlords,
    properties = [],
    charge,
    defaultLandlordId,
    onSaved,
}: {
    isOpen: boolean;
    onClose: () => void;
    landlords: Landlord[];
    properties?: Property[];
    charge?: LandlordCharge | null;
    defaultLandlordId?: string;
    onSaved?: () => void;
}) {
    const [landlordId, setLandlordId] = useState(charge?.landlordId ?? defaultLandlordId ?? '');
    const [propertyId, setPropertyId] = useState(charge?.propertyId ?? '');
    const [category, setCategory] = useState(charge?.category ?? 'REPAIR');
    const [description, setDescription] = useState(charge?.description ?? '');
    const [amount, setAmount] = useState(charge ? String(charge.amount) : '');
    const [chargeDate, setChargeDate] = useState(
        charge?.chargeDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    );
    const [notes, setNotes] = useState(charge?.notes ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const landlordProperties = properties.filter(
        (property) => !landlordId || property.landlordId === landlordId,
    );

    const submit = async () => {
        const value = Number(amount);
        if (!description.trim()) {
            setError('Describe what was charged for');
            return;
        }
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount greater than zero');
            return;
        }

        setError(null);
        setIsSaving(true);
        try {
            const payload = {
                ...(charge ? {} : { landlordId }),
                propertyId: propertyId || undefined,
                category,
                description: description.trim(),
                amount: value,
                chargeDate,
                notes: notes.trim() || undefined,
            };

            if (charge) {
                await landlordChargesApi.update(charge.id, payload);
                toast.success('Charge updated');
            } else {
                await landlordChargesApi.create(payload as Parameters<typeof landlordChargesApi.create>[0]);
                toast.success('Charge recorded');
            }

            setDescription('');
            setAmount('');
            setNotes('');
            onSaved?.();
            onClose();
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message;
            setError(
                Array.isArray(message) ? message.join('. ') : message || 'Could not save the charge',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={charge ? 'Edit charge' : 'Charge a cost to a landlord'}
        >
            <div className="space-y-4">
{!charge && (
                    <div className="space-y-2">
                        <Label htmlFor="charge-landlord">Landlord</Label>
                        <Select
                            value={landlordId}
                            options={landlords.map((landlord) => ({
                                value: landlord.id,
                                label: `${landlord.code} — ${landlord.name}`,
                            }))}
                            onChange={(event) => {
                                setLandlordId(event.target.value);
                                setPropertyId('');
                            }}
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="charge-category">Category</Label>
                    <Select
                        value={category}
                        options={CHARGE_CATEGORIES}
                        onChange={(event) => setCategory(event.target.value as ChargeCategory)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Shown as “{categoryLabel(category)}” on the owner statement.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="charge-description">Description</Label>
                    <Input
                        id="charge-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="e.g. Burst pipe in unit 4B"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="charge-amount">Amount</Label>
                        <Input
                            id="charge-amount"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Deducted from the next owner statement.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="charge-date">Date</Label>
                        <Input
                            id="charge-date"
                            type="date"
                            value={chargeDate}
                            onChange={(event) => setChargeDate(event.target.value)}
                        />
                    </div>
                </div>

{landlordProperties.length > 0 && (
                    <div className="space-y-2">
                        <Label htmlFor="charge-property">Property (optional)</Label>
                        <Select
                            value={propertyId || 'none'}
                            options={[
                                { value: 'none', label: 'Not attributed to one property' },
                                ...landlordProperties.map((property) => ({
                                    value: property.id,
                                    label: property.name,
                                })),
                            ]}
                            onChange={(event) =>
                                setPropertyId(event.target.value === 'none' ? '' : event.target.value)
                            }
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="charge-notes">Notes</Label>
                    <Textarea
                        id="charge-notes"
                        rows={2}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving || !landlordId}>
                        <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isSaving ? 'Saving…' : charge ? 'Save charge' : 'Record charge'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}