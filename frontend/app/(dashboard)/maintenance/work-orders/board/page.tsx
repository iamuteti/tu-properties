'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Play, RefreshCw, UserRound, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { WORK_ORDER_ACTION_LABELS, WORK_ORDER_STATUSES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { KanbanBoard, type KanbanColumn } from '@/components/ui/kanban-board';
import { LoadingState } from '@/components/ui/entity-states';
import { WorkOrderActionDialog } from '@/components/maintenance/work-order-action-dialog';
import { useWorkOrders } from '@/hooks/use-maintenance';
import type { WorkOrder, WorkOrderAction } from '@/types';

/**
 * The maintenance board (Module 9).
 *
 * One column per state in pipeline order, so a job reads left to right as it
 * progresses. A drop calls the matching transition endpoint rather than writing a
 * status, which is the whole point: the API refuses an illegal move and says why,
 * rather than the card quietly jumping columns.
 *
 * Two drops deliberately open the action dialog instead of firing a request —
 * approving, assigning, inspecting and completing all need something the board
 * cannot invent (who, what the inspection found, what was done). The dialog is
 * also on every card, because the columns are not adjacent and most real moves
 * are not a drag away.
 */
const DRAG_ACTIONS: Record<string, WorkOrderAction> = {
    REQUESTED: 'INSPECT',
    INSPECTION: 'APPROVE',
    APPROVED: 'ASSIGN',
    ASSIGNED: 'START',
    IN_PROGRESS: 'COMPLETE',
    COMPLETED: 'CLOSE',
};

const NEEDS_INPUT: WorkOrderAction[] = ['INSPECT', 'APPROVE', 'ASSIGN', 'COMPLETE'];

export default function WorkOrderBoardPage() {
    const router = useRouter();
    const { workOrders, isLoading, error, refetch } = useWorkOrders({ open: true });
    const [dialog, setDialog] = useState<{
        workOrder: WorkOrder;
        action: WorkOrderAction;
    } | null>(null);

    const columns: Array<KanbanColumn<WorkOrder>> = WORK_ORDER_STATUSES.filter(
        (status) => status.value !== 'CANCELLED',
    ).map((status) => ({
        id: status.value,
        label: status.label,
        description: status.hint,
        // Only a column that a drop can legally reach accepts one. The server
        // enforces this too; offering the target is a courtesy, not the rule.
        droppable: Boolean(DRAG_ACTIONS[status.value]),
    }));

    const handleMove = async (workOrder: WorkOrder, toStatus: string) => {
        const action = DRAG_ACTIONS[toStatus];
        if (!action) return;

        if (NEEDS_INPUT.includes(action)) {
            setDialog({ workOrder, action });
            return;
        }

        try {
            if (action === 'START') {
                await maintenanceApi.startWorkOrder(workOrder.id);
            } else if (action === 'CLOSE') {
                await maintenanceApi.closeWorkOrder(workOrder.id);
            }
            toast.success(`${workOrder.reference} moved to ${toStatus.toLowerCase()}`);
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'That move is not allowed'));
        }
    };

    const renderCard = (workOrder: WorkOrder) => {
        const openTasks = workOrder.openTasks ?? 0;
        return (
            <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{workOrder.title}</p>
                    {workOrder.overdue && (
                        <AlertTriangle
                            className="h-4 w-4 shrink-0 text-red-600"
                            aria-label="Overdue"
                        />
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {workOrder.reference}
                    {workOrder.property?.name ? ` · ${workOrder.property.name}` : ''}
                    {workOrder.unit?.name ? ` · ${workOrder.unit.name}` : ''}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {workOrder.assignedTechnician
                        ? `${workOrder.assignedTechnician.firstName} ${workOrder.assignedTechnician.lastName}`
                        : 'Unassigned'}
                    {workOrder.priority === 'EMERGENCY' && (
                        <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                            Emergency
                        </span>
                    )}
                </p>
                {openTasks > 0 && (
                    <p className="text-xs text-amber-700">
                        {openTasks} checklist item{openTasks === 1 ? '' : 's'} open
                    </p>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                    {(workOrder.availableActions ?? []).map((action) => (
                        <Button
                            key={action}
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDialog({ workOrder, action })}
                        >
                            {WORK_ORDER_ACTION_LABELS[action] ?? action}
                        </Button>
                    ))}
                </div>
            </div>
        );
    };

    if (isLoading && workOrders.length === 0) {
        return <LoadingState label="Loading the board…" />;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Maintenance board</h1>
                    <p className="text-muted-foreground">
                        Live work, in pipeline order. Drag a card to move it — the rules
                        still apply, and the server says so when they do not.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.push('/maintenance/work-orders')}>
                        <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
                        The list
                    </Button>
                    <Button variant="outline" onClick={refetch}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Refresh
                    </Button>
                </div>
            </div>

            <KanbanBoard<WorkOrder>
                columns={columns}
                items={workOrders}
                getStage={(workOrder) => workOrder.status}
                getId={(workOrder) => workOrder.id}
                renderCard={renderCard}
                onMove={handleMove}
                error={error}
                emptyTitle="No live work orders"
                emptyDescription="Nothing is open right now. Closed and cancelled work is on the list."
                emptyIcon={<Play className="h-8 w-8" aria-hidden="true" />}
                emptyAction={
                    <Button onClick={() => router.push('/maintenance/work-orders/new')}>
                        Report a fault
                    </Button>
                }
            />

            <p className="text-xs text-muted-foreground">
                Dragging into a column whose move needs a decision — an inspection
                finding, a technician, a resolution note — opens that dialog instead of
                guessing.
            </p>

            {dialog && (
                <WorkOrderActionDialog
                    isOpen
                    action={dialog.action}
                    workOrder={dialog.workOrder}
                    onClose={() => setDialog(null)}
                    onDone={refetch}
                />
            )}
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
