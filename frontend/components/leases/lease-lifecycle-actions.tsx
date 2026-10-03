'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { leasesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Lease, LeaseAction } from '@/types';

/**
 * Named lifecycle actions for a lease.
 *
 * The UX standards want the next steps as named buttons rather than a status
 * dropdown, and the API is the authority on which are legal — this only renders
 * what `lease.timeline.availableActions` reports and shows its refusal message
 * when one is rejected (e.g. renewing a tenancy that has moved out).
 */
const ACTION_META: Record<LeaseAction, { label: string; needsDate?: boolean; needsReason?: boolean }> = {
    ACTIVATE: { label: 'Activate lease' },
    RENEW: { label: 'Renew…', needsDate: true },
    EXTEND: { label: 'Extend…', needsDate: true },
    TERMINATE: { label: 'Terminate early…', needsReason: true },
    EXPIRE: { label: 'Let it expire' },
    REACTIVATE: { label: 'Reactivate' },
};

export function LeaseLifecycleActions({
    lease,
    onChanged,
}: {
    lease: Lease;
    onChanged: () => void | Promise<void>;
}) {
    const [isBusy, setIsBusy] = useState<LeaseAction | null>(null);
    const [busy, setBusy] = useState(false);

    const available = lease.timeline?.availableActions ?? [];

    const run = async (action: LeaseAction) => {
        const meta = ACTION_META[action];

        if (meta.needsDate && action === 'RENEW') {
            const termMonths = Number(window.prompt('New term in months (e.g. 12):', '12') ?? 0);
            if (!termMonths) {
                toast.error('Enter how many months the renewal runs for.');
                return;
            }
            const rent = window.prompt(
                `New monthly rent (${lease.currency}, blank keeps ${Number(lease.rentAmount).toLocaleString()}):`,
                String(lease.rentAmount),
            );
            setBusy(true);
            try {
                await leasesApi.renew(lease.id, {
                    termMonths,
                    ...(rent ? { rentAmount: Number(rent) } : {}),
                });
                toast.success('Lease renewed — the successor agreement is ready');
                await onChanged();
            } catch (err: any) {
                toast.error(err.response?.data?.message || 'The renewal was refused.');
            } finally {
                setBusy(false);
            }
            return;
        }

        if (meta.needsDate && action === 'EXTEND') {
            const date = window.prompt('New end date (YYYY-MM-DD):', '');
            if (!date) return;
            setBusy(true);
            try {
                await leasesApi.extend(lease.id, date);
                toast.success('Lease extended');
                await onChanged();
            } catch (err: any) {
                toast.error(err.response?.data?.message || 'The extension was refused.');
            } finally {
                setBusy(false);
            }
            return;
        }

        if (meta.needsReason && action === 'TERMINATE') {
            const reason = window.prompt('Why is the lease ending early? (recorded on the lease)') ?? '';
            if (!reason.trim()) {
                toast.error('A reason is required to terminate a lease.');
                return;
            }
            setBusy(true);
            try {
                const result = await leasesApi.terminate(lease.id, reason.trim());
                const arrears = result.data.arrears;
                const arrearsNote =
                    arrears > 0
                        ? ` — ${lease.currency} ${arrears.toLocaleString()} is still owed`
                        : '';
                toast.success(
                    result.data.unitVacated
                        ? `Lease terminated and the unit is vacant${arrearsNote}`
                        : `Lease terminated — a successor tenancy keeps the unit${arrearsNote}`,
                );
                await onChanged();
            } catch (err: any) {
                toast.error(err.response?.data?.message || 'Termination was refused.');
            } finally {
                setBusy(false);
            }
            return;
        }

        if (!window.confirm(`${meta.label}?`)) return;

        setIsBusy(action);
        try {
            if (action === 'ACTIVATE') await leasesApi.activate(lease.id);
            else if (action === 'EXPIRE') await leasesApi.expire(lease.id);
            else if (action === 'REACTIVATE') await leasesApi.reactivate(lease.id);
            toast.success(`${meta.label} done`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That action was refused.');
        } finally {
            setIsBusy(null);
        }
    };

    if (available.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                This lease is closed. A {lease.status.toLowerCase()} lease has no further
                lifecycle actions — raise a new lease for the unit instead.
            </p>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {available.map((action) => (
                <Button
                    key={action}
                    variant={action === 'TERMINATE' ? 'outline' : 'default'}
                    onClick={() => run(action)}
                    disabled={busy || isBusy !== null}
                >
                    {busy || isBusy === action
                        ? 'Working…'
                        : ACTION_META[action]?.label ?? action}
                </Button>
            ))}
        </div>
    );
}

/** Small helper used by the detail page to raise a move-out for this lease. */
export function MoveOutPrompt({ lease, onCreated }: { lease: Lease; onCreated: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [date, setDate] = useState(today());
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);

    if (lease.status !== 'ACTIVE') return null;

    const submit = async () => {
        setBusy(true);
        try {
            const { moveOutsApi } = await import('@/lib/api');
            await moveOutsApi.create({ rentalAgreementId: lease.id, moveoutDate: date, notes });
            toast.success('Move-out requested');
            setIsOpen(false);
            onCreated();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not raise the move-out.');
        } finally {
            setBusy(false);
        }
    };

    if (!isOpen) {
        return (
            <Button variant="outline" onClick={() => setIsOpen(true)}>
                Raise a move-out
            </Button>
        );
    }

    return (
        <div className="w-full space-y-3 rounded-lg border bg-slate-50 p-4">
            <div>
                <label htmlFor="moveout-date" className="mb-1 block text-sm font-medium">
                    Move-out date
                </label>
                <Input
                    id="moveout-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                />
            </div>
            <div>
                <label htmlFor="moveout-notes" className="mb-1 block text-sm font-medium">
                    Notes (optional)
                </label>
                <Input
                    id="moveout-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notice received by email on…"
                />
            </div>
            <div className="flex gap-2">
                <Button onClick={submit} disabled={busy}>
                    {busy ? 'Raising…' : 'Raise move-out'}
                </Button>
                <Button variant="ghost" onClick={() => setIsOpen(false)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function today() {
    return new Date().toISOString().slice(0, 10);
}