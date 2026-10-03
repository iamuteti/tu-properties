'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
    Building2,
    Download,
    Eye,
    FileText,
    Landmark,
    Mail,
    Pencil,
    Plus,
    Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLandlords } from '@/hooks/use-landlords';
import { landlordsApi } from '@/lib/api';
import { MANAGEMENT_FEE_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { LandlordFilters, LandlordFiltersState } from '@/components/filters/landlords-filter';
import { StatementGenerateDialog } from '@/components/landlords/statement-generate-dialog';
import { PayoutFormDialog } from '@/components/landlords/payout-form-dialog';
import type { Landlord } from '@/types';

/**
 * Landlord list (Module 6).
 *
 * The row actions are the module's working surface: from here you open the
 * owner, run a statement, record a cost or send them money. The two money pages
 * (statements, payouts) are linked from the header rather than duplicated here.
 */
export default function LandlordsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [filters, setFilters] = useState<LandlordFiltersState>({
        code: '',
        name: '',
        status: '',
    });
    const [statementFor, setStatementFor] = useState<Landlord | null>(null);
    const [payoutFor, setPayoutFor] = useState<Landlord | null>(null);

    const effectiveSearch = useMemo(() => {
        const parts = [filters.code, filters.name].filter(Boolean);
        return parts.join(' ') || undefined;
    }, [filters.code, filters.name]);

    const { landlords, paginationMeta, isLoading, error, refetch } = useLandlords({
        page,
        limit,
        search: effectiveSearch,
        sortBy,
        sortOrder,
        status: filters.status || undefined,
    });

    const handlePaginationChange = useCallback((next: { page: number; limit: number }) => {
        setPage(next.page);
        setLimit(next.limit);
    }, []);

    const handleSortChange = useCallback((nextSortBy: string, nextOrder: 'asc' | 'desc') => {
        setSortBy(nextSortBy);
        setSortOrder(nextOrder);
        setPage(1);
    }, []);

    const feeLabel = (landlord: Landlord) => {
        if (landlord.managementFeeType === 'FIXED') {
            return `Flat ${landlord.managementFeeAmount ?? 0}`;
        }
        return `${landlord.managementFeeRate ?? 0}%`;
    };

    const columns: ColumnDef<Landlord>[] = useMemo(
        () => [
            {
                accessorKey: 'code',
                header: 'Code',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium">{row.original.code}</span>
                    </div>
                ),
            },
            {
                accessorKey: 'name',
                header: 'Name',
                cell: ({ row }) => (
                    <Link
                        href={`/landlords/${row.original.id}`}
                        className="font-medium hover:underline"
                    >
                        {row.original.name}
                    </Link>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                id: 'properties',
                header: 'Properties',
                cell: ({ row }) => (
                    <span className="inline-flex items-center gap-1 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {row.original.properties?.length ?? 0}
                    </span>
                ),
            },
            {
                id: 'fee',
                header: 'Management fee',
                cell: ({ row }) => <span className="tabular-nums">{feeLabel(row.original)}</span>,
            },
            {
                accessorKey: 'email',
                header: 'Email',
                cell: ({ row }) => (
                    <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {row.original.email || '—'}
                    </div>
                ),
            },
            {
                accessorKey: 'phone',
                header: 'Phone',
                cell: ({ row }) => row.original.phone || '—',
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => {
                    const actions: RowAction<Landlord>[] = [
                        {
                            label: 'View owner',
                            icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (landlord) => router.push(`/landlords/${landlord.id}`),
                        },
                        {
                            label: 'Edit details',
                            icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (landlord) =>
                                router.push(`/landlords/${landlord.id}/edit`),
                        },
                        {
                            label: 'Generate statement',
                            icon: <FileText className="h-4 w-4" aria-hidden="true" />,
                            disabled: (row.original.properties?.length ?? 0) === 0,
                            disabledReason: 'This landlord has no properties to bill for',
                            onSelect: (landlord) => setStatementFor(landlord),
                        },
                        {
                            label: 'Record payout',
                            icon: <Receipt className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (landlord) => setPayoutFor(landlord),
                        },
                    ];

                    return (
                        <RowActionsMenu
                            row={row.original}
                            actions={actions}
                            label={`Actions for ${row.original.name}`}
                        />
                    );
                },
            },
        ],
        [router],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Landlords</h1>
                    <p className="text-muted-foreground">
                        Owners, their management agreements, and what they are owed
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(landlordsApi.exportUrl({ status: filters.status || undefined }), '_blank')
                        }
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/landlords/statements')}>
                        <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                        Statements
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/landlords/payouts')}>
                        <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
                        Payouts
                    </Button>
                    <Button onClick={() => router.push('/landlords/new')}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Add Landlord
                    </Button>
                </div>
            </div>

            <LandlordFilters
                filters={filters}
                onFiltersChange={(next) => {
                    setFilters(next);
                    setPage(1);
                }}
                onReset={() => {
                    setFilters({ code: '', name: '', status: '' });
                    setPage(1);
                }}
            />

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && landlords.length === 0 ? (
                <LoadingState label="Loading landlords…" />
            ) : landlords.length === 0 ? (
                <EmptyState
                    icon={<Landmark className="h-8 w-8" aria-hidden="true" />}
                    title="No landlords yet"
                    description="Add the property owners you manage — they are the other half of the rent relationship: money flows to them, not from them."
                    action={
                        <Button onClick={() => router.push('/landlords/new')}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add Landlord
                        </Button>
                    }
                />
            ) : (
                <DataTable
                    data={landlords}
                    columns={columns}
                    serverSidePagination
                    paginationMeta={paginationMeta ?? undefined}
                    onPaginationChange={handlePaginationChange}
                    onSortChange={handleSortChange}
                    enableSearch={false}
                />
            )}

            <StatementGenerateDialog
                isOpen={Boolean(statementFor)}
                onClose={() => setStatementFor(null)}
                landlordId={statementFor?.id}
                onGenerated={() => {
                    refetch();
                    toast.success('Statement generated');
                }}
            />

            <PayoutFormDialog
                isOpen={Boolean(payoutFor)}
                onClose={() => setPayoutFor(null)}
                landlordId={payoutFor?.id ?? ''}
                landlordName={payoutFor?.name}
                onRecorded={refetch}
            />

            <p className="text-xs text-muted-foreground">
                Management fee terms ({MANAGEMENT_FEE_TYPES[0].label.toLowerCase()} or{' '}
                {MANAGEMENT_FEE_TYPES[1].label.toLowerCase()}) are set per landlord and deducted
                from every statement generated for them.
            </p>
        </div>
    );
}