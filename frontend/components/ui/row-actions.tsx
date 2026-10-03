'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MoreHorizontal } from 'lucide-react';

export interface RowAction<T> {
    label: string;
    onSelect: (row: T) => void;
    icon?: React.ReactNode;
    variant?: 'default' | 'danger';
    /** Rendered but disabled, with `disabledReason` as the tooltip text. */
    disabled?: boolean;
    disabledReason?: string;
}

/**
 * Row action menu for list tables.
 *
 * The audit found every list page rendering a dead "…" button with no menu
 * behind it. This is the shared replacement: keyboard accessible, closes on
 * select/blur, and can explain why an action is unavailable instead of hiding
 * it silently.
 */
export function RowActionsMenu<T>({
    row,
    actions,
    label = 'Row actions',
}: {
    row: T;
    actions: RowAction<T>[];
    label?: string;
}) {
    if (actions.length === 0) return null;

    return (
        <Menu as="div" className="relative inline-block text-left">
            <MenuButton
                className="inline-flex items-center justify-center rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                aria-label={label}
                onClick={(event) => event.stopPropagation()}
            >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </MenuButton>
            <MenuItems className="absolute right-0 z-40 mt-1 w-52 origin-top-right rounded-md border border-slate-200 bg-white py-1 shadow-lg focus:outline-none">
                {actions.map((action) => (
                    <MenuItem
                        key={action.label}
                        disabled={action.disabled}
                    >
                        <button
                            type="button"
                            title={action.disabled ? action.disabledReason : undefined}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                                    action.disabled
                                        ? 'cursor-not-allowed text-slate-400'
                                        : action.variant === 'danger'
                                          ? 'text-red-600 hover:bg-red-50'
                                          : 'text-slate-700 hover:bg-slate-100'
                                }`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (!action.disabled) action.onSelect(row);
                                }}
                            >
                                {action.icon}
                                <span className="truncate">{action.label}</span>
                            </button>
                        </MenuItem>
                    ))}
            </MenuItems>
        </Menu>
    );
}