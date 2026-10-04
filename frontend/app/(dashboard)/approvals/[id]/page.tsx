"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import {
    ApprovalHistory,
    ApprovalTimeline,
} from "@/components/workflow/approval-timeline";
import { ApprovalDecision } from "@/components/workflow/decision-form";
import { workflowsApi } from "@/lib/api";
import {
    WORKFLOW_STATUS_META,
    formatWorkflowCurrency,
} from "@/lib/constants";
import { useAuth } from "@/context/auth-context";
import type { WorkflowInstance } from "@/types";

/**
 * One approval, end to end: what was asked for, which levels it had to pass,
 * who decided each one and why, and what happened as a result.
 *
 * The page is read-only for everybody but the current level's approver, and it
 * offers no override of its own — an administrator acting outside the policy is
 * allowed by the API and recorded as an override, but it is surfaced as one here
 * rather than looking like an ordinary approval.
 */
export default function ApprovalDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const [instance, setInstance] = useState<WorkflowInstance | null>(null);
    const [approverNames, setApproverNames] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const found = (await workflowsApi.findOne(params.id)).data;
            setInstance(found);

            // Levels addressed to a named person should show the name, not an id.
            const ids = (found.stepInstances ?? [])
                .map((step) => step.approverUserId)
                .filter((id): id is string => !!id);
            if (ids.length > 0) {
                try {
                    const options = (await workflowsApi.approverOptions()).data;
                    setApproverNames(
                        Object.fromEntries(
                            options.users
                                .filter((candidate) => ids.includes(candidate.id))
                                .map((candidate) => [
                                    candidate.id,
                                    `${candidate.firstName} ${candidate.lastName}`,
                                ]),
                        ),
                    );
                } catch {
                    // A missing name is cosmetic; the id is still in the trail.
                }
            }
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    "Could not load this approval. It may belong to another organization.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading approval…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!instance) return <ErrorState message="Approval not found." />;

    const meta = WORKFLOW_STATUS_META[instance.status] ?? {
        label: instance.status,
        className: "bg-slate-100 text-slate-600",
    };
    const current = [...(instance.stepInstances ?? [])]
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .find((step) => step.status === "ACTIVE" || step.status === "ESCALATED");
    const open = instance.status === "IN_PROGRESS" || instance.status === "ESCALATED";
    const isCurrentApprover =
        !!current && current.approverUserId !== instance.startedById;

    const withdraw = async () => {
        const reason = window.prompt("Why are you withdrawing this request?");
        if (!reason?.trim()) return;
        try {
            await workflowsApi.cancel(instance.id, reason.trim());
            toast.success("Request withdrawn");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not withdraw that request.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Back
                </Button>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}>
                    {meta.label}
                </span>
            </div>

            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    {instance.entityLabel ?? `${instance.entityType} request`}
                </h1>
                <p className="text-muted-foreground">
                    {instance.startedBy
                        ? `Raised by ${instance.startedBy.firstName} ${instance.startedBy.lastName} `
                        : "Raised "}
                    on {new Date(instance.startedAt).toLocaleString()}
                    {instance.completedAt
                        ? ` · decided ${new Date(instance.completedAt).toLocaleString()}`
                        : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
            </div>

            {instance.autoApproved && (
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-4 text-sm">
                        <p className="font-medium">Processed without approval</p>
                        <p className="text-amber-900">
                            {instance.note ??
                                "No policy applied when this was raised, so it went straight through."}
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="space-y-4 p-5">
                    <h2 className="font-medium">What was requested</h2>
                    <RequestFacts
                        entityType={instance.entityType}
                        context={instance.context ?? {}}
                    />
                    {instance.finalComment && (
                        <p className="rounded bg-slate-50 px-3 py-2 text-sm">
                            “{instance.finalComment}”
                        </p>
                    )}
                    {instance.workflowDefinition && (
                        <p className="text-xs text-muted-foreground">
                            Policy: {instance.workflowDefinition.name}
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 p-5">
                    <h2 className="font-medium">Approval levels</h2>
                    <ApprovalTimeline instance={instance} approverNames={approverNames} />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 p-5">
                    <h2 className="font-medium">History</h2>
                    <ApprovalHistory instance={instance} />
                </CardContent>
            </Card>

            {(open || instance.startedBy?.id === user?.id) && (
                <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                        {open && isCurrentApprover ? (
                            <ApprovalDecision
                                instanceId={instance.id}
                                entityLabel={instance.entityLabel ?? undefined}
                                onDecided={load}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {open
                                    ? `This is with ${
                                          current?.approverKind === "USER"
                                              ? (approverNames[current.approverUserId ?? ""] ??
                                                "a named approver")
                                              : (current?.approverRole
                                                  ? `anyone holding ${current.approverRole}`
                                                  : "the next level")
                                      } — you cannot decide it.`
                                    : "Nothing left to decide."}
                            </p>
                        )}
                        {open && instance.startedBy?.id === user?.id && (
                            <Button size="sm" variant="ghost" onClick={withdraw}>
                                Withdraw
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            <p className="text-xs text-muted-foreground">
                Record{" "}
                <Link href="/approvals" className="underline">
                    back to approvals
                </Link>
                .
            </p>
        </div>
    );
}

function RequestFacts({
    entityType,
    context,
}: {
    entityType: string;
    context: Record<string, unknown>;
}) {
    const entries = Object.entries(context ?? {});
    if (entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Nothing further was recorded with this request.
            </p>
        );
    }

    const currency = String(context.currency ?? "KES");

    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {entries.map(([key, value]) => (
                <div key={key}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                    </dt>
                    <dd className="font-medium">
                        {key === "amount"
                            ? formatWorkflowCurrency(value, currency)
                            : value === null || value === undefined || value === ""
                              ? "—"
                              : typeof value === "boolean"
                                ? value
                                  ? "Yes"
                                  : "No"
                                : String(value)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}