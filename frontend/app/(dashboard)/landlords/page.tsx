"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useLandlords } from "@/hooks/use-landlords";
import { Button } from "@/components/ui/button";
import { ExpandableTable, TableData } from "@/components/ui/expandable-table";
import { LandlordFilters, LandlordFiltersState } from "@/components/filters/landlords-filter";
import { AddLandlordModal } from "@/components/ui/modals/add-landlord-modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { landlordsApi } from "@/lib/api";
import { Plus, Landmark, Mail, Phone, Building2, ChevronDown, ChevronRight, Edit, Trash2, MoreVertical } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

interface LandlordTableData extends TableData {
    landlordId: string;
    code: string;
    name: string;
    status: string;
    email?: string;
    phone?: string;
    city?: string;
    properties: any[]; // Assuming properties are included
}

export default function LandlordsPage() {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [landlordToDelete, setLandlordToDelete] = useState<string | null>(null);
    const [editingLandlord, setEditingLandlord] = useState<any | null>(null);

    // Filter state (unapplied)
    const [filterState, setFilterState] = useState({
        code: "",
        name: "",
        status: "",
    });

    // Applied filters
    const [appliedFilters, setAppliedFilters] = useState({
        code: "",
        name: "",
        status: "",
    });

    // Build effective search from applied filters
    const effectiveSearch = useMemo(() => {
        const parts = [appliedFilters.code, appliedFilters.name].filter(Boolean);
        return parts.join(" ") || undefined;
    }, [appliedFilters.code, appliedFilters.name]);

    const { landlords, paginationMeta, isLoading, error, refetch } = useLandlords({
        page,
        limit,
        search: effectiveSearch,
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
        // Since we have custom filters, this might not be used, but keep for compatibility
        setPage(1);
    }, []);

    const handleApplyFilters = useCallback((newFilters: LandlordFiltersState) => {
        setFilterState(newFilters);
        setAppliedFilters(newFilters);
        setPage(1);
    }, []);

    const handleResetFilters = useCallback(() => {
        const resetState = { code: "", name: "", status: "" };
        setFilterState(resetState);
        setAppliedFilters(resetState);
        setPage(1);
    }, []);

    const handleDeleteLandlord = useCallback(async () => {
        if (!landlordToDelete) return;

        try {
            await landlordsApi.remove(landlordToDelete);
            toast.success("Landlord deleted successfully!");
            // Refresh the data
            refetch();
        } catch (error) {
            console.error("Failed to delete landlord:", error);
            toast.error("Failed to delete landlord. Please try again.");
        } finally {
            setDeleteDialogOpen(false);
            setLandlordToDelete(null);
        }
    }, [landlordToDelete]);

    if (isLoading && !landlords.length) {
        return <div>Loading landlords...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    const columns: ColumnDef<LandlordTableData>[] = [
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
            accessorKey: 'code',
            header: 'Code',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    {row.original.code}
                </div>
            ),
            size: 100,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = (row.original.status as string) || 'ACTIVE';
                const colorMap: Record<string, string> = {
                    ACTIVE: 'bg-green-100 text-green-800',
                    INACTIVE: 'bg-gray-100 text-gray-800',
                    ARCHIVED: 'bg-blue-100 text-blue-800',
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
            accessorKey: 'name',
            header: 'Name',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {row.original.name}
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'email',
            header: 'Email',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    {row.original.email || "-"}
                </div>
            ),
            size: 200,
        },
        {
            accessorKey: 'phone',
            header: 'Phone',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {row.original.phone || "-"}
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'city',
            header: 'City',
            cell: ({ row }) => row.original.city || "-",
            size: 100,
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <div className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setOpenDropdown(openDropdown === row.original.id ? null : row.original.id)}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                    {openDropdown === row.original.id && (
                        <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-md shadow-lg z-10">
                            <button
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                                onClick={() => {
                                    setEditingLandlord(row.original);
                                    setIsModalOpen(true);
                                    setOpenDropdown(null);
                                }}
                            >
                                <Edit className="h-3 w-3" />
                                Edit
                            </button>
                            <button
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-red-600"
                                onClick={() => {
                                    setLandlordToDelete(row.original.id);
                                    setDeleteDialogOpen(true);
                                    setOpenDropdown(null);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            ),
            size: 80,
        },
    ];

    // Custom expanded row component for landlords
    const LandlordExpandedDetails = ({ row }: { row: LandlordTableData }) => {
        const properties = row.properties || [];
        return (
            <div className="bg-slate-50 p-4 border-l-4 border-cyan-500 ml-4">
                <h4 className="text-sm font-medium text-slate-900 mb-2">Properties ({properties.length})</h4>
                {properties.length === 0 ? (
                    <p className="text-sm text-slate-500">No properties associated with this landlord.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {properties.map((property: any) => (
                            <div key={property.id} className="bg-white p-3 rounded border">
                                <div className="flex items-center gap-2 mb-1">
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-medium text-sm">{property.name}</span>
                                </div>
                                <p className="text-xs text-slate-500">{property.address || 'No address'}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Landlords</h1>
                    <p className="text-muted-foreground">
                        Manage your landlords directory
                    </p>
                </div>
                <Button onClick={() => {
                    setEditingLandlord(null);
                    setIsModalOpen(true);
                }}>
                    <Plus className="mr-2 h-4 w-4" /> Add Landlord
                </Button>
            </div>

            {/* Filters */}
            <LandlordFilters
                filters={filterState}
                onFiltersChange={handleApplyFilters}
                onReset={handleResetFilters}
            />

            <ExpandableTable
                data={landlords.map(landlord => ({
                    id: landlord.id,
                    landlordId: landlord.id,
                    code: landlord.code,
                    name: landlord.name,
                    status: landlord.status,
                    email: landlord.email,
                    phone: landlord.phone,
                    city: landlord.city,
                    properties: landlord.properties || [],
                }))}
                columns={columns}
                expandedRowComponent={LandlordExpandedDetails}
                serverSidePagination={true}
                paginationMeta={paginationMeta || undefined}
                onPaginationChange={handlePaginationChange}
                onSortChange={handleSortChange}
                onSearchChange={handleSearchChange}
            />

            <AddLandlordModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingLandlord(null);
                }}
                onSuccess={() => {
                    // Refresh the data by triggering a re-fetch
                    refetch();
                }}
                landlord={editingLandlord}
            />

            <ConfirmDialog
                isOpen={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleDeleteLandlord}
                title="Delete Landlord"
                message="Are you sure you want to delete this landlord? This action cannot be undone."
            />
        </div>
    );
}
