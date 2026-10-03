'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { crmApi } from '@/lib/api';
import { LEAD_STAGES } from '@/lib/constants';
import type { Lead, LeadStage } from '@/types';

/**
 * Named next-stage actions for a lead.
 *
 * The UX standards require status changes to be presented as the next named
 * action rather than a dropdown of all values, and the API refuses illegal
 * moves anyway — so this only offers what the server said is allowed
 * (`lead.pipeline.availableStages`) and surfaces the refusal reason verbatim.
 */
export function LeadStageActions({
    lead,
    onChanged,
}: {
    lead: Lead;
    onChanged: () => void | Promise<void>;
}) {
    const [isBusy, setIsBusy] = useState<LeadStage | null>(null);

    const allowed = lead.pipeline?.availableStages?.filter(
        (stage) => stage !== lead.stage,
    );

    const move = async (stage: LeadStage, label: string) => {
        let reason: string | undefined;
        if (stage === 'LOST') {
            reason = window.prompt('Why was this lead lost? (required)') ?? undefined;
            if (!reason?.trim()) {
                toast.error('A reason is required to mark a lead lost.');
                return;
            }
        } else if (
            !window.confirm(`Move this lead to "${label}"?`)
        ) {
            return;
        }

        setIsBusy(stage);
        try {
            await crmApi.setLeadStage(lead.id, stage, reason);
            toast.success(`Lead moved to ${label}`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That move is not allowed.');
        } finally {
            setIsBusy(null);
        }
    };

    if (!allowed || allowed.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                This lead is closed ({lead.stage.replace('_', ' ').toLowerCase()}). Reopen it by
                converting or editing before moving it again.
            </p>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {allowed.map((stage) => {
                const meta = LEAD_STAGES.find((s) => s.value === stage);
                return (
                    <button
                        key={stage}
                        type="button"
                        disabled={isBusy !== null}
                        onClick={() => move(stage, meta?.label ?? stage)}
                        title={meta?.description}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {isBusy === stage ? 'Moving…' : `Move to ${meta?.label ?? stage}`}
                    </button>
                );
            })}
        </div>
    );
}