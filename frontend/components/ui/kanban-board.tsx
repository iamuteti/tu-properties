'use client';

import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './entity-states';

export interface KanbanColumn<T> {
    id: string;
    label: string;
    description?: string;
    /** Tailwind classes for the column's accent colour and border. */
    color?: string;
    /** Columns can refuse drops (e.g. "Won" is set by converting a lead). */
    droppable?: boolean;
}

export interface KanbanBoardProps<T> {
    columns: Array<KanbanColumn<T>>;
    items: T[];
    getStage: (item: T) => string;
    getId: (item: T) => string;
    renderCard: (item: T) => React.ReactNode;
    onMove: (item: T, columnId: string) => void | Promise<void>;
    /** Column id whose items are excluded from the "drag a card" affordance. */
    lockedStages?: string[];
    isLoading?: boolean;
    error?: string | null;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: React.ReactNode;
    emptyIcon?: React.ReactNode;
    busyId?: string | null;
    /** Unique id of the item currently in flight, for a pulse animation. */
}

/**
 * Generic drag-and-drop kanban board.
 *
 * Extracted from the CRM lead board so the sales pipeline uses the same
 * behaviour instead of a second copy: native HTML5 drag and drop (no board
 * library in the bundle), the same keyboard-accessible drop targets, and — most
 * importantly — the same rule that a drop calls the server and shows the API's
 * refusal message rather than silently reverting. All legality lives on the
 * server; this only offers the columns.
 */
export function KanbanBoard<T>({
    columns,
    items,
    getStage,
    getId,
    renderCard,
    onMove,
    lockedStages = [],
    isLoading,
    error,
    emptyTitle = 'Nothing here yet',
    emptyDescription,
    emptyAction,
    emptyIcon,
    busyId,
}: KanbanBoardProps<T>) {
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    if (isLoading) return <LoadingState label="Loading…" />;
    if (error) return <ErrorState message={error} />;

    const openItems = items.filter(
        (item) => !lockedStages.includes(getStage(item)),
    );

    if (items.length === 0) {
        return (
            <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                icon={emptyIcon}
                action={emptyAction}
            />
        );
    }

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-4">
                {columns.map((column) => {
                    const cards = items.filter((item) => getStage(item) === column.id);
                    const droppable = column.droppable !== false;
                    const isTarget = dropTarget === column.id;

                    return (
                        <section
                            key={column.id}
                            className={`flex w-72 shrink-0 flex-col rounded-lg border-t-4 ${
                                column.color ?? 'border-slate-300'
                            } bg-slate-50`}
                            onDragOver={(event) => {
                                if (!droppable) return;
                                event.preventDefault();
                                setDropTarget(column.id);
                            }}
                            onDragLeave={() =>
                                setDropTarget((current) =>
                                    current === column.id ? null : current,
                                )
                            }
                            onDrop={(event) => {
                                if (!droppable) return;
                                event.preventDefault();
                                setDropTarget(null);
                                const id = event.dataTransfer.getData('text/plain');
                                const item = items.find((entry) => getId(entry) === id);
                                setDraggingId(null);
                                if (item && getStage(item) !== column.id) {
                                    onMove(item, column.id);
                                }
                            }}
                            aria-label={`${column.label} column`}
                        >
                            <header className="flex items-start justify-between gap-2 px-3 py-2">
                                <div>
                                    <h2 className="text-sm font-semibold">
                                        {column.label}{' '}
                                        <span className="text-slate-400">({cards.length})</span>
                                    </h2>
                                    {column.description && (
                                        <p className="text-xs text-muted-foreground">
                                            {column.description}
                                        </p>
                                    )}
                                </div>
                            </header>

                            <div className="flex-1 space-y-2 px-2 pb-3">
                                {cards.length === 0 && (
                                    <p
                                        className={`rounded-md border border-dashed px-3 py-6 text-center text-xs ${
                                            isTarget
                                                ? 'border-slate-400 bg-white text-slate-600'
                                                : 'border-slate-200 text-slate-400'
                                        }`}
                                    >
                                        {droppable ? (isTarget ? 'Drop here' : 'No items') : 'Closed'}
                                    </p>
                                )}

                                {cards.map((item) => {
                                    const id = getId(item);
                                    const draggable =
                                        droppable && !lockedStages.includes(getStage(item));
                                    return (
                                        <article
                                            key={id}
                                            draggable={draggable}
                                            onDragStart={(event) => {
                                                event.dataTransfer.setData('text/plain', id);
                                                setDraggingId(id);
                                            }}
                                            onDragEnd={() => {
                                                setDraggingId(null);
                                                setDropTarget(null);
                                            }}
                                            className={`rounded-lg border bg-white shadow-sm transition-shadow ${
                                                draggable ? 'cursor-grab hover:shadow' : ''
                                            } ${draggingId === id ? 'opacity-50' : ''} ${
                                                busyId === id ? 'animate-pulse' : ''
                                            }`}
                                        >
                                            {renderCard(item)}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
            {openItems.length === 0 && items.length > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                    Everything here is in a closed stage.
                </p>
            )}
        </div>
    );
}