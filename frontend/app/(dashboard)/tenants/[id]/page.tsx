'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { tenantsApi } from '@/lib/api';
import type { Receipt, Tenant } from '@/types';
import { ReceiptDetailModal } from '@/components/tenants/receipt-detail-modal';
import { TenantOverviewSection } from '@/components/tenants/tenant-overview';
import { TenantFinancialSection } from '@/components/tenants/tenant-financial';
import { TenantUtilitiesSection } from '@/components/tenants/tenant-utilities';
import { TenantHistorySection } from '@/components/tenants/tenant-history';
import { TenantServiceSection } from '@/components/tenants/tenant-service';
import { useOrgFormat } from '@/hooks/use-org-format';

/**
 * The resident file.
 *
 * One page for everything about one person, because that is how the questions
 * arrive: "did they pay?", "how much do they owe?", "why is there a hole in
 * their water bill?", "what did they report last month?" — and each of those was
 * a different screen, or on a screen that had never heard of the module that
 * held the answer.
 *
 * The tabs are not a navigation gimmick; they are the five questions this page
 * answers, in the order somebody asks them.
 */
export default function TenantDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const fmt = useOrgFormat();

    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await tenantsApi.findOne(id);
            setTenant(response.data);
        } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { message?: string } } };
            setError(
                e.response?.status === 404
                    ? 'Tenant not found.'
                    : e.response?.data?.message || 'Failed to load the tenant.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const data = useMemo(() => {
        if (!tenant) return null;
        const agreements = tenant.agreements ?? [];
        const receipts = tenant.receipts ?? [];
        const invoices = agreements.flatMap((a) => a.invoices ?? []);
        const utilityCharges = agreements.flatMap((a) => a.utilityCharges ?? []);
        const requests = tenant.requests ?? [];
        const workOrders = tenant.workOrders ?? [];
        return {
            agreements,
            receipts,
            invoices,
            utilityCharges,
            requests,
            workOrders,
            // The currency this file's money is in, taken from the records
            // themselves. A tenant's agreements, invoices and receipts each
            // carry their own currency, and the headline figures below add them
            // up — so the figure has to say which currency it is in, and that
            // answer comes from the data, never from a constant.
            currency: fmt.resolve([
                ...agreements.map((a) => a.currency),
                ...invoices.map((i) => i.currency),
                ...receipts.map((r) => r.currency),
            ]),
            totalInvoiced: invoices.reduce((s, inv) => s + Number(inv.totalAmount ?? 0), 0),
            totalPaid: invoices.reduce((s, inv) => s + Number(inv.paidAmount ?? 0), 0),
            outstanding: invoices.reduce((s, inv) => s + Number(inv.balanceAmount ?? 0), 0),
            utilitiesBilled: utilityCharges
                .filter((c) => c.status === 'INVOICED' && c.invoiceId)
                .reduce((s, c) => s + Number(c.pricing?.total ?? 0), 0),
            openWorkOrders: workOrders.filter(
                (w) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status),
            ).length,
            pendingRequests: requests.filter((r) => r.status === 'PENDING').length,
        };
    }, [tenant, fmt]);

    if (isLoading) return <LoadingState label="Loading tenant…" />;
    if (error || !tenant || !data) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/tenants')}
                    aria-label="Back to tenants"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || 'Tenant not found.'} onRetry={load} />
            </div>
        );
    }

    const name = `${tenant.surname} ${tenant.otherNames ?? ''}`.trim();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/tenants')}
                        aria-label="Back to tenants"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
                            <StatusBadge status={tenant.status} />
                        </div>
                        <p className="text-muted-foreground">
                            {tenant.code}
                            {tenant.accountNumber ? ` · ${tenant.accountNumber}` : ''}
                            {tenant.email ? ` · ${tenant.email}` : ''}
                            {tenant.phone ? ` · ${tenant.phone}` : ''}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => router.push(`/tenants/${tenant.id}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    {tenant.contactId && (
                        <Button
                            variant="outline"
                            onClick={() => router.push(`/crm/contacts/${tenant.contactId}`)}
                        >
                            <User className="mr-2 h-4 w-4" aria-hidden="true" />
                            Contact record
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Agreements
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{data.agreements.length}</p>
                        <p className="text-sm text-muted-foreground">
                            {data.agreements.filter((a) => a.status === 'ACTIVE').length} active
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Invoiced
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(data.totalInvoiced, data.currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            {data.invoices.length} invoice(s)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Paid
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(data.totalPaid, data.currency)}</p>
                        <p className="text-sm text-muted-foreground">settled on invoices</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Outstanding
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p
                            className={`text-2xl font-semibold ${
                                data.outstanding > 0 ? 'text-amber-700' : ''
                            }`}
                        >
                            {fmt.money(data.outstanding, data.currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">unpaid balance</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Utilities billed
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(data.utilitiesBilled, data.currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            {data.utilityCharges.length} metered charge(s)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Open work orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{data.openWorkOrders}</p>
                        <p className="text-sm text-muted-foreground">
                            {data.pendingRequests} pending request(s)
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* The file */}
            <Tabs defaultValue="overview">
                <TabsList className="flex-wrap">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="financial">
                        Financial
                        <span className="ml-2 text-xs text-muted-foreground">
                            {data.invoices.length}/{data.receipts.length}
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="utilities">
                        Utilities
                        <span className="ml-2 text-xs text-muted-foreground">
                            {data.utilityCharges.length}
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        History
                        <span className="ml-2 text-xs text-muted-foreground">
                            {data.agreements.length}
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="service">
                        Requests &amp; access
                        <span className="ml-2 text-xs text-muted-foreground">
                            {data.workOrders.length}
                        </span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <TenantOverviewSection tenant={tenant} agreements={data.agreements} />
                </TabsContent>

                <TabsContent value="financial">
                    <TenantFinancialSection
                        agreements={data.agreements}
                        receipts={data.receipts}
                        creditNotes={tenant.creditNotes ?? []}
                        credits={tenant.credits ?? []}
                        currency={data.currency}
                        onViewReceipt={setActiveReceipt}
                    />
                </TabsContent>

                <TabsContent value="utilities">
                    <TenantUtilitiesSection
                        agreements={data.agreements}
                        currency={data.currency}
                    />
                </TabsContent>

                <TabsContent value="history">
                    <TenantHistorySection
                        agreements={data.agreements}
                        moveOutRequests={tenant.moveOutRequests ?? []}
                    />
                </TabsContent>

                <TabsContent value="service">
                    <TenantServiceSection
                        agreements={data.agreements}
                        emergencyContacts={tenant.emergencyContacts ?? []}
                        requests={data.requests}
                        notifications={tenant.notifications ?? []}
                        workOrders={data.workOrders}
                        facilityBookings={tenant.facilityBookings ?? []}
                        accessCards={tenant.accessCards ?? []}
                        visitorVisits={tenant.visitorVisits ?? []}
                    />
                </TabsContent>
            </Tabs>

            <ReceiptDetailModal
                receipt={activeReceipt}
                tenantId={tenant.id}
                isOpen={activeReceipt !== null}
                onClose={() => setActiveReceipt(null)}
            />
        </div>
    );
}
