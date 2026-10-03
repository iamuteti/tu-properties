"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Building2,
    CalendarDays,
    Download,
    Eye,
    Pencil,
    Trash2,
    Upload,
} from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { useLandlords } from "@/hooks/use-landlords";
import { usePropertyFormOptions } from "@/hooks/use-property-form-options";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/entity-states";
import { CsvImportModal } from "@/components/ui/csv-import-modal";
import { propertiesApi } from "@/lib/api";
import { PROPERTY_CATEGORIES, PROPERTY_TYPES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Property } from "@/types";

const STATUS_OPTIONS = [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "ARCHIVED", label: "Archived" },
];

const CATEGORY_OPTIONS = PROPERTY_CATEGORIES.map((option) => ({ value: option.value, label: option.label }));
const TYPE_OPTIONS = PROPERTY_TYPES.map((option) => ({ value: option.value, label: option.label }));

export default function PropertiesPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterCode, setFilterCode] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterLandlordId, setFilterLandlordId] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterBranchId, setFilterBranchId] = useState("");

    const [appliedFilters, setAppliedFilters] = useState({
        code: "",
        name: "",
        landlordId: "",
        status: "",
        type: "",
        branchId: "",
    });

    const [search, setSearch] = useState("");
    const [isImportOpen, setIsImportOpen] = useState(false);

    const { landlords } = useLandlords();
    const { branches } = usePropertyFormOptions();

    const landlordOptions = useMemo(
        () => landlords.map((l) => ({ value: l.id, label: l.name })),
        [landlords],
    );
    const branchOptions = useMemo(
        () => branches.map((b) => ({ value: b.id, label: b.name })),
        [branches],
    );

    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.code, appliedFilters.name].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.code, appliedFilters.name]);

    const { properties, paginationMeta, isLoading, error, refetch } = useProperties({
        page,
        limit,
        search: search || effectiveSearch,
        sortBy,
        sortOrder,
        landlordId: appliedFilters.landlordId || undefined,
        status: appliedFilters.status || undefined,
        type: appliedFilters.type || undefined,
        branchId: appliedFilters.branchId || undefined,
    });

    const handleDelete = useCallback(
        async (property: Property) => {
            if (!confirm(`Delete ${property.name}? This cannot be undone.`)) return;
            try {
                await propertiesApi.remove(property.id);
                toast.success("Property deleted");
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to delete the property.");
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Property>[] = useMemo(
        () => [
            {
                accessorKey: "name",
                header: "Name",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link href={`/properties/${row.original.id}`} className="font-medium hover:underline">
                            {row.original.name}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono">{row.original.code}</span>
                    </div>
                ),
            },
            {
                id: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                id: "type",
                header: "Type",
                cell: ({ row }) => row.original.type || "—",
            },
            {
                id: "landlord",
                header: "Landlord",
                cell: ({ row }) => {
                    const landlord = row.original.landlord;
                    if (!landlord) return <span className="text-muted-foreground">—</span>;
                    return <span className="text-sm">{landlord.name}</span>;
                },
            },
            {
                id: "branch",
                header: "Branch",
                cell: ({ row }) => row.original.branch?.name || <span className="text-muted-foreground">—</span>,
            },
            {
                id: "location",
                header: "Location",
                cell: ({ row }) => {
                    const prop = row.original;
                    return (
                        [prop.estateArea, prop.areaRegion, prop.country].filter(Boolean).join(", ") || "—"
                    );
                },
            },
            {
                id: "units",
                header: "Units",
                cell: ({ row }) => row.original._count?.units || 0,
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Property>
                            row={row.original}
                            label={`Actions for ${row.original.name}`}
                            actions={[
                                {
                                    label: "View property",
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (property) => router.push(`/properties/${property.id}`),
                                },
                                {
                                    label: "Edit property",
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (property) => router.push(`/properties/${property.id}/edit`),
                                },
                                {
                                    label: "Delete property",
                                    icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                                    variant: "danger",
                                    disabled: (row.original._count?.units ?? 0) > 0,
                                    disabledReason:
                                        "This property still has units — remove them before deleting it.",
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
            code: filterCode,
            name: filterName,
            landlordId: filterLandlordId,
            status: filterStatus,
            type: filterType,
            branchId: filterBranchId,
        });
        setPage(1);
    }, [filterCode, filterName, filterLandlordId, filterStatus, filterType, filterBranchId]);

    const handleResetFilters = useCallback(() => {
        setFilterCode("");
        setFilterName("");
        setFilterLandlordId("");
        setFilterStatus("");
        setFilterType("");
        setFilterBranchId("");
        setAppliedFilters({ code: "", name: "", landlordId: "", status: "", type: "", branchId: "" });
        setPage(1);
    }, []);

    const hasActiveFilters = filterCode || filterName || filterLandlordId || filterStatus || filterType || filterBranchId;

    const exportUrl = propertiesApi.exportUrl({
        search: search || effectiveSearch,
        landlordId: appliedFilters.landlordId || undefined,
        status: appliedFilters.status || undefined,
        type: appliedFilters.type || undefined,
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
                    <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
                    <p className="text-muted-foreground">Manage your real estate assets</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => router.push("/properties/availability")}>
                        <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                        Availability
                    </Button>
                    <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                        Import CSV
                    </Button>
                    <Button variant="outline" onClick={() => window.open(exportUrl, "_blank")}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/properties/new">
                        <Button>
                            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" /> Add Property
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-code" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Code
                        </label>
                        <Input
                            id="filter-code"
                            placeholder="Filter by code…"
                            value={filterCode}
                            onChange={(e) => setFilterCode(e.target.value)}
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Name
                        </label>
                        <Input
                            id="filter-name"
                            placeholder="Filter by name…"
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-status" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Status
                        </label>
                        <Select
                            id="filter-status"
                            options={STATUS_OPTIONS}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            placeholder="All statuses"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Type
                        </label>
                        <Select
                            id="filter-type"
                            options={TYPE_OPTIONS}
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            placeholder="All types"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-branch" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Branch
                        </label>
                        <Select
                            id="filter-branch"
                            options={branchOptions}
                            value={filterBranchId}
                            onChange={(e) => setFilterBranchId(e.target.value)}
                            placeholder="All branches"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="filter-landlord" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Landlord
                        </label>
                        <Select
                            id="filter-landlord"
                            options={landlordOptions}
                            value={filterLandlordId}
                            onChange={(e) => setFilterLandlordId(e.target.value)}
                            placeholder="All landlords"
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

            {isLoading && properties.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading properties…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={properties}
                    columns={columns}
                    searchPlaceholder="Search properties…"
                    emptyMessage="No properties found. Add one to get started."
                    emptyIcon={<Building2 className="h-12 w-12 text-slate-400" aria-hidden="true" />}
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
                entityLabel="Properties"
                templateUrl={propertiesApi.importTemplateUrl()}
                onImport={(csv, dryRun) => propertiesApi.importCsv(csv, dryRun)}
            />
        </div>
    );
}