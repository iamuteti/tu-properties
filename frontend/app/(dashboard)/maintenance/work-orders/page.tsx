'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
    AlertTriangle,
    CalendarClock,
    Download,
    Eye,
    KanbanSquare,
    Pencil,
    Plus,
    UserPlus,
    Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import {
    MAINTENANCE_CATEGORIES,
    OPEN_WORK_ORDER_STATUSES,
    WORK_ORDER_PRIORITIES,
    WORK_ORDER_STATUSES,
} from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import {
    WorkOrderActionDialog,
} from '@/components/maintenance/work-order-action-dialog';
import { useTechnicians, useWorkOrders } from '@/hooks/use-maintenance';
import type { WorkOrder, WorkOrderAction } from '@/types';

/**
 * The maintenance queue (Module 9).
 *
 * The board is the working surface; this list is the reporting one, so it shows
 * the columns a manager needs to answer "is anything late": the response window,
 * who has it, and how long it has been sitting. The counters at the top are the
 * reason the page exists — an overdue queue that you have to count by hand is a
 * queue nobody checks.
 */
export default function WorkOrdersPage() {
    const router = useRouter();
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        category: '',
        priority: '',
        assigned: '',
        openOnly: true,
    });
    const [selected, setSelected] = useState<WorkOrder[]>([]);
    const [actionFor, setActionFor] = useState<{
        workOrder: WorkOrder;
        action: WorkOrderAction;
    } | null>(null);
    const [bulkFor, setBulkFor] = useState(false);

    const { workOrders, stats, isLoading, error, refetch } = useWorkOrders({
        search: filters.search || undefined,
        status: filters.status || undefined,
        category: filters.category || undefined,
        priority: filters.priority || undefined,
        assigned: filters.assigned || undefined,
        open: filters.openOnly || undefined,
    });
    const { technicians } = useTechnicians();

    const columns: ColumnDef<WorkOrder>[] = useMemo(
        () => [
            {
                accessorKey: 'reference',
                header: 'Reference',
                cell: ({ row }) => (
                    <Link
                        href={`/maintenance/work-orders/${row.original.id}`}
                        className="font-medium hover:underline"
                    >
                        {row.original.reference}
                    </Link>
                ),
            },
            {
                accessorKey: 'title',
                header: 'What is wrong',
                cell: ({ row }) => (
                    <div className="min-w-[16rem]">
                        <p className="font-medium">{row.original.title}</p>
                        <p className="text-xs text-muted-foreground">
                            {[row.original.property?.name, row.original.unit?.name]
                                .filter(Boolean)
                                .join(' · ') || 'No location given'}
                            {row.original.source === 'TENANT_PORTAL' && ' · reported by a resident'}
                            {row.original.source === 'PREVENTIVE' && ' · scheduled service'}
                        </p>
                    </div>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                accessorKey: 'priority',
                header: 'Priority',
                cell: ({ row }) => {
                    const priority = WORK_ORDER_PRIORITIES.find(
                        (option) => option.value === row.original.priority,
                    );
                    return (
                        <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priority?.className ?? 'bg-slate-100 text-slate-700'}`}
                            title={`Response window: ${priority?.window ?? '7 days'}`}
                        >
                            {priority?.label ?? row.original.priority}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'category',
                header: 'Trade',
                cell: ({ row }) =>
                    MAINTENANCE_CATEGORIES.find(
                        (option) => option.value === row.original.category,
                    )?.label ?? row.original.category,
            },
            {
                id: 'assigned',
                header: 'Technician',
                cell: ({ row }) =>
                    row.original.assignedTechnician ? (
                        <span className="text-sm">
                            {row.original.assignedTechnician.firstName}{' '}
                            {row.original.assignedTechnician.lastName}
                        </span>
                    ) : (
                        <span className="text-sm text-muted-foreground">
                            Nobody yet
                        </span>
                    ),
            },
            {
                id: 'response',
                header: 'Response',
                cell: ({ row }) => {
                    if (row.original.overdue) {
                        return (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                Overdue
                            </span>
                        );
                    }
                    const hours = row.original.hoursRemaining;
                    if (hours === undefined || hours === null) return '—';
                    if (hours < 0) return '—';
                    if (hours < 48) return `${hours}h left`;
                    return `${Math.round(hours / 24)}d left`;
                },
            },
            {
                id: 'checklist',
                header: 'Checklist',
                cell: ({ row }) => {
                    const total = row.original.tasks?.length ?? 0;
                    const open = row.original.openTasks ?? 0;
                    if (total === 0) return <span className="text-muted-foreground">—</span>;
                    return (
                        <span className="text-sm tabular-nums">
                            {total - open}/{total}
                        </span>
                    );
                },
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => {
                    const workOrder = row.original;
                    const actions: RowAction<WorkOrder>[] = [
                        {
                            label: 'Open work order',
                            icon: <Eye className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (record) => router.push(`/maintenance/work-orders/${record.id}`),
                        },
                        {
                            label: 'Edit details',
                            icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
                            disabled:
                                workOrder.status === 'CLOSED' ||
                                workOrder.status === 'CANCELLED',
                            disabledReason:
                                'This record is finished — raise a new work order instead',
                            onSelect: (record) =>
                                router.push(`/maintenance/work-orders/${record.id}/edit`),
                        },
                    ];

                    // The row's own buttons, in the order the state machine allows.
                    (workOrder.availableActions ?? [])
                        .filter((action) => action !== 'CANCEL')
                        .forEach((action) => {
                            actions.push({
                                label: actionLabel(action),
                                icon:
                                    action === 'ASSIGN' ? (
                                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                        <Wrench className="h-4 w-4" aria-hidden="true" />
                                    ),
                                onSelect: (record) => setActionFor({ workOrder: record, action }),
                            });
                        });

                    if ((workOrder.availableActions ?? []).includes('CANCEL')) {
                        actions.push({
                            label: 'Cancel work order',
                            icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
                            onSelect: (record) => setActionFor({ workOrder: record, action: 'CANCEL' }),
                        });
                    }

                    if (workOrder.status === 'INSPECTION') {
                        actions.push({
                            label: 'Send for approval',
                            icon: <CalendarClock className="h-4 w-4" aria-hidden="true" />,
                            onSelect: async (record) => {
                                try {
                                    const response = await maintenanceApi.requestWorkOrderApproval(
                                        record.id,
                                    );
                                    toast.success(
                                        response.data.approval.status === 'APPROVED'
                                            ? 'No approval policy applies — approved immediately'
                                            : 'Sent for approval',
                                    );
                                    refetch();
                                } catch (err) {
                                    toast.error(apiMessage(err, 'Could not send for approval'));
                                }
                            },
                        });
                    }

                    return (
                        <RowActionsMenu
                            row={workOrder}
                            actions={actions}
                            label={`Actions for ${workOrder.reference}`}
                        />
                    );
                },
            },
        ],
        [router, refetch],
    );

    const assignable = useMemo(
        () =>
            selected.filter((workOrder) =>
                (workOrder.availableActions ?? []).includes('ASSIGN'),
            ),
        [selected],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Maintenance</h1>
                    <p className="text-muted-foreground">
                        Every fault reported, scheduled or found — and who is on it
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(
                                maintenanceApi.workOrdersExportUrl({
                                    status: filters.status || undefined,
                                    category: filters.category || undefined,
                                    search: filters.search || undefined,
                                    open: filters.openOnly ? 'true' : undefined,
                                }),
                                '_blank',
                            )
                        }
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Export CSV
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => router.push('/maintenance/work-orders/board')}
                    >
                        <KanbanSquare className="mr-2 h-4 w-4" aria-hidden="true" />
                        Board
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => router.push('/maintenance/assets')}
                    >
                        Plant register
                    </Button>
                    <Button onClick={() => router.push('/maintenance/work-orders/new')}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Report a fault
                    </Button>
                </div>
            </div>

            {/* The counters the page exists for. */}
            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Counter label="Open" value={stats.open} />
                    <Counter
                        label="Overdue"
                        value={stats.overdue}
                        tone={stats.overdue > 0 ? 'danger' : 'plain'}
                    />
                    <Counter
                        label="Emergency"
                        value={stats.emergency}
                        tone={stats.emergency > 0 ? 'danger' : 'plain'}
                    />
                    <Counter
                        label="Unassigned"
                        value={stats.unassigned}
                        tone={stats.unassigned > 0 ? 'warn' : 'plain'}
                    />
                    <Counter label="Scheduled this week" value={stats.scheduledThisWeek} />
                    <Counter
                        label="Awaiting approval"
                        value={stats.awaitingApproval}
                    />
                </div>
            )}

            {/* Filters */}
            <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="wo-search">Search</Label>
                    <Input
                        id="wo-search"
                        value={filters.search}
                        onChange={(event) =>
                            setFilters((current) => ({ ...current, search: event.target.value }))
                        }
                        placeholder="Reference, title or description"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                        value={filters.status}
                        onChange={(event) =>
                            setFilters((current) => ({
                                ...current,
                                status: event.target.value,
                            }))
                        }
                        options={[
                            { value: '', label: 'Any status' },
                            ...WORK_ORDER_STATUSES.map((status) => ({
                                value: status.value,
                                label: status.label,
                            })),
                        ]}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Trade</Label>
                    <Select
                        value={filters.category}
                        onChange={(event) =>
                            setFilters((current) => ({
                                ...current,
                                category: event.target.value,
                            }))
                        }
                        options={[
                            { value: '', label: 'Any trade' },
                            ...MAINTENANCE_CATEGORIES,
                        ]}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Assigned</Label>
                    <Select
                        value={filters.assigned}
                        onChange={(event) =>
                            setFilters((current) => ({
                                ...current,
                                assigned: event.target.value,
                            }))
                        }
                        options={[
                            { value: '', label: 'Anyone' },
                            { value: 'unassigned', label: 'Nobody yet' },
                            ...technicians.map((technician) => ({
                                value: technician.id,
                                label: `${technician.firstName} ${technician.lastName}`,
                            })),
                        ]}
                    />
                </div>
                <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={filters.openOnly}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    openOnly: event.target.checked,
                                }))
                            }
                        />
                        Live work only
                    </label>
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(
                                maintenanceApi.workOrdersExportUrl({
                                    status: filters.status || undefined,
                                    category: filters.category || undefined,
                                    search: filters.search || undefined,
                                    open: filters.openOnly ? 'true' : undefined,
                                }),
                                '_blank',
                            )
                        }
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        CSV
                    </Button>
                </div>
            </div>

            {selected.length > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3">
                    <p className="text-sm">
                        {selected.length} selected
                        {assignable.length < selected.length && (
                            <span className="text-muted-foreground">
                                {' '}
                                — {selected.length - assignable.length} cannot be assigned
                                from their current state
                            </span>
                        )}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setSelected([])}>
                            Clear
                        </Button>
                        <Button
                            disabled={assignable.length === 0}
                            onClick={() => setBulkFor(true)}
                        >
                            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Assign to a technician
                        </Button>
                    </div>
                </div>
            )}

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && workOrders.length === 0 ? (
                <LoadingState label="Loading the maintenance queue…" />
            ) : (
                <DataTable
                    data={workOrders}
                    columns={columns}
                    enableSearch={false}
                    enableRowSelection
                    onRowSelectionChange={setSelected}
                    defaultPageSize={25}
                    pageSizeOptions={[25, 50, 100]}
                    emptyMessage="No work orders match these filters."
                    emptyIcon={<Wrench className="mx-auto h-12 w-12 text-slate-400" />}
                />
            )}

            {actionFor && (
                <WorkOrderActionDialog
                    isOpen
                    action={actionFor.action}
                    workOrder={actionFor.workOrder}
                    onClose={() => setActionFor(null)}
                    onDone={refetch}
                />
            )}

            <BulkAssignDialog
                isOpen={bulkFor}
                workOrders={assignable}
                onClose={() => setBulkFor(false)}
                onDone={(summary) => {
                    if (summary.failed > 0) {
                        toast.warning(
                            `${summary.assigned} assigned, ${summary.failed} refused`,
                            { description: summary.firstFailure },
                        );
                    } else {
                        toast.success(`${summary.assigned} work orders assigned`);
                    }
                    setSelected([]);
                    refetch();
                }}
            />

            <p className="text-xs text-muted-foreground">
                {OPEN_WORK_ORDER_STATUSES.length} states count as live work:{' '}
                {OPEN_WORK_ORDER_STATUSES.map(
                    (status) =>
                        WORK_ORDER_STATUSES.find((option) => option.value === status)?.label,
                ).join(', ')}
                . A closed or cancelled work order is history and cannot be edited.
            </p>
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

function BulkAssignDialog({
    isOpen,
    workOrders,
    onClose,
    onDone,
}: {
    isOpen: boolean;
    workOrders: WorkOrder[];
    onClose: () => void;
    onDone: (summary: {
        assigned: number;
        failed: number;
        firstFailure?: string;
    }) => void;
}) {
    const { technicians } = useTechnicians();
    const [technicianId, setTechnicianId] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!technicianId) {
            setError('Choose somebody to assign these to');
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            const response = await maintenanceApi.bulkAssignWorkOrders({
                workOrderIds: workOrders.map((workOrder) => workOrder.id),
                technicianId,
                ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
            });
            onDone({
                assigned: response.data.assigned,
                failed: response.data.failed,
                firstFailure: response.data.results.find((row) => !row.ok)?.reason,
            });
            onClose();
        } catch (err) {
            setError(apiMessage(err, 'Could not assign those work orders'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Assign ${workOrders.length} work order${workOrders.length === 1 ? '' : 's'}`}
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Each work order still goes through the state machine — a bulk
                    assignment can never be a way round the rules. Anything that cannot
                    be assigned from its current state is reported back per row.
                </p>
                <div className="space-y-2">
                    <Label>Technician</Label>
                    <Select
                        value={technicianId}
                        onChange={(event) => setTechnicianId(event.target.value)}
                        options={technicians.map((technician) => ({
                            value: technician.id,
                            label: `${technician.firstName} ${technician.lastName} — ${
                                technician.openWorkOrders ?? 0
                            } open`,
                        }))}
                        placeholder="Choose somebody"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="bulk-scheduled">Scheduled for (optional)</Label>
                    <Input
                        id="bulk-scheduled"
                        type="date"
                        value={scheduledFor}
                        onChange={(event) => setScheduledFor(event.target.value)}
                    />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving}>
                        {isSaving ? 'Assigning…' : 'Assign'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function actionLabel(action: WorkOrderAction): string {
    switch (action) {
        case 'INSPECT':
            return 'Record inspection';
        case 'APPROVE':
            return 'Approve & assign';
        case 'ASSIGN':
            return 'Assign technician';
        case 'START':
            return 'Start work';
        case 'COMPLETE':
            return 'Complete';
        case 'CLOSE':
            return 'Close';
        case 'CANCEL':
            return 'Cancel';
        default:
            return action;
    }
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
