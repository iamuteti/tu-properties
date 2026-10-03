"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DoorOpen, Download, Eye, Pencil, Trash2, Upload } from "lucide-react";
import { useUnits } from "@/hooks/use-units";
import { useProperties } from "@/hooks/use-properties";
import { usePropertyFormOptions } from "@/hooks/use-property-form-options";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/entity-states";
import { CsvImportModal } from "@/components/ui/csv-import-modal";
import { unitsApi } from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import type { Unit } from "@/types";

const STATUS_OPTIONS = [
    { value: "VACANT", label: "Vacant" },
    { value: "OCCUPIED", label: "Occupied" },
    { value: "RESERVED", label: "Reserved" },
    { value: "MAINTENANCE", label: "Maintenance" },
];

export default function UnitsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterPropertyId, setFilterPropertyId] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [filterBranchId, setFilterBranchId] = useState("");
    const [filterBedrooms, setFilterBedrooms] = useState("");
    const [appliedFilters, setAppliedFilters] = useState({
        propertyId: "",
        status: "",
        branchId: "",
        bedrooms: "",
    });
    const [search, setSearch] = useState("");
    const [isImportOpen, setIsImportOpen] = useState(false);

    const { properties } = useProperties({ limit: 500 });
    const { branches } = usePropertyFormOptions();

    const propertyOptions = useMemo(
        () => properties.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
        [properties],
    );
    const branchOptions = useMemo(
        () => branches.map((b) => ({ value: b.id, label: b.name })),
        [branches],
    );

    const { units, paginationMeta, isLoading, error, refetch } = useUnits({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        propertyId: appliedFilters.propertyId || undefined,
        status: appliedFilters.status || undefined,
        branchId: appliedFilters.branchId || undefined,
        bedrooms: appliedFilters.bedrooms || undefined,
    });

    const handleDelete = useCallback(
        async (unit: Unit) => {
            if (!confirm(`Delete ${unit.name}? This cannot be undone.`)) return;
            try {
                await unitsApi.remove(unit.id);
                toast.success("Unit deleted");
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to delete the unit.");
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Unit>[] = useMemo(
        () => [
            {
                accessorKey: "name",
                header: "Unit",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link href={`/units/${row.original.id}`} className="font-medium hover:underline">
                            {row.original.name}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono">{row.original.code}</span>
                    </div>
                ),
            },
            {
                id: "property",
                header: "Property",
                cell: ({ row }) => {
                    const property = row.original.property;
                    if (!property) return <span className="text-muted-foreground">—</span>;
                    return (
                        <Link href={`/properties/${property.id}`} className="text-sm hover:underline">
                            {property.name}
                        </Link>
                    );
                },
            },
            {
                id: "status",
                header: "Occupancy",
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => row.original.type || "—",
            },
            {
                accessorKey: "bedrooms",
                header: "Beds",
                cell: ({ row }) => (row.original.bedrooms != null ? row.original.bedrooms : "—"),
            },
            {
                accessorKey: "baseRent",
                header: "Rent",
                cell: ({ row }) =>
                    row.original.baseRent != null
                        ? `${row.original.currency ?? "KES"} ${Number(row.original.baseRent).toLocaleString()}`
                        : "—",
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Unit>
                            row={row.original}
                            label={`Actions for ${row.original.name}`}
                            actions={[
                                {
                                    label: "View unit",
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (unit) => router.push(`/units/${unit.id}`),
                                },
                                {
                                    label: "Edit unit",
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (unit) => router.push(`/units/${unit.id}/edit`),
                                },
                                {
                                    label: "Delete unit",
                                    icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                                    variant: "danger",
                                    disabled: (row.original.rentalAgreements?.length ?? 0) > 0,
                                    disabledReason: "This unit has rental agreements — terminate them first.",
                                    onSelect: handleDelete,
                                },
                            ]}
                        />
                    </div>
                ),
            },
        ],
        [handleDelete, router],
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
            propertyId: filterPropertyId,
            status: filterStatus,
            branchId: filterBranchId,
            bedrooms: filterBedrooms,
        });
        setPage(1);
    }, [filterPropertyId, filterStatus, filterBranchId, filterBedrooms]);

    const handleResetFilters = useCallback(() => {
        setFilterPropertyId("");
        setFilterStatus("");
        setFilterBranchId("");
        setFilterBedrooms("");
        setAppliedFilters({ propertyId: "", status: "", branchId: "", bedrooms: "" });
        setPage(1);
    }, []);

    const hasActiveFilters = filterPropertyId || filterStatus || filterBranchId || filterBedrooms;

    const exportUrl = unitsApi.exportUrl({
        search: search || undefined,
        propertyId: appliedFilters.propertyId || undefined,
        status: appliedFilters.status || undefined,
        branchId: appliedFilters.branchId || undefined,
    });

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
              total: paginationMeta.total,
              page: paginationMeta.page,
              limit: paginationMeta.limit,
              totalPages: paginationMeta.totalPages,
          }
        : undefined;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Units</h1>
                    <p className="text-muted-foreground">Individual let-able spaces across your properties</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                        Import CSV
                    </Button>
                    <Button variant="outline" onClick={() => window.open(exportUrl, "_blank")}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/units/new">
                        <Button>
                            <DoorOpen className="mr-2 h-4 w-4" aria-hidden="true" /> Add Unit
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px] max-w-xs flex-1">
                        <label htmlFor="unit-filter-property" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Property
                        </label>
                        <Select
                            id="unit-filter-property"
                            options={propertyOptions}
                            value={filterPropertyId}
                            onChange={(e) => setFilterPropertyId(e.target.value)}
                            placeholder="All properties"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="unit-filter-status" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Occupancy
                        </label>
                        <Select
                            id="unit-filter-status"
                            options={STATUS_OPTIONS}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            placeholder="All statuses"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="unit-filter-branch" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Branch
                        </label>
                        <Select
                            id="unit-filter-branch"
                            options={branchOptions}
                            value={filterBranchId}
                            onChange={(e) => setFilterBranchId(e.target.value)}
                            placeholder="All branches"
                        />
                    </div>
                    <div className="min-w-[140px] max-w-[160px]">
                        <label htmlFor="unit-filter-bedrooms" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Bedrooms
                        </label>
                        <Input
                            id="unit-filter-bedrooms"
                            type="number"
                            min={0}
                            placeholder="Any"
                            value={filterBedrooms}
                            onChange={(e) => setFilterBedrooms(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleApplyFilters}>Search</Button>
                        {hasActiveFilters && (
                            <Button variant="outline" onClick={handleResetFilters}>
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {isLoading && units.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading units…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={units}
                    columns={columns}
                    searchPlaceholder="Search units…"
                    emptyMessage="No units found. Add one to get started."
                    emptyIcon={<DoorOpen className="h-12 w-12 text-slate-400" aria-hidden="true" />}
                    serverSidePagination
                    paginationMeta={meta}
                    onPaginationChange={handlePaginationChange}
                    onSortChange={handleSortChange}
                    onSearchChange={handleSearchChange}
                />
            )}

            <CsvImportModal
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                entityLabel="Units"
                templateUrl={unitsApi.importTemplateUrl()}
                onImport={(csv, dryRun) => unitsApi.importCsv(csv, dryRun)}
            />
        </div>
    );
}