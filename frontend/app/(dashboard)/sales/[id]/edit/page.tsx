"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { useContacts } from "@/hooks/use-contacts";
import { useUsers } from "@/hooks/use-users";
import { salesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { SaleForm, type SaleFormValues } from "@/components/sales/sale-form";
import type { Sale } from "@/types";

export default function EditSalePage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [buyerId, setBuyerId] = useState('');
    const [agentId, setAgentId] = useState('');

    const { properties } = useProperties({ limit: 500, includeArchived: true });
    const { contacts } = useContacts({ limit: 500 });
    const { users } = useUsers();

    const loadSale = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await salesApi.findSale(id);
            setSale(response.data);
            setBuyerId(response.data.buyerContactId ?? '');
            setAgentId(response.data.agentUserId ?? '');
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? 'Sale not found. It may have been deleted.'
                    : err.response?.data?.message || 'Failed to load the sale.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadSale();
    }, [loadSale]);

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
        if (!id) return;
        await salesApi.updateSale(id, {
            ...values,
            buyerContactId: buyerId || null,
            agentUserId: agentId || null,
        } as never);
        toast.success('Sale updated');
        router.push(`/sales/${id}`);
        router.refresh();
    }

    if (isLoading) return <LoadingState label="Loading sale…" />;
    if (error) return <ErrorState message={error} onRetry={loadSale} />;
    if (!sale || !id) return <ErrorState message="Sale not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/sales/${id}`)}
                    aria-label="Back to sale"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Edit {sale.code}</h1>
                    <p className="text-sm text-muted-foreground">
                        The stage is not edited here — move the sale from its detail page so the
                        server can validate the step.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <SaleForm
                    mode="edit"
                    initial={sale}
                    propertyId={sale.propertyId}
                    propertyOptions={propertyOptions}
                    contactId={buyerId}
                    onContactChange={setBuyerId}
                    contactOptions={contactOptions}
                    agentId={agentId}
                    onAgentChange={setAgentId}
                    agentOptions={agentOptions}
                    submitLabel="Save changes"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push(`/sales/${id}`)}
                />
            </div>
        </div>
    );
}