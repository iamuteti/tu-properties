'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, RefreshCw } from 'lucide-react';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { LEAVE_STATUS_LABELS, LEAVE_TYPES } from '@/lib/constants';
import type { EmployeeSelf, LeaveRequestRow, PayslipRow } from '@/types';

/**
 * "My account" — an employee's own view of their employment.
 *
 * Four separate reads, loaded together rather than composed: `/hr/me` resolves the
 * employment record, `/hr/me/payslips`, `/hr/me/leave` and `/hr/me/leave-balance`
 * are each scoped by the login on the server. **None of them takes an employee
 * id**, so there is no parameter on this page that could be edited to read
 * somebody else's payslip — which is why the client deliberately has no
 * `employeeId` on `createSelfLeave` either.
 *
 * The salary card is here rather than hidden because it is the employee's own
 * figure. What it deliberately does not show is anybody else's, which is the
 * whole reason the backend splits `findAll` from `findOne`.
 */
export default function HrMePage() {
    const [me, setMe] = useState<EmployeeSelf | null>(null);
    const [payslips, setPayslips] = useState<PayslipRow[]>([]);
    const [leave, setLeave] = useState<LeaveRequestRow[]>([]);
    const [balance, setBalance] = useState<{ entitlement: number; remaining: number } | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Four reads that are independent of each other. A failure on any one
            // of them is reported rather than swallowed — but they are issued
            // together so one round trip's worth of latency covers all four.
            const [meResponse, payslipResponse, leaveResponse, balanceResponse] =
                await Promise.all([
                    hrApi.me(),
                    hrApi.myPayslips(),
                    hrApi.myLeave(),
                    hrApi.myLeaveBalance(),
                ]);
            setMe(meResponse.data);
            setPayslips(payslipResponse.data);
            setLeave(leaveResponse.data);
            setBalance(balanceResponse.data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ??
                    'Could not load your account. If you are not linked to an employment record, an administrator can link one from the employee record.',
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const pendingLeave = useMemo(
        () => leave.filter((request) => request.status === 'PENDING').length,
        [leave],
    );

    if (isLoading) return <LoadingState label="Loading your account…" />;
    if (error) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/dashboard">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to the dashboard
                    </Link>
                </Button>
                <ErrorState message={error} onRetry={load} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My account</h1>
                    <p className="text-muted-foreground">
                        {me
                            ? `${me.preferredName || `${me.firstName} ${me.lastName}`} · ${me.employeeNumber}`
                            : 'Your employment record'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/hr/me/leave/new">
                            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Request leave
                        </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Job title</p>
                        <p className="mt-1 font-medium">{me?.jobTitle ?? '—'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {me?.department ?? 'No department'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Paid</p>
                        <p className="mt-1 font-medium">{me?.payFrequency ?? '—'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            in {me?.salaryCurrency ?? '—'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Leave remaining</p>
                        <p className="mt-1 font-medium">
                            {balance?.remaining ?? me?.leaveBalance?.remaining ?? '—'} days
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            of {balance?.entitlement ?? me?.leaveBalance?.entitlement ?? '—'} a year
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Payslips</p>
                        <p className="mt-1 font-medium">{payslips.length}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {pendingLeave > 0
                                ? `${pendingLeave} leave request(s) waiting`
                                : 'nothing waiting on a decision'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>My payslips</CardTitle>
                </CardHeader>
                <CardContent>
                    {payslips.length === 0 ? (
                        <EmptyState
                            title="No payslips yet"
                            description="They appear here once a payroll run has been calculated for a period you were employed in."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Run</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Pay date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Net</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payslips.map((payslip) => {
                                    const reference =
                                        payslip.runReference ?? payslip.payrollRun?.reference;
                                    const status = payslip.runStatus ?? payslip.payrollRun?.status;
                                    return (
                                        <TableRow key={payslip.id}>
                                            <TableCell>
                                                <Link
                                                    href={`/hr/me/payslips/${payslip.id}`}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                >
                                                    {reference ?? 'Payslip'}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(payslip.periodStart).toLocaleDateString()}{' '}
                                                – {new Date(payslip.periodEnd).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(payslip.payDate).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {status ? (
                                                    <StatusBadge status={status} />
                                                ) : (
                                                    '—'
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {payslip.totals.net.toLocaleString('en-KE', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>My leave</CardTitle>
                </CardHeader>
                <CardContent>
                    {leave.length === 0 ? (
                        <EmptyState
                            title="No leave requests"
                            description="File one and the decision appears here."
                            action={
                                <Button asChild>
                                    <Link href="/hr/me/leave/new">Request leave</Link>
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead className="text-right">Days</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leave.slice(0, 6).map((request) => (
                                        <TableRow key={request.id}>
                                            <TableCell>
                                                {LEAVE_TYPES.find(
                                                    (entry) => entry.value === request.leaveType,
                                                )?.label ?? request.leaveType}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(request.startDate).toLocaleDateString()}{' '}
                                                – {new Date(request.endDate).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {request.workingDays}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAVE_STATUS_LABELS[request.status]?.className ?? 'bg-gray-100 text-gray-800'}`}
                                                >
                                                    {LEAVE_STATUS_LABELS[request.status]?.label ??
                                                        request.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {leave.length > 6 && (
                                <p className="mt-3 text-sm">
                                    <Link
                                        href="/hr/me/leave"
                                        className="text-primary underline-offset-4 hover:underline"
                                    >
                                        See all {leave.length} requests
                                    </Link>
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}