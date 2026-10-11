'use client';

import { LeadStage } from '@/types';

const STAGE_STYLES: Record<LeadStage, string> = {
    NEW: 'bg-muted text-foreground',
    CONTACTED: 'bg-sky-100 text-sky-800',
    VIEWING_SCHEDULED: 'bg-indigo-100 text-indigo-800',
    NEGOTIATION: 'bg-amber-100 text-amber-800',
    WON: 'bg-green-100 text-green-800',
    LOST: 'bg-red-100 text-red-800',
};

/** Pipeline stage pill, shared by the lead list, board and detail pages. */
export function LeadStageBadge({ stage }: { stage: LeadStage }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STAGE_STYLES[stage] ?? 'bg-gray-100 text-foreground'
            }`}
        >
            {stage.replace(/_/g, ' ').charAt(0) + stage.replace(/_/g, ' ').slice(1).toLowerCase()}
        </span>
    );
}