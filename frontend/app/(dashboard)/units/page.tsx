"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { useUnits } from "@/hooks/use-units";
import { useProperties } from "@/hooks/use-properties";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DoorOpen, MoreHorizontal, Search, X } from "lucide-react";
import { UNIT_TYPES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Unit } from "@/types";

const statusOptions = [
    { value: "VACANT", label: "Vacant" },
    { value: "OCCUPIED", label: "Occupied" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "RESERVED", label: "Reserved" },
];

export default function UnitsPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Filter state (unapplied)
    const [filterCode, setFilterCode] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterPropertyId, setFilterPropertyId] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    // Applied filters
    const [appliedFilters, setAppliedFilters] = useState({
        code: "",
        name: "",
        propertyId: "",
        status: "",
    });

    const { properties } = useProperties({ limit: 100 });

    const propertyOptions = useMemo(
        () => properties.map((p) => ({ value: p.id, label: p.name })),
        [properties]
    );

    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.code, appliedFilters.name].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.code, appliedFilters.name]);

    const { units, paginationMeta, isLoading, error } = useUnits({
        page,
        limit,
        search: effectiveSearch,
        sortBy,
        sortOrder,
        propertyId: appliedFilters.propertyId || undefined,
        status: appliedFilters.status || undefined,
    });

    const columns: ColumnDef<Unit>[] = useMemo(
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
                id: "property",
                header: "Property",
                cell: ({ row }) => row.original.property?.name || "N/A",
            },
            {
                id: "tenant",
                header: "Tenant/Resident",
                cell: ({ row }) => {
                    const lease = row.original.leases?.[0];
                    const tenant = lease?.tenant;
                    if (!tenant) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{tenant.surname} {tenant.otherNames}</span>
                            {tenant.phone && (
                                <span className="text-xs text-muted-foreground">{tenant.phone}</span>
                            )}
                        </div>
                    );
                },
            },
            {
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => {
                    const type = row.original.type;
                    if (!type) return "N/A";
                    const unitType = UNIT_TYPES.find((t) => t.value === type);
                    return unitType?.label || type;
                },
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => {
                    const status = row.original.status;
                    const colorMap: Record<string, string> = {
                        VACANT: "bg-green-100 text-green-800",
                        OCCUPIED: "bg-blue-100 text-blue-800",
                        MAINTENANCE: "bg-yellow-100 text-yellow-800",
                        RESERVED: "bg-purple-100 text-purple-800",
                    };
                    return (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] || "bg-gray-100 text-gray-800"}`}>
                            {status}
                        </span>
                    );
                },
            },
            {
                accessorKey: "baseRent",
                header: "Rent",
                cell: ({ row }) => row.original.baseRent ? `$${row.original.baseRent}` : "N/A",
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

    const handleApplyFilters = useCallback(() => {
        setAppliedFilters({
            code: filterCode,
            name: filterName,
            propertyId: filterPropertyId,
            status: filterStatus,
        });
        setPage(1);
    }, [filterCode, filterName, filterPropertyId, filterStatus]);

    const handleResetFilters = useCallback(() => {
        setFilterCode("");
        setFilterName("");
        setFilterPropertyId("");
        setFilterStatus("");
        setAppliedFilters({ code: "", name: "", propertyId: "", status: "" });
        setPage(1);
    }, []);

    const hasActiveFilters = filterCode || filterName || filterPropertyId || filterStatus;

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
            total: paginationMeta.total,
            page: paginationMeta.page,
            limit: paginationMeta.limit,
            totalPages: paginationMeta.totalPages,
        }
        : undefined;

    if (isLoading && !units.length) {
        return <div>Loading units...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Units</h1>
                    <p className="text-muted-foreground">
                        Manage your rental units
                    </p>
                </div>
                <Link href="/dashboard/units/new">
                    <Button>
                        <DoorOpen className="mr-2 h-4 w-4" /> Add Unit
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 backdrop-blur-sm p-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[180px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Code</label>
                        <Input
                            placeholder="Filter by code..."
                            value={filterCode}
                            onChange={(e) => setFilterCode(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[180px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Name</label>
                        <Input
                            placeholder="Filter by name..."
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Property</label>
                        <Select
                            options={propertyOptions}
                            value={filterPropertyId}
                            onChange={(e) => setFilterPropertyId(e.target.value)}
                            placeholder="All properties"
                        />
                    </div>
                    <div className="flex-1 min-w-[180px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Status</label>
                        <Select
                            options={statusOptions}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            placeholder="All statuses"
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
                data={units}
                columns={columns}
                emptyMessage="No units found. Add one to get started."
                emptyIcon={<DoorOpen className="h-12 w-12 text-slate-400" />}
                serverSidePagination
                paginationMeta={meta}
                onPaginationChange={handlePaginationChange}
                onSortChange={handleSortChange}
            />
        </div>
    );
}
