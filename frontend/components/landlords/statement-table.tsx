'use client';

import { StatementStatusBadge } from './statement-status-badge';
import type { OwnerStatementSummary } from '@/types';

const money = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Read-only list of an owner's statements, shown on the landlord detail page.
 *
 * Deliberately a plain table rather than `DataTable`: this is a short recent
 * history with no search, sort or paging of its own, and the full register
 * lives at `/landlords/statements`.
 */
export function OwnerStatementTable({
    statements,
    onSelect,
}: {
    statements: OwnerStatementSummary[];
    onSelect: (statement: OwnerStatementSummary) => void;
}) {
    if (statements.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No statements yet. Generate one for a completed period and the rent collected in it
                is worked out from the payments already recorded.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Statement</th>
                        <th className="py-2 pr-3">Period</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3 text-right">Collected</th>
                        <th className="py-2 pr-3 text-right">Expenses</th>
                        <th className="py-2 pr-3 text-right">Fee</th>
                        <th className="py-2 text-right">Net payout</th>
                    </tr>
                </thead>
                <tbody>
                    {statements.map((statement) => (
                        <tr
                            key={statement.id}
                            className="cursor-pointer border-b last:border-0 hover:bg-slate-50"
                            onClick={() => onSelect(statement)}
                        >
                            <td className="py-2 pr-3 font-medium">{statement.statementNumber}</td>
                            <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                                {statement.periodStart.slice(0, 10)} –{' '}
                                {statement.periodEnd.slice(0, 10)}
                            </td>
                            <td className="py-2 pr-3">
                                <StatementStatusBadge status={statement.status} />
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                                {money(statement.grossIncome)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-red-600">
                                {money(statement.expenses)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-red-600">
                                {money(statement.managementFee)}
                            </td>
                            <td className="py-2 text-right font-semibold tabular-nums">
                                {money(statement.netPayout)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}