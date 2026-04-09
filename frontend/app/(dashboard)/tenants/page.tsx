"use client";

import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useTenants } from "@/hooks/use-tenants";
import { ExpandableTable, TableData } from "@/components/ui/expandable-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ColumnDef } from "@tanstack/react-table";
import { TenantFilters, TenantFiltersState } from "@/components/filters/tenants-filter";

interface TenantTableData extends TableData {
    tenantId: string;
    tenantName: string;
    tenantCode: string;
    unitName: string;
    unitId: string;
    propertyName: string;
    propertyId: string;
    idNoRegNo?: string;
    taxPin?: string;
    agreementType?: string;
    tenancyType?: string;
    phone?: string;
    email?: string;
    leaseId: string;
    agreementStartDate: string;
    agreementEndDate?: string;
    rentAmount: number;
    rentBalance: number;
    rentStatus: string;
    status: 'active' | 'inactive' | 'archived';
}

const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "ARCHIVED", label: "Archived" }
];

export default function TenantsPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Filter state (unapplied)
    const [filterState, setFilterState] = useState<TenantFiltersState>({
        code: "",
        name: "",
        status: "",
        withDeposit: false,
    });

    // Applied filters
    const [appliedFilters, setAppliedFilters] = useState<TenantFiltersState>({
        code: "",
        name: "",
        status: "",
        withDeposit: false,
    });

    const [search, setSearch] = useState("");

    // Build effective search from applied filters
    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.code, appliedFilters.name].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.code, appliedFilters.name]);

    const { tenants, paginationMeta, isLoading, error } = useTenants({
        page,
        limit,
        search: search || effectiveSearch,
        sortBy,
        sortOrder,
        status: appliedFilters.status || undefined,
        withDeposit: appliedFilters.withDeposit,
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

    const handleApplyFilters = useCallback((newFilters: TenantFiltersState) => {
        setFilterState(newFilters);
        setAppliedFilters(newFilters);
        setPage(1);
    }, []);

    const handleResetFilters = useCallback(() => {
        const resetState = { code: "", name: "", status: "", withDeposit: false };
        setFilterState(resetState);
        setAppliedFilters(resetState);
        setPage(1);
    }, []);

    const hasActiveFilters = filterState.code || filterState.name || filterState.status || filterState.withDeposit;

    if (isLoading && !tenants.length) {
        return <div>Loading tenants...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    const handleRowClick = (tenant: any) => {
        console.log("Tenant clicked:", tenant);
        // Could navigate to detail page or open a modal
    };

    const handleRowSelect = (selectedRows: any[]) => {
        console.log("Selected rows:", selectedRows);
        // Handle bulk actions on selected rows
    };

    // Custom columns for tenants
    const tenantColumns: ColumnDef<TenantTableData>[] = [
        {
            id: 'expander',
            header: () => null,
            cell: ({ row }) => (
                <button
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    onClick={() => row.toggleExpanded()}
                    aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
                >
                    {row.getIsExpanded() ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                </button>
            ),
            enableSorting: false,
            enableHiding: false,
            size: 40,
        },
        {
            accessorKey: 'tenantCode',
            header: 'Code',
            cell: ({ row }) => (
                <span className="text-slate-500 font-mono text-sm">
                    {row.original.tenantCode}
                </span>
            ),
            size: 100,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = row.original.status;
                const colorMap = {
                    active: 'bg-green-100 text-green-800',
                    inactive: 'bg-gray-100 text-gray-800',
                    archived: 'bg-blue-100 text-blue-800',
                };
                return (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] || 'bg-gray-100 text-gray-800'}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                );
            },
            size: 100,
        },
        {
            accessorKey: 'tenantName',
            header: 'Name',
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-slate-900">{row.original.tenantName}</span>
                    {row.original.phone && (
                        <span className="text-xs text-muted-foreground">{row.original.phone}</span>
                    )}
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
            accessorKey: 'agreementStartDate',
            header: 'Start Date',
            cell: ({ row }) => row.original.agreementStartDate ? new Date(row.original.agreementStartDate).toLocaleDateString('en-GB') : '-',
            size: 120,
        },
        {
            accessorKey: 'rentAmount',
            header: 'Monthly Rent',
            cell: ({ row }) => row.original.rentAmount ? `KES ${row.original.rentAmount.toLocaleString()}` : '-',
            size: 120,
        },
        {
            accessorKey: 'rentBalance',
            header: 'Balance',
            cell: ({ row }) => {
                const balance = row.original.rentBalance;
                const rentAmount = row.original.rentAmount;
                let bgColor = 'bg-green-100 text-green-800';
                let status = 'Paid';
                if (balance === 0) {
                    bgColor = 'bg-green-100 text-green-800';
                    status = 'Paid';
                } else if (balance < rentAmount / 3) {
                    bgColor = 'bg-yellow-100 text-yellow-800';
                    status = 'Partial';
                } else {
                    bgColor = 'bg-red-100 text-red-800';
                    status = 'Overdue';
                }
                return (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bgColor}`}>
                        {status} - KES {balance.toLocaleString()}
                    </span>
                );
            },
            size: 120,
        },
    ];

    // Custom expanded row component for tenants
    const TenantExpandedDetails = ({ row }: { row: TenantTableData }) => {
        return (
            <div className="bg-slate-50 p-4 border-l-4 border-cyan-500 ml-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Tax PIN</p>
                        <p className="text-sm font-medium text-slate-900">{row.taxPin || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Tenant Type</p>
                        <p className="text-sm font-medium text-slate-900">{row.agreementType || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Town</p>
                        <p className="text-sm font-medium text-slate-900">{row.tenancyType || 'N/A'}</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
                    <p className="text-muted-foreground">
                        Manage your tenants directory
                    </p>
                </div>
                <Link href="/dashboard/tenants/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Tenant
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <TenantFilters
                filters={filterState}
                onFiltersChange={handleApplyFilters}
                onReset={handleResetFilters}
            />

            <ExpandableTable
                data={tenants.map(tenant => ({
                    id: tenant.id,
                    tenantId: tenant.id,
                    tenantName: `${tenant.surname} ${tenant.otherNames || ''}`.trim(),
                    tenantCode: tenant.code,
                    unitName: tenant.rentalAgreement?.unit?.name || '',
                    unitId: tenant.rentalAgreement?.unitId || '',
                    propertyName: tenant.rentalAgreement?.unit?.property?.name || '',
                    propertyId: tenant.rentalAgreement?.unit?.propertyId || '',
                    idNoRegNo: tenant.idNoRegNo,
                    taxPin: tenant.taxPin,
                    agreementType: tenant.rentalAgreement?.agreementType,
                    tenancyType: tenant.town,
                    phone: tenant.phone,
                    email: tenant.email,
                    leaseId: tenant.rentalAgreement?.id || '',
                    agreementStartDate: tenant.rentalAgreement?.startDate || '',
                    agreementEndDate: tenant.rentalAgreement?.endDate || '',
                    rentAmount: tenant.rentalAgreement?.rentAmount ? Number(tenant.rentalAgreement.rentAmount) : 0,
                    rentBalance: tenant.lastPaidInvoice ? Number(tenant.lastPaidInvoice.balanceAmount) : (tenant.rentalAgreement?.rentAmount ? Number(tenant.rentalAgreement.rentAmount) : 0),
                    rentStatus: '',
                    status: tenant?.status === 'ACTIVE' ? 'active' : tenant.status === 'INACTIVE' ? 'inactive' : 'archived' as 'active' | 'inactive' | 'archived'
                }))}
                columns={tenantColumns}
                expandedRowComponent={TenantExpandedDetails}
                onRowClick={handleRowClick}
                onRowSelect={handleRowSelect}
                pagination={{ pageIndex: page - 1, pageSize: limit }}
                serverSidePagination={true}
                paginationMeta={paginationMeta}
                onPaginationChange={handlePaginationChange}
                onSortChange={handleSortChange}
                onSearchChange={handleSearchChange}
            />
        </div>
    );
}
