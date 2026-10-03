"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Building2,
    Columns3,
    Download,
    Eye,
    KanbanSquare,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import { useSales, useSalesPipeline } from "@/hooks/use-sales";
import { useProperties } from "@/hooks/use-properties";
import { useUsers } from "@/hooks/use-users";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/entity-states";
import { SalesBoard } from "@/components/sales/sales-board";
import { salesApi } from "@/lib/api";
import { SALE_STAGES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Sale } from "@/types";

const STAGE_OPTIONS = SALE_STAGES.map((stage) => ({ value: stage.value, label: stage.label }));

export default function SalesPage() {
    const router = useRouter();
    const [view, setView] = useState<"list" | "board">("board");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterStage, setFilterStage] = useState("");
    const [filterPropertyId, setFilterPropertyId] = useState("");
    const [filterAgentId, setFilterAgentId] = useState("");
    const [applied, setApplied] = useState({ stage: '', propertyId: '', agentId: '' });
    const [search, setSearch] = useState("");

    const { properties } = useProperties({ limit: 500 });
    const { users } = useUsers();

    const propertyOptions = useMemo(
        () => properties.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
        [properties],
    );
    const agentOptions = useMemo(
        () =>
            users.map((u) => ({
                value: u.id,
                label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
            })),
        [users],
    );

    const { sales, paginationMeta, isLoading, error, refetch } = useSales({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        stage: applied.stage || undefined,
        propertyId: applied.propertyId || undefined,
        agentUserId: applied.agentId || undefined,
    });

    const board = useSalesPipeline({ agentUserId: applied.agentId || undefined });

    const handleDelete = useCallback(
        async (sale: Sale) => {
            if (!confirm(`Delete sale ${sale.code}? This cannot be undone.`)) return;
            try {
                await salesApi.removeSale(sale.id);
                toast.success('Sale deleted');
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || 'Failed to delete the sale.');
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Sale>[] = useMemo(
        () => [
            {
                accessorKey: 'code',
                header: 'Sale',
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link href={`/sales/${row.original.id}`} className="font-medium hover:underline">
                            {row.original.code}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                            {row.original.propertyTitle ?? row.original.property?.name}
                        </span>
                    </div>
                ),
            },
            {
                id: 'stage',
                header: 'Stage',
                cell: ({ row }) => <StatusBadge status={row.original.stage} />,
            },
            {
                id: 'price',
                header: 'Agreed price',
                cell: ({ row }) =>
                    row.original.agreedPrice != null
                        ? `${row.original.currency} ${Number(row.original.agreedPrice).toLocaleString()}`
                        : '—',
            },
            {
                id: 'buyer',
                header: 'Buyer',
                cell: ({ row }) =>
                    row.original.buyerContact ? (
                        <Link
                            href={`/crm/contacts/${row.original.buyerContact.id}`}
                            className="text-sm hover:underline"
                        >
                            {`${row.original.buyerContact.firstName} ${row.original.buyerContact.lastName ?? ''}`.trim()}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: 'agent',
                header: 'Agent',
                cell: ({ row }) =>
                    row.original.agent ? (
                        <span className="text-sm">
                            {`${row.original.agent.firstName} ${row.original.agent.lastName}`.trim()}
                        </span>
                    ) : (
                        <span className="text-sm text-amber-600">Unassigned</span>
                    ),
            },
            {
                id: 'instalments',
                header: 'Schedule',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.installments?.length ?? 0} instalment(s)
                    </span>
                ),
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Sale>
                            row={row.original}
                            label={`Actions for ${row.original.code}`}
                            actions={[
                                {
                                    label: 'View sale',
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (sale) => router.push(`/sales/${sale.id}`),
                                },
                                {
                                    label: 'Edit sale',
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (sale) => router.push(`/sales/${sale.id}/edit`),
                                },
                                {
                                    label: 'Delete sale',
                                    icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                                    variant: 'danger',
                                    disabled:
                                        row.original.stage === 'HANDOVER' ||
                                        (row.original.installments ?? []).some((i) => i.invoiceId),
                                    disabledReason:
                                        row.original.stage === 'HANDOVER'
                                            ? 'A completed sale cannot be deleted'
                                            : 'Invoices were raised against this sale — cancel it instead',
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

    const handleApplyFilters = () => {
        setApplied({
            stage: filterStage,
            propertyId: filterPropertyId,
            agentId: filterAgentId,
        });
        setPage(1);
    };

    const handleResetFilters = () => {
        setFilterStage('');
        setFilterPropertyId('');
        setFilterAgentId('');
        setApplied({ stage: '', propertyId: '', agentId: '' });
        setPage(1);
    };

    const exportUrl = salesApi.exportUrl({
        search: search || undefined,
        stage: applied.stage || undefined,
        propertyId: applied.propertyId || undefined,
        agentUserId: applied.agentId || undefined,
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
                    <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
                    <p className="text-muted-foreground">
                        Quotations through to handover, with the commission each sale earns
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-md border p-0.5">
                        <button
                            type="button"
                            onClick={() => setView('list')}
                            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                                view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'
                            }`}
                        >
                            <KanbanSquare className="h-4 w-4" aria-hidden="true" />
                            List
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('board')}
                            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                                view === 'board' ? 'bg-slate-900 text-white' : 'text-slate-600'
                            }`}
                        >
                            <Columns3 className="h-4 w-4" aria-hidden="true" />
                            Pipeline
                        </button>
                    </div>
                    <Link href="/sales/commissions">
                        <Button variant="outline">Commission report</Button>
                    </Link>
                    <Button variant="outline" onClick={() => window.open(exportUrl, '_blank')}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/sales/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Open Sale
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="sale-filter-stage" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Stage
                        </label>
                        <Select
                            id="sale-filter-stage"
                            options={STAGE_OPTIONS}
                            value={filterStage}
                            onChange={(e) => setFilterStage(e.target.value)}
                            placeholder="All stages"
                        />
                    </div>
                    <div className="min-w-[180px] max-w-xs flex-1">
                        <label htmlFor="sale-filter-property" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Property
                        </label>
                        <Select
                            id="sale-filter-property"
                            options={propertyOptions}
                            value={filterPropertyId}
                            onChange={(e) => setFilterPropertyId(e.target.value)}
                            placeholder="All properties"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="sale-filter-agent" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Agent
                        </label>
                        <Select
                            id="sale-filter-agent"
                            options={agentOptions}
                            value={filterAgentId}
                            onChange={(e) => setFilterAgentId(e.target.value)}
                            placeholder="All agents"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleApplyFilters}>Apply</Button>
                        {(filterStage || filterPropertyId || filterAgentId) && (
                            <Button variant="outline" onClick={handleResetFilters}>
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {view === 'board' ? (
                <SalesBoard
                    sales={board.sales}
                    isLoading={board.isLoading}
                    error={board.error}
                    onChanged={board.refetch}
                />
            ) : isLoading && sales.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading sales…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={sales}
                    columns={columns}
                    searchPlaceholder="Search by sale code, property or buyer…"
                    emptyMessage="No sales yet. Open one from a property that is up for sale."
                    emptyIcon={<Building2 className="h-12 w-12 text-slate-400" aria-hidden="true" />}
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