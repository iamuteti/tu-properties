"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { workflowsApi } from "@/lib/api";
import type { WorkflowInstance } from "@/types";

/**
 * Approve or reject a level, with the note the other side will read.
 *
 * A rejection cannot be submitted without one — the API refuses it, and it
 * should be refused: "rejected" with no reason is the most useless thing an
 * approval system can produce for the person who has to act on the answer.
 *
 * A note on an approval is optional but kept on the record either way, so
 * "approved" is never the only thing written down about a money decision.
 */
export function ApprovalDecision({
    instanceId,
    onDecided,
    entityLabel,
}: {
    instanceId: string;
    onDecided?: (instance: WorkflowInstance) => void;
    entityLabel?: string;
}) {
    const [decision, setDecision] = useState<"APPROVE" | "REJECT" | null>(null);
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (decision === "REJECT" && !comment.trim()) {
            toast.error("Say why it is being rejected — that is what the requester reads.");
            return;
        }
        setBusy(true);
        try {
            const instance = (await workflowsApi.decide(
                instanceId,
                decision as "APPROVE" | "REJECT",
                comment.trim() || undefined,
            )).data;
            toast.success(
                decision === "APPROVE" ? "Approved" : "Rejected",
                {
                    description:
                        decision === "APPROVE"
                            ? instance.status === "APPROVED"
                                ? "That was the last level — the request is complete."
                                : "It has moved to the next level."
                            : "The requester has been told.",
                },
            );
            setDecision(null);
            setComment("");
            onDecided?.(instance);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "The decision was refused.");
        } finally {
            setBusy(false);
        }
    };

    if (!decision) {
        return (
            <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => setDecision("APPROVE")}>
                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Approve
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDecision("REJECT")}
                >
                    <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Reject
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3 rounded-md border bg-muted/30 p-4 sm:w-96">
            <p className="text-sm font-medium">
                {decision === "APPROVE" ? "Approve" : "Reject"}
                {entityLabel ? ` — ${entityLabel}` : ""}
            </p>
            <div>
                <label
                    htmlFor={`note-${instanceId}`}
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                    Note {decision === "REJECT" ? "(required)" : "(optional)"}
                </label>
                <textarea
                    id={`note-${instanceId}`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder={
                        decision === "APPROVE"
                            ? "What you checked, or anything the next level should know."
                            : "Why this is being rejected."
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
            </div>
            <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={submit}>
                    {busy ? "Saving…" : decision === "APPROVE" ? "Confirm approval" : "Confirm rejection"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                        setDecision(null);
                        setComment("");
                    }}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}