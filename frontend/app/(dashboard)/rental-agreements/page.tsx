"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Download, Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useLeases, useExpiringLeases } from "@/hooks/use-leases";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { AgreementStatusBadge } from "@/components/leases/agreement-status-badge";
import { leasesApi } from "@/lib/api";
import { AGREEMENT_STATUSES, AGREEMENT_TYPES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Lease } from "@/types";

/**
 * The single lease list. It replaces the orphan `/leases` page (a second list
 * for the same data with a dead row click) and the bare table that used to sit
 * here with a non-functional "…" button.
 */
export default function RentalAgreementsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterStatus, setFilterStatus] = useState("");
    const [filterType, setFilterType] = useState("");
    const [applied, setApplied] = useState({ status: "", type: "" });
    const [search, setSearch] = useState("");

    const { leases, paginationMeta, isLoading, error, refetch } = useLeases({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        status: applied.status || undefined,
        agreementType: applied.type || undefined,
    });

    // Expiry reminder stub: the query that a Notifications job will consume.
    const expiring = useExpiringLeases(60);

    const handleDelete = useCallback(
        async (lease: Lease) => {
            if (!confirm(`Delete lease ${lease.code ?? ''}? This cannot be undone.`)) return;
            try {
                await leasesApi.removeLease(lease.id);
                toast.success("Lease deleted");
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to delete the lease.");
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Lease>[] = useMemo(
        () => [
            {
                accessorKey: "code",
                header: "Lease",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link
                            href={`/rental-agreements/${row.original.id}`}
                            className="font-medium hover:underline"
                        >
                            {row.original.code ?? "Draft lease"}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                            {row.original.agreementType === "LEASE" ? "Fixed term" : "Monthly"}
                        </span>
                    </div>
                ),
            },
            {
                id: "tenant",
                header: "Tenant",
                cell: ({ row }) =>
                    row.original.tenant ? (
                        <Link
                            href={`/tenants/${row.original.tenant.id}`}
                            className="text-sm hover:underline"
                        >
                            {`${row.original.tenant.surname} ${row.original.tenant.otherNames ?? ""}`.trim()}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "unit",
                header: "Unit",
                cell: ({ row }) =>
                    row.original.unit ? (
                        <Link
                            href={`/units/${row.original.unit.id}`}
                            className="text-sm hover:underline"
                        >
                            {row.original.unit.name}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "status",
                header: "Status",
                cell: ({ row }) => <AgreementStatusBadge status={row.original.status} />,
            },
            {
                id: "rent",
                header: "Rent",
                cell: ({ row }) => (
                    <span className="text-sm">
                        {row.original.currency} {Number(row.original.rentAmount).toLocaleString()}
                    </span>
                ),
            },
            {
                id: "term",
                header: "Term",
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {new Date(row.original.startDate).toLocaleDateString()} →{" "}
                        {row.original.endDate
                            ? new Date(row.original.endDate).toLocaleDateString()
                            : "open-ended"}
                    </span>
                ),
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Lease>
                            row={row.original}
                            label={`Actions for lease ${row.original.code ?? ""}`}
                            actions={[
                                {
                                    label: "View lease",
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (lease) => router.push(`/rental-agreements/${lease.id}`),
                                },
                                {
                                    label: "Edit lease",
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (lease) => router.push(`/rental-agreements/${lease.id}/edit`),
                                },
                                {
                                    label: "Raise a move-out",
                                    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
                                    disabled: row.original.status !== "ACTIVE",
                                    disabledReason:
                                        row.original.status !== "ACTIVE"
                                            ? "Only an active lease can end with a move-out"
                                            : undefined,
                                    onSelect: (lease) =>
                                        router.push(`/rental-agreements/${lease.id}`),
                                },
                                {
                                    label: "Delete lease",
                                    icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                                    variant: "danger",
                                    disabled: row.original.status === "ACTIVE",
                                    disabledReason:
                                        row.original.status === "ACTIVE"
                                            ? "Terminate an active lease instead of deleting it"
                                            : undefined,
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

    const meta: PaginationMeta | undefined = paginationMeta
        ? {
              total: paginationMeta.total,
              page: paginationMeta.page,
              limit: paginationMeta.limit,
              totalPages: paginationMeta.totalPages,
          }
        : undefined;

    const exportUrl = leasesApi.exportUrl({
        search: search || undefined,
        status: applied.status || undefined,
        agreementType: applied.type || undefined,
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Leases</h1>
                    <p className="text-muted-foreground">
                        Tenancies from draft to renewal or move-out
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => window.open(exportUrl, "_blank")}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/rental-agreements/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            New Lease
                        </Button>
                    </Link>
                </div>
            </div>

            {expiring.leases.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                                {expiring.leases.length} lease
                                {expiring.leases.length === 1 ? '' : 's'} ending within 60
                                days
                            </h2>
                            <p className="mt-0.5 text-xs text-amber-800">
                                Renewal is open for these — reminders become scheduled sends in
                                Module 18.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {expiring.leases.slice(0, 4).map((lease) => (
                                <Link
                                    key={lease.id}
                                    href={`/rental-agreements/${lease.id}`}
                                    className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100"
                                >
                                    {lease.tenant
                                        ? `${lease.tenant.surname} ${lease.tenant.otherNames ?? ""}`.trim()
                                        : lease.code}
                                    {lease.endDate
                                        ? ` · ${new Date(lease.endDate).toLocaleDateString()}`
                                        : ""}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="lease-filter-status" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Status
                        </label>
                        <Select
                            id="lease-filter-status"
                            options={AGREEMENT_STATUSES}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            placeholder="All statuses"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="lease-filter-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Type
                        </label>
                        <Select
                            id="lease-filter-type"
                            options={AGREEMENT_TYPES}
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            placeholder="All types"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => {
                                setApplied({ status: filterStatus, type: filterType });
                                setPage(1);
                            }}
                        >
                            Apply
                        </Button>
                        {(filterStatus || filterType) && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setFilterStatus("");
                                    setFilterType("");
                                    setApplied({ status: "", type: "" });
                                    setPage(1);
                                }}
                            >
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {isLoading && leases.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading leases…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={leases}
                    columns={columns}
                    searchPlaceholder="Search by lease code, tenant or unit…"
                    emptyMessage="No leases yet. Draft one against a vacant unit."
                    emptyIcon={<FileText className="h-12 w-12 text-slate-400" aria-hidden="true" />}
                    serverSidePagination
                    paginationMeta={meta}
                    onPaginationChange={(p) => {
                        setPage(p.page);
                        setLimit(p.limit);
                    }}
                    onSortChange={(field, order) => {
                        setSortBy(field);
                        setSortOrder(order);
                        setPage(1);
                    }}
                    onSearchChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                />
            )}
        </div>
    );
}