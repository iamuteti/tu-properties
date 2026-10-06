"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, FileText, History, Pencil, RefreshCw, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { UnitStatusActions } from "@/components/units/unit-status-actions";
import { leasesApi, unitsApi } from "@/lib/api";
import type { OccupancyHistory, Unit } from "@/types";

export default function UnitDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [unit, setUnit] = useState<Unit | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [history, setHistory] = useState<OccupancyHistory | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const loadUnit = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await unitsApi.findOne(id);
            setUnit(response.data);

            // Occupancy history (Module 5) — every tenancy plus the vacant gaps.
            try {
                const occupancy = await leasesApi.occupancyHistory(id);
                setHistory(occupancy.data);
                setHistoryError(null);
            } catch (historyErr: any) {
                setHistory(null);
                setHistoryError(
                    historyErr.response?.data?.message || "Could not load occupancy history.",
                );
            }
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Unit not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the unit.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadUnit();
    }, [loadUnit]);

    const handleDelete = async () => {
        if (!unit) return;
        if (!confirm(`Delete ${unit.name}? This cannot be undone.`)) return;
        setIsBusy(true);
        try {
            await unitsApi.remove(unit.id);
            toast.success("Unit deleted");
            router.push(unit.propertyId ? `/properties/${unit.propertyId}` : "/units");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete the unit.");
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading unit…" />;
    if (error || !unit) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" size="icon" onClick={() => router.push("/units")} aria-label="Back to units">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Unit not found."} onRetry={loadUnit} />
            </div>
        );
    }

    const agreements = unit.rentalAgreements ?? [];
    const invoices = (agreements.flatMap((agreement: any) => agreement.invoices ?? []) ?? []) as Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        dueDate: string;
        balanceAmount: number | string;
        currency?: string;
    }>;
    const outstanding = invoices.reduce(
        (total, invoice) => total + Number(invoice.balanceAmount ?? 0),
        0,
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                            router.push(unit.propertyId ? `/properties/${unit.propertyId}` : "/units")
                        }
                        aria-label="Back to property"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">{unit.name}</h1>
                            <StatusBadge status={unit.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-mono">{unit.code}</span>
                            {unit.property && (
                                <>
                                    {" · "}
                                    <Link href={`/properties/${unit.property.id}`} className="hover:underline">
                                        {unit.property.name}
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={loadUnit} disabled={isBusy}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Refresh
                    </Button>
                    <Button onClick={() => router.push(`/units/${unit.id}/edit`)} disabled={isBusy}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Occupancy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Occupancy follows the unit&apos;s rental agreements — a unit cannot claim to be let
                        while no agreement is active.
                    </p>
                    <UnitStatusActions unit={unit} onChanged={loadUnit} />
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Specifications</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Type" value={unit.type} />
                        <Detail label="Floor" value={unit.floor?.toString()} />
                        <Detail label="Bedrooms" value={unit.bedrooms?.toString()} />
                        <Detail label="Bathrooms" value={unit.bathrooms?.toString()} />
                        <Detail label="Area (sq ft)" value={unit.areaSqFt != null ? Number(unit.areaSqFt).toLocaleString() : undefined} />
                        <Detail label="Furnished" value={unit.furnished ? "Yes" : "No"} />
                        <Detail
                            label="Base rent"
                            value={
                                unit.baseRent != null
                                    ? `${unit.currency ?? "KES"} ${Number(unit.baseRent).toLocaleString()}`
                                    : undefined
                            }
                        />
                        <Detail label="Charge plan" value={unit.chargePlan} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Features &amp; charges</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {unit.features && unit.features.length > 0 ? (
                            <ul className="flex flex-wrap gap-2">
                                {unit.features.map((feature, index) => (
                                    <li
                                        key={feature.id ?? index}
                                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                                    >
                                        {feature.name}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No features recorded.</p>
                        )}
                        {unit.serviceCharges && unit.serviceCharges.length > 0 && (
                            <ul className="divide-y rounded-md border text-sm">
                                {unit.serviceCharges.map((charge: any) => (
                                    <li key={charge.id} className="flex items-center justify-between px-3 py-2">
                                        <span>{charge.serviceUtilityAmenity}</span>
                                        <span className="font-medium">
                                            {unit.currency ?? "KES"} {Number(charge.totalCost).toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {unit.apartmentNotes && (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{unit.apartmentNotes}</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" aria-hidden="true" />
                        Occupancy history
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {historyError ? (
                        <ErrorState message={historyError} onRetry={loadUnit} />
                    ) : !history || history.periods.length === 0 ? (
                        <EmptyState
                            title="No tenancies recorded yet"
                            description="Every tenancy on this unit will appear here, with the vacant gaps between them."
                        />
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                {history.summary.tenancies} tenancy
                                {history.summary.tenancies === 1 ? "" : "ies"} ·{" "}
                                {history.summary.totalVacantDays.toLocaleString()} days vacant
                                {history.summary.currentTenant && (
                                    <>
                                        {" · currently "}
                                        {`${history.summary.currentTenant.surname} ${history.summary.currentTenant.otherNames ?? ""}`.trim()}
                                    </>
                                )}
                            </p>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Period</TableHead>
                                        <TableHead>Tenant</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Days</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.periods.map((period, index) =>
                                        period.kind === "tenancy" ? (
                                            <TableRow key={`t-${period.agreementId}-${index}`}>
                                                <TableCell className="text-xs">
                                                    {new Date(period.start).toLocaleDateString()}
                                                    {period.end
                                                        ? ` – ${new Date(period.end).toLocaleDateString()}`
                                                        : " – present"}
                                                </TableCell>
                                                <TableCell>
                                                    <Link
                                                        href={`/rental-agreements/${period.agreementId}`}
                                                        className="hover:underline"
                                                    >
                                                        {`${period.tenant.surname} ${period.tenant.otherNames ?? ""}`.trim()}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge status={period.agreementStatus} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {period.occupiedDays ?? "—"}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            <TableRow key={`v-${period.start}-${index}`}>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {new Date(period.start).toLocaleDateString()} –{" "}
                                                    {new Date(period.end).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    Vacant
                                                </TableCell>
                                                <TableCell>—</TableCell>
                                                <TableCell className="text-right text-muted-foreground">
                                                    {period.vacantDays}
                                                </TableCell>
                                            </TableRow>
                                        ),
                                    )}
                                </TableBody>
                            </Table>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Rental agreements ({agreements.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {agreements.length === 0 ? (
                        <EmptyState
                            title="No rental agreements"
                            description="Once a lease exists for this unit its occupancy follows the lease automatically."
                            icon={<FileText className="h-10 w-10" aria-hidden="true" />}
                            action={
                                <Button onClick={() => router.push("/rental-agreements/new")}>
                                    Create lease
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tenant</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Term</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Rent</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {agreements.map((agreement: any) => (
                                    <TableRow key={agreement.id}>
                                        <TableCell>
                                            {agreement.tenant
                                                ? `${agreement.tenant.surname} ${agreement.tenant.otherNames ?? ""}`.trim()
                                                : "—"}
                                        </TableCell>
                                        <TableCell>{agreement.agreementType ?? "—"}</TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(agreement.startDate).toLocaleDateString()}
                                            {agreement.endDate
                                                ? ` – ${new Date(agreement.endDate).toLocaleDateString()}`
                                                : " – open"}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={agreement.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {agreement.currency ?? unit.currency ?? "KES"}{" "}
                                            {Number(agreement.rentAmount).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4" aria-hidden="true" />
                        Billing
                    </CardTitle>
                    {outstanding > 0 && (
                        <span className="text-sm font-medium text-red-600">
                            Outstanding {unit.currency ?? "KES"} {outstanding.toLocaleString()}
                        </span>
                    )}
                </CardHeader>
                <CardContent>
                    {invoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No invoices raised for this unit yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell>
                                            <Link href={`/finance/invoices/${invoice.id}`} className="hover:underline">
                                                {invoice.invoiceNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <StatusBadge status={invoice.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {invoice.currency ?? unit.currency ?? "KES"}{" "}
                                            {Number(invoice.balanceAmount ?? 0).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value || "—"}</p>
        </div>
    );
}