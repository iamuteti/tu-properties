'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { landlordPayoutsApi } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { OwnerStatement } from '@/types';

/**
 * Record a payout to a landlord.
 *
 * The amount defaults to what the statement still owes, because paying an
 * owner "some of it" is the exception, not the rule. The server refuses an
 * amount larger than the outstanding balance, so this form cannot overpay even
 * if it is typed in wrong.
 */
export function PayoutFormDialog({
    isOpen,
    onClose,
    landlordId,
    landlordName,
    statement,
    onRecorded,
}: {
    isOpen: boolean;
    onClose: () => void;
    landlordId: string;
    landlordName?: string;
    statement?: OwnerStatement;
    onRecorded?: () => void;
}) {
    const [amount, setAmount] = useState(
        statement ? String(statement.outstandingAmount) : '',
    );
    const [method, setMethod] = useState('BANK_TRANSFER');
    const [reference, setReference] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0) {
            setError('Enter an amount greater than zero');
            return;
        }
        if (statement && value > statement.outstandingAmount) {
            setError(
                `Only ${statement.outstandingAmount.toLocaleString()} is still owed on ${statement.statementNumber}`,
            );
            return;
        }

        setError(null);
        setIsSaving(true);
        try {
            await landlordPayoutsApi.create({
                landlordId,
                ownerStatementId: statement?.id,
                amount: value,
                method,
                reference: reference.trim() || undefined,
                scheduledFor: scheduledFor || undefined,
                notes: notes.trim() || undefined,
            });
            toast.success('Payout recorded as pending');
            setAmount('');
            setReference('');
            setNotes('');
            onRecorded?.();
            onClose();
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message;
            setError(
                Array.isArray(message) ? message.join('. ') : message || 'Could not record the payout',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={statement ? `Pay ${statement.statementNumber}` : 'Record a payout'}
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    {statement
                        ? `Outstanding on this statement: ${statement.outstandingAmount.toLocaleString()}`
                        : `Payable to ${landlordName ?? 'this landlord'} with no statement attached.`}
                </p>

                <div className="space-y-2">
                    <Label htmlFor="payout-amount">Amount</Label>
                    <Input
                        id="payout-amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="payout-method">Method</Label>
                    <Select
                        value={method}
                        options={PAYMENT_METHODS}
                        onChange={(event) => setMethod(event.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="payout-reference">Transfer reference</Label>
                    <Input
                        id="payout-reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Can be added when the transfer is made"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="payout-scheduled">Scheduled for</Label>
                    <Input
                        id="payout-scheduled"
                        type="date"
                        value={scheduledFor}
                        onChange={(event) => setScheduledFor(event.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="payout-notes">Notes</Label>
                    <Textarea
                        id="payout-notes"
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
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isSaving ? 'Recording…' : 'Record payout'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}