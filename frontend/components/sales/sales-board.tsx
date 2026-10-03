'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Clock, User } from 'lucide-react';
import { KanbanBoard, type KanbanColumn } from '@/components/ui/kanban-board';
import { salesApi } from '@/lib/api';
import { SALE_STAGES, SALE_STAGE_COLORS } from '@/lib/constants';
import type { Sale, SaleStage } from '@/types';

/**
 * Sales pipeline board.
 *
 * Same shared board as the CRM lead pipeline (`KanbanBoard`); this module only
 * supplies columns and cards. `HANDOVER` is not droppable because it is gated on
 * the money being settled — the sale detail page drives that move, and the
 * server refuses it anyway when cash is outstanding.
 */
const COLUMNS: Array<KanbanColumn<Sale>> = SALE_STAGES.map((stage) => ({
    id: stage.value,
    label: stage.label,
    description: stage.description,
    color: SALE_STAGE_COLORS[stage.value],
    droppable: stage.value !== 'HANDOVER',
}));

export function SalesBoard({
    sales,
    isLoading,
    error,
    onChanged,
}: {
    sales: Sale[];
    isLoading: boolean;
    error: string | null;
    onChanged: () => void | Promise<void>;
}) {
    const router = useRouter();

    const moveSale = async (sale: Sale, stageId: string) => {
        const stage = stageId as SaleStage;
        const meta = SALE_STAGES.find((s) => s.value === stage);
        let reason: string | undefined;

        if (stage === 'CANCELLED') {
            reason = window.prompt('Why is this sale being cancelled? (required)') ?? undefined;
            if (!reason?.trim()) {
                toast.error('A reason is required to cancel a sale.');
                return;
            }
        } else if (!window.confirm(`Move ${sale.code} to "${meta?.label}"?`)) {
            return;
        }

        try {
            await salesApi.setStage(sale.id, stage, reason);
            toast.success(`Moved to ${meta?.label ?? stage}`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'That move is not allowed.');
        }
    };

    return (
        <KanbanBoard<Sale>
            columns={COLUMNS}
            items={sales}
            getStage={(sale) => sale.stage}
            getId={(sale) => sale.id}
            lockedStages={['HANDOVER', 'CANCELLED']}
            isLoading={isLoading}
            error={error}
            onMove={moveSale}
            emptyTitle="No open sales"
            emptyDescription="Sales appear here as they progress. Start one from a property that is up for sale."
            emptyIcon={<Building2 className="h-10 w-10" aria-hidden="true" />}
            emptyAction={
                <button
                    type="button"
                    onClick={() => router.push('/sales/new')}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                    Start a sale
                </button>
            }
            renderCard={(sale) => (
                <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                        <Link href={`/sales/${sale.id}`} className="text-sm font-medium hover:underline">
                            {sale.code}
                        </Link>
                        <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            {sale.currency}
                        </span>
                    </div>

                    <p className="mt-1 truncate text-xs text-muted-foreground">
                        {sale.propertyTitle ?? sale.property?.name}
                    </p>

                    {sale.agreedPrice != null && (
                        <p className="mt-2 text-sm font-semibold">
                            {Number(sale.agreedPrice).toLocaleString()}
                        </p>
                    )}

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {new Date(sale.updatedAt ?? sale.createdAt).toLocaleDateString()}
                        </span>
                        {sale.agent ? (
                            <span className="inline-flex items-center gap-1 truncate">
                                <User className="h-3 w-3" aria-hidden="true" />
                                {sale.agent.firstName}
                            </span>
                        ) : (
                            <span className="text-amber-600">Unassigned</span>
                        )}
                    </div>

                    {sale.cancellationReason && (
                        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                            {sale.cancellationReason}
                        </p>
                    )}
                </div>
            )}
        />
    );
}