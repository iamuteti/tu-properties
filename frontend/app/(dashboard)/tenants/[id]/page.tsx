'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft,
    Pencil,
    User,
    Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { AgreementStatusBadge } from '@/components/agreements/agreement-status-badge';
import { tenantsApi } from '@/lib/api';
import type { Agreement, Tenant } from '@/types';

const money = (amount: number | string | null | undefined) => {
    const n = Number(amount ?? 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (value: string | Date | null | undefined) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-GB');
};

const invoiceStatus = (status: string) => {
    const map: Record<string, string> = {
        PAID: 'bg-emerald-100 text-emerald-700',
        OVERDUE: 'bg-red-100 text-red-700',
        PARTIALLY_PAID: 'bg-amber-100 text-amber-800',
        PENDING: 'bg-blue-100 text-blue-700',
        DRAFT: 'bg-muted text-foreground',
        CANCELLED: 'bg-slate-100 text-slate-500',
    };
    return map[status] ?? 'bg-muted text-foreground';
};

const moveOutStatus = (status: string) => {
    const map: Record<string, string> = {
        PENDING: 'bg-amber-100 text-amber-800',
        APPROVED: 'bg-green-100 text-green-800',
        COMPLETED: 'bg-emerald-100 text-emerald-700',
        REJECTED: 'bg-red-100 text-red-700',
    };
    return map[status] ?? 'bg-muted text-foreground';
};

const workOrderStatus = (status: string) => {
    const map: Record<string, string> = {
        REQUESTED: 'bg-slate-100 text-slate-700',
        INSPECTION: 'bg-violet-100 text-violet-700',
        APPROVED: 'bg-blue-100 text-blue-700',
        ASSIGNED: 'bg-cyan-100 text-cyan-700',
        IN_PROGRESS: 'bg-amber-100 text-amber-800',
        COMPLETED: 'bg-emerald-100 text-emerald-700',
        CLOSED: 'bg-slate-800 text-white',
        CANCELLED: 'bg-muted text-muted-foreground',
    };
    return map[status] ?? 'bg-muted text-foreground';
};

const tenantRequestStatus = (status: string) => {
    const map: Record<string, string> = {
        PENDING: 'bg-amber-100 text-amber-800',
        APPROVED: 'bg-green-100 text-green-800',
        REJECTED: 'bg-red-100 text-red-700',
        WITHDRAWN: 'bg-slate-100 text-slate-700',
    };
    return map[status] ?? 'bg-muted text-foreground';
};

const creditNoteStatus = (status: string) => {
    const map: Record<string, string> = {
        ISSUED: 'bg-emerald-100 text-emerald-700',
        VOID: 'bg-red-100 text-red-700',
        DRAFT: 'bg-slate-100 text-slate-700',
    };
    return map[status] ?? 'bg-muted text-foreground';
};

/** A rental agreement has no fixed end date. The real end of tenancy comes from a
 * move-out request's moveoutDate; otherwise the tenancy is open-ended. A fixed-term
 * lease keeps its endDate. */
const agreementEndDate = (a: Agreement) => {
    if (a.agreementType === 'RENTAL') {
        const moveout = (a.moveOutRequests ?? []).find((m) => m.moveoutDate);
        return moveout?.moveoutDate ?? undefined;
    }
    return a.endDate;
};

export default function TenantDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    if (isLoading) return <LoadingState label="Loading tenant…" />;
    if (error || !tenant) {
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

    const agreements = tenant.agreements ?? [];
    const activeAgreement = agreements.find((a) => a.status === 'ACTIVE');
    const allInvoices = agreements.flatMap((a) => a.invoices ?? []);
    const totalInvoiced = allInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount ?? 0), 0);
    const totalPaid = allInvoices.reduce((sum, inv) => sum + Number(inv.paidAmount ?? 0), 0);
    const outstanding = allInvoices.reduce((sum, inv) => sum + Number(inv.balanceAmount ?? 0), 0);
    const openWorkOrders = (tenant.workOrders ?? []).filter(
        (w) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status),
    ).length;
    const pendingRequests = (tenant.tenantRequests ?? []).filter((r) => r.status === 'PENDING').length;

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
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
                            <StatusBadge status={tenant.status} />
                        </div>
                        <p className="text-muted-foreground">
                            {tenant.code}
                            {tenant.accountNumber ? ` · ${tenant.accountNumber}` : ''}
                            {tenant.email ? ` · ${tenant.email}` : ''}
                            {tenant.phone ? ` · ${tenant.phone}` : ''}
                        </p>
                        <p className="text-muted-foreground text-sm">
                            {tenant.tenantType ? `${tenant.tenantType} · ` : ''}
                            {tenant.gender ? `${tenant.gender} · ` : ''}
                            Member since {fmtDate(tenant.createdAt)}
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
            <div className="grid gap-4 md:grid-cols-5">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total agreements
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{agreements.length}</p>
                        <p className="text-sm text-muted-foreground">
                            {agreements.filter((a) => a.status === 'ACTIVE').length} active
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
                        <p className="text-2xl font-semibold">KES {money(totalInvoiced)}</p>
                        <p className="text-sm text-muted-foreground">
                            across {allInvoices.length} invoice(s)
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
                        <p className="text-2xl font-semibold">KES {money(totalPaid)}</p>
                        <p className="text-sm text-muted-foreground">toward invoices</p>
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
                                outstanding > 0 ? 'text-amber-700' : ''
                            }`}
                        >
                            KES {money(outstanding)}
                        </p>
                        <p className="text-sm text-muted-foreground">unpaid balance</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Open work orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{openWorkOrders}</p>
                        <p className="text-sm text-muted-foreground">
                            {pendingRequests} pending request(s)
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Details + Current tenancy */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-4 w-4" aria-hidden="true" />
                            Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Account number" value={tenant.accountNumber} />
                        <Detail label="Code" value={tenant.code} />
                        <Detail label="Phone" value={tenant.phone} />
                        <Detail label="Email" value={tenant.email} />
                        <Detail label="National ID / Reg No" value={tenant.idNoRegNo} />
                        <Detail label="Tax PIN" value={tenant.taxPin} />
                        <Detail label="Status" value={<StatusBadge status={tenant.status} />} />
                        <Detail label="County" value={tenant.county} />
                        <Detail label="Town" value={tenant.town} />
                        <Detail label="Occupation" value={tenant.occupation} />
                        <Detail label="Tenant type" value={tenant.tenantType} />
                        <Detail label="Gender" value={tenant.gender} />
                        <Detail label="Postal address" value={tenant.postalAddress} />
                        <Detail label="Postal code" value={tenant.postalCode} />
                        <Detail label="Country" value={tenant.country} />
                        <Detail label="Send mobile number" value={tenant.sendMobileNumber ? 'Yes' : 'No'} />
                        <Detail label="Created" value={fmtDate(tenant.createdAt)} />
                        <Detail label="Updated" value={fmtDate(tenant.updatedAt)} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Home className="h-4 w-4" aria-hidden="true" />
                            Current tenancy
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!activeAgreement ? (
                            <EmptyState
                                title="No active tenancy"
                                description="This tenant has no current lease or rental agreement."
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <Detail
                                    label="Agreement"
                                    value={
                                        <Link
                                            href={`/agreements/${activeAgreement.id}`}
                                            className="hover:underline"
                                        >
                                            {activeAgreement.code}
                                        </Link>
                                    }
                                />
                                <Detail label="Type" value={activeAgreement.agreementType ?? '—'} />
                                <Detail
                                    label="Status"
                                    value={
                                        <AgreementStatusBadge
                                            status={activeAgreement.status as
                                                | 'DRAFT'
                                                | 'ACTIVE'
                                                | 'EXPIRED'
                                                | 'TERMINATED'
                                                | 'RENEWED'}
                                        />
                                    }
                                />
                                <Detail
                                    label="Unit"
                                    value={
                                        activeAgreement.unit ? (
                                            <Link
                                                href={`/units/${activeAgreement.unit.id}`}
                                                className="hover:underline"
                                            >
                                                {activeAgreement.unit.name}
                                            </Link>
                                        ) : (
                                            '—'
                                        )
                                    }
                                />
                                <Detail
                                    label="Property"
                                    value={
                                        activeAgreement.unit?.property ? (
                                            <Link
                                                href={`/properties/${activeAgreement.unit.property.id}`}
                                                className="hover:underline"
                                            >
                                                {activeAgreement.unit.property.name}
                                            </Link>
                                        ) : (
                                            '—'
                                        )
                                    }
                                />
                                <Detail
                                    label="Rent"
                                    value={`${activeAgreement.currency ?? 'KES'} ${money(activeAgreement.rentAmount)}`}
                                />
                                <Detail label="Payment day" value={String(activeAgreement.paymentDay ?? '—')} />
                                <Detail
                                    label="Term"
                                    value={`${fmtDate(activeAgreement.startDate)} → ${
                                        agreementEndDate(activeAgreement)
                                            ? fmtDate(agreementEndDate(activeAgreement))
                                            : 'N/A'
                                    }`}
                                />
                                <Detail
                                    label="Security deposit"
                                    value={`${activeAgreement.currency ?? 'KES'} ${money(activeAgreement.securityDeposit ?? 0)}`}
                                />
                                <Detail
                                    label="Balance"
                                    value={
                                        activeAgreement.invoices?.length
                                            ? `${activeAgreement.currency ?? 'KES'} ${money(
                                                  activeAgreement.invoices.reduce(
                                                    (s, inv) => s + Number(inv.balanceAmount ?? 0),
                                                    0,
                                                  ),
                                              )}`
                                            : '—'
                                    }
                                />
                                {activeAgreement.noticePeriodDays && (
                                    <Detail label="Notice period" value={`${activeAgreement.noticePeriodDays} days`} />
                                )}
                                {activeAgreement.escalationRate && (
                                    <Detail label="Escalation rate" value={`${activeAgreement.escalationRate}%`} />
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Tenancy history */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tenancy history</CardTitle>
                </CardHeader>
                <CardContent>
                    {agreements.length === 0 ? (
                        <EmptyState
                            title="No tenancy history"
                            description="This tenant has never signed a lease or rental agreement."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Agreement</th>
                                        <th className="py-2 pr-3">Unit / Property</th>
                                        <th className="py-2 pr-3">Type</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 pr-3">Term</th>
                                        <th className="py-2 pr-3">Rent</th>
                                        <th className="py-2 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agreements.map((a) => (
                                        <tr key={a.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap font-medium">
                                                <Link href={`/agreements/${a.id}`} className="hover:underline">
                                                    {a.code}
                                                </Link>
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span className="font-medium">{a.unit?.name ?? '—'}</span>
                                                <br />
                                                <span className="text-xs text-muted-foreground">
                                                    {a.unit?.property?.name ?? '—'}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3">{a.agreementType ?? '—'}</td>
                                            <td className="py-2 pr-3">
                                                <AgreementStatusBadge
                                                    status={a.status as
                                                        | 'DRAFT'
                                                        | 'ACTIVE'
                                                        | 'EXPIRED'
                                                        | 'TERMINATED'
                                                        | 'RENEWED'}
                                                />
                                            </td>
                                            <td className="py-2 pr-3">
                                                {fmtDate(a.startDate)} →{' '}
                                                {agreementEndDate(a)
                                                    ? fmtDate(agreementEndDate(a))
                                                    : 'N/A'}
                                            </td>
                                            <td className="py-2 pr-3">
                                                {a.currency ?? 'KES'} {money(a.rentAmount)}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {a.invoices?.length
                                                    ? money(
                                                          a.invoices.reduce(
                                                            (s, inv) => s + Number(inv.balanceAmount ?? 0),
                                                            0,
                                                        ),
                                                  )
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Financial: invoices + receipts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Invoices</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {allInvoices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No invoices found for this tenant.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                                <th className="py-2 pr-3">Invoice</th>
                                                <th className="py-2 pr-3">Agreement</th>
                                                <th className="py-2 pr-3">Due date</th>
                                                <th className="py-2 pr-3">Status</th>
                                                <th className="py-2 text-right">Amount</th>
                                                <th className="py-2 text-right">Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allInvoices.slice(0, 20).map((inv) => (
                                                <tr key={inv.id} className="border-b last:border-0">
                                                    <td className="py-2 pr-3 font-medium">
                                                        {inv.invoiceNumber}
                                                    </td>
                                                    <td className="py-2 pr-3 text-muted-foreground">
                                                        {inv.AgreementId ? 'Lease #' + inv.AgreementId : '—'}
                                                    </td>
                                                    <td className="py-2 pr-3 whitespace-nowrap">
                                                        {fmtDate(inv.dueDate)}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${invoiceStatus(inv.status)}`}
                                                        >
                                                            {inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {money(inv.totalAmount)}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {money(inv.balanceAmount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {allInvoices.length > 20 && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Showing 20 of {allInvoices.length} invoices.
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Receipts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(tenant.receipts ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No receipts found for this tenant.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                                <th className="py-2 pr-3">Receipt</th>
                                                <th className="py-2 pr-3">Method</th>
                                                <th className="py-2 pr-3">Date</th>
                                                <th className="py-2 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(tenant.receipts ?? []).slice(0, 20).map((r) => (
                                                <tr key={r.id} className="border-b last:border-0">
                                                    <td className="py-2 pr-3 font-medium">{r.receiptId}</td>
                                                    <td className="py-2 pr-3 text-muted-foreground">
                                                        {r.paymentMethod}
                                                    </td>
                                                    <td className="py-2 pr-3 whitespace-nowrap">
                                                        {fmtDate(r.recordingDate)}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {money(r.amountReceived)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {(tenant.receipts ?? []).length > 20 && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Showing 20 of {(tenant.receipts ?? []).length} receipts.
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Emergency contacts */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Emergency contacts</CardTitle>
                </CardHeader>
                <CardContent>
                    {(tenant.emergencyContacts ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No emergency contacts on file.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {(tenant.emergencyContacts ?? []).map((c) => (
                                <div
                                    key={c.id}
                                    className="flex items-center justify-between gap-4 p-3 bg-muted rounded-lg"
                                >
                                    <div>
                                        <p className="font-medium">{c.contactName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {c.relationship ?? '—'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium">{c.phone ?? '—'}</p>
                                        {c.email && (
                                            <p className="text-xs text-muted-foreground">{c.email}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Move-out requests */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Move-out requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {(tenant.moveOutRequests ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No move-out requests on file.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {(tenant.moveOutRequests ?? []).map((m) => (
                                <div key={m.id} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-medium">
                                            Moving out on {fmtDate(m.moveoutDate)}
                                        </span>
                                        <span
                                            className={`text-xs font-medium rounded-full px-2 py-0.5 ${moveOutStatus(m.status)}`}
                                        >
                                            {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
                                        </span>
                                    </div>
                                    {m.depositRefundAmount && (
                                        <p className="text-sm text-muted-foreground">
                                            Deposit refund: KES {money(m.depositRefundAmount)}
                                        </p>
                                    )}
                                    {(m.deductions ?? []).length > 0 && (
                                        <div className="mt-3">
                                            <p className="text-xs text-muted-foreground mb-1">
                                                Deductions
                                            </p>
                                            <ul className="space-y-1 text-sm">
                                                {(m.deductions ?? []).map((d) => (
                                                    <li key={d.id} className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            {d.category}
                                                        </span>
                                                        <span className="tabular-nums">-{money(d.amount)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {m.notes && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {m.notes}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Tenant requests */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Tenant requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {(tenant.tenantRequests ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No tenant requests on file.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {(tenant.tenantRequests ?? []).map((r) => (
                                <div key={r.id} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-medium">{r.type}</span>
                                        <span
                                            className={`text-xs font-medium rounded-full px-2 py-0.5 ${tenantRequestStatus(r.status)}`}
                                        >
                                            {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Created {fmtDate(r.createdAt)}
                                    </p>
                                    {r.decidedAt && (
                                        <p className="text-sm text-muted-foreground">
                                            Decided on {fmtDate(r.decidedAt)}
                                        </p>
                                    )}
                                    {r.decisionNote && (
                                        <p className="mt-1 text-sm">{r.decisionNote}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Work orders */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Work orders reported</CardTitle>
                </CardHeader>
                <CardContent>
                    {(tenant.workOrders ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No work orders reported by this tenant.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {(tenant.workOrders ?? []).slice(0, 10).map((w) => (
                                <div key={w.id} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-medium">{w.title}</span>
                                        <span
                                            className={`text-xs font-medium rounded-full px-2 py-0.5 ${workOrderStatus(w.status)}`}
                                        >
                                            {w.status
                                                .charAt(0)
                                                + w.status.slice(1).toLowerCase().replace('_', ' ')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {w.category} · {w.priority}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Reported {fmtDate(w.reportedAt)}
                                    </p>
                                    {w.completedAt && (
                                        <p className="text-sm text-muted-foreground">
                                            Completed {fmtDate(w.completedAt)}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Access cards, facility bookings, visitor visits */}
            <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Access cards</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(tenant.accessCards ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No access cards issued.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {(tenant.accessCards ?? []).map((c) => (
                                    <li key={c.id} className="text-sm border p-3 rounded">
                                        <p className="font-medium">{c.cardNumber}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {c.type} · {c.effectiveStatus}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Facility bookings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(tenant.facilityBookings ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No facility bookings.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {(tenant.facilityBookings ?? []).slice(0, 10).map((b) => (
                                    <li key={b.id} className="text-sm border p-3 rounded">
                                        <p className="font-medium">{b.bookedForName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {fmtDate(b.startsAt)} → {fmtDate(b.endsAt)} ·{' '}
                                            {b.statusLabel ?? b.status}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Visitor visits</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(tenant.visitorVisits ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No visitor visits on file.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {(tenant.visitorVisits ?? []).slice(0, 10).map((v) => (
                                    <li key={v.id} className="text-sm border p-3 rounded">
                                        <p className="font-medium">{v.visitorName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {v.stateLabel ?? v.state}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Credit notes */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Credit notes</CardTitle>
                </CardHeader>
                <CardContent>
                    {(tenant.creditNotes ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No credit notes on file.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Note number</th>
                                        <th className="py-2 pr-3">Issue date</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(tenant.creditNotes ?? []).map((c) => (
                                        <tr key={c.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 font-medium">
                                                {c.creditNoteNumber}
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {fmtDate(c.issueDate)}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${creditNoteStatus(c.status)}`}
                                                >
                                                    {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {money(c.totalAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string | React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {typeof value === 'string' ? (
                <p className="font-medium break-words">{value || '—'}</p>
            ) : (
                <div className="font-medium">{value}</div>
            )}
        </div>
    );
}

