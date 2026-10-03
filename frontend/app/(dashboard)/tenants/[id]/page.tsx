"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { AgreementStatusBadge } from "@/components/leases/agreement-status-badge";
import { tenantsApi } from "@/lib/api";
import type { Tenant } from "@/types";

/**
 * Tenant profile: who they are, which contacts they share, and their tenancy
 * history with links into each lease.
 */
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
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Tenant not found."
                    : err.response?.data?.message || "Failed to load the tenant.",
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
                    onClick={() => router.push("/tenants")}
                    aria-label="Back to tenants"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Tenant not found."} onRetry={load} />
            </div>
        );
    }

    const lease = (tenant as any).rentalAgreement;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/tenants")}
                        aria-label="Back to tenants"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {`${tenant.surname} ${tenant.otherNames ?? ""}`.trim()}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tenant.code}
                            {tenant.accountNumber && ` · ${tenant.accountNumber}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/tenants/${tenant.id}/edit`)}
                    >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    {tenant.contactId && (
                        <Button
                            variant="outline"
                            onClick={() => router.push(`/crm/contacts/${tenant.contactId}`)}
                        >
                            Contact record
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Phone" value={tenant.phone} />
                        <Detail label="Email" value={tenant.email} />
                        <Detail label="National ID" value={tenant.idNoRegNo} />
                        <Detail label="Tax PIN" value={tenant.taxPin} />
                        <Detail label="Status" value={tenant.status} />
                        <Detail label="County" value={tenant.county} />
                        <Detail label="Town" value={tenant.town} />
                        <Detail label="Occupation" value={tenant.occupation} />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Current tenancy</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!lease ? (
                            <EmptyState
                                title="No lease on file"
                                description="This tenant has no current tenancy."
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <Detail
                                    label="Lease"
                                    value={
                                        <Link
                                            href={`/rental-agreements/${lease.id}`}
                                            className="hover:underline"
                                        >
                                            {lease.code ?? "Draft lease"}
                                        </Link>
                                    }
                                />
                                <Detail label="Status" value={<AgreementStatusBadge status={lease.status} />} />
                                <Detail
                                    label="Unit"
                                    value={
                                        <Link
                                            href={`/units/${lease.unitId}`}
                                            className="hover:underline"
                                        >
                                            {lease.unit?.name ?? "—"}
                                        </Link>
                                    }
                                />
                                <Detail
                                    label="Rent"
                                    value={`${lease.currency} ${Number(lease.rentAmount).toLocaleString()}`}
                                />
                                <Detail
                                    label="Term"
                                    value={`${new Date(lease.startDate).toLocaleDateString()} → ${
                                        lease.endDate
                                            ? new Date(lease.endDate).toLocaleDateString()
                                            : "open-ended"
                                    }`}
                                />
                                <Detail
                                    label="Balance"
                                    value={`${lease.currency} ${Number(
                                        lease.balance ?? 0,
                                    ).toLocaleString()}`}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {typeof value === "string" || value === undefined ? (
                <p className="font-medium break-words">{value || "—"}</p>
            ) : (
                <div className="font-medium">{value}</div>
            )}
        </div>
    );
}