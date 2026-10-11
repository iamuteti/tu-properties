'use client';

import { OWNER_STATEMENT_STATUSES } from '@/lib/constants';
import type { OwnerStatementStatus } from '@/types';

export function StatementStatusBadge({ status }: { status: OwnerStatementStatus | string }) {
    const option = OWNER_STATEMENT_STATUSES.find((entry) => entry.value === status);

    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                option?.className ?? 'bg-gray-100 text-foreground'
            }`}
        >
            {option?.label ?? status}
        </span>
    );
}