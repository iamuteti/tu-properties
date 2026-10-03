'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { landlordPayoutsApi } from '@/lib/api';
import { PAYOUT_STATUSES } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LandlordPayout, PayoutStatus } from '@/types';

/**
 * Move a payout through its state machine.
 *
 * Only the statuses the server will accept are offered, and the extra fields a
 * status needs are asked for here rather than failing at the API: marking it
 * paid requires the bank reference, marking it failed requires the reason.
 */
const NEXT_STATUSES: Record<PayoutStatus, PayoutStatus[]> = {
    PENDING: ['PROCESSING', 'PAID', 'FAILED'],
    PROCESSING: ['PAID', 'FAILED'],
    FAILED: ['PROCESSING', 'PENDING'],
    PAID: [],
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
    const option = PAYOUT_STATUSES.find((entry) => entry.value === status);
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                option?.className ?? 'bg-gray-100 text-gray-800'
            }`}
        >
            {option?.label ?? status}
        </span>
    );
}

export function PayoutStatusDialog({
    isOpen,
    onClose,
    payout,
    targetStatus,
    onUpdated,
}: {
    isOpen: boolean;
    onClose: () => void;
    payout: LandlordPayout | null;
    targetStatus: PayoutStatus | null;
    onUpdated?: () => void;
}) {
    const [reference, setReference] = useState('');
    const [failureReason, setFailureReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!payout || !targetStatus) return null;

    const needsReference = targetStatus === 'PAID' && !payout.reference;
    const needsReason = targetStatus === 'FAILED';

    const submit = async () => {
        setError(null);
        setIsSaving(true);
        try {
            await landlordPayoutsApi.updateStatus(payout.id, {
                status: targetStatus,
                reference: reference.trim() || undefined,
                failureReason: failureReason.trim() || undefined,
            });
            toast.success(`Payout marked ${targetStatus.toLowerCase()}`);
            setReference('');
            setFailureReason('');
            onUpdated?.();
            onClose();
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message;
            setError(
                Array.isArray(message) ? message.join('. ') : message || 'Could not update the payout',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Mark payout ${targetStatus.toLowerCase()}`}
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    {payout.amount.toLocaleString()} to{' '}
                    {payout.landlord?.name ?? 'this landlord'}
                    {payout.ownerStatement
                        ? ` against ${payout.ownerStatement.statementNumber}`
                        : ''}
                    .
                </p>

                {needsReference && (
                    <div className="space-y-2">
                        <Label htmlFor="status-reference">Transfer reference</Label>
                        <Input
                            id="status-reference"
                            value={reference}
                            onChange={(event) => setReference(event.target.value)}
                            placeholder="Bank / RTGS reference"
                        />
                        <p className="text-xs text-muted-foreground">
                            Required — an unreferenced payout cannot be audited.
                        </p>
                    </div>
                )}

                {needsReason && (
                    <div className="space-y-2">
                        <Label htmlFor="failure-reason">Why did it fail?</Label>
                        <Textarea
                            id="failure-reason"
                            rows={2}
                            value={failureReason}
                            onChange={(event) => setFailureReason(event.target.value)}
                            placeholder="e.g. Account closed at the bank"
                        />
                    </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={isSaving || (needsReference && reference.trim() === '')}
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : targetStatus === 'PAID' ? (
                            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        ) : targetStatus === 'FAILED' ? (
                            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                        ) : null}
                        {isSaving ? 'Saving…' : 'Confirm'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/** The status transitions available for a payout, for a row action menu. */
export function availablePayoutTransitions(status: PayoutStatus): PayoutStatus[] {
    return NEXT_STATUSES[status] ?? [];
}