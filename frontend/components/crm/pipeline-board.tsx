'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, Mail, Phone } from 'lucide-react';
import { KanbanBoard, type KanbanColumn } from '@/components/ui/kanban-board';
import { crmApi } from '@/lib/api';
import { LEAD_STAGES, LEAD_STAGE_COLORS } from '@/lib/constants';
import type { Lead, LeadStage } from '@/types';

/**
 * CRM lead pipeline board.
 *
 * The board mechanics (drag and drop, drop targets, refusal handling) live in
 * the shared `KanbanBoard`; this module supplies the columns and the card. A
 * drop calls the same stage endpoint the buttons use, so an illegal move shows
 * the API's refusal message rather than silently reverting.
 */
const COLUMNS: Array<KanbanColumn<Lead>> = LEAD_STAGES.map((stage) => ({
    id: stage.value,
    label: stage.label,
    description: stage.description,
    color: LEAD_STAGE_COLORS[stage.value],
    // WON is set by converting the lead, not by dropping a card on it.
    droppable: stage.value !== 'WON',
}));

export function PipelineBoard({
    leads,
    isLoading,
    error,
    onChanged,
}: {
    leads: Lead[];
    isLoading: boolean;
    error: string | null;
    onChanged: () => void | Promise<void>;
}) {
    const router = useRouter();

    const moveLead = async (lead: Lead, stageId: string) => {
        const stage = stageId as LeadStage;
        const meta = LEAD_STAGES.find((s) => s.value === stage);
        let reason: string | undefined;

        if (stage === 'LOST') {
            reason = window.prompt('Why was this lead lost? (required)') ?? undefined;
            if (!reason?.trim()) {
                toast.error('A reason is required to mark a lead lost.');
                return;
            }
        }

        try {
            await crmApi.setLeadStage(lead.id, stage, reason);
            toast.success(`Moved to ${meta?.label ?? stage}`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That move is not allowed.');
        }
    };

    return (
        <KanbanBoard<Lead>
            columns={COLUMNS}
            items={leads}
            getStage={(lead) => lead.stage}
            getId={(lead) => lead.id}
            lockedStages={['WON', 'LOST']}
            isLoading={isLoading}
            error={error}
            onMove={moveLead}
            emptyTitle="The pipeline is empty"
            emptyDescription="Open leads appear here as columns. Add a lead, or wait for one to arrive through the public website form."
            emptyIcon={<UserIcon />}
            emptyAction={
                <button
                    type="button"
                    onClick={() => router.push('/crm/leads/new')}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                    Add lead
                </button>
            }
            renderCard={(lead) => (
                <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                        <Link
                            href={`/crm/leads/${lead.id}`}
                            className="text-sm font-medium hover:underline"
                        >
                            {lead.firstName} {lead.lastName ?? ''}
                        </Link>
                        {lead.source !== 'OTHER' && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                {lead.source.replace('_', ' ').toLowerCase()}
                            </span>
                        )}
                    </div>

                    {lead.interestedProperty && (
                        <p className="mt-1 truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            {lead.interestedProperty.name}
                        </p>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {lead.phone && (
                            <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" aria-hidden="true" />
                                {lead.phone}
                            </span>
                        )}
                        {lead.email && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="h-3 w-3" aria-hidden="true" />
                                <span className="truncate">{lead.email}</span>
                            </span>
                        )}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                        {lead.assignedAgent ? (
                            <span className="truncate">{lead.assignedAgent.firstName}</span>
                        ) : (
                            <span className="text-amber-600">Unassigned</span>
                        )}
                    </div>

                    {lead.lostReason && (
                        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                            {lead.lostReason}
                        </p>
                    )}
                </div>
            )}
        />
    );
}

function UserIcon() {
    return (
        <svg
            className="h-10 w-10 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
        >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
    );
}