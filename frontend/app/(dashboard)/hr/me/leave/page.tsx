'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
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
import type { LeaveRequestRow } from '@/types';

/**
 * Your own leave requests.
 *
 * Reached from the request form, and the reason it exists as a page rather than a
 * toast is that filing leave is not a one-way door: somebody files it, goes home,
 * and needs to see it was approved. Approvals also arrive through the workflow
 * engine rather than in the response to the request, so the only place the outcome
 * is visible is a list somebody can come back to.
 *
 * The one action here is **withdraw**, and the backend refuses it on a rejected
 * request — a decision somebody else made is not the requester's to overturn, and
 * pretending otherwise would make the queue's decisions advisory.
 */
export default function MyLeavePage() {
    const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
    const [status, setStatus] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.myLeave({ status: status || undefined });
            setRequests(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load your leave requests.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);

    const withdraw = async (request: LeaveRequestRow) => {
        try {
            await hrApi.cancelSelfLeave(request.id);
            toast.success('Your request was withdrawn');
            load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not withdraw that request',
            );
        }
    };

    const actionsFor = (request: LeaveRequestRow): RowAction<LeaveRequestRow>[] => [
        {
            label: 'Withdraw',
            icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
            disabled: request.status !== 'PENDING' && request.status !== 'APPROVED',
            disabledReason:
                request.status === 'REJECTED'
                    ? 'A declined request cannot be withdrawn — the decision has been made'
                    : request.status === 'CANCELLED'
                      ? 'This request was already withdrawn'
                      : undefined,
            onSelect: () => withdraw(request),
        },
    ];

    const pending = useMemo(
        () => requests.filter((request) => request.status === 'PENDING').length,
        [requests],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My leave</h1>
                    <p className="text-muted-foreground">
                        Every request you have filed, with the decision on it.
                        {pending > 0 && ` ${pending} still waiting on a decision.`}
                    </p>
                </div>
                <Button asChild>
                    <Link href="/hr/me/leave/new">
                        <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Request leave
                    </Link>
                </Button>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="w-56">
                <Label htmlFor="myLeaveStatus">Status</Label>
                <Select
                    name="myLeaveStatus"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    options={[
                        { value: '', label: 'All' },
                        ...Object.entries(LEAVE_STATUS_LABELS).map(([key, meta]) => ({
                            value: key,
                            label: meta.label,
                        })),
                    ]}
                />
            </div>

            {isLoading ? (
                <LoadingState label="Loading your leave requests…" />
            ) : requests.length === 0 ? (
                <EmptyState
                    title="You have not filed any leave"
                    description="Requests go to your manager, and you will see the decision here."
                    action={
                        <Button asChild>
                            <Link href="/hr/me/leave/new">Request leave</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Working days</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Decision</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell>
                                            {LEAVE_TYPES.find(
                                                (entry) => entry.value === request.leaveType,
                                            )?.label ?? request.leaveType}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(request.startDate).toLocaleDateString()} –{' '}
                                            {new Date(request.endDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {request.workingDays}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={request.status} />
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {request.decisionNote ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={request}
                                                actions={actionsFor(request)}
                                                label="Actions on this request"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Button variant="ghost" asChild>
                <Link href="/hr/me">Back to my account</Link>
            </Button>
        </div>
    );
}