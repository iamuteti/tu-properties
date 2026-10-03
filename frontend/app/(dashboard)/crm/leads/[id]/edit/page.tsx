"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { useUsers } from "@/hooks/use-users";
import { crmApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { LeadForm, type LeadFormValues } from "@/components/crm/lead-form";
import type { Lead } from "@/types";

export default function EditLeadPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [lead, setLead] = useState<Lead | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { properties } = useProperties({ limit: 500 });
    const { users } = useUsers();

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

    const propertyOptions = useMemo(
        () => properties.map((p) => ({ id: p.id, name: p.name, code: p.code })),
        [properties],
    );
    const agentOptions = useMemo(
        () =>
            users.map((u) => ({
                id: u.id,
                label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
            })),
        [users],
    );

    async function handleSubmit(
        values: LeadFormValues & { interestedPropertyId?: string | null; assignedAgentId?: string | null },
    ) {
        if (!id) return;
        await crmApi.updateLead(id, values);
        toast.success("Lead updated");
        router.push(`/crm/leads/${id}`);
        router.refresh();
    }

    if (isLoading) return <LoadingState label="Loading lead…" />;
    if (error) return <ErrorState message={error} onRetry={loadLead} />;
    if (!lead || !id) return <ErrorState message="Lead not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/crm/leads/${id}`)}
                    aria-label="Back to lead"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Edit {lead.firstName} {lead.lastName ?? ""}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        The pipeline stage is not edited here — use the stage actions on the lead page
                        so the server can validate the move.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <LeadForm
                    mode="edit"
                    initial={lead}
                    properties={propertyOptions}
                    agents={agentOptions}
                    submitLabel="Save changes"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push(`/crm/leads/${id}`)}
                />
            </div>
        </div>
    );
}