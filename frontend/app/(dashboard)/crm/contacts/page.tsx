"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, Pencil, Trash2, UserRound } from "lucide-react";
import { useContacts } from "@/hooks/use-contacts";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/entity-states";
import { crmApi } from "@/lib/api";
import { CONTACT_TYPES } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { Contact } from "@/types";

const TYPE_OPTIONS = CONTACT_TYPES.map((option) => ({ value: option.value, label: option.label }));

export default function ContactsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    const [filterType, setFilterType] = useState("");
    const [engagedOnly, setEngagedOnly] = useState(false);
    const [applied, setApplied] = useState({ type: '', engaged: false });
    const [search, setSearch] = useState("");

    const { contacts, paginationMeta, isLoading, error, refetch } = useContacts({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        type: applied.type || undefined,
        engaged: applied.engaged || undefined,
    });

    const handleDelete = useCallback(
        async (contact: Contact) => {
            if (
                !confirm(
                    `Delete ${contact.firstName} ${contact.lastName}? Their communication history and any lead link will be removed too.`,
                )
            )
                return;
            try {
                await crmApi.removeContact(contact.id);
                toast.success("Contact deleted");
                await refetch();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to delete the contact.");
            }
        },
        [refetch],
    );

    const columns: ColumnDef<Contact>[] = useMemo(
        () => [
            {
                accessorKey: "firstName",
                header: "Contact",
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <Link
                            href={`/crm/contacts/${row.original.id}`}
                            className="font-medium hover:underline"
                        >
                            {row.original.firstName} {row.original.lastName}
                        </Link>
                        {row.original.company && (
                            <span className="text-xs text-muted-foreground">{row.original.company}</span>
                        )}
                    </div>
                ),
            },
            {
                id: "type",
                header: "Type",
                cell: ({ row }) => <StatusBadge status={row.original.type} />,
            },
            {
                accessorKey: "email",
                header: "Email",
                cell: ({ row }) => row.original.email || <span className="text-muted-foreground">—</span>,
            },
            {
                accessorKey: "phone",
                header: "Phone",
                cell: ({ row }) => row.original.phone || <span className="text-muted-foreground">—</span>,
            },
            {
                id: "engagement",
                header: "Engagement",
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original._count?.leads ?? 0} lead(s) ·{' '}
                        {row.original._count?.communications ?? 0} log(s)
                    </span>
                ),
            },
            {
                id: "tenant",
                header: "Tenant",
                cell: ({ row }) =>
                    row.original.tenant ? (
                        <Link href={`/tenants/${row.original.tenant.id}`} className="text-sm hover:underline">
                            {row.original.tenant.code}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "actions",
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <RowActionsMenu<Contact>
                            row={row.original}
                            label={`Actions for ${row.original.firstName}`}
                            actions={[
                                {
                                    label: "View contact",
                                    icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (contact) => router.push(`/crm/contacts/${contact.id}`),
                                },
                                {
                                    label: "Edit contact",
                                    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                                    onSelect: (contact) => router.push(`/crm/contacts/${contact.id}/edit`),
                                },
                                {
                                    label: "Delete contact",
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
        setApplied({ type: filterType, engaged: engagedOnly });
        setPage(1);
    };

    const handleResetFilters = () => {
        setFilterType("");
        setEngagedOnly(false);
        setApplied({ type: '', engaged: false });
        setPage(1);
    };

    const exportUrl = crmApi.contactsExportUrl({
        search: search || undefined,
        type: applied.type || undefined,
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
                    <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
                    <p className="text-muted-foreground">
                        Buyers, tenants, landlords, investors, agents and lawyers — one shared directory
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => window.open(exportUrl, "_blank")}>
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Link href="/crm/contacts/new">
                        <Button>
                            <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add Contact
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[180px] max-w-xs flex-1">
                        <label htmlFor="contact-filter-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                            Type
                        </label>
                        <Select
                            id="contact-filter-type"
                            options={TYPE_OPTIONS}
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            placeholder="All types"
                        />
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                        <input
                            id="contact-filter-engaged"
                            type="checkbox"
                            checked={engagedOnly}
                            onChange={(e) => setEngagedOnly(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                        />
                        <label htmlFor="contact-filter-engaged" className="text-sm text-slate-700">
                            Only contacts with a lead or communication
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleApplyFilters}>Apply</Button>
                        {(filterType || engagedOnly) && (
                            <Button variant="outline" onClick={handleResetFilters}>
                                Reset
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {isLoading && contacts.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading contacts…</div>
            ) : error ? (
                <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
                    {error}
                    <Button variant="outline" size="sm" className="ml-3" onClick={refetch}>
                        Retry
                    </Button>
                </div>
            ) : (
                <DataTable
                    data={contacts}
                    columns={columns}
                    searchPlaceholder="Search contacts by name, email, phone or company…"
                    emptyMessage="No contacts yet. Convert a lead, or add one directly."
                    emptyIcon={<UserRound className="h-12 w-12 text-slate-400" aria-hidden="true" />}
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