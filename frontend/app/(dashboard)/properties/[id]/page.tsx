"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    ChevronLeft,
    DoorOpen,
    Images,
    Pencil,
    Plus,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { PropertyDocuments } from "@/components/properties/property-documents";
import { propertiesApi } from "@/lib/api";
import type { Property, Unit } from "@/types";

type Tab = "overview" | "units" | "files";

export default function PropertyDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [property, setProperty] = useState<Property | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [tab, setTab] = useState<Tab>("overview");

    const loadProperty = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await propertiesApi.findOne(id);
            setProperty(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Property not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the property.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadProperty();
    }, [loadProperty]);

    const handleStatusChange = async (status: string) => {
        if (!property) return;
        if (status === "ARCHIVED" && !confirm(`Archive ${property.name}? It will be hidden from lists.`)) {
            return;
        }
        setIsBusy(true);
        try {
            await propertiesApi.update(property.id, { status } as never);
            toast.success(`Property marked ${status.toLowerCase()}`);
            await loadProperty();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to update the property status.");
        } finally {
            setIsBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!property) return;
        if (!confirm(`Delete ${property.name}? This cannot be undone.`)) return;
        setIsBusy(true);
        try {
            await propertiesApi.remove(property.id);
            toast.success("Property deleted");
            router.push("/properties");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete the property.");
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading property…" />;
    if (error || !property) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" size="icon" onClick={() => router.push("/properties")} aria-label="Back to properties">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Property not found."} onRetry={loadProperty} />
            </div>
        );
    }

    const units: Unit[] = (property.units ?? []) as Unit[];
    const occupancy = property.occupancy ?? { total: units.length };
    const location = [property.estateArea, property.areaRegion, property.country].filter(Boolean).join(", ");

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/properties")} aria-label="Back to properties">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">{property.name}</h1>
                            <StatusBadge status={property.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-mono">{property.code}</span>
                            {location && <> · {location}</>}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={loadProperty} disabled={isBusy}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Refresh
                    </Button>
                    {property.status !== "ACTIVE" && (
                        <Button variant="outline" onClick={() => handleStatusChange("ACTIVE")} disabled={isBusy}>
                            Mark active
                        </Button>
                    )}
                    {property.status === "ACTIVE" && (
                        <Button variant="outline" onClick={() => handleStatusChange("INACTIVE")} disabled={isBusy}>
                            Mark inactive
                        </Button>
                    )}
                    {property.status !== "ARCHIVED" && (
                        <Button variant="outline" onClick={() => handleStatusChange("ARCHIVED")} disabled={isBusy}>
                            Archive
                        </Button>
                    )}
                    <Button onClick={() => router.push(`/properties/${property.id}/edit`)} disabled={isBusy}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Units" value={occupancy.total ?? 0} />
                <SummaryCard label="Vacant" value={occupancy.VACANT ?? 0} tone="text-green-700" />
                <SummaryCard label="Occupied" value={occupancy.OCCUPIED ?? 0} tone="text-blue-700" />
                <SummaryCard
                    label="Other"
                    value={(occupancy.RESERVED ?? 0) + (occupancy.MAINTENANCE ?? 0)}
                    tone="text-amber-700"
                />
            </div>

            <div className="flex flex-wrap gap-2 border-b pb-2" role="tablist" aria-label="Property sections">
                {(
                    [
                        { id: "overview", label: "Overview" },
                        { id: "units", label: `Units (${units.length})` },
                        { id: "files", label: "Photos & documents" },
                    ] as Array<{ id: Tab; label: string }>
                ).map((item) => (
                    <button
                        key={item.id}
                        role="tab"
                        type="button"
                        aria-selected={tab === item.id}
                        onClick={() => setTab(item.id)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            tab === item.id
                                ? "bg-slate-900 text-white"
                                : "text-muted-foreground hover:bg-slate-100"
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4 text-sm">
                            <Detail label="Type" value={property.type} />
                            <Detail label="Category" value={property.category} />
                            <Detail label="Landlord" value={property.landlord?.name} />
                            <Detail label="Branch" value={property.branch?.name} />
                            <Detail label="Floors" value={property.numberOfFloors?.toString()} />
                            <Detail label="Specification" value={property.specification} />
                            <Detail label="LR number" value={property.lrNumber} />
                            <Detail
                                label="Date acquired"
                                value={property.dateAcquired ? new Date(property.dateAcquired).toLocaleDateString() : undefined}
                            />
                            <Detail
                                label="GPS"
                                value={
                                    property.latitude != null && property.longitude != null
                                        ? `${property.latitude}, ${property.longitude}`
                                        : undefined
                                }
                            />
                            <Detail label="M-Pesa paybill" value={property.mpesaPropertyPayNumber} />
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Amenities</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {property.amenities && property.amenities.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {property.amenities.map((amenity) => (
                                            <li
                                                key={amenity.id}
                                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                                            >
                                                {amenity.name}
                                                {amenity.category && (
                                                    <span className="ml-1 text-slate-500">({amenity.category})</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No amenities recorded. Add them from the property edit screen.
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Notes</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <p className="whitespace-pre-wrap text-muted-foreground">
                                    {property.notes || "No notes recorded."}
                                </p>
                                {property.specificContactInfo && (
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground">Contact</p>
                                        <p className="whitespace-pre-wrap">{property.specificContactInfo}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {tab === "units" && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Units</CardTitle>
                        <Button size="sm" onClick={() => router.push(`/units/new?propertyId=${property.id}`)}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add unit
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {units.length === 0 ? (
                            <EmptyState
                                title="No units yet"
                                description="Add the first unit to start tracking occupancy, rent and leases."
                                icon={<DoorOpen className="h-10 w-10" aria-hidden="true" />}
                                action={
                                    <Button onClick={() => router.push(`/units/new?propertyId=${property.id}`)}>
                                        Add unit
                                    </Button>
                                }
                            />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Unit</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Occupancy</TableHead>
                                        <TableHead>Current tenant</TableHead>
                                        <TableHead className="text-right">Rent</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {units.map((unit) => {
                                        const activeAgreement = unit.rentalAgreements?.[0];
                                        return (
                                            <TableRow key={unit.id}>
                                                <TableCell>
                                                    <Link
                                                        href={`/units/${unit.id}`}
                                                        className="font-medium hover:underline"
                                                    >
                                                        {unit.name}
                                                    </Link>
                                                    <span className="block text-xs text-muted-foreground font-mono">
                                                        {unit.code}
                                                    </span>
                                                </TableCell>
                                                <TableCell>{unit.type ?? "—"}</TableCell>
                                                <TableCell>
                                                    <StatusBadge status={unit.status} />
                                                </TableCell>
                                                <TableCell>
                                                    {activeAgreement?.tenant
                                                        ? `${activeAgreement.tenant.surname} ${activeAgreement.tenant.otherNames ?? ""}`.trim()
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {unit.baseRent != null
                                                        ? `${unit.currency ?? "KES"} ${Number(unit.baseRent).toLocaleString()}`
                                                        : "—"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Link href={`/units/${unit.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            View
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}

            {tab === "files" && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Images className="h-4 w-4" aria-hidden="true" />
                            Photos &amp; documents
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <PropertyDocuments propertyId={property.id} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function SummaryCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone?: string;
}) {
    return (
        <Card>
            <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={`mt-1 text-2xl font-bold ${tone ?? ""}`}>{value}</p>
            </CardContent>
        </Card>
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