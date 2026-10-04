'use client';

import { useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { WORK_ORDER_ACTION_LABELS } from '@/lib/constants';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useTechnicians } from '@/hooks/use-maintenance';
import type { MaintenanceTechnician, WorkOrder, WorkOrderAction } from '@/types';

/**
 * One dialog for every work-order action.
 *
 * Each action asks for exactly what it needs and nothing else: the inspection
 * note is required because the approver reads it, the resolution note is required
 * because the resident reads it, and Start has no fields at all because starting
 * a job is not a decision that needs recording.
 *
 * The API decides whether an action is legal; this component only asks. That is
 * why a refusal is shown in the dialog rather than swallowed: the server's reason
 * ("2 checklist items are still open") is the most useful sentence on the screen
 * when somebody presses Complete too early.
 */
export function WorkOrderActionDialog({
    isOpen,
    action,
    workOrder,
    onClose,
    onDone,
}: {
    isOpen: boolean;
    action: WorkOrderAction | null;
    workOrder: WorkOrder;
    onClose: () => void;
    onDone?: () => void;
}) {
    const { technicians } = useTechnicians();
    const [technicianId, setTechnicianId] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [note, setNote] = useState('');
    const [cost, setCost] = useState(
        workOrder.estimatedCost ? String(workOrder.estimatedCost) : '',
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!action) return null;

    const title = WORK_ORDER_ACTION_LABELS[action] ?? action;
    const needsTechnician = action === 'ASSIGN' || action === 'APPROVE';
    const openTasks = workOrder.openTasks ?? 0;

    const reset = () => {
        setTechnicianId(workOrder.assignedTechnicianId ?? '');
        setScheduledFor('');
        setNote('');
        setError(null);
    };

    const submit = async () => {
        setIsSaving(true);
        setError(null);
        try {
            switch (action) {
                case 'INSPECT':
                    await maintenanceApi.inspectWorkOrder(workOrder.id, {
                        inspectionNote: note.trim(),
                        ...(cost.trim() ? { estimatedCost: Number(cost) } : {}),
                    });
                    break;
                case 'APPROVE':
                    await maintenanceApi.approveWorkOrder(workOrder.id, {
                        technicianId,
                        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
                    });
                    break;
                case 'ASSIGN':
                    await maintenanceApi.assignWorkOrder(workOrder.id, {
                        technicianId,
                        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
                    });
                    break;
                case 'START':
                    await maintenanceApi.startWorkOrder(workOrder.id);
                    break;
                case 'COMPLETE':
                    await maintenanceApi.completeWorkOrder(workOrder.id, {
                        resolutionNote: note.trim(),
                        ...(cost.trim() ? { actualCost: Number(cost) } : {}),
                    });
                    break;
                case 'CLOSE':
                    await maintenanceApi.closeWorkOrder(workOrder.id);
                    break;
                case 'CANCEL':
                    await maintenanceApi.cancelWorkOrder(workOrder.id, note.trim());
                    break;
            }
            toast.success(`${workOrder.reference}: ${title.toLowerCase()} done`);
            reset();
            onDone?.();
            onClose();
        } catch (err) {
            setError(
                messageFrom(err, `Could not ${title.toLowerCase()}`),
            );
        } finally {
            setIsSaving(false);
        }
    };

    const technicianOptions = technicians.map((technician: MaintenanceTechnician) => ({
        value: technician.id,
        label: `${technician.firstName} ${technician.lastName}${
            technician.openWorkOrders
                ? ` — ${technician.openWorkOrders} open`
                : ''
        }`,
    }));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${title} — ${workOrder.reference}`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{workOrder.title}</p>

                {action === 'INSPECT' && (
                    <>
                        <p className="text-sm text-muted-foreground">
                            What did the inspection find? This is what the approver reads
                            before committing money.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="wo-inspection">Findings</Label>
                            <Textarea
                                id="wo-inspection"
                                rows={4}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="e.g. Cartridge worn; the whole mixer needs replacing."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="wo-inspection-cost">Estimated cost (optional)</Label>
                            <Input
                                id="wo-inspection-cost"
                                inputMode="decimal"
                                value={cost}
                                onChange={(event) => setCost(event.target.value)}
                            />
                        </div>
                    </>
                )}

                {(action === 'APPROVE' || action === 'ASSIGN') && (
                    <>
                        <p className="text-sm text-muted-foreground">
                            {action === 'APPROVE'
                                ? 'Approving and dispatching in one step. If this repair needs a second signature, use “Send for approval” on the work order instead.'
                                : 'Who is doing this?'}
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="wo-technician">Technician</Label>
                            <Select
                                id="wo-technician"
                                value={technicianId}
                                onChange={(event) => setTechnicianId(event.target.value)}
                                options={technicianOptions}
                                placeholder="Choose somebody"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="wo-scheduled">Scheduled for (optional)</Label>
                            <Input
                                id="wo-scheduled"
                                type="date"
                                value={scheduledFor}
                                onChange={(event) => setScheduledFor(event.target.value)}
                            />
                        </div>
                    </>
                )}

                {action === 'START' && (
                    <p className="text-sm text-muted-foreground">
                        Confirms the technician is on site and the job is under way.
                    </p>
                )}

                {action === 'COMPLETE' && (
                    <>
                        {openTasks > 0 && (
                            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                                <AlertTriangle
                                    className="mt-0.5 h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span>
                                    {openTasks} checklist item{openTasks === 1 ? ' is' : 's are'}{' '}
                                    still open. Tick them on the work order first — the API
                                    will refuse this until the job is honestly finished.
                                </span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="wo-resolution">What was done</Label>
                            <Textarea
                                id="wo-resolution"
                                rows={4}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="The resident sees this note."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="wo-actual-cost">Actual cost (optional)</Label>
                            <Input
                                id="wo-actual-cost"
                                inputMode="decimal"
                                value={cost}
                                onChange={(event) => setCost(event.target.value)}
                            />
                        </div>
                    </>
                )}

                {action === 'CLOSE' && (
                    <p className="text-sm text-muted-foreground">
                        Closes the record. A closed work order cannot be reopened — raise
                        a new one if the fault comes back.
                    </p>
                )}

                {action === 'CANCEL' && (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Cancelling keeps the record and the reason. It is what the
                            resident and the owner read.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="wo-cancel-reason">Why is it being called off?</Label>
                            <Textarea
                                id="wo-cancel-reason"
                                rows={3}
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="e.g. Duplicate of WO-2026-0011."
                            />
                        </div>
                    </>
                )}

                {error && (
                    <div className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving}>
                        <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isSaving ? 'Saving…' : title}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function messageFrom(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
