"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import { Plus, ChevronDown, ChevronRight, User } from "lucide-react";
import { useTenants } from "@/hooks/use-tenants";
import { ExpandableTable, TableData } from "@/components/ui/expandable-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ColumnDef } from "@tanstack/react-table";
import { TenantFilters, TenantFiltersState } from "@/components/filters/tenants-filter";
import { computeRentStatus, RentStatus, RentTone } from "@/lib/rent-status";
import { useOrgFormat } from "@/hooks/use-org-format";

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
    postalAddress?: string;
    country?: string;
    photoUrl?: string;
    emergencyContact?: string;
    rentAmount: number;
    rentStatus: RentStatus;
    status: 'active' | 'inactive' | 'archived';
}

const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "ARCHIVED", label: "Archived" }
];

// Bar track is the unpaid part of the period, tinted by how bad it is.
// The fill is always the settled part.
const rentStatusTones: Record<RentTone, { track: string; fill: string; label: string; text: string }> = {
    paid: { track: 'bg-gray-200', fill: 'bg-green-500', label: '', text: '' },
    overdue: { track: 'bg-red-200', fill: 'bg-green-500', label: 'text-red-600', text: 'Overdue' },
    partial: { track: 'bg-amber-200', fill: 'bg-green-500', label: 'text-amber-700', text: 'Part paid' },
    due: { track: 'bg-blue-200', fill: 'bg-green-500', label: 'text-blue-700', text: 'Payment due' },
    none: { track: 'bg-gray-200', fill: 'bg-gray-300', label: 'text-muted-foreground', text: '' },
};

