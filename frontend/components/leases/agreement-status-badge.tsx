'use client';

import { AgreementStatus } from '@/types';
import { AGREEMENT_STATUS_STYLES } from '@/lib/constants';

/** Agreement status pill, shared by the lease list, detail and move-out screens. */
export function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                AGREEMENT_STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-800'
            }`}
        >
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}