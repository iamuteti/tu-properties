"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { propertiesApi } from "@/lib/api";
import type { Unit } from "@/types";

/**
 * Availability calendar view (Module 2 checklist: "Availability calendar view
 * for vacant units").
 *
 * Shows every unit that can be let — vacant or reserved — with the lease that
 * ends inside the window, so a letting pipeline ("these come free next month")
 * can be read off one screen instead of filtering the unit list by hand.
 */
export default function PropertyAvailabilityPage() {
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [propertyId, setPropertyId] = useState("");
    const [from, setFrom] = useState(today());
    const [to, setTo] = useState(defaultTo());

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await propertiesApi.availability({
                propertyId: propertyId || undefined,
                from,
                to,
            });
            setUnits(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to load availability.");
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, from, to]);

    useEffect(() => {
        load();
    }, [load]);

    const grouped = useMemo(() => {
        const map = new Map<string, { label: string; units: Unit[] }>();
        for (const unit of units) {
            const key = unit.propertyId ?? "unassigned";
            const label = unit.property?.name ?? "Unassigned";
            const entry = map.get(key) ?? { label, units: [] };
            entry.units.push(unit);
            map.set(key, entry);
        }
        return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
    }, [units]);

    const endingSoon = units.filter((unit) =>
        (unit.rentalAgreements ?? []).some((agreement) => agreement.endDate),
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => window.history.back()} aria-label="Go back">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <CalendarDays className="h-5 w-5" aria-hidden="true" />
                            Availability
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Units that can be let now, plus leases ending inside the window.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="from" className="mb-1 block text-xs text-muted-foreground">
                            Window starts
                        </label>
                        <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                    </div>
                    <div>
                        <label htmlFor="to" className="mb-1 block text-xs text-muted-foreground">
                            Window ends
                        </label>
                        <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                    </div>
                    <Button variant="outline" onClick={load} disabled={isLoading}>
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Let-able units</p>
                        <p className="mt-1 text-2xl font-bold">{units.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Available now</p>
                        <p className="mt-1 text-2xl font-bold text-green-700">
                            {units.filter((unit) => unit.status === "VACANT").length}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Leases ending in window
                        </p>
                        <p className="mt-1 text-2xl font-bold text-amber-700">{endingSoon}</p>
                    </CardContent>
                </Card>
            </div>

            {isLoading && <LoadingState label="Loading availability…" />}
            {error && <ErrorState message={error} onRetry={load} />}

            {!isLoading && !error && units.length === 0 && (
                <EmptyState
                    title="Nothing available in this window"
                    description="Every unit is either occupied or out of service for the dates selected."
                    icon={<DoorOpen className="h-10 w-10" aria-hidden="true" />}
                />
            )}

            {!isLoading && !error && grouped.length > 0 && (
                <div className="space-y-4">
                    {grouped.map((group) => (
                        <Card key={group.key}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    {group.key !== "unassigned" && (
                                        <Link href={`/properties/${group.key}`} className="hover:underline">
                                            {group.label}
                                        </Link>
                                    )}
                                    {group.key === "unassigned" && <span>{group.label}</span>}
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                        {group.units.length}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {group.units.map((unit) => {
                                        const ending = (unit.rentalAgreements ?? [])[0];
                                        return (
                                            <li key={unit.id} className="rounded-lg border p-3 text-sm">
                                                <div className="flex items-start justify-between gap-2">
                                                    <Link href={`/units/${unit.id}`} className="font-medium hover:underline">
                                                        {unit.name}
                                                    </Link>
                                                    <StatusBadge status={unit.status} />
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground font-mono">
                                                    {unit.code}
                                                    {unit.type ? ` · ${unit.type}` : ""}
                                                    {unit.baseRent != null
                                                        ? ` · ${unit.currency ?? "KES"} ${Number(unit.baseRent).toLocaleString()}`
                                                        : ""}
                                                </p>
                                                {ending?.endDate && (
                                                    <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                                        Free from{" "}
                                                        {new Date(ending.endDate).toLocaleDateString()}
                                                        {ending.tenant
                                                            ? ` — currently ${ending.tenant.surname} ${ending.tenant.otherNames ?? ""}`.trim()
                                                            : ""}
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function defaultTo() {
    const date = new Date();
    date.setDate(date.getDate() + 90);
    return date.toISOString().slice(0, 10);
}