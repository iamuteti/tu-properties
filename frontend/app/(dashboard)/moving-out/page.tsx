"use client";

import { useState, useMemo, useCallback } from "react";
import { DoorOpen, Search, X } from "lucide-react";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { MoveOutRequestModal } from "@/components/ui/modals/move-out-request-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { useMoveouts } from "@/hooks/use-moveouts";
import { useAuth } from "@/context/auth-context";

const statusOptions = [
    { value: "PENDING", label: "Pending" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" }
];

interface MoveOutTableData {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  unitName: string;
  unitId: string;
  propertyName: string;
  propertyId: string;
  moveoutDate: string;
  approvalDate?: string;
  approvedBy?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  depositRefunded: boolean;
  depositRefundAmount?: number;
  notes?: string;
}

export default function MovingOutPage() {
    const { user, organization } = useAuth();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Filter state (unapplied)
    const [filterTenantCode, setFilterTenantCode] = useState("");
    const [filterTenantName, setFilterTenantName] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    // Applied filters
    const [appliedFilters, setAppliedFilters] = useState({
        tenantCode: "",
        tenantName: "",
        status: "",
    });

    const [search, setSearch] = useState("");

    // Build effective search from applied filters
    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.tenantCode, appliedFilters.tenantName].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.tenantCode, appliedFilters.tenantName]);

    const { moveouts, paginationMeta, isLoading, error } = useMoveouts({
        page,
        limit,
        search: search || effectiveSearch,
        sortBy,
        sortOrder,
        status: appliedFilters.status || undefined,
    });

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
            tenantCode: filterTenantCode,
            tenantName: filterTenantName,
            status: filterStatus,
        });
        setPage(1);
    }, [filterTenantCode, filterTenantName, filterStatus]);

    const handleResetFilters = useCallback(() => {
        setFilterTenantCode("");
        setFilterTenantName("");
        setFilterStatus("");
        setAppliedFilters({ tenantCode: "", tenantName: "", status: "" });
        setPage(1);
    }, []);

    const hasActiveFilters = filterTenantCode || filterTenantName || filterStatus;

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
            total: paginationMeta.total,
            page: paginationMeta.page,
            limit: paginationMeta.limit,
            totalPages: paginationMeta.totalPages,
        }
        : undefined;

    // Custom columns for move-outs
    const moveOutColumns: ColumnDef<MoveOutTableData>[] = [
        {
            accessorKey: 'tenantCode',
            header: 'Tenant Code',
            cell: ({ row }) => (
                <span className="text-slate-500 font-mono text-sm">
                    {row.original.tenantCode}
                </span>
            ),
            size: 120,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = row.original.status;
                const colorMap = {
                    PENDING: 'bg-yellow-100 text-yellow-800',
                    APPROVED: 'bg-green-100 text-green-800',
                    REJECTED: 'bg-red-100 text-red-800',
                };
                return (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] || 'bg-gray-100 text-gray-800'}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
                    </span>
                );
            },
            size: 100,
        },
        {
            accessorKey: 'tenantName',
            header: 'Tenant Name',
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-slate-900">{row.original.tenantName}</span>
                </div>
            ),
            size: 180,
        },
        {
            id: 'propertyUnit',
            header: 'Property/Unit',
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-slate-900">{row.original.propertyName}</span>
                    <span className="text-xs text-slate-500">{row.original.unitName}</span>
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'moveoutDate',
            header: 'Move-out Date',
            cell: ({ row }) => row.original.moveoutDate ? new Date(row.original.moveoutDate).toLocaleDateString('en-GB') : '-',
            size: 120,
        },
        {
            accessorKey: 'approvalDate',
            header: 'Approval Date',
            cell: ({ row }) => row.original.approvalDate ? new Date(row.original.approvalDate).toLocaleDateString('en-GB') : '-',
            size: 120,
        },
    ];

    if (isLoading && !moveouts.length) {
        return <div>Loading move-out requests...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Moving Out</h1>
                    <p className="text-muted-foreground">
                        Manage tenant move-out requests
                    </p>
                </div>
                {organization ? <Button onClick={() => setIsModalOpen(true)}>
                    <DoorOpen className="mr-2 h-4 w-4" /> New Request
                </Button> : null}
            </div>

            {/* Filters */}
            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 backdrop-blur-sm p-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Tenant Code</label>
                        <Input
                            placeholder="Filter by tenant code..."
                            value={filterTenantCode}
                            onChange={(e) => setFilterTenantCode(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-xs">
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Tenant Name</label>
                        <Input
                            placeholder="Filter by tenant name..."
                            value={filterTenantName}
                            onChange={(e) => setFilterTenantName(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[200px] max-w-xs">
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
                data={moveouts.map(moveout => ({
                    id: moveout.id,
                    tenantId: moveout.tenant?.id || '',
                    tenantName: `${moveout.tenant?.surname || ''} ${moveout.tenant?.otherNames || ''}`.trim(),
                    tenantCode: moveout.tenant?.code || '',
                    unitName: moveout.rentalAgreement?.unit?.name || '',
                    unitId: moveout.rentalAgreement?.unitId || '',
                    propertyName: moveout.rentalAgreement?.unit?.property?.name || '',
                    propertyId: moveout.rentalAgreement?.unit?.propertyId || '',
                    moveoutDate: moveout.moveoutDate,
                    approvalDate: moveout.approvalDate || undefined,
                    approvedBy: moveout.approvedBy || undefined,
                    status: moveout.status,
                    depositRefunded: moveout.depositRefunded,
                    depositRefundAmount: moveout.depositRefundAmount || undefined,
                    notes: moveout.notes || undefined,
                }))}
                columns={moveOutColumns}
                searchPlaceholder="Search move-out requests..."
                emptyMessage="No move-out requests found. Create one to get started."
                emptyIcon={<DoorOpen className="h-12 w-12 text-slate-400" />}
                serverSidePagination
                paginationMeta={meta}
                onPaginationChange={handlePaginationChange}
                onSortChange={handleSortChange}
                onSearchChange={handleSearchChange}
            />

            {isModalOpen && <MoveOutRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    // Refresh the data
                    // window.location.reload();
                }}
            />}
        </div>
    );
}