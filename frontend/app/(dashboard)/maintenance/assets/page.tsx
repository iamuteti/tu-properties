'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, Pencil, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { ASSET_STATUSES, ASSET_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import { useAssets } from '@/hooks/use-maintenance';
import type { Asset } from '@/types';

/**
 * The plant register (Module 9).
 *
 * A register of what the company actually owns and where it is, because the
 * repairs are the evidence. Retired equipment is hidden by default and shown
 * behind a checkbox rather than deleted: the whole value of the register is being
 * able to say what happened to the lift that was here last year.
 */
export default function AssetsPage() {
    const router = useRouter();
    const [filters, setFilters] = useState({
        search: '',
        type: '',
        status: '',
        includeRetired: false,
    });
    const { assets, stats, isLoading, error, refetch } = useAssets({
        search: filters.search || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
        includeRetired: filters.includeRetired,
    });

    const columns: ColumnDef<Asset>[] = useMemo(
        () => [
            {
                accessorKey: 'assetTag',
                header: 'Tag',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">
                        {row.original.assetTag ?? '—'}
                    </span>
                ),
            },
            {
                accessorKey: 'name',
                header: 'Plant',
                cell: ({ row }) => (
                    <div>
                        <Link
                            href={`/maintenance/assets/${row.original.id}`}
                            className="font-medium hover:underline"
                        >
                            {row.original.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            {[row.original.location, row.original.capacity]
                                .filter(Boolean)
                                .join(' · ') || 'No location recorded'}
                        </p>
                    </div>
                ),
            },
            {
                accessorKey: 'type',
                header: 'Type',
                cell: ({ row }) =>
                    ASSET_TYPES.find((option) => option.value === row.original.type)
                        ?.label ?? row.original.type,
            },
            {
                accessorKey: 'property',
                header: 'Property',
                cell: ({ row }) => row.original.property?.name ?? '—',
            },
            {
                accessorKey: 'status',
                header: 'Service state',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                id: 'open',
                header: 'Open faults',
                cell: ({ row }) => {
                    const open = row.original._count?.workOrders ?? 0;
                    return (
                        <span className={open > 0 ? 'font-medium tabular-nums' : 'tabular-nums'}>
                            {open}
                        </span>
                    );
                },
            },
            {
                id: 'service',
                header: 'Next service',
                cell: ({ row }) => {
                    const next = row.original.pmSchedules?.[0]?.nextDueAt;
                    if (!next) return <span className="text-muted-foreground">—</span>;
                    const date = new Date(next);
                    const overdue = date < new Date();
                    return (
                        <span className={overdue ? 'font-medium text-amber-700' : ''}>
                            {date.toLocaleDateString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })}
                            {overdue && ' · due'}
                        </span>
                    );
                },
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => {
                    const asset = row.original;
                    const actions: RowAction<Asset>[] = [
                        {
                            label: 'Open asset',
                            icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (record) => router.push(`/maintenance/assets/${record.id}`),
                        },
                        {
                            label: 'Edit details',
                            icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                            disabled: asset.status === 'RETIRED',
                            disabledReason:
                                'Retired kit keeps its record but is not editable',
                            onSelect: (record) => router.push(`/maintenance/assets/${record.id}/edit`),
                        },
                        {
                            label: 'Mark out of service',
                            icon: <Wrench className="h-4 w-4" aria-hidden="true" />,
                            disabled:
                                asset.status === 'OUT_OF_SERVICE' ||
                                asset.status === 'RETIRED',
                            disabledReason:
                                asset.status === 'RETIRED'
                                    ? 'This asset is retired'
                                    : 'Already out of service',
                            onSelect: async (record) => {
                                try {
                                    await maintenanceApi.changeAssetStatus(
                                        record.id,
                                        'OUT_OF_SERVICE',
                                    );
                                    toast.success(`${record.name} is out of service`);
                                    refetch();
                                } catch (err) {
                                    toast.error(apiMessage(err, 'Could not change the service state'));
                                }
                            },
                        },
                        {
                            label: 'Retire this asset',
                            icon: <Wrench className="h-4 w-4" aria-hidden="true" />,
                            disabled: asset.status === 'RETIRED',
                            disabledReason: 'Already retired',
                            onSelect: async (record) => {
                                if (
                                    !window.confirm(
                                        `Retire ${record.name}? It stops generating preventive work orders and cannot go back into service. The service history is kept.`,
                                    )
                                ) {
                                    return;
                                }
                                try {
                                    await maintenanceApi.changeAssetStatus(record.id, 'RETIRED');
                                    toast.success(`${record.name} retired`);
                                    refetch();
                                } catch (err) {
                                    toast.error(apiMessage(err, 'Could not retire it'));
                                }
                            },
                        },
                    ];

                    return (
                        <RowActionsMenu
                            row={asset}
                            actions={actions}
                            label={`Actions for ${asset.name}`}
                        />
                    );
                },
            },
        ],
        [router, refetch],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Plant register</h1>
                    <p className="text-muted-foreground">
                        The lifts, generators, pumps and cameras the company owns — and what
                        has happened to each of them
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(
                                maintenanceApi.assetsExportUrl({
                                    type: filters.type || undefined,
                                    status: filters.status || undefined,
                                    search: filters.search || undefined,
                                }),
                                '_blank',
                            )
                        }
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Button variant="outline" onClick={() => router.push('/maintenance/schedules')}>
                        Service schedule
                    </Button>
                    <Button onClick={() => router.push('/maintenance/assets/new')}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Add plant
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Counter label="Assets" value={stats.total} />
                    <Counter
                        label="Services overdue"
                        value={stats.serviceOverdue}
                        tone={stats.serviceOverdue > 0 ? 'warn' : 'plain'}
                    />
                    <Counter
                        label="Out of service"
                        value={stats.byStatus?.OUT_OF_SERVICE ?? 0}
                        tone={(stats.byStatus?.OUT_OF_SERVICE ?? 0) > 0 ? 'danger' : 'plain'}
                    />
                    <Counter label="Retired" value={stats.byStatus?.RETIRED ?? 0} />
                </div>
            )}

            <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="asset-search">Search</Label>
                    <Input
                        id="asset-search"
                        value={filters.search}
                        onChange={(event) =>
                            setFilters((current) => ({ ...current, search: event.target.value }))
                        }
                        placeholder="Tag, name, serial number or location"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                        value={filters.type}
                        onChange={(event) =>
                            setFilters((current) => ({ ...current, type: event.target.value }))
                        }
                        options={[
                            { value: '', label: 'Any type' },
                            ...ASSET_TYPES,
                        ]}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Service state</Label>
                    <Select
                        value={filters.status}
                        onChange={(event) =>
                            setFilters((current) => ({ ...current, status: event.target.value }))
                        }
                        options={[
                            { value: '', label: 'In service' },
                            ...ASSET_STATUSES.map((status) => ({
                                value: status.value,
                                label: status.label,
                            })),
                        ]}
                    />
                    <label className="flex items-center gap-2 pt-2 text-sm">
                        <input
                            type="checkbox"
                            checked={filters.includeRetired}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    includeRetired: event.target.checked,
                                }))
                            }
                        />
                        Include retired
                    </label>
                </div>
            </div>

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && assets.length === 0 ? (
                <LoadingState label="Loading the plant register…" />
            ) : assets.length === 0 ? (
                <EmptyState
                    icon={<Wrench className="h-8 w-8" aria-hidden="true" />}
                    title="No plant registered"
                    description="Register the lifts, generators, pumps and cameras you own. Once they are here, faults can be attached to them and a service schedule keeps them running."
                    action={
                        <Button onClick={() => router.push('/maintenance/assets/new')}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add plant
                        </Button>
                    }
                />
            ) : (
                <DataTable
                    data={assets}
                    columns={columns}
                    enableSearch={false}
                    defaultPageSize={25}
                    pageSizeOptions={[25, 50, 100]}
                    emptyMessage="No assets match these filters."
                />
            )}
        </div>
    );
}

function Counter({
    label,
    value,
    tone = 'plain',
}: {
    label: string;
    value: number;
    tone?: 'plain' | 'warn' | 'danger';
}) {
    const toneClass =
        tone === 'danger'
            ? 'text-red-600'
            : tone === 'warn'
              ? 'text-amber-600'
              : 'text-slate-900';
    return (
        <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
        </div>
    );
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
