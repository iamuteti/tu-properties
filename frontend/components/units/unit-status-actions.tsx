'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { DoorClosed, DoorOpen, Hammer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unitsApi } from '@/lib/api';
import type { Unit, UnitStatus } from '@/types';

/**
 * Explicit occupancy actions for a unit.
 *
 * `00-UX-CROSS-CUTTING-STANDARDS.md` requires status changes to be presented as
 * named next-state actions rather than a dropdown that accepts invalid
 * transitions. The server is still the authority — it refuses a transition that
 * contradicts the unit's rental agreements — and the refusal reason is shown to
 * the user instead of being swallowed.
 */

const ACTION_META: Record<
    UnitStatus,
    { label: string; confirm?: string; icon: React.ReactNode; variant?: 'default' | 'outline' | 'destructive' }
> = {
    VACANT: {
        label: 'Mark vacant',
        confirm: 'Mark this unit vacant? Only possible when no rental agreement is active.',
        icon: <DoorOpen className="mr-2 h-4 w-4" aria-hidden="true" />,
        variant: 'outline',
    },
    OCCUPIED: {
        label: 'Mark occupied',
        confirm: 'Mark this unit occupied? Only possible while a rental agreement is active.',
        icon: <DoorOpen className="mr-2 h-4 w-4" aria-hidden="true" />,
    },
    RESERVED: {
        label: 'Hold for tenant',
        confirm: 'Mark this unit reserved? It needs a rental agreement (active or starting soon).',
        icon: <DoorClosed className="mr-2 h-4 w-4" aria-hidden="true" />,
        variant: 'outline',
    },
    MAINTENANCE: {
        label: 'Take out of service',
        confirm: 'Take this unit out of service? It will be excluded from availability.',
        icon: <Hammer className="mr-2 h-4 w-4" aria-hidden="true" />,
        variant: 'outline',
    },
};

export function UnitStatusActions({
    unit,
    onChanged,
}: {
    unit: Unit;
    onChanged: () => void | Promise<void>;
}) {
    const [isBusy, setIsBusy] = useState<UnitStatus | 'sync' | null>(null);

    const current = (unit.occupancy?.status ?? unit.status) as UnitStatus;
    // The API reports which transitions are legal right now; fall back to every
    // other status so a stale payload can never leave the user with no actions.
    const allowed = unit.occupancy?.availableActions?.length
        ? unit.occupancy.availableActions
        : (Object.keys(ACTION_META) as UnitStatus[]);
    const targets = (Object.keys(ACTION_META) as UnitStatus[]).filter((status) => status !== current);

    const run = async (status: UnitStatus) => {
        const meta = ACTION_META[status];
        if (meta.confirm && !confirm(meta.confirm)) return;
        setIsBusy(status);
        try {
            await unitsApi.setStatus(unit.id, status);
            toast.success(`Unit marked ${status.charAt(0) + status.slice(1).toLowerCase()}`);
            await onChanged();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message ||
                    'That status change is not allowed for this unit right now.',
            );
        } finally {
            setIsBusy(null);
        }
    };

    const sync = async () => {
        setIsBusy('sync');
        try {
            const response = await unitsApi.syncStatus(unit.id);
            toast.success(
                response.data.changed
                    ? `Occupancy updated to ${response.data.status.toLowerCase()}`
                    : 'Occupancy already matches the rental agreements',
            );
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to re-check occupancy.');
        } finally {
            setIsBusy(null);
        }
    };

    const drifted = unit.occupancy?.derivedStatus !== current;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {targets.map((status) => {
                const meta = ACTION_META[status];
                const enabled = allowed.includes(status);
                return (
                    <Button
                        key={status}
                        variant={meta.variant ?? 'default'}
                        onClick={() => run(status)}
                        disabled={isBusy !== null || !enabled}
                        title={enabled ? undefined : 'Not allowed while the current rental agreements stand'}
                    >
                        {meta.icon}
                        {meta.label}
                    </Button>
                );
            })}
            {drifted && (
                <Button variant="outline" onClick={sync} disabled={isBusy !== null}>
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isBusy === 'sync' ? 'Re-checking…' : 'Re-check occupancy'}
                </Button>
            )}
        </div>
    );
}