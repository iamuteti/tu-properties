"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, UserPlus } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { useUsers } from "@/hooks/use-users";
import { crmApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/entity-states";
import { LeadForm, type LeadFormValues } from "@/components/crm/lead-form";

function NewLeadContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const propertyId = searchParams?.get("propertyId") ?? undefined;
    const { properties } = useProperties({ limit: 500 });
    const { users } = useUsers();

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
        await crmApi.createLead(values);
        toast.success("Lead added");
        router.push("/crm/leads");
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <UserPlus className="h-5 w-5" aria-hidden="true" />
                        Add lead
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Capture it now — the details can be completed later.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <LeadForm
                    mode="create"
                    properties={propertyOptions}
                    agents={agentOptions}
                    defaultPropertyId={propertyId}
                    onSubmit={handleSubmit}
                    onCancel={() => router.push("/crm/leads")}
                />
            </div>
        </div>
    );
}

export default function NewLeadPage() {
    return (
        <Suspense fallback={<LoadingState label="Loading form…" />}>
            <NewLeadContent />
        </Suspense>
    );
}