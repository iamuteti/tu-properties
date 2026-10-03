"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ExternalLink, Pencil, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { LeadStageBadge } from "@/components/crm/lead-stage-badge";
import { LeadStageActions } from "@/components/crm/lead-stage-actions";
import { ConvertLeadDialog } from "@/components/crm/convert-lead-dialog";
import { CommunicationTimeline } from "@/components/crm/communication-timeline";
import { crmApi } from "@/lib/api";
import type { Lead } from "@/types";

export default function LeadDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [lead, setLead] = useState<Lead | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [isConvertOpen, setIsConvertOpen] = useState(false);

    const loadLead = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await crmApi.findLead(id);
            setLead(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Lead not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the lead.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLead();
    }, [loadLead]);

    const handleDelete = async () => {
        if (!lead) return;
        if (!confirm(`Delete the lead for ${lead.firstName} ${lead.lastName ?? ""}?`)) return;
        setIsBusy(true);
        try {
            await crmApi.removeLead(lead.id);
            toast.success("Lead deleted");
            router.push("/crm/leads");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete the lead.");
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading lead…" />;
    if (error || !lead) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/crm/leads")}
                    aria-label="Back to leads"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Lead not found."} onRetry={loadLead} />
            </div>
        );
    }

    const terminal = lead.stage === "WON" || lead.stage === "LOST";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/crm/leads")}
                        aria-label="Back to leads"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {lead.firstName} {lead.lastName ?? ""}
                            </h1>
                            <LeadStageBadge stage={lead.stage} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Captured {new Date(lead.createdAt).toLocaleDateString()} via{" "}
                            {lead.source.replace(/_/g, " ").toLowerCase()}
                            {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => router.push(`/crm/leads/${lead.id}/edit`)} disabled={isBusy}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button
                        onClick={() => setIsConvertOpen(true)}
                        disabled={isBusy || Boolean(lead.contactId) || lead.stage === "LOST"}
                        title={
                            lead.contactId
                                ? "Already converted"
                                : lead.stage === "LOST"
                                  ? "Reopen the lead before converting"
                                  : undefined
                        }
                    >
                        <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        {lead.contactId ? "Converted" : "Convert to contact"}
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Enquiry</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Email" value={lead.email} />
                        <Detail label="Phone" value={lead.phone} />
                        <Detail label="Source" value={lead.source.replace(/_/g, " ")} />
                        <Detail label="Assigned agent" value={lead.assignedAgent ? `${lead.assignedAgent.firstName} ${lead.assignedAgent.lastName}` : undefined} />
                        <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Interested in</p>
                            {lead.interestedProperty ? (
                                <Link
                                    href={`/properties/${lead.interestedProperty.id}`}
                                    className="inline-flex items-center gap-1 font-medium hover:underline"
                                >
                                    {lead.interestedProperty.name}
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </Link>
                            ) : (
                                <p className="font-medium">Not specific yet</p>
                            )}
                        </div>
                        {lead.lostReason && (
                            <div className="col-span-2 rounded-md bg-red-50 px-3 py-2 text-red-700">
                                <p className="text-xs font-medium">Lost because</p>
                                <p className="text-sm">{lead.lostReason}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>What they are asking for</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {lead.message || "No message captured."}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Stage changes are validated by the server: a lead can only be marked won once it
                        has been converted, and a lost lead needs a reason.
                    </p>
                    <LeadStageActions lead={lead} onChanged={loadLead} />
                    {lead.contact && (
                        <div className="mt-4 rounded-md border bg-green-50 px-3 py-2 text-sm">
                            Converted to contact{' '}
                            <Link href={`/crm/contacts/${lead.contact.id}`} className="font-medium underline">
                                {lead.contact.firstName} {lead.contact.lastName}
                            </Link>{' '}
                            <StatusBadge status={lead.contact.type} />
                            {lead.convertedAt && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                    on {new Date(lead.convertedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Communication history</CardTitle>
                </CardHeader>
                <CardContent>
                    <CommunicationTimeline
                        entries={lead.communications ?? []}
                        leadId={lead.id}
                        contactId={lead.contactId ?? undefined}
                        onLogged={loadLead}
                        onDeleted={loadLead}
                        emptyHint={
                            terminal
                                ? "This lead was closed before any communication was logged."
                                : "Calls, emails, WhatsApp messages, meetings and notes appear here newest first."
                        }
                    />
                </CardContent>
            </Card>

            {isConvertOpen && (
                <ConvertLeadDialog
                    lead={lead}
                    isOpen={isConvertOpen}
                    onClose={() => setIsConvertOpen(false)}
                    onConverted={async (contactId) => {
                        setIsConvertOpen(false);
                        await loadLead();
                        toast.success("You can now view the contact.");
                        router.push(`/crm/contacts/${contactId}`);
                    }}
                />
            )}
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium break-words">{value || "—"}</p>
        </div>
    );
}