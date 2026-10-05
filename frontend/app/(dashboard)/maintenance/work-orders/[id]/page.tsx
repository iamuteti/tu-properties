'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    CalendarClock,
    CheckCircle2,
    Clock,
    DoorOpen,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Plus,
    ShieldCheck,
    Trash2,
    User,
    Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import {
    MAINTENANCE_CATEGORIES,
    WORK_ORDER_ACTION_LABELS,
    WORK_ORDER_PRIORITIES,
    WORK_ORDER_SOURCES,
    WORK_ORDER_STATUSES,
} from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { Input } from '@/components/ui/input';
import { WorkOrderActionDialog } from '@/components/maintenance/work-order-action-dialog';
import { WorkOrderMaterialsPanel } from '@/components/inventory/work-order-materials-panel';
import { useWorkOrder } from '@/hooks/use-maintenance';
import type { WorkOrderAction } from '@/types';

/**
 * One work order (Module 9).
 *
 * The action bar at the top is the work order's whole interface: what can be done
 * next comes from the API's `availableActions`, so this page cannot offer a move
 * the state machine would refuse. The notes are shown in full because they are
 * written for two different readers — the inspection note for the approver, the
 * resolution note for the resident — and both of them end up here.
 */
export default function WorkOrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const { workOrder, isLoading, error, refetch } = useWorkOrder(id);
    const [action, setAction] = useState<WorkOrderAction | null>(null);
    const [newTask, setNewTask] = useState('');
    const [addingTask, setAddingTask] = useState(false);

    if (isLoading) return <LoadingState label="Loading the work order…" />;
    if (error || !workOrder) {
        return <ErrorState message={error ?? 'Work order not found'} onRetry={refetch} />;
    }

    const statusMeta = WORK_ORDER_STATUSES.find((entry) => entry.value === workOrder.status);
    const priorityMeta = WORK_ORDER_PRIORITIES.find(
        (entry) => entry.value === workOrder.priority,
    );
    const categoryLabel = MAINTENANCE_CATEGORIES.find(
        (entry) => entry.value === workOrder.category,
    )?.label;
    const sourceLabel = WORK_ORDER_SOURCES.find(
        (entry) => entry.value === workOrder.source,
    )?.label;
    const openTasks = workOrder.openTasks ?? 0;

    const addTask = async () => {
        if (newTask.trim().length < 2) return;
        setAddingTask(true);
        try {
            await maintenanceApi.addWorkOrderTask(workOrder.id, newTask.trim());
            setNewTask('');
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not add the checklist item'));
        } finally {
            setAddingTask(false);
        }
    };

    const toggleTask = async (taskId: string, isDone: boolean) => {
        try {
            await maintenanceApi.setWorkOrderTaskDone(workOrder.id, taskId, !isDone);
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not update the checklist'));
        }
    };

    const removeTask = async (taskId: string) => {
        try {
            await maintenanceApi.deleteWorkOrderTask(workOrder.id, taskId);
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not remove the item'));
        }
    };

    const requestApproval = async () => {
        try {
            const response = await maintenanceApi.requestWorkOrderApproval(workOrder.id);
            toast.success(
                response.data.approval.status === 'APPROVED'
                    ? 'No approval policy applies — approved immediately'
                    : 'Sent for approval',
            );
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not send for approval'));
        }
    };

    const remove = async () => {
        try {
            await maintenanceApi.deleteWorkOrder(workOrder.id);
            toast.success('Work order deleted');
            router.push('/maintenance/work-orders');
        } catch (err) {
            toast.error(apiMessage(err, 'Could not delete this work order'));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href="/maintenance/work-orders"
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to the queue
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {workOrder.reference} — {workOrder.title}
                    </h1>
                    <p className="text-muted-foreground">
                        {statusMeta?.label ?? workOrder.status}
                        {statusMeta ? ` · ${statusMeta.hint}` : ''}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(workOrder.availableActions ?? []).map((next) => (
                        <Button
                            key={next}
                            variant={next === 'CANCEL' ? 'outline' : 'default'}
                            onClick={() => setAction(next)}
                        >
                            {WORK_ORDER_ACTION_LABELS[next] ?? next}
                        </Button>
                    ))}
                    {workOrder.status === 'INSPECTION' && (
                        <Button variant="outline" onClick={requestApproval}>
                            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                            Send for approval
                        </Button>
                    )}
                    {(workOrder.status === 'REQUESTED' ||
                        workOrder.status === 'INSPECTION') && (
                        <>
                            <Button variant="outline" onClick={() => router.push(`/maintenance/work-orders/${workOrder.id}/edit`)}>
                                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                                Edit
                            </Button>
                            <Button variant="outline" onClick={remove}>
                                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Delete
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {workOrder.overdue && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                        This has missed its {priorityMeta?.window ?? '7 day'} response
                        window. It is still{' '}
                        <strong>{statusMeta?.label.toLowerCase()}</strong> — approval is
                        where jobs go to age, because approving is what removes them from
                        anybody&apos;s mental queue.
                    </span>
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>The fault</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="whitespace-pre-line text-sm">{workOrder.description}</p>

                            <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                <Field label="Trade" value={categoryLabel ?? workOrder.category} />
                                <Field
                                    label="Priority"
                                    value={`${priorityMeta?.label ?? workOrder.priority} · respond within ${priorityMeta?.window ?? '7 days'}`}
                                />
                                <Field label="Raised" value={formatDate(workOrder.reportedAt)} />
                                <Field label="How it came in" value={sourceLabel ?? workOrder.source} />
                                <Field
                                    label="Location"
                                    value={
                                        [
                                            workOrder.property?.name,
                                            workOrder.unit?.name,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ') || 'No location given'
                                    }
                                />
                                <Field
                                    label="Plant"
                                    value={
                                        workOrder.asset
                                            ? `${workOrder.asset.assetTag ? `${workOrder.asset.assetTag} · ` : ''}${workOrder.asset.name}`
                                            : '—'
                                    }
                                />
                            </dl>

                            {workOrder.accessInstructions && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                                    <p className="flex items-center gap-2 font-medium text-amber-900">
                                        <DoorOpen className="h-4 w-4" aria-hidden="true" />
                                        Access
                                    </p>
                                    <p className="mt-1 text-amber-800">{workOrder.accessInstructions}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Checklist</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(workOrder.tasks?.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No checklist on this job. Preventive services arrive with
                                    their schedule&apos;s steps already copied here.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {workOrder.tasks?.map((task) => (
                                        <li key={task.id} className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={task.isDone}
                                                onChange={() => toggleTask(task.id, task.isDone)}
                                                disabled={
                                                    workOrder.status === 'CLOSED' ||
                                                    workOrder.status === 'CANCELLED'
                                                }
                                                aria-label={task.description}
                                            />
                                            <span
                                                className={
                                                    task.isDone
                                                        ? 'text-sm text-muted-foreground line-through'
                                                        : 'text-sm'
                                                }
                                            >
                                                {task.description}
                                            </span>
                                            {task.isDone && task.completedAt && (
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDate(task.completedAt)}
                                                </span>
                                            )}
                                            {workOrder.status !== 'CLOSED' &&
                                                workOrder.status !== 'CANCELLED' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTask(task.id)}
                                                        className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {openTasks > 0 && (
                                <p className="text-xs text-amber-700">
                                    {openTasks} item{openTasks === 1 ? '' : 's'} still open —
                                    completion is refused until they are finished or removed.
                                </p>
                            )}

                            {workOrder.status !== 'CLOSED' &&
                                workOrder.status !== 'CANCELLED' && (
                                    <div className="flex gap-2">
                                        <Input
                                            value={newTask}
                                            onChange={(event) => setNewTask(event.target.value)}
                                            placeholder="Add a step"
                                            aria-label="Add a checklist step"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={addTask}
                                            disabled={addingTask || newTask.trim().length < 2}
                                        >
                                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                                            Add
                                        </Button>
                                    </div>
                                )}
                        </CardContent>
                    </Card>

                    {/* Module 11. Placed after the checklist because what the job
                        *did* is the natural next question after what it had to do —
                        * and before the inspection findings, since material comes
                        * off the shelf during the work rather than at the sign-off. */}
                    {workOrder.status !== 'CANCELLED' && (
                        <WorkOrderMaterialsPanel workOrderId={workOrder.id} />
                    )}

                    {workOrder.inspectionNote && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Inspection findings</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-line text-sm">
                                    {workOrder.inspectionNote}
                                </p>
                                {workOrder.inspectedAt && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Inspected {formatDate(workOrder.inspectedAt)}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {workOrder.resolutionNote && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                                    What was done
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-line text-sm">
                                    {workOrder.resolutionNote}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    The resident sees this note in their portal.
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {workOrder.cancellationReason && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Why it was cancelled</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm">{workOrder.cancellationReason}</p>
                            </CardContent>
                        </Card>
                    )}

                    {workOrder.approval && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Approval</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <p>
                                    {workOrder.approval.workflowDefinition?.name ??
                                        'Approval policy'}{' '}
                                    — <strong>{workOrder.approval.status}</strong>
                                </p>
                                <ul className="space-y-1 text-muted-foreground">
                                    {workOrder.approval.stepInstances?.map((step) => (
                                        <li key={step.id}>
                                            {step.name}: {step.status}
                                            {step.actedAt
                                                ? ` — decided ${formatDate(step.actedAt)}`
                                                : ''}
                                            {step.comment ? ` — “${step.comment}”` : ''}
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href="/approvals"
                                    className="inline-block text-sm text-cyan-700 hover:underline"
                                >
                                    See it in the approval inbox
                                </Link>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Assignment</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                {workOrder.assignedTechnician ? (
                                    <span>
                                        {workOrder.assignedTechnician.firstName}{' '}
                                        {workOrder.assignedTechnician.lastName}
                                        {workOrder.assignedTechnician.phone && (
                                            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                                                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                                {workOrder.assignedTechnician.phone}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Nobody yet
                                    </span>
                                )}
                            </div>
                            {workOrder.scheduledFor && (
                                <p className="flex items-center gap-2 text-muted-foreground">
                                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                                    {formatDate(workOrder.scheduledFor)}
                                </p>
                            )}
                            {workOrder.tenant && (
                                <div className="space-y-1 rounded-md border border-slate-200 p-3">
                                    <p className="flex items-center gap-2 font-medium">
                                        <User className="h-4 w-4" aria-hidden="true" />
                                        {workOrder.tenant.surname}{' '}
                                        {workOrder.tenant.otherNames ?? ''}
                                    </p>
                                    {workOrder.tenant.phone && (
                                        <p className="flex items-center gap-2 text-muted-foreground">
                                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                            {workOrder.tenant.phone}
                                        </p>
                                    )}
                                    {workOrder.tenant.email && (
                                        <p className="flex items-center gap-2 text-muted-foreground">
                                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                                            {workOrder.tenant.email}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {workOrder.tenant.code}
                                        {workOrder.tenant.accountNumber
                                            ? ` · ${workOrder.tenant.accountNumber}`
                                            : ''}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Cost and timing</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <Field label="Estimated" value={money(workOrder.estimatedCost)} />
                            <Field label="Actual" value={money(workOrder.actualCost)} />
                            <Field label="Raised" value={formatDate(workOrder.reportedAt)} />
                            {workOrder.startedAt && (
                                <Field label="Started" value={formatDate(workOrder.startedAt)} />
                            )}
                            {workOrder.completedAt && (
                                <Field label="Completed" value={formatDate(workOrder.completedAt)} />
                            )}
                            {workOrder.closedAt && (
                                <Field label="Closed" value={formatDate(workOrder.closedAt)} />
                            )}
                            {workOrder.overdue ? (
                                <p className="flex items-center gap-2 font-medium text-red-600">
                                    <Clock className="h-4 w-4" aria-hidden="true" />
                                    Response window missed
                                </p>
                            ) : (
                                workOrder.hoursRemaining !== undefined &&
                                workOrder.hoursRemaining > 0 && (
                                    <p className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="h-4 w-4" aria-hidden="true" />
                                        {workOrder.hoursRemaining < 48
                                            ? `${workOrder.hoursRemaining}h to respond`
                                            : `${Math.round(workOrder.hoursRemaining / 24)} days to respond`}
                                    </p>
                                )
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Where</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {workOrder.property && (
                                <p className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    <Link
                                        href={`/properties/${workOrder.property.id}`}
                                        className="hover:underline"
                                    >
                                        {workOrder.property.name}
                                    </Link>
                                </p>
                            )}
                            {workOrder.unit && (
                                <p className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4" aria-hidden="true" />
                                    {workOrder.unit.name}
                                </p>
                            )}
                            {workOrder.asset && (
                                <p className="flex items-center gap-2 text-muted-foreground">
                                    <Wrench className="h-4 w-4" aria-hidden="true" />
                                    <Link
                                        href={`/maintenance/assets/${workOrder.asset.id}`}
                                        className="hover:underline"
                                    >
                                        {workOrder.asset.name}
                                    </Link>
                                </p>
                            )}
                            <p className="pt-2">
                                <StatusBadge status={workOrder.status} />
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {action && (
                <WorkOrderActionDialog
                    isOpen
                    action={action}
                    workOrder={workOrder}
                    onClose={() => setAction(null)}
                    onDone={refetch}
                />
            )}
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function money(value?: string | number | null): string {
    if (value === undefined || value === null || value === '') return '—';
    const amount = Number(value);
    return Number.isFinite(amount)
        ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : '—';
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
