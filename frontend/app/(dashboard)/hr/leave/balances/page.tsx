'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { LeaveBalanceRow } from '@/types';

/**
 * Every employee's leave balance.
 *
 * The four numbers are not four versions of one thing, and the column headings
 * exist because of that:
 *
 * - **entitlement** is what the policy grants for the year;
 * - **taken** is leave already gone;
 * - **booked** is approved leave dated ahead — counted, because otherwise December
 *   could be approved twice;
 * - **remaining** is entitlement plus carryover, less both. It is deliberately
 *   *not* `entitlement − taken`, and a screen that showed the naive subtraction
 *   would quietly disagree with the number somebody is refused leave against.
 */
export default function LeaveBalancesPage() {
    const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.leaveBalances();
            setBalances(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the leave balances.',
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Leave balances</h1>
                    <p className="text-muted-foreground">
                        Entitlement, taken, booked and remaining — per employee, on their
                        own leave policy.
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/hr/leave/calendar">
                        <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                        Working calendar
                    </Link>
                </Button>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            {isLoading ? (
                <LoadingState label="Loading leave balances…" />
            ) : balances.length === 0 ? (
                <EmptyState
                    title="No balances yet"
                    description="A balance exists once an employee is on a leave policy."
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Policy</TableHead>
                                        <TableHead className="text-right">Entitlement</TableHead>
                                        <TableHead className="text-right">Carried in</TableHead>
                                        <TableHead className="text-right">Taken</TableHead>
                                        <TableHead className="text-right">Booked</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {balances.map((row) => (
                                        <TableRow key={row.employeeId}>
                                            <TableCell>
                                                <Link
                                                    href={`/hr/employees/${row.employeeId}`}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                >
                                                    {row.name}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.employeeNumber}
                                                    {row.department ? ` · ${row.department}` : ''}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {row.balance.policy.code}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {days(row.balance.entitlement)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {row.balance.carriedIn > 0
                                                    ? days(row.balance.carriedIn)
                                                    : '—'}
                                                {row.balance.expired > 0 && (
                                                    <p className="text-xs text-amber-700">
                                                        {days(row.balance.expired)} expired
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {days(row.balance.taken)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {days(row.balance.booked)}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {days(row.balance.remaining)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/hr/employees/${row.employeeId}`}>
                                                        View
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

const days = (value: number) =>
    `${value.toLocaleString('en-KE', { maximumFractionDigits: 1 })}d`;