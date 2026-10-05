'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Download, Plus, Scale } from 'lucide-react';
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
 * Every leave request in the organization.
 *
 * Approve and reject are **row actions, not a status dropdown**, and the reason is
 * the workflow engine: where a `LEAVE_REQUEST` policy is configured, a decision
 * goes to the approver chain and comes back through the approvals inbox, so this
 * screen's buttons are the no-policy fallback rather than the primary path. A
 * free-form status picker here would look like it worked and silently do nothing
 * while an approval sat in an inbox.
 */
export default function LeaveListPage() {
    const router = useRouter();
    const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [leaveType, setLeaveType] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.leaveRequests({
                ...(status ? { status } : {}),
                ...(leaveType ? { leaveType } : {}),
            });
            setRequests(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the leave requests.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status, leaveType]);

    useEffect(() => {
        load();
    }, [load]);

    // Search is client-side because the endpoint has no `search` parameter; the
    // other two filters are server-side so they mean the same thing here as they
    // do in the export.
    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return requests;
        return requests.filter(
            (request) =>
                request.employeeName?.toLowerCase().includes(term) ||
                request.employee?.employeeNumber.toLowerCase().includes(term) ||
                (request.reason?.toLowerCase().includes(term) ?? false),
        );
    }, [requests, search]);

    const decide = async (
        request: LeaveRequestRow,
        action: 'approve' | 'reject',
        note?: string,
    ) => {
        try {
            if (action === 'approve') {
                await hrApi.approveLeave(request.id, note);
                toast.success('Leave approved');
            } else {
                await hrApi.rejectLeave(request.id, note);
                toast.success('Leave declined');
            }
            load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? `Could not ${action} that request`,
            );
        }
    };

    const actionsFor = (request: LeaveRequestRow): RowAction<LeaveRequestRow>[] => [
        { label: 'View', onSelect: () => router.push(`/hr/leave/${request.id}`) },
        {
            label: 'Approve',
            disabled: request.status !== 'PENDING',
            disabledReason:
                request.status === 'PENDING'
                    ? undefined
                    : `Only a waiting request can be approved — this one is ${LEAVE_STATUS_LABELS[request.status]?.label.toLowerCase() ?? request.status}`,
            onSelect: () => decide(request, 'approve'),
        },
        {
            label: 'Decline',
            variant: 'danger',
            disabled: request.status !== 'PENDING',
            disabledReason:
                request.status === 'PENDING'
                    ? undefined
                    : `Only a waiting request can be declined — this one is ${LEAVE_STATUS_LABELS[request.status]?.label.toLowerCase() ?? request.status}`,
            onSelect: () => decide(request, 'reject'),
        },
        {
            label: 'Cancel',
            disabled: request.status === 'CANCELLED' || request.status === 'REJECTED',
            disabledReason:
                request.status === 'REJECTED'
                    ? 'A declined request cannot be cancelled afterwards'
                    : request.status === 'CANCELLED'
                      ? 'Already cancelled'
                      : undefined,
            onSelect: async () => {
                try {
                    await hrApi.cancelLeave(request.id);
                    toast.success('Leave cancelled');
                    load();
                } catch (err) {
                    toast.error(
                        (err as { response?: { data?: { message?: string } } })?.response?.data
                            ?.message ?? 'Could not cancel that request',
                    );
                }
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Leave requests</h1>
                    <p className="text-muted-foreground">
                        Filed, approved and declined, with the working days each one costs.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={hrApi.leaveExportUrl({ status: status || undefined })}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/hr/leave/balances">
                            <Scale className="mr-2 h-4 w-4" aria-hidden="true" />
                            Balances
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/hr/leave/calendar">
                            <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                            Calendar
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/hr/leave/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            File leave
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Label htmlFor="leaveStatus">Status</Label>
                    <Select
                        name="leaveStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            { value: '', label: 'All statuses' },
                            ...Object.entries(LEAVE_STATUS_LABELS).map(([key, meta]) => ({
                                value: key,
                                label: meta.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-56">
                    <Label htmlFor="leaveTypeFilter">Leave type</Label>
                    <Select
                        name="leaveTypeFilter"
                        value={leaveType}
                        onChange={(event) => setLeaveType(event.target.value)}
                        options={[
                            { value: '', label: 'All types' },
                            ...LEAVE_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="leaveSearch">Search</Label>
                    <Input
                        id="leaveSearch"
                        value={search}
                        placeholder="Employee, employee number or reason"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading leave requests…" />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No leave requests match"
                    description={
                        requests.length === 0
                            ? 'Nothing has been filed yet.'
                            : 'Clear the filters to see all of them.'
                    }
                    action={
                        requests.length === 0 ? (
                            <Button asChild>
                                <Link href="/hr/leave/new">File leave</Link>
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearch('');
                                    setStatus('');
                                    setLeaveType('');
                                }}
                            >
                                Clear filters
                            </Button>
                        )
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Working days</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell>
                                            <Link
                                                href={`/hr/leave/${request.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {request.employeeName ?? '—'}
                                            </Link>
                                            {request.clashesWith && request.clashesWith.length > 0 && (
                                                <p className="text-xs text-amber-700">
                                                    overlaps {request.clashesWith.length} other
                                                    request(s)
                                                </p>
                                            )}
                                        </TableCell>
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
        </div>
    );
}