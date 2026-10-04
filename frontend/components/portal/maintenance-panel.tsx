'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Send, Undo2, Wrench } from 'lucide-react';
import { maintenanceApi } from '@/lib/api';
import { MAINTENANCE_CATEGORIES, WORK_ORDER_STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/simple-select';
import type { PortalWorkOrder } from '@/types';

/**
 * The resident's maintenance desk (Module 9).
 *
 * Report a fault, and watch what happens to it. Two things make this useful
 * rather than a form:
 *
 * - the report is attached to the resident's own lease, so there is nothing to
 *   fill in about which flat it is;
 * - the state of every report is visible, because "somebody reported a leak three
 *   weeks ago and heard nothing" is the failure this exists to end. The status
 *   wording is the manager's, not the resident's — a leak that is `Approved` is
 *   explained, not just asserted.
 */
export function MaintenancePanel({ className }: { className?: string }) {
    const [workOrders, setWorkOrders] = useState<PortalWorkOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('PLUMBING');
    const [priority, setPriority] = useState('NORMAL');
    const [accessInstructions, setAccessInstructions] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await maintenanceApi.portalWorkOrders();
            setWorkOrders(response.data);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not load your requests.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const submit = async () => {
        if (title.trim().length < 3 || description.trim().length < 5) {
            toast.error('Tell us what is wrong and where.');
            return;
        }
        setIsBusy(true);
        try {
            const response = await maintenanceApi.reportIssue({
                title: title.trim(),
                description: description.trim(),
                category,
                priority,
                ...(accessInstructions.trim()
                    ? { accessInstructions: accessInstructions.trim() }
                    : {}),
            });
            toast.success(
                `${response.data.reference} reported — your property manager will review it`,
            );
            setTitle('');
            setDescription('');
            setAccessInstructions('');
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not send that report.');
        } finally {
            setIsBusy(false);
        }
    };

    const withdraw = async (workOrder: PortalWorkOrder) => {
        if (!confirm('Withdraw this report?')) return;
        try {
            await maintenanceApi.withdrawIssue(workOrder.id);
            toast.success('Report withdrawn');
            await load();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message ||
                    'This one is already being worked on, so it cannot be withdrawn. Contact your property manager.',
            );
        }
    };

    return (
        <div className={`space-y-6 ${className ?? ''}`}>
            <div className="rounded-lg border bg-white p-5">
                <h2 className="text-sm font-semibold">Report something broken</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    This goes to your property manager. Emergencies — no water, no power,
                    a door that will not lock — are called out as urgent so they are
                    attended to the same day.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="issue-title">What is wrong?</Label>
                        <Input
                            id="issue-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="e.g. Kitchen tap dripping"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="issue-category">What kind of job is it?</Label>
                        <Select
                            id="issue-category"
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                        >
                            {MAINTENANCE_CATEGORIES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="issue-description">Tell us more</Label>
                        <Textarea
                            id="issue-description"
                            rows={3}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Since when, what it sounds like, anything you have tried."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="issue-priority">How urgent is it?</Label>
                        <Select
                            id="issue-priority"
                            value={priority}
                            onChange={(event) => setPriority(event.target.value)}
                        >
                            <option value="LOW">Low — whenever convenient</option>
                            <option value="NORMAL">Normal</option>
                            <option value="HIGH">High — it is getting worse</option>
                            <option value="EMERGENCY">
                                Emergency — no water, no power, unsafe
                            </option>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="issue-access">How can somebody get in?</Label>
                        <Input
                            id="issue-access"
                            value={accessInstructions}
                            onChange={(event) => setAccessInstructions(event.target.value)}
                            placeholder="e.g. I will be home after 4pm"
                        />
                    </div>
                </div>

                <Button className="mt-4" onClick={submit} disabled={isBusy}>
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isBusy ? 'Sending…' : 'Report it'}
                </Button>
            </div>

            <div className="rounded-lg border bg-white p-5">
                <h2 className="text-sm font-semibold">Your reports</h2>
                {isLoading ? (
                    <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                ) : workOrders.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                        Nothing reported yet.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-3">
                        {workOrders.map((workOrder) => (
                            <li
                                key={workOrder.id}
                                className="rounded-md border border-slate-200 p-3"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium">{workOrder.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {workOrder.reference} · reported{' '}
                                            {new Date(workOrder.reportedAt).toLocaleDateString()}
                                            {workOrder.assignedTechnician
                                                ? ` · ${workOrder.assignedTechnician.firstName} ${workOrder.assignedTechnician.lastName} attending`
                                                : ''}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                        {workOrder.statusLabel ??
                                            WORK_ORDER_STATUS_LABELS[workOrder.status] ??
                                            workOrder.status}
                                    </span>
                                </div>
                                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                                    {workOrder.description}
                                </p>
                                {workOrder.cancellationReason && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Reason: {workOrder.cancellationReason}
                                    </p>
                                )}
                                {workOrder.status === 'REQUESTED' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2"
                                        onClick={() => withdraw(workOrder)}
                                    >
                                        <Undo2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                        Withdraw
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Wrench className="mt-0.5 h-3.5 w-3.5" aria-hidden="true" />
                <span>
                    A report is reviewed before anybody is sent, unless it is an
                    emergency. Once work has started it can no longer be withdrawn from
                    here — call your property manager if it is no longer needed.
                </span>
            </p>
        </div>
    );
}
