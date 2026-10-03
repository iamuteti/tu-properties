'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Banknote, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useLandlordPayouts } from '@/hooks/use-landlord-payouts';
import { landlordPayoutsApi } from '@/lib/api';
import { PAYMENT_METHODS, PAYOUT_STATUSES } from '@/lib/constants';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
    PayoutStatusBadge,
    PayoutStatusDialog,
    availablePayoutTransitions,
} from '@/components/landlords/payout-status-dialog';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import type { LandlordPayout, PayoutStatus } from '@/types';

const money = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Owner payouts (Module 6).
 *
 * The register of money going out to owners. A row's actions are its available
 * state transitions — a paid payout offers none, because that record is closed.
 */
export default function LandlordPayoutsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [landlordId, setLandlordId] = useState('');
    const [statusTarget, setStatusTarget] = useState<{
        payout: LandlordPayout;
        status: PayoutStatus;
    } | null>(null);

    const { payouts, paginationMeta, isLoading, error, refetch } = useLandlordPayouts({
        page,
        limit,
        search: search || undefined,
        status: status || undefined,
        landlordId: landlordId || undefined,
    });

    const columns: ColumnDef<LandlordPayout>[] = [
        {
            id: 'landlord',
            header: 'Landlord',
            cell: ({ row }) => (
                <Link
                    href={`/landlords/${row.original.landlordId}`}
                    className="font-medium hover:underline"
                >
                    {row.original.landlord?.name ?? row.original.landlordId}
                </Link>
            ),
        },
        {
            id: 'statement',
            header: 'Statement',
            cell: ({ row }) =>
                row.original.ownerStatement ? (
                    <Link
                        href={`/landlords/statements/${row.original.ownerStatement.id}`}
                        className="hover:underline"
                    >
                        {row.original.ownerStatement.statementNumber}
                    </Link>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => (
                <span className="font-semibold tabular-nums">{money(row.original.amount)}</span>
            ),
        },
        {
            accessorKey: 'method',
            header: 'Method',
            cell: ({ row }) =>
                PAYMENT_METHODS.find((option) => option.value === row.original.method)?.label ??
                row.original.method,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <PayoutStatusBadge status={row.original.status} />,
        },
        {
            accessorKey: 'reference',
            header: 'Reference',
            cell: ({ row }) => row.original.reference || '—',
        },
        {
            accessorKey: 'paidAt',
            header: 'Paid on',
            cell: ({ row }) =>
                row.original.paidAt ? row.original.paidAt.slice(0, 10) : '—',
        },
        {
            id: 'actions',
            header: 'Actions',
cell: ({ row }) => {
                const transitions = availablePayoutTransitions(row.original.status);
                const actions: RowAction<LandlordPayout>[] = transitions.map((next) => ({
                    label:
                        next === 'PAID'
                            ? 'Mark paid'
                            : next === 'PROCESSING'
                              ? 'Mark processing'
                              : next === 'FAILED'
                                ? 'Mark failed'
                                : 'Move to pending',
                    icon:
                        next === 'PAID' ? (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        ) : next === 'FAILED' ? (
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Clock className="h-4 w-4" aria-hidden="true" />
                        ),
                    variant: next === 'FAILED' ? ('danger' as const) : ('default' as const),
                    onSelect: (payout) => setStatusTarget({ payout, status: next }),
                }));

                return (
                    <RowActionsMenu
                        row={row.original}
                        actions={actions}
                        label={`Actions for payout of ${row.original.amount}`}
                    />
                );
            },
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
                    <h1 className="text-3xl font-bold tracking-tight">Owner payouts</h1>
                    <p className="text-muted-foreground">
                        Money transferred to landlords, and the statements it settles
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        window.open(
                            landlordPayoutsApi.exportUrl({
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
            </div>

<div className="flex flex-wrap items-center gap-3">
                <div className="w-52">
                    <Select
                        value={status || 'all'}
                        options={[
                            { value: 'all', label: 'All statuses' },
                            ...PAYOUT_STATUSES.map((option) => ({
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
                        onChange={(event) => {
                            setLandlordId(event.target.value);
                            setPage(1);
                        }}
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
                        placeholder="Search by reference, notes or landlord"
                        aria-label="Search payouts"
                    />
                </div>
            </div>

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && payouts.length === 0 ? (
                <LoadingState label="Loading payouts…" />
            ) : payouts.length === 0 ? (
                <EmptyState
                    icon={<Banknote className="h-8 w-8" aria-hidden="true" />}
                    title="No payouts recorded"
                    description="Record a payout from a landlord's page or their statement. It starts as pending and only becomes paid once you have the transfer reference."
                />
            ) : (
                <DataTable
                    data={payouts}
                    columns={columns}
                    enableSearch={false}
                    serverSidePagination
                    paginationMeta={paginationMeta ?? undefined}
                    onPaginationChange={(next) => {
                        setPage(next.page);
                        setLimit(next.limit);
                    }}
                />
            )}

            <PayoutStatusDialog
                isOpen={Boolean(statusTarget)}
                payout={statusTarget?.payout ?? null}
                targetStatus={statusTarget?.status ?? null}
                onClose={() => setStatusTarget(null)}
                onUpdated={() => {
                    refetch();
                    toast.success('Payout updated');
                }}
            />

            <p className="text-xs text-muted-foreground">
                A payout is recorded here and transferred in the bank — the reference is what
                makes it auditable, so one is required before a payout can be marked paid.
            </p>
        </div>
    );
}