export default function TenantsPage() {
    const router = useRouter();
    const fmt = useOrgFormat();
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
        withDeposit: appliedFilters.withDeposit ? true : undefined,
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

    const handleRowSelect = (selectedRows: any[]) => {
        console.log("Selected rows:", selectedRows);
        // Handle bulk actions on selected rows
    };

    // Custom columns for tenants
    const tenantColumns: ColumnDef<TenantTableData>[] = [
        {
            id: 'expander',
            header: () => null,
            cell: ({ row }) => {
                const isExpanded = row.getIsExpanded();
                return (
                    <button
                        title={isExpanded ? 'Collapse row' : 'Expand row'}
                        onClick={() => row.toggleExpanded()}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 rotate-180" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                        )}
                    </button>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 40,
        },
        {
            accessorKey: 'tenantCode',
            header: 'Code',
            cell: ({ row }) => (
                <span className="text-muted-foreground font-mono text-sm">
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
                    inactive: 'bg-gray-100 text-foreground',
                    archived: 'bg-blue-100 text-blue-800',
                };
                return (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] || 'bg-gray-100 text-foreground'}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                );
            },
            size: 100,
        },
        {
            accessorKey: 'tenantName',
            header: 'Name',
            cell: ({ row }) => {
                const tenant = row.original;
                return (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/tenants/${tenant.id}`);
                        }}
                        title={`View ${tenant.tenantName}`}
                        className="flex flex-col gap-0.5 w-full items-start cursor-pointer text-cyan-600 hover:bg-cyan-50 hover:underline hover:text-cyan-700 transition-all duration-200"
                    >
                        <span className="font-medium">{tenant.tenantName}</span>
                        {tenant.phone && (
                            <span className="text-xs text-muted-foreground">{tenant.phone}</span>
                        )}
                    </span>
                );
            },
            size: 180,
        },
        {
            id: 'propertyUnit',
            header: 'Property/Unit',
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{row.original.propertyName}</span>
                    <span className="text-xs text-muted-foreground">{row.original.unitName}</span>
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'email',
            header: 'Email',
            cell: ({ row }) => row.original.email || '-',
            size: 150,
        },
        {
            accessorKey: 'rentAmount',
            header: 'Monthly Rent',
            cell: ({ row }) => {
                const rentAmount = row.original.rentAmount;
                const status = row.original.rentStatus;
                const tone = rentStatusTones[status.tone];
                // The tenancy's own currency — a lease denominated in USD is
                // in USD whatever the organization's default happens to be.
                const currency = row.original.currency;

                return (
                    <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">
                            {rentAmount ? fmt.money(rentAmount, currency) : '-'}
                        </span>
                        <div
                            className={`w-full rounded-full h-1.5 overflow-hidden ${tone.track}`}
                            title={
                                status.tone === 'none'
                                    ? undefined
                                    : `${status.scopeLabel}: ${fmt.money(status.billed, currency)} billed, ${fmt.money(status.paid, currency)} paid`
                            }
                        >
                            <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${tone.fill}`}
                                style={{ width: `${status.paidPct}%` }}
                            />
                        </div>
                        {status.tone === 'none' ? (
                            <span className="text-xs text-muted-foreground">No invoice raised</span>
                        ) : status.tone === 'paid' ? null : (
                            <span
                                className="text-xs"
                                title={
                                    status.arrears > 0 && status.arrears < status.outstanding
                                        ? `${fmt.money(status.arrears, currency)} of it is past due`
                                        : undefined
                                }
                            >
                                <span className={`font-medium ${tone.label}`}>{tone.text}</span>
                                <span className="text-muted-foreground">
                                    {' '}
                                    - {fmt.money(status.outstanding, currency)} owing
                                </span>
                            </span>
                        )}
                    </div>
                );
            },
            size: 160,
        },
        {
            accessorKey: 'agreementStartDate',
            header: 'Start Date',
            cell: ({ row }) => row.original.agreementStartDate ? new Date(row.original.agreementStartDate).toLocaleDateString('en-GB') : '-',
            size: 120,
        },
    ];

    // Custom expanded row component for tenants
    const TenantExpandedDetails = ({ row }: { row: TenantTableData }) => {
        const daysToExpire = row.agreementEndDate
            ? Math.ceil((new Date(row.agreementEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        const leasePeriod = row.agreementEndDate && row.agreementStartDate
            ? Math.max(1, Math.round((new Date(row.agreementEndDate).getTime() - new Date(row.agreementStartDate).getTime()) / (1000 * 60 * 60 * 24 * 30)))
            : 0;

        return (
            <div className="bg-muted p-4 border-l-4 border-cyan-500 ml-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                    {/* Photo */}
                    <div className="flex flex-col items-center shrink-0">
                        {row.photoUrl ? (
                            <img
                                src={row.photoUrl}
                                alt="Tenant"
                                className="w-28 h-28 rounded-full object-cover border-2 border-cyan-500 shadow-md"
                            />
                        ) : (
                            <div className="w-28 h-28 rounded-full bg-gray-300 flex items-center justify-center shadow-md">
                                <User className="h-14 w-14 text-gray-500" />
                            </div>
                        )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-3">
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">ID/REG Number</p>
                            <p className="text-sm text-foreground">{row.idNoRegNo || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Tax PIN Number</p>
                            <p className="text-sm text-foreground">{row.taxPin || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Agreement Type</p>
                            <p className="text-sm text-foreground">{row.agreementType || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Tenancy Type</p>
                            <p className="text-sm text-foreground">{row.tenancyType || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Postal Address</p>
                            <p className="text-sm text-foreground">{row.postalAddress || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Country/Town</p>
                            <p className="text-sm text-foreground">{row.country || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Email Address</p>
                            <p className="text-sm text-foreground">{row.email || 'N/A'}</p>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Emergency Contact</p>
                            <p className="text-sm text-foreground">{row.emergencyContact || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                {row.agreementType === 'LEASE' && (
                    <div className="mt-5 bg-cyan-50 border border-cyan-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-semibold text-cyan-700 bg-cyan-100 px-2 py-1 rounded">Lease Dates & Term</span>
                            <span className="text-sm text-foreground">
                                {row.agreementStartDate ? new Date(row.agreementStartDate).toLocaleDateString('en-GB') : '-'} - {row.agreementEndDate ? new Date(row.agreementEndDate).toLocaleDateString('en-GB') : '-'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Lease Period</p>
                                <p className="text-sm text-foreground">{leasePeriod}Yr(s)</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Days To Expire</p>
                                <p className="text-sm text-foreground">{daysToExpire}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Lease Variation Type</p>
                                <p className="text-sm text-foreground">Revision</p>
                            </div>
                        </div>
                    </div>
                )}
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
                <Link href="/tenants/new">
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
                    unitName: tenant.agreement?.unit?.name || '',
                    unitId: tenant.agreement?.unitId || '',
                    propertyName: tenant.agreement?.unit?.property?.name || '',
                    propertyId: tenant.agreement?.unit?.propertyId || '',
                    idNoRegNo: tenant.idNoRegNo,
                    taxPin: tenant.taxPin,
                    agreementType: tenant.agreement?.agreementType,
                    tenancyType: tenant.tenantType,
                    phone: tenant.phone,
                    email: tenant.email,
                    leaseId: tenant.agreement?.id || '',
                    agreementStartDate: tenant.agreement?.startDate || '',
                    agreementEndDate: tenant.agreement?.endDate || '',
                    postalAddress: tenant.postalAddress,
                    country: tenant.country,
                    photoUrl: tenant.photoUrl,
                    emergencyContact: tenant.emergencyContacts?.[0]?.contactName || tenant.emergencyContacts?.[0]?.phone || '',
                    rentAmount: tenant.agreement?.rentAmount ? Number(tenant.agreement.rentAmount) : 0,
                    rentStatus: computeRentStatus(tenant.agreement?.invoices),
                    status: tenant?.status === 'ACTIVE' ? 'active' : tenant.status === 'INACTIVE' ? 'inactive' : 'archived' as 'active' | 'inactive' | 'archived'
                }))}
                columns={tenantColumns}
                expandedRowComponent={TenantExpandedDetails}
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
