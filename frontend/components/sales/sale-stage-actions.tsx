'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { salesApi } from '@/lib/api';
import { SALE_STAGES } from '@/lib/constants';
import type { Sale, SaleStage } from '@/types';

/**
 * Named next-stage actions for a sale.
 *
 * Only the moves the server says are legal are offered (`sale.pipeline.availableStages`),
 * and its refusal message is shown verbatim when one is rejected — e.g. handing
 * over with money outstanding, or reserving before an agreed price exists.
 */
export function SaleStageActions({
    sale,
    onChanged,
}: {
    sale: Sale;
    onChanged: () => void | Promise<void>;
}) {
    const [isBusy, setIsBusy] = useState<SaleStage | null>(null);

    const allowed = (sale.pipeline?.availableStages ?? []).filter(
        (stage) => stage !== sale.stage,
    );

    const move = async (stage: SaleStage) => {
        const meta = SALE_STAGES.find((s) => s.value === stage);
        let reason: string | undefined;

        if (stage === 'CANCELLED') {
            reason = window.prompt('Why is this sale being cancelled? (required)') ?? undefined;
            if (!reason?.trim()) {
                toast.error('A reason is required to cancel a sale.');
                return;
            }
        } else if (!window.confirm(`Move this sale to "${meta?.label}"?`)) {
            return;
        }

        setIsBusy(stage);
        try {
            await salesApi.setStage(sale.id, stage, reason);
            toast.success(`Sale moved to ${meta?.label}`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That move is not allowed.');
        } finally {
            setIsBusy(null);
        }
    };

    if (allowed.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                This sale is closed ({sale.stage.toLowerCase()}). A completed or cancelled sale
                cannot be moved.
            </p>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {allowed.map((stage) => {
                const meta = SALE_STAGES.find((s) => s.value === stage);
                return (
                    <Button
                        key={stage}
                        variant={stage === 'CANCELLED' ? 'outline' : 'default'}
                        onClick={() => move(stage)}
                        disabled={isBusy !== null}
                        title={meta?.description}
                    >
                        {isBusy === stage
                            ? 'Moving…'
                            : `Move to ${meta?.label ?? stage}`}
                    </Button>
                );
            })}
        </div>
    );
}