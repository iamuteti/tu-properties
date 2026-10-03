"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { ChevronLeft, Plus } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { useContacts } from "@/hooks/use-contacts";
import { useUsers } from "@/hooks/use-users";
import { salesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/entity-states";
import { SaleForm, type SaleFormValues } from "@/components/sales/sale-form";

function NewSaleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { properties } = useProperties({ limit: 500, includeArchived: true });
    const { contacts } = useContacts({ limit: 500, type: 'BUYER' });
    const { users } = useUsers();

    const [propertyId, setPropertyId] = useState(searchParams?.get('propertyId') ?? '');
    const [contactId, setContactId] = useState('');
    const [agentId, setAgentId] = useState('');

    const propertyOptions = useMemo(
        () => properties.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` })),
        [properties],
    );
    const contactOptions = useMemo(
        () =>
            contacts.map((c) => ({
                id: c.id,
                label: `${c.firstName} ${c.lastName}${c.email ? ` · ${c.email}` : ''}`,
            })),
        [contacts],
    );
    const agentOptions = useMemo(
        () =>
            users.map((u) => ({
                id: u.id,
                label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
            })),
        [users],
    );

    async function handleSubmit(values: SaleFormValues) {
        await salesApi.createSale({
            propertyId,
            buyerContactId: contactId || null,
            agentUserId: agentId || null,
            ...values,
        } as never);
        toast.success('Sale opened at Quotation');
        router.push('/sales');
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
                        <Plus className="h-5 w-5" aria-hidden="true" />
                        Open a sale
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        A property can only have one open sale at a time.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <SaleForm
                    mode="create"
                    requireProperty
                    propertyId={propertyId}
                    onPropertyChange={setPropertyId}
                    propertyOptions={propertyOptions}
                    contactId={contactId}
                    onContactChange={setContactId}
                    contactOptions={contactOptions}
                    agentId={agentId}
                    onAgentChange={setAgentId}
                    agentOptions={agentOptions}
                    onSubmit={handleSubmit}
                    onCancel={() => router.push('/sales')}
                />
            </div>
        </div>
    );
}

export default function NewSalePage() {
    return (
        <Suspense fallback={<LoadingState label="Loading form…" />}>
            <NewSaleContent />
        </Suspense>
    );
}