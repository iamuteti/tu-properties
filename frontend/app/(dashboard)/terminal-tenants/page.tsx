"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { UserRound, Search, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { useTenants } from "@/hooks/use-tenants";
import { formatDate } from "@/lib/currency";
import { useAuth } from "@/context/auth-context";
import type { Tenant } from "@/types";

/**
 * The terminal-tenants register.
 *
 * Tenants whose tenancy has ended (status TERMINATED). They stay in the
 * directory as financial history — a terminated tenant still has invoices,
 * receipts and a deposit settlement — so this screen is the read-only place
 * to find them rather than a reason to delete the row.
 */
export default function TerminalTenantsPage() {
    const { organization } = useAuth();
    const locale = organization?.defaultLocale ?? null;

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");

    const { tenants, paginationMeta, isLoading, error, refetch } = useTenants({
        page,
        limit,
        search: appliedSearch || undefined,
        sortBy,
        sortOrder,
        status: "TERMINATED",
    });

    const handlePaginationChange = useCallback(
        (pagination: { page: number; limit: number }) => {
            setPage(pagination.page);
            setLimit(pagination.limit);
        },
        [],
    );

    const handleSortChange = useCallback(
        (newSortBy: string, newSortOrder: "asc" | "desc") => {
            setSortBy(newSortBy);
            setSortOrder(newSortOrder);
            setPage(1);
        },
        [],
    );

    const handleSearchChange = useCallback((s: string) => {
        setSearch(s);
        setPage(1);
    }, []);

    const applySearch = useCallback(() => {
        setAppliedSearch(search.trim());
        setPage(1);
    }, [search]);

    const clearFilters = useCallback(() => {
        setSearch("");
        setAppliedSearch("");
        setPage(1);
    }, []);

    const hasFilters = Boolean(appliedSearch);

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
            total: paginationMeta.total,
            page: paginationMeta.page,
            limit: paginationMeta.limit,
            totalPages: paginationMeta.totalPages,
        }
        : undefined;

    const columns: ColumnDef<Tenant>[] = useMemo(
        () => [
            {
                accessorKey: 'code',
                header: 'Code',
                cell: ({ row }) => (
                    <span className="text-muted-foreground font-mono text-sm">
                        {row.original.code}
                    </span>
                ),
                size: 110,
                enableSorting: false,
            },
            {
                accessorKey: 'surname',
                header: 'Name',
                cell: ({ row }) => {
                    const tenant = row.original;
                    const name = `${tenant.surname} ${tenant.otherNames ?? ''}`.trim();
                    return (
                        <div className="flex flex-col gap-0.5 w-full">
                            <Link
                                href={`/tenants/${tenant.id}`}
                                className="font-medium text-foreground hover:underline"
                                title={`View ${name}`}
                            >
                                {name}
                            </Link>
                            <span className="text-xs text-muted-foreground">
                                {tenant.accountNumber}
                            </span>
                        </div>
                    );
                },
                size: 180,
                enableSorting: false,
            },
            {
                id: 'propertyUnit',
                header: 'Property/Unit',
                cell: ({ row }) => {
                    const tenant = row.original;
                    const agreement = tenant.agreements?.[0];
                    const unit = agreement?.unit;
                    return (
                        <div className="flex flex-col gap-0.5 w-full">
                            {unit?.property ? (
                                <span className="font-medium text-foreground">
                                    {unit.property.name}
                                </span>
                            ) : (
                                <span className="text-muted-foreground">—</span>
                            )}
                            {unit ? (
                                <span className="text-xs text-muted-foreground">
                                    {unit.name}
                                </span>
                            ) : null}
                        </div>
                    );
                },
                size: 170,
                enableSorting: false,
            },
            {
                id: 'status',
                header: 'Status',
                cell: () => (
                    <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-foreground"
                    >
                        Terminated
                    </span>
                ),
                size: 100,
                enableSorting: false,
            },
            {
                accessorKey: 'updatedAt',
                header: 'Tenancy ended',
                cell: ({ row }) => {
                    const tenant = row.original;
                    const agreement = tenant.agreements?.[0];
                    const endedAt = agreement?.endDate || tenant.updatedAt;
                    return endedAt
                        ? formatDate(endedAt, locale)
                        : '-';
                },
                size: 130,
                enableSorting: true,
            },
        ],
        [locale],
    );

    if (isLoading && !tenants.length) {
        return <LoadingState label="Loading terminal tenants…" />;
    }

    if (error) {
        return <ErrorState message={error} onRetry={refetch} />;
    }

    const total = meta?.total ?? 0;
    const from = total === 0 ? 0 : (meta?.page ?? 1 - 1) * (meta?.limit ?? 10) + 1;
    const to = Math.min(meta?.page ?? 1 * (meta?.limit ?? 10), total);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Terminal Tenants
                    </h1>
                    <p className="text-muted-foreground">
                        Tenants whose tenancy has ended. Their records stay as
                        financial history.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card/50 backdrop-blur-sm p-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-64 flex-1">
                        <label className="text-sm font-medium text-foreground block mb-1.5">
                            Search
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={search}
                                placeholder="Tenant name, code or account number"
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") applySearch();
                                }}
                            />
                            <Button onClick={applySearch}>
                                <Search className="mr-2 h-4 w-4" /> Search
                            </Button>
                        </div>
                    </div>
                    {hasFilters && (
                        <Button variant="outline" onClick={clearFilters}>
                            <X className="mr-2 h-4 w-4" /> Clear
                        </Button>
                    )}
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={refetch} />}

            {isLoading && tenants.length === 0 ? (
                <LoadingState label="Loading terminal tenants…" />
            ) : (
                <>
                    {tenants.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            Showing {from}–{to} of {total}
                        </p>
                    )}
                    <DataTable
                        data={tenants}
                        columns={columns}
                        searchPlaceholder="Search terminal tenants…"
                        searchColumns={[
                            { id: 'code', label: 'Tenant code' },
                            { id: 'surname', label: 'Tenant name' },
                        ]}
                        emptyMessage={
                            hasFilters
                                ? "No terminated tenant matches what you have narrowed it to."
                                : "No terminated tenants yet. Ended tenancies appear here once a tenant is set to TERMINATED."
                        }
                        emptyIcon={<UserRound className="h-12 w-12 text-muted-foreground" aria-hidden="true" />}
                        serverSidePagination
                        paginationMeta={meta}
                        page={page}
                        onPaginationChange={handlePaginationChange}
                        onSortChange={handleSortChange}
                        onSearchChange={handleSearchChange}
                    />
                </>
            )}
        </div>
    );
}
