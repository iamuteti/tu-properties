"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Inbox, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { ApprovalDecision } from "@/components/workflow/decision-form";
import { workflowsApi } from "@/lib/api";
import {
    WORKFLOW_CONTEXT_HINTS,
    WORKFLOW_STATUS_META,
    formatWorkflowCurrency,
} from "@/lib/constants";
import { useAuth } from "@/context/auth-context";
import type {
    ApprovalInbox,
    ApprovalTask,
    WorkflowDelegation,
    WorkflowInstance,
} from "@/types";

/**
 * The approvals inbox (Module 18).
 *
 * One queue for every kind of request. An approver's actual job is "decide what
 * is waiting on me", and splitting that queue by module is how approval inboxes
 * end up unmonitored — so refunds, and whatever procurement and maintenance send
 * here later, all arrive in the same place.
 *
 * Two things the page is careful about:
 *
 *   - It says *why* something is here. A level handed over by an escalation, or
 *     decided under somebody's delegation, is not the same thing as a level
 *     addressed to you, and an approver who cannot tell will stop trusting it.
 *   - A request you raised yourself is never offered back to you for approval.
 *     The API refuses it; hiding it is kinder than a 403.
 */
export default function ApprovalsPage() {
    const { user } = useAuth();
    const [inbox, setInbox] = useState<ApprovalInbox | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<"mine" | "requested">("mine");

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            setInbox((await workflowsApi.inbox()).data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load your approvals.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const pending = inbox?.pending ?? [];
    const requested = inbox?.requestedByMe ?? [];
    const canDecide = (task: ApprovalTask) => task.requestedBy?.id !== user?.id;

    const tabs = useMemo(
        () => [
            { key: "mine" as const, label: "Waiting on you", count: pending.length },
            {
                key: "requested" as const,
                label: "Requested by me",
                count: requested.filter((i) => i.status === "IN_PROGRESS" || i.status === "ESCALATED")
                    .length,
            },
        ],
        [pending.length, requested],
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
                <p className="text-muted-foreground">
                    {inbox
                        ? inbox.counts.pending === 0
                            ? "Nothing is waiting on you"
                            : `${inbox.counts.pending} waiting on you${
                                  inbox.counts.overdue
                                      ? `, ${inbox.counts.overdue} past their deadline`
                                      : ""
                              }`
                        : "Every request that needs a decision, in one place"}
                </p>
            </div>

            <DelegationPanel onChanged={load} />

            <div className="flex gap-1 border-b" role="tablist" aria-label="Approval queues">
                {tabs.map((item) => (
                    <button
                        key={item.key}
                        role="tab"
                        aria-selected={tab === item.key}
                        onClick={() => setTab(item.key)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                            tab === item.key
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {item.label}
                        {item.count > 0 && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                                {item.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <LoadingState label="Loading your approvals…" />
            ) : error ? (
                <ErrorState message={error} onRetry={load} />
            ) : tab === "mine" ? (
                pending.length === 0 ? (
                    <EmptyState
                        title="Nothing is waiting on you"
                        description="Requests addressed to your role, or to you by name, arrive here. If a level misses its deadline it is escalated to somebody higher up rather than sitting here."
                        icon={<Inbox className="h-10 w-10" aria-hidden="true" />}
                    />
                ) : (
                    <ul className="space-y-4">
                        {pending.map((task) => (
                            <li key={task.stepId}>
                                <Card>
                                    <CardContent className="space-y-4 p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <p className="font-medium">
                                                    {task.entityLabel ?? `${task.entityType} request`}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    Level {task.stepIndex + 1}: {task.stepName}
                                                    {task.requestedBy
                                                        ? ` · raised by ${task.requestedBy.firstName} ${task.requestedBy.lastName}`
                                                        : ""}
                                                    {` · ${new Date(task.requestedAt).toLocaleString()}`}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {task.status === "ESCALATED" && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                                                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                                        Escalated to you
                                                    </span>
                                                )}
                                                {task.overdue && task.status !== "ESCALATED" && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                                                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                                        Past its deadline
                                                    </span>
                                                )}
                                                {task.viaDelegation && (
                                                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                                                        On somebody&apos;s behalf
                                                    </span>
                                                )}
                                                {task.viaOverride && (
                                                    <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                                        Administrator override
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <ContextSummary entityType={task.entityType} context={task.context} />

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <Link
                                                href={`/approvals/${task.instanceId}`}
                                                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                                            >
                                                See the whole request
                                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Link>
                                            {canDecide(task) ? (
                                                <ApprovalDecision
                                                    instanceId={task.instanceId}
                                                    entityLabel={task.entityLabel ?? undefined}
                                                    onDecided={load}
                                                />
                                            ) : (
                                                <p className="text-xs text-muted-foreground">
                                                    You raised this one, so somebody else has to decide it.
                                                </p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )
            ) : (
                <RequestedList instances={requested} />
            )}
        </div>
    );
}

/**
 * The payload a decision is made on.
 *
 * Rendered from `context` rather than a hand-written template per entity type:
 * the engine is generic, so the fields an approver sees come from whoever
 * raised the request. Missing fields are simply not shown, and the keys the
 * caller used are always shown, so nothing can quietly hide.
 */
function ContextSummary({
    entityType,
    context,
}: {
    entityType: string;
    context: Record<string, unknown>;
}) {
    const entries = Object.entries(context ?? {});
    if (entries.length === 0) return null;

    const hinted = WORKFLOW_CONTEXT_HINTS[entityType] ?? [];
    const currency = String(context.currency ?? "KES");
    const ordered = [
        ...hinted.filter((key) => key in (context ?? {})),
        ...entries.map(([key]) => key).filter((key) => !hinted.includes(key)),
    ];
    const seen = new Set<string>();
    const visible = ordered.filter((key) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-3">
            {visible.map((key) => (
                <div key={key}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                    </dt>
                    <dd className="font-medium">
                        {key === "amount"
                            ? formatWorkflowCurrency(context[key], currency)
                            : renderValue(context[key])}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function renderValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return "—";
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function RequestedList({ instances }: { instances: WorkflowInstance[] }) {
    if (instances.length === 0) {
        return (
            <EmptyState
                title="You have not raised anything"
                description="Refunds you request, and anything else that needs approval, will show here with where it has got to."
                icon={<Inbox className="h-10 w-10" aria-hidden="true" />}
            />
        );
    }

    return (
        <ul className="space-y-3">
            {instances.map((instance) => {
                const meta = WORKFLOW_STATUS_META[instance.status] ?? {
                    label: instance.status,
                    className: "bg-slate-100 text-slate-600",
                };
                const current = [...(instance.stepInstances ?? [])]
                    .sort((a, b) => a.stepIndex - b.stepIndex)
                    .find((s) => s.status === "ACTIVE" || s.status === "ESCALATED");

                return (
                    <li key={instance.id}>
                        <Card>
                            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                                <div>
                                    <p className="font-medium">
                                        {instance.entityLabel ?? `${instance.entityType} request`}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Raised {new Date(instance.startedAt).toLocaleString()}
                                        {current ? ` · with ${current.name}` : ""}
                                        {instance.finalComment
                                            ? ` · “${instance.finalComment}”`
                                            : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                                    >
                                        {meta.label}
                                    </span>
                                    <Link
                                        href={`/approvals/${instance.id}`}
                                        className="text-sm hover:underline"
                                    >
                                        Open
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Delegation, kept on the page an approver already visits.
 *
 * "I am away and things are piling up" is exactly the moment somebody looks at
 * their inbox, so the control lives here rather than in a settings page nobody
 * opens in time.
 */
function DelegationPanel({ onChanged }: { onChanged: () => Promise<void> }) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [delegations, setDelegations] = useState<{
        givenByMe: WorkflowDelegation[];
        givenToMe: WorkflowDelegation[];
    } | null>(null);
    const [options, setOptions] = useState<
        { id: string; firstName: string; lastName: string; email: string }[]
    >([]);
    const [toUserId, setToUserId] = useState("");
    const [endsAt, setEndsAt] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [mine, approvers] = await Promise.all([
                workflowsApi.delegations(),
                workflowsApi.approverOptions(),
            ]);
            setDelegations(mine.data);
            setOptions(approvers.data.users.filter((u: { id: string }) => u.id !== user?.id));
        } catch {
            // Delegation is a convenience; failing to load it must not take the
            // inbox down with it.
        }
    }, [user?.id]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const create = async () => {
        if (!toUserId) {
            toast.error("Choose who will decide in your absence.");
            return;
        }
        setBusy(true);
        try {
            await workflowsApi.createDelegation({
                toUserId,
                endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
                reason: "Away from the approvals queue",
            });
            toast.success("Delegated", {
                description: "They can decide what is waiting on you until it ends.",
            });
            setToUserId("");
            setEndsAt("");
            await load();
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not delegate.");
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (id: string) => {
        try {
            await workflowsApi.removeDelegation(id);
            toast.success("Delegation withdrawn");
            await load();
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not withdraw that delegation.");
        }
    };

    const live = (delegations?.givenByMe ?? []).filter((d) => !d.endsAt || new Date(d.endsAt) >= new Date());

    return (
        <Card>
            <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">Out of office?</p>
                        <p className="text-sm text-muted-foreground">
                            Let a colleague decide what is waiting on you. They act in your
                            name, and the trail records that they did.
                        </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
                        <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {open ? "Close" : "Manage delegation"}
                    </Button>
                </div>

                {open && (
                    <div className="space-y-4 border-t pt-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Who decides for you
                                </span>
                                <Select
                                    value={toUserId}
                                    onChange={(e) => setToUserId(e.target.value)}
                                    placeholder="Choose a colleague"
                                    aria-label="Who decides for you"
                                    options={options.map((u) => ({
                                        value: u.id,
                                        label: `${u.firstName} ${u.lastName}`,
                                    }))}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="delegate-until"
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                >
                                    Until (optional)
                                </label>
                                <input
                                    id="delegate-until"
                                    type="datetime-local"
                                    value={endsAt}
                                    onChange={(e) => setEndsAt(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <Button size="sm" disabled={busy || !toUserId} onClick={create}>
                            {busy ? "Saving…" : "Delegate my approvals"}
                        </Button>

                        {live.length > 0 && (
                            <ul className="space-y-2">
                                {live.map((delegation) => (
                                    <li
                                        key={delegation.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                                    >
                                        <span>
                                            {delegation.toUser?.firstName}{" "}
                                            {delegation.toUser?.lastName}
                                            {delegation.endsAt
                                                ? ` · until ${new Date(delegation.endsAt).toLocaleString()}`
                                                : " · until you withdraw it"}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => revoke(delegation.id)}
                                        >
                                            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                            Withdraw
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {(delegations?.givenToMe ?? []).length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                You can also decide for{" "}
                                {delegations?.givenToMe
                                    .map((d) => `${d.fromUser?.firstName} ${d.fromUser?.lastName}`)
                                    .join(", ")}
                                .
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}