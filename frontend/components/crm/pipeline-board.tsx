'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock, GripVertical, Mail, Phone, User } from 'lucide-react';
import { crmApi } from '@/lib/api';
import { LEAD_STAGES, LEAD_STAGE_COLORS } from '@/lib/constants';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { Lead, LeadStage } from '@/types';

/**
 * Pipeline board.
 *
 * Deliberately a lightweight native HTML5 drag-and-drop implementation rather
 * than a board library: six static columns, no virtualisation needed, and no
 * new dependency in the bundle. Dropping a card calls the same
 * `PATCH /crm/leads/:id/stage` endpoint the buttons use, so the server-side
 * transition rules still decide whether the move is legal — an illegal drop
 * shows the API's refusal message rather than silently reverting.
 */
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
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<LeadStage | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const byStage = useMemo(() => {
        const map = new Map<LeadStage, Lead[]>();
        for (const stage of LEAD_STAGES) {
            map.set(
                stage.value,
                leads.filter((lead) => lead.stage === stage.value),
            );
        }
        return map;
    }, [leads]);

    const moveLead = async (lead: Lead, stage: LeadStage) => {
        const meta = LEAD_STAGES.find((s) => s.value === stage);
        let reason: string | undefined;

        if (stage === 'WON') {
            toast.info('Convert the lead from its detail page to mark it won.');
            return;
        }
        if (stage === 'LOST') {
            reason = window.prompt('Why was this lead lost? (required)') ?? undefined;
            if (!reason?.trim()) {
                toast.error('A reason is required to mark a lead lost.');
                return;
            }
        }

        setBusyId(lead.id);
        try {
            await crmApi.setLeadStage(lead.id, stage, reason);
            toast.success(`Moved to ${meta?.label ?? stage}`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That move is not allowed.');
        } finally {
            setBusyId(null);
        }
    };

    if (isLoading) return <LoadingState label="Loading the pipeline…" />;
    if (error) return <ErrorState message={error} />;

    const openCount = leads.filter(
        (lead) => lead.stage !== 'WON' && lead.stage !== 'LOST',
    ).length;
    if (openCount === 0) {
        return (
            <EmptyState
                title="The pipeline is empty"
                description="Open leads appear here as columns. Add a lead, or wait for one to arrive through the public website form."
                icon={<User className="h-10 w-10" aria-hidden="true" />}
                action={
                    <button
                        type="button"
                        onClick={() => router.push('/crm/leads/new')}
                        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                        Add lead
                    </button>
                }
            />
        );
    }

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4">
                {LEAD_STAGES.map((stage) => {
                    const cards = byStage.get(stage.value) ?? [];
                    const isDropTarget = dropTarget === stage.value;
                    return (
                        <section
                            key={stage.value}
                            className={`flex w-72 shrink-0 flex-col rounded-lg border-t-4 ${
                                LEAD_STAGE_COLORS[stage.value] ?? 'border-slate-300'
                            } bg-slate-50`}
                            onDragOver={(event) => {
                                event.preventDefault();
                                setDropTarget(stage.value);
                            }}
                            onDragLeave={() =>
                                setDropTarget((current) =>
                                    current === stage.value ? null : current,
                                )
                            }
                            onDrop={(event) => {
                                event.preventDefault();
                                setDropTarget(null);
                                const id = event.dataTransfer.getData('text/plain');
                                const lead = leads.find((item) => item.id === id);
                                setDraggingId(null);
                                if (lead && lead.stage !== stage.value) {
                                    moveLead(lead, stage.value);
                                }
                            }}
                            aria-label={`${stage.label} column`}
                        >
                            <header className="flex items-start justify-between gap-2 px-3 py-2">
                                <div>
                                    <h2 className="text-sm font-semibold">
                                        {stage.label}{' '}
                                        <span className="text-slate-400">({cards.length})</span>
                                    </h2>
                                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                                </div>
                            </header>

                            <div className="flex-1 space-y-2 px-2 pb-3">
                                {cards.length === 0 && (
                                    <p
                                        className={`rounded-md border border-dashed px-3 py-6 text-center text-xs ${
                                            isDropTarget
                                                ? 'border-slate-400 bg-white text-slate-600'
                                                : 'border-slate-200 text-slate-400'
                                        }`}
                                    >
                                        {isDropTarget ? 'Drop here' : 'No leads'}
                                    </p>
                                )}

                                {cards.map((lead) => (
                                    <article
                                        key={lead.id}
                                        draggable={stage.value !== 'WON' && stage.value !== 'LOST'}
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData('text/plain', lead.id);
                                            setDraggingId(lead.id);
                                        }}
                                        onDragEnd={() => {
                                            setDraggingId(null);
                                            setDropTarget(null);
                                        }}
                                        className={`cursor-grab rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow ${
                                            draggingId === lead.id ? 'opacity-50' : ''
                                        } ${busyId === lead.id ? 'animate-pulse' : ''}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <Link
                                                href={`/crm/leads/${lead.id}`}
                                                className="text-sm font-medium hover:underline"
                                            >
                                                {lead.firstName} {lead.lastName ?? ''}
                                            </Link>
                                            <GripVertical
                                                className="h-4 w-4 shrink-0 text-slate-300"
                                                aria-hidden="true"
                                            />
                                        </div>

                                        <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                            {lead.source !== 'OTHER' && (
                                                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                                                    {lead.source.replace('_', ' ').toLowerCase()}
                                                </span>
                                            )}
                                            {lead.interestedProperty && (
                                                <span className="truncate rounded bg-slate-100 px-1.5 py-0.5">
                                                    {lead.interestedProperty.name}
                                                </span>
                                            )}
                                        </div>

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
                                                <span className="truncate">
                                                    {lead.assignedAgent.firstName}
                                                </span>
                                            ) : (
                                                <span className="text-amber-600">Unassigned</span>
                                            )}
                                        </div>

                                        {lead.lostReason && (
                                            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                                {lead.lostReason}
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}