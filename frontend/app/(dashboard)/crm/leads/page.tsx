"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Columns3, Download, Eye, KanbanSquare, Pencil, Trash2, UserPlus } from "lucide-react";
import { useLeads, useLeadPipeline } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { useUsers } from "@/hooks/use-users";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { LeadStageBadge } from "@/components/crm/lead-stage-badge";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { crmApi } from "@/lib/api";
import { LEAD_SOURCES, LEAD_STAGES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Lead } from "@/types";

const STAGE_OPTIONS = LEAD_STAGES.map((stage) => ({ value: stage.value, label: stage.label }));
const SOURCE_OPTIONS = LEAD_SOURCES.map((source) => ({ value: source.value, label: source.label }));

export default function LeadsPage() {
    const router = useRouter();
    const [view, setView] = useState<"list" | "board">("list");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterStage, setFilterStage] = useState("");
    const [filterSource, setFilterSource] = useState("");
    const [filterPropertyId, setFilterPropertyId] = useState("");
    const [filterAgentId, setFilterAgentId] = useState("");
    const [unassignedOnly, setUnassignedOnly] = useState(false);
    const [applied, setApplied] = useState({
        stage: "",
        source: "",
        propertyId: "",
        agentId: "",
        unassigned: false,
    });
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

    const { leads, paginationMeta, isLoading, error, refetch } = useLeads({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        stage: applied.stage || undefined,
        source: applied.source || undefined,
        propertyId: applied.propertyId || undefined,
        assignedAgentId: applied.agentId || undefined,
        unassigned: applied.unassigned || undefined,
    });

    const board = useLeadPipeline({
        propertyId: applied.propertyId || undefined,
        agentId: applied.agentId || undefined,
    });

    const handleDelete = useCallback(
        async (lead: Lead) => {
            if (!confirm(`Delete the lead for ${lead.firstName} ${lead.lastName ?? ""}?`)) return;
            try {
                await crmApi.removeLead(lead.id);
                toast.success("Lead deleted");
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to delete the lead.");
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Lead>[] = useMemo(
        () => [
            {
                accessorKey: "firstName",
                header: "Lead",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link href={`/crm/leads/${row.original.id}`} className="font-medium hover:underline">
                            {row.original.firstName} {row.original.lastName ?? ""}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                            {row.original.email || row.original.phone || "no contact details"}
                        </span>
                    </div>
                ),
            },
            {
                id: "stage",
                header: "Stage",
                cell: ({ row }) => <LeadStageBadge stage={row.original.stage} />,
            },
            {
                id: "source",
                header: "Source",
                cell: ({ row }) => (
                    <span className="text-sm">
                        {LEAD_SOURCES.find((s) => s.value === row.original.source)?.label ??
                            row.original.source}
                    </span>
                ),
            },
            {
                id: "property",
                header: "Interested in",
                cell: ({ row }) =>
                    row.original.interestedProperty ? (
                        <Link
                            href={`/properties/${row.original.interestedProperty.id}`}
                            className="text-sm hover:underline"
                        >
                            {row.original.interestedProperty.name}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "agent",
                header: "Agent",
                cell: ({ row }) =>
                    row.original.assignedAgent ? (
                        <span className="text-sm">
                            {row.original.assignedAgent.firstName} {row.original.assignedAgent.lastName}
                        </span>
                    ) : (
                        <span className="text-sm text-amber-600">Unassigned</span>
                    ),
            },
            {
                id: "createdAt",
                header: "Captured",
                cell: ({ row }) => (
                    <span className="text-sm text-muted-foreground">
                        {new Date(row.original.createdAt).toLocaleDateString()}
                    </span>
                ),
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Lead>
                            row={row.original}
                            label={`Actions for ${row.original.firstName}`}
                            actions={[
                                {
                                    label: "View lead",
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (lead) => router.push(`/crm/leads/${lead.id}`),
                                },
                                {
                                    label: "Edit lead",
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (lead) => router.push(`/crm/leads/${lead.id}/edit`),
                                },
                                {
                                    label: "Convert to contact",
                                    icon: <UserPlus className="h-4 w-4" aria-hidden="true" />,
                                    disabled: Boolean(row.original.contactId),
                                    disabledReason: row.original.contactId
                                        ? "Already converted"
                                        : undefined,
                                    onSelect: (lead) => router.push(`/crm/leads/${lead.id}`),
                                },
                                {
                                    label: "Delete lead",
                                    icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                                    variant: "danger",
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
            source: filterSource,
            propertyId: filterPropertyId,
            agentId: filterAgentId,
            unassigned: unassignedOnly,
        });
        setPage(1);
    };

    const handleResetFilters = () => {
        setFilterStage("");
        setFilterSource("");
        setFilterPropertyId("");
        setFilterAgentId("");
        setUnassignedOnly(false);
        setApplied({ stage: "", source: "", propertyId: "", agentId: "", unassigned: false });
        setPage(1);
    };

    const hasActiveFilters =
        filterStage || filterSource || filterPropertyId || filterAgentId || unassignedOnly;

    const exportUrl = crmApi.leadsExportUrl({
        search: search || undefined,
        stage: applied.stage || undefined,
        source: applied.source || undefined,
        propertyId: applied.propertyId || undefined,
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
                    <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
                    <p className="text-muted-foreground">
                        Enquiries from the website, social media, walk-ins and referrals
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-md border p-0.5">
                        <button
                            type="button"
                            onClick={() => setView("list")}
                            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                                view === "list" ? "bg-slate-900 text-white" : "text-slate-600"
                            }`}
                        >
                            <KanbanSquare className="h-4 w-4" aria-hidden="true" />
                            List
                        </button>
                        <button
                            type="button"
                            onClick={() => setView("board")}
                            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                                view === "board" ? "bg-slate-900 text-white" : "text-slate-600"
                            }`}
                        >
                            <Columns3 className="h-4 w-4" aria-hidden="true" />
                            Pipeline
                        </button>
                    </div>
                    <Button variant="outline" onClick={() => window.open(exportUrl, "_blank")}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/crm/leads/new">
                        <Button>
                            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add Lead
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="lead-filter-stage" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Stage
                        </label>
                        <Select
                            id="lead-filter-stage"
                            options={STAGE_OPTIONS}
                            value={filterStage}
                            onChange={(e) => setFilterStage(e.target.value)}
                            placeholder="All stages"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="lead-filter-source" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Source
                        </label>
                        <Select
                            id="lead-filter-source"
                            options={SOURCE_OPTIONS}
                            value={filterSource}
                            onChange={(e) => setFilterSource(e.target.value)}
                            placeholder="All sources"
                        />
                    </div>
                    <div className="min-w-[180px] max-w-xs flex-1">
                        <label htmlFor="lead-filter-property" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Property
                        </label>
                        <Select
                            id="lead-filter-property"
                            options={propertyOptions}
                            value={filterPropertyId}
                            onChange={(e) => setFilterPropertyId(e.target.value)}
                            placeholder="All properties"
                        />
                    </div>
                    <div className="min-w-[160px] max-w-xs flex-1">
                        <label htmlFor="lead-filter-agent" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Agent
                        </label>
                        <Select
                            id="lead-filter-agent"
                            options={agentOptions}
                            value={filterAgentId}
                            onChange={(e) => setFilterAgentId(e.target.value)}
                            placeholder="All agents"
                        />
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                        <input
                            id="lead-filter-unassigned"
                            type="checkbox"
                            checked={unassignedOnly}
                            onChange={(e) => setUnassignedOnly(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        <label htmlFor="lead-filter-unassigned" className="text-sm text-slate-700">
                            Unassigned only
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleApplyFilters}>Apply</Button>
                        {hasActiveFilters && (
                            <Button variant="outline" onClick={handleResetFilters}>
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {view === "board" ? (
                <PipelineBoard
                    leads={board.leads}
                    isLoading={board.isLoading}
                    error={board.error}
                    onChanged={board.refetch}
                />
            ) : isLoading && leads.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading leads…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={leads}
                    columns={columns}
                    searchPlaceholder="Search leads by name, email or phone…"
                    emptyMessage="No leads yet. Capture one manually or wire up the public lead form."
                    emptyIcon={<UserPlus className="h-12 w-12 text-slate-400" aria-hidden="true" />}
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