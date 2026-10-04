"use client";

import { AlertTriangle, ArrowRight, Check, Clock, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKFLOW_STEP_STATUS_META } from "@/lib/constants";
import type { WorkflowInstance, WorkflowStep } from "@/types";

/**
 * The levels of one approval, in order, with who each was addressed to.
 *
 * This is the part an approver is actually accountable for, so it renders
 * honestly: a level that did not apply says so instead of disappearing, and a
 * decision made under a delegation says whose approval it really was.
 */
export function ApprovalTimeline({
    instance,
    approverNames = {},
    compact = false,
}: {
    instance: WorkflowInstance;
    /** userId -> display name, for levels addressed to a named person. */
    approverNames?: Record<string, string>;
    compact?: boolean;
}) {
    const steps = [...(instance.stepInstances ?? [])].sort(
        (a, b) => a.stepIndex - b.stepIndex,
    );

    if (steps.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                This request was decided without any approval levels — no policy
                applied when it was raised.
            </p>
        );
    }

    return (
        <ol className="space-y-0">
            {steps.map((step, index) => (
                <TimelineRow
                    key={step.id}
                    step={step}
                    isLast={index === steps.length - 1}
                    approverName={
                        step.approverUserId
                            ? (approverNames[step.approverUserId] ?? "a named approver")
                            : undefined
                    }
                    compact={compact}
                    decidedByName={undefined}
                />
            ))}
        </ol>
    );
}

function TimelineRow({
    step,
    isLast,
    approverName,
    compact,
}: {
    step: WorkflowStep;
    isLast: boolean;
    approverName?: string;
    compact: boolean;
    decidedByName?: string;
}) {
    const meta = WORKFLOW_STEP_STATUS_META[step.status] ?? {
        label: step.status,
        className: "bg-slate-100 text-slate-600",
    };
    const overdue =
        (step.status === "ACTIVE" || step.status === "ESCALATED") &&
        !!step.dueAt &&
        new Date(step.dueAt) <= new Date();

    const addressedTo =
        step.approverKind === "USER"
            ? approverName ?? "a named person"
            : step.approverRole
              ? `anyone holding ${step.approverRole}`
              : "nobody — this level is unassigned";

    return (
        <li className="flex gap-3">
            <div className="flex flex-col items-center">
                <Marker status={step.status} />
                {!isLast && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={cn("flex-1", compact ? "pb-4" : "pb-5")}>
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{step.name}</p>
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            meta.className,
                        )}
                    >
                        {meta.label}
                    </span>
                    {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            Past its deadline
                        </span>
                    )}
                    {step.actedViaDelegationId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                            Acted under a delegation
                        </span>
                    )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {addressedTo}
                    {step.dueAt && (step.status === "ACTIVE" || step.status === "ESCALATED")
                        ? ` · due ${new Date(step.dueAt).toLocaleString()}`
                        : ""}
                    {step.actedAt ? ` · decided ${new Date(step.actedAt).toLocaleString()}` : ""}
                </p>
                {step.comment && (
                    <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm">
                        “{step.comment}”
                    </p>
                )}
            </div>
        </li>
    );
}

function Marker({ status }: { status: WorkflowStep["status"] }) {
    const base =
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2";
    if (status === "APPROVED") {
        return (
            <span className={cn(base, "border-emerald-200 bg-emerald-100 text-emerald-700")}>
                <Check className="h-4 w-4" aria-hidden="true" />
            </span>
        );
    }
    if (status === "REJECTED") {
        return (
            <span className={cn(base, "border-red-200 bg-red-100 text-red-700")}>
                <X className="h-4 w-4" aria-hidden="true" />
            </span>
        );
    }
    if (status === "SKIPPED") {
        return (
            <span className={cn(base, "border-slate-200 bg-slate-100 text-slate-400")}>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
        );
    }
    if (status === "ESCALATED") {
        return (
            <span className={cn(base, "border-orange-200 bg-orange-100 text-orange-700")}>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
        );
    }
    if (status === "ACTIVE") {
        return (
            <span className={cn(base, "border-amber-300 bg-amber-100 text-amber-700")}>
                <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
        );
    }
    return (
        <span className={cn(base, "border-slate-200 bg-white text-slate-300")}>
            <Clock className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

/** The decisions taken, as a readable history rather than a log dump. */
export function ApprovalHistory({ instance }: { instance: WorkflowInstance }) {
    const events = [...(instance.events ?? [])].sort(
        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
    );

    if (events.length === 0) return null;

    return (
        <ol className="space-y-3">
            {events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden="true" />
                    <div>
                        <p>
                            <span className="font-medium">
                                {event.actorUser
                                    ? `${event.actorUser.firstName} ${event.actorUser.lastName}`
                                    : "The system"}
                            </span>
                            {event.onBehalfOfUser && (
                                <>
                                    {" "}
                                    acted for{" "}
                                    <span className="font-medium">
                                        {event.onBehalfOfUser.firstName}{" "}
                                        {event.onBehalfOfUser.lastName}
                                    </span>
                                </>
                            )}{" "}
                            · {new Date(event.createdAt).toLocaleString()}
                        </p>
                        {event.stepIndex !== null && event.stepIndex !== undefined && (
                            <p className="text-xs text-muted-foreground">
                                Level {event.stepIndex + 1}
                            </p>
                        )}
                        {event.comment && (
                            <p className="mt-1 rounded bg-slate-50 px-3 py-2 text-sm">
                                {event.comment}
                            </p>
                        )}
                    </div>
                </li>
            ))}
        </ol>
    );
}