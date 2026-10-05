'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { LEAVE_STATUS_LABELS, LEAVE_TYPES } from '@/lib/constants';
import type { LeaveRequestRow } from '@/types';

/**
 * One leave request, with the decision on it.
 *
 * The decision buttons live here **and** on the list row rather than only in one
 * of them, because the UX standard asks for row actions and because approving a
 * specific request is exactly the operation somebody has in front of them when
 * they arrive from a notification.
 *
 * There is no edit. A leave request that has not been decided can be cancelled and
 * refiled, which leaves one honest record rather than two; and a decided one is
 * part of somebody's balance history, so quietly editing it is how an entitlement
 * ends up disagreeing with the requests that produced it.
 */
export default function LeaveDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [request, setRequest] = useState<LeaveRequestRow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [isDeciding, setIsDeciding] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.leaveRequest(id);
            setRequest(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That leave request does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the leave request.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const decide = async (action: 'approve' | 'reject' | 'cancel') => {
        if (!request) return;
        if (action === 'reject' && note.trim().length === 0) {
            toast.error('A decline needs a note — it is what the employee reads');
            return;
        }
        setIsDeciding(true);
        try {
            if (action === 'approve') {
                await hrApi.approveLeave(request.id, note.trim() || undefined);
                toast.success('Leave approved');
            } else if (action === 'reject') {
                await hrApi.rejectLeave(request.id, note.trim());
                toast.success('Leave declined');
            } else {
                await hrApi.cancelLeave(request.id, note.trim() || undefined);
                toast.success('Leave cancelled');
            }
            await load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? `Could not ${action} that request`,
            );
        } finally {
            setIsDeciding(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the leave request…" />;
    if (error || !request) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/hr/leave">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to leave requests
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Leave request not found.'} onRetry={load} />
            </div>
        );
    }

    const statusLabel =
        LEAVE_STATUS_LABELS[request.status]?.label ?? request.status;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/hr/leave" aria-label="Back to leave requests">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {request.employeeName ?? 'Leave request'}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge status={request.status} />
                            <span className="text-sm text-muted-foreground">{statusLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/hr/leave/calendar">
                            <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                            Working calendar
                        </Link>
                    </Button>
                    {request.status === 'PENDING' && (
                        <>
                            <Button
                                onClick={() => decide('approve')}
                                disabled={isDeciding}
                            >
                                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                                Approve
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => decide('reject')}
                                disabled={isDeciding}
                            >
                                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                                Decline
                            </Button>
                        </>
                    )}
                    {(request.status === 'PENDING' || request.status === 'APPROVED') && (
                        <Button
                            variant="ghost"
                            onClick={() => decide('cancel')}
                            disabled={isDeciding}
                        >
                            Cancel the request
                        </Button>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>The request</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Employee</dt>
                            <dd>
                                {request.employee ? (
                                    <Link
                                        href={`/hr/employees/${request.employeeId}`}
                                        className="underline underline-offset-4"
                                    >
                                        {request.employeeName}
                                    </Link>
                                ) : (
                                    (request.employeeName ?? '—')
                                )}
                            </dd>
                            {request.employee?.employeeNumber && (
                                <p className="text-xs text-muted-foreground">
                                    {request.employee.employeeNumber}
                                </p>
                            )}
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Leave type</dt>
                            <dd>
                                {LEAVE_TYPES.find((entry) => entry.value === request.leaveType)
                                    ?.label ?? request.leaveType}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Period</dt>
                            <dd>
                                {new Date(request.startDate).toLocaleDateString()} –{' '}
                                {new Date(request.endDate).toLocaleDateString()}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Working days</dt>
                            <dd className="font-medium">{request.workingDays}</dd>
                            <p className="text-xs text-muted-foreground">
                                weekends and holidays excluded
                            </p>
                        </div>
                    </dl>

                    {request.reason && (
                        <div className="mt-4">
                            <p className="text-sm text-muted-foreground">Reason given</p>
                            <p className="text-sm">{request.reason}</p>
                        </div>
                    )}

                    {request.decidedAt && (
                        <div className="mt-4 border-t pt-4">
                            <p className="text-sm text-muted-foreground">Decision</p>
                            <p className="text-sm">
                                {statusLabel} on{' '}
                                {new Date(request.decidedAt).toLocaleDateString()}
                            </p>
                            {request.decisionNote && (
                                <p className="mt-1 text-sm">{request.decisionNote}</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {request.balance && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            Balance on {request.balance.policy.name}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            <div>
                                <p className="text-muted-foreground">Entitlement</p>
                                <p className="font-medium">{request.balance.entitlement}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Taken</p>
                                <p className="font-medium">{request.balance.taken}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Booked</p>
                                <p className="font-medium">{request.balance.booked}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Remaining</p>
                                <p className="font-medium">{request.balance.remaining}</p>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            This is the balance <em>before</em> the request above is decided.
                        </p>
                    </CardContent>
                </Card>
            )}

            {request.clashesWith && request.clashesWith.length > 0 && (
                <div
                    className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    role="alert"
                >
                    <p className="font-medium">This overlaps approved leave</p>
                    <p>
                        {request.clashesWith
                            .map(
                                (clash) =>
                                    `${clash.workingDays} day(s) for another employee`,
                            )
                            .join(', ')}
                        . Both can stand — two people off at once is a rota question, not a
                        rule — but somebody should know.
                    </p>
                </div>
            )}

            {request.status === 'PENDING' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Decision note</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Required to decline, optional to approve. This is the text the
                            employee reads, so "we need cover that week" beats "denied".
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="decision-note">Note</Label>
                            <Input
                                id="decision-note"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Optional for an approval, required for a decline"
                            />
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}