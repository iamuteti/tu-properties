'use client';

import { LeadStage } from '@/types';

const STAGE_STYLES: Record<LeadStage, string> = {
    NEW: 'bg-muted text-foreground',
    CONTACTED: 'bg-stage-sky-soft text-stage-sky',
    VIEWING_SCHEDULED: 'bg-stage-indigo-soft text-stage-indigo',
    NEGOTIATION: 'bg-warning-soft text-warning',
    WON: 'bg-success-soft text-success',
    LOST: 'bg-danger-soft text-danger',
};

/** Pipeline stage pill, shared by the lead list, board and detail pages. */
export function LeadStageBadge({ stage }: { stage: LeadStage }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STAGE_STYLES[stage] ?? 'bg-muted text-foreground'
            }`}
        >
            {stage.replace(/_/g, ' ').charAt(0) + stage.replace(/_/g, ' ').slice(1).toLowerCase()}
        </span>
    );
}