'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Download, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useOwnerStatements } from '@/hooks/use-owner-statements';
import { ownerStatementsApi } from '@/lib/api';
import { OWNER_STATEMENT_STATUSES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { StatementGenerateDialog } from '@/components/landlords/statement-generate-dialog';
import { StatementStatusBadge } from '@/components/landlords/statement-status-badge';
import type { OwnerStatement } from '@/types';

const money = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Owner statements (Module 6).
 *
 * A register of the documents, newest period first. Generation is a dialog
 * rather than a row action because a statement is built from a *period*, not
 * from a landlord — you need to see the derived figures before it exists.
 */
export default function OwnerStatementsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [sortBy, setSortBy] = useState('periodEnd');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [status, setStatus] = useState('');
    const [landlordId, setLandlordId] = useState('');
    const [search, setSearch] = useState('');
    const [isGenerateOpen, setIsGenerateOpen] = useState(false);

    const { statements, paginationMeta, isLoading, error, refetch } = useOwnerStatements({
        page,
        limit,
        search: search || undefined,
        sortBy,
        sortOrder,
        status: status || undefined,
        landlordId: landlordId || undefined,
    });

    const columns: ColumnDef<OwnerStatement>[] = [
        {
            accessorKey: 'statementNumber',
            header: 'Statement',
            cell: ({ row }) => (
                <Link
                    href={`/landlords/statements/${row.original.id}`}
                    className="font-medium hover:underline"
                >
                    {row.original.statementNumber}
                </Link>
            ),
        },
        {
            id: 'landlord',
            header: 'Landlord',
            cell: ({ row }) => row.original.landlord?.name ?? '—',
        },
        {
            id: 'period',
            header: 'Period',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {row.original.periodStart.slice(0, 10)} –{' '}
                    {row.original.periodEnd.slice(0, 10)}
                </span>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <StatementStatusBadge status={row.original.status} />,
        },
        {
            accessorKey: 'grossIncome',
            header: 'Collected',
            cell: ({ row }) => (
                <span className="tabular-nums">{money(row.original.grossIncome)}</span>
            ),
        },
        {
            accessorKey: 'expenses',
            header: 'Expenses',
            cell: ({ row }) => (
                <span className="tabular-nums text-red-600">{money(row.original.expenses)}</span>
            ),
        },
        {
            accessorKey: 'managementFee',
            header: 'Fee',
            cell: ({ row }) => (
                <span className="tabular-nums text-red-600">{money(row.original.managementFee)}</span>
            ),
        },
        {
            accessorKey: 'netPayout',
            header: 'Net payout',
            cell: ({ row }) => (
                <span className="font-semibold tabular-nums">{money(row.original.netPayout)}</span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/landlords')}
                        className="mb-2 -ml-2"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Landlords
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">Owner statements</h1>
                    <p className="text-muted-foreground">
                        Each period&rsquo;s account: rent collected, costs deducted, fee, net payout
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(
                                ownerStatementsApi.exportUrl({
                                    status: status || undefined,
                                    landlordId: landlordId || undefined,
                                }),
                                '_blank',
                            )
                        }
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Button onClick={() => setIsGenerateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Generate statement
                    </Button>
                </div>
            </div>

<div className="flex flex-wrap items-center gap-3">
                <div className="w-52">
                    <Select
                        value={status || 'all'}
                        options={[
                            { value: 'all', label: 'All statuses' },
                            ...OWNER_STATEMENT_STATUSES.map((option) => ({
                                value: option.value,
                                label: option.label,
                            })),
                        ]}
                        onChange={(event) => {
                            const value = event.target.value;
                            setStatus(value === 'all' ? '' : value);
                            setPage(1);
                        }}
                    />
                </div>

                <div className="w-64">
                    <Input
                        type="search"
                        value={landlordId}
                        onChange={(event) => setLandlordId(event.target.value)}
                        placeholder="Landlord id (paste from the owner page)"
                        aria-label="Filter by landlord id"
                    />
                </div>

                <div className="min-w-56 flex-1">
                    <Input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Search by statement number or landlord name"
                        aria-label="Search statements"
                    />
                </div>
            </div>

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && statements.length === 0 ? (
                <LoadingState label="Loading statements…" />
            ) : statements.length === 0 ? (
                <EmptyState
                    icon={<FileText className="h-8 w-8" aria-hidden="true" />}
                    title="No owner statements yet"
                    description="Generate one for a completed period. The figures come from the rent payments already recorded against the landlord's properties — nothing is typed in."
                    action={
                        <Button onClick={() => setIsGenerateOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Generate statement
                        </Button>
                    }
                />
            ) : (
                <DataTable
                    data={statements}
                    columns={columns}
                    enableSearch={false}
                    serverSidePagination
                    paginationMeta={paginationMeta ?? undefined}
                    onPaginationChange={(next) => {
                        setPage(next.page);
                        setLimit(next.limit);
                    }}
                    onSortChange={(nextSortBy, nextOrder) => {
                        setSortBy(nextSortBy);
                        setSortOrder(nextOrder);
                        setPage(1);
                    }}
                />
            )}

            <StatementGenerateDialog
                isOpen={isGenerateOpen}
                onClose={() => setIsGenerateOpen(false)}
                onGenerated={() => {
                    refetch();
                    toast.success('Statement generated');
                }}
            />
        </div>
    );
}