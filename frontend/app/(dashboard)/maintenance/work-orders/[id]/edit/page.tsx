'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { WorkOrderForm } from '@/components/maintenance/work-order-form';
import { useWorkOrder } from '@/hooks/use-maintenance';

/**
 * Edit a work order's details (Module 9).
 *
 * Deliberately does not offer status, assignment or actual cost: those move
 * through the actions on the work order so each one is recorded with an actor and
 * a reason. Editing a description is a different kind of act from deciding who
 * is going to fix it.
 */
export default function EditWorkOrderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const { workOrder, isLoading, error, refetch } = useWorkOrder(id);
    const [isDeleting, setIsDeleting] = useState(false);

    if (isLoading) return <LoadingState label="Loading the work order…" />;
    if (error || !workOrder) {
        return <ErrorState message={error ?? 'Work order not found'} onRetry={refetch} />;
    }

    if (workOrder.status === 'CLOSED' || workOrder.status === 'CANCELLED') {
        return (
            <div className="space-y-4">
                <Link
                    href={`/maintenance/work-orders/${workOrder.id}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to {workOrder.reference}
                </Link>
                <ErrorState
                    message={`${workOrder.reference} is ${workOrder.status.toLowerCase()}. A finished work order is history — raise a new one if the fault comes back.`}
                />
            </div>
        );
    }

    const remove = async () => {
        if (
            !window.confirm(
                `Delete ${workOrder.reference}? This is only possible while it is still a report — anything inspected or dispatched must be cancelled so the record survives.`,
            )
        ) {
            return;
        }
        setIsDeleting(true);
        try {
            await maintenanceApi.deleteWorkOrder(workOrder.id);
            toast.success('Work order deleted');
            router.push('/maintenance/work-orders');
        } catch (err) {
            const payload = (err as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data;
            toast.error(
                Array.isArray(payload?.message)
                    ? payload.message.join(' ')
                    : (payload?.message as string) || 'Could not delete this work order',
            );
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href={`/maintenance/work-orders/${workOrder.id}`}
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to {workOrder.reference}
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight">Edit work order</h1>
                </div>
                <Button variant="outline" onClick={remove} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>
            </div>

            <WorkOrderForm workOrderId={workOrder.id} />
        </div>
    );
}
