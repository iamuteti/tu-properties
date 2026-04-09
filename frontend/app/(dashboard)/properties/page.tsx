"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { useProperties } from "@/hooks/use-properties";
import { useLandlords } from "@/hooks/use-landlords";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Building2, MoreHorizontal, Search, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Property } from "@/types";

export default function PropertiesPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Filter state (unapplied)
    const [filterCode, setFilterCode] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterLandlordId, setFilterLandlordId] = useState("");

    // Applied filters
    const [appliedFilters, setAppliedFilters] = useState({
        code: "",
        name: "",
        landlordId: "",
    });

    const [search, setSearch] = useState("");

    const { landlords } = useLandlords();

    const landlordOptions = useMemo(
        () => landlords.map((l) => ({ value: l.id, label: l.name })),
        [landlords]
    );

    // Build effective search from applied filters
    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.code, appliedFilters.name].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.code, appliedFilters.name]);

    const { properties, paginationMeta, isLoading, error } = useProperties({
        page,
        limit,
        search: search || effectiveSearch,
        sortBy,
        sortOrder,
        landlordId: appliedFilters.landlordId || undefined,
    });

    const columns: ColumnDef<Property>[] = useMemo(
        () => [
            {
                accessorKey: "name",
                header: "Name",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.original.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.original.code}</span>
                    </div>
                ),
            },
            {
                id: "landlord",
                header: "Landlord",
                cell: ({ row }) => {
                    const landlord = row.original.landlord;
                    if (!landlord) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{landlord.name}</span>
                            {landlord.phone && (
                                <span className="text-xs text-muted-foreground">{landlord.phone}</span>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "location",
                header: "Location",
                cell: ({ row }) => {
                    const prop = row.original;
                    return [prop.estateArea, prop.areaRegion, prop.country]
                        .filter(Boolean)
                        .join(", ");
                },
            },
            {
                accessorKey: "numberOfFloors",
                header: "Floors",
                cell: ({ row }) => row.original.numberOfFloors || "-",
            },
            {
                id: "units",
                header: "Units",
                cell: ({ row }) => row.original._count?.units || 0,
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: () => (
                    <div className="text-right">
                        <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            },
        ],
        []
    );

    const handlePaginationChange = useCallback((newPagination: { page: number; limit: number }) => {
        setPage(newPagination.page);
        setLimit(newPagination.limit);
    }, []);

    const handleSortChange = useCallback((newSortBy: string, newSortOrder: "asc" | "desc") => {
        setSortBy(newSortBy);
        setSortOrder(newSortOrder);
        setPage(1);
    }, []);

    const handleSearchChange = useCallback((s: string) => {
        setSearch(s);
        setPage(1);
    }, []);

    const handleApplyFilters = useCallback(() => {
        setAppliedFilters({
            code: filterCode,
            name: filterName,
            landlordId: filterLandlordId,
        });
        setPage(1);
    }, [filterCode, filterName, filterLandlordId]);

    const handleResetFilters = useCallback(() => {
        setFilterCode("");
        setFilterName("");
        setFilterLandlordId("");
        setAppliedFilters({ code: "", name: "", landlordId: "" });
        setPage(1);
    }, []);

    const hasActiveFilters = filterCode || filterName || filterLandlordId;

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
            total: paginationMeta.total,
            page: paginationMeta.page,
            limit: paginationMeta.limit,
            totalPages: paginationMeta.totalPages,
        }
        : undefined;

    if (isLoading && !properties.length) {
        return <div>Loading properties...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
                    <p className="text-muted-foreground">
                        Manage your real estate assets
                    </p>
                </div>
                <Link href="/dashboard/properties/new">
                    <Button>
                        <Building2 className="mr-2 h-4 w-4" /> Add Property
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 backdrop-blur-sm p-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Code</label>
                        <Input
                            placeholder="Filter by code..."
                            value={filterCode}
                            onChange={(e) => setFilterCode(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Name</label>
                        <Input
                            placeholder="Filter by name..."
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Landlord</label>
                        <Select
                            options={landlordOptions}
                            value={filterLandlordId}
                            onChange={(e) => setFilterLandlordId(e.target.value)}
                            placeholder="All landlords"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleApplyFilters}>
                            <Search className="mr-2 h-4 w-4" /> Search
                        </Button>
                        {hasActiveFilters && (
                            <Button variant="outline" onClick={handleResetFilters}>
                                <X className="mr-2 h-4 w-4" /> Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <DataTable
                data={properties}
                columns={columns}
                searchPlaceholder="Search properties..."
                emptyMessage="No properties found. Add one to get started."
                emptyIcon={<Building2 className="h-12 w-12 text-slate-400" />}
                serverSidePagination
                paginationMeta={meta}
                onPaginationChange={handlePaginationChange}
                onSortChange={handleSortChange}
                onSearchChange={handleSearchChange}
            />
        </div>
    );
}
