'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, LogIn, LogOut, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { visitorsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { VISIT_STATE_FILTERS, VISIT_STATE_STYLES } from '@/lib/constants';
import type { VisitorVisitRow } from '@/types';

/**
 * The gate book.
 *
 * **There is no status column behind this table.** A visit's state — expected, on
 * site, overstayed, left, did-not-arrive — is a comparison between `checkedInAt`,
 * `expectedOutAt` and the current time. An enum would be a fourth thing that could
 * disagree with the two timestamps it was supposed to describe, and "overstayed" in
 * particular stops being true without a single write happening anywhere.
 *
 * So the `state` filter is sent to the API, which answers from the same calculation
 * the rows are drawn from, and the two cannot drift.
 *
 * `availableActions` comes from the server too, for the same reason as bookings: the
 * check-in/check-out guards (never checked out without being checked in; never
 * checked in twice) are rules the service enforces, and the two buttons here read
 * exactly what it would accept.
 */
export default function VisitorVisitsPage() {
    const [visits, setVisits] = useState<VisitorVisitRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [state, setState] = useState('ALL');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await visitorsApi.visits({
                ...(state !== 'ALL' ? { state } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            setVisits(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load the gate book.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [state, search]);

    useEffect(() => {
        load();
    }, [load]);

    const onSite = visits.filter((visit) => visit.isOnSite).length;
    const overdue = visits.filter((visit) => visit.isOverdue).length;

    const move = async (visit: VisitorVisitRow, action: 'check-in' | 'check-out') => {
        try {
            const { data } =
                action === 'check-in'
                    ? await visitorsApi.checkIn(visit.id)
                    : await visitorsApi.checkOut(visit.id);
            toast.success(
                action === 'check-in'
                    ? `${data.visitorName} is on site.`
                    : `${data.visitorName} has left.`,
            );
            await load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not record that',
                { duration: 9000 },
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">The gate book</h1>
                    <p className="text-muted-foreground">
                        Who is on site, who is expected and who has overstayed — all
                        computed from two timestamps and the clock, so nothing here can be
                        stale.
                        {onSite > 0 && (
                            <span className="ml-1 font-medium text-emerald-700">
                                {onSite} on site
                                {overdue > 0 && (
                                    <span className="text-red-700">, {overdue} overstayed</span>
                                )}
                                .
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={visitorsApi.visitsExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/facilities/visitors">Visitor directory</Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="visitState">State</Label>
                    <Select
                        name="visitState"
                        value={state}
                        onChange={(event) => setState(event.target.value)}
                        options={VISIT_STATE_FILTERS}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="visitSearch">Search</Label>
                    <Input
                        id="visitSearch"
                        value={search}
                        placeholder="Visitor, host, company or purpose"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the gate book…" />
            ) : visits.length === 0 ? (
                <EmptyState
                    title="Nobody to show"
                    description={
                        state !== 'ALL' || search
                            ? 'Clear the filters to see the whole book.'
                            : 'No arrivals have been logged. Log somebody at the gate from the visitor directory, and they will appear here the moment they do.'
                    }
                    action={
                        <Button asChild>
                            <Link href="/facilities/visitors">Open the directory</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Visitor</TableHead>
                                    <TableHead>Here to see</TableHead>
                                    <TableHead>Purpose</TableHead>
                                    <TableHead>Expected</TableHead>
                                    <TableHead>Arrived</TableHead>
                                    <TableHead>Left</TableHead>
                                    <TableHead>State</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visits.map((visit) => (
                                    <TableRow key={visit.id}>
                                        <TableCell>
                                            <Link
                                                href={`/facilities/visitors/${visit.visitorId}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {visit.visitorName}
                                            </Link>
                                            {visit.visitorCompany && (
                                                <p className="text-xs text-muted-foreground">
                                                    {visit.visitorCompany}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visit.hostName}
                                        </TableCell>
                                        <TableCell className="max-w-[14rem] truncate text-xs">
                                            {visit.purpose ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(
                                                visit.expectedAt,
                                            ).toLocaleString(undefined, {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            })}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visit.checkedInAt
                                                ? new Date(
                                                      visit.checkedInAt,
                                                  ).toLocaleTimeString(undefined, {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                  })
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visit.checkedOutAt
                                                ? new Date(
                                                      visit.checkedOutAt,
                                                  ).toLocaleTimeString(undefined, {
                                                      hour: '2-digit',
                                                      minute: '2-digit',
                                                  })
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    VISIT_STATE_STYLES[visit.state] ??
                                                    'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {visit.stateLabel}
                                            </span>
                                            {visit.isPreApproved && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    pre-authorised
                                                </p>
                                            )}
                                            {visit.isOverdue && visit.minutesOverdue != null && (
                                                <p className="mt-1 text-xs text-red-700">
                                                    {visit.minutesOverdue} min over
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                {visit.availableActions.includes('check-in') && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => move(visit, 'check-in')}
                                                    >
                                                        <LogIn
                                                            className="mr-1 h-3.5 w-3.5"
                                                            aria-hidden="true"
                                                        />
                                                        Check in
                                                    </Button>
                                                )}
                                                {visit.availableActions.includes('check-out') && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => move(visit, 'check-out')}
                                                    >
                                                        <LogOut
                                                            className="mr-1 h-3.5 w-3.5"
                                                            aria-hidden="true"
                                                        />
                                                        Check out
                                                    </Button>
                                                )}
                                                {!visit.checkedInAt &&
                                                    !visit.checkedOutAt &&
                                                    new Date(visit.expectedAt) <=
                                                        new Date() && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={async () => {
                                                                try {
                                                                    await visitorsApi.preApproveVisit(
                                                                        visit.id,
                                                                    );
                                                                    toast.success(
                                                                        'Recorded as expected.',
                                                                    );
                                                                    await load();
                                                                } catch (err) {
                                                                    toast.error(
                                                                        (err as {
                                                                            response?: {
                                                                                data?: {
                                                                                    message?: string;
                                                                                };
                                                                            }
                                                                        })?.response?.data
                                                                            ?.message ??
                                                                            'Could not record that',
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <UserCheck
                                                                className="mr-1 h-3.5 w-3.5"
                                                                aria-hidden="true"
                                                            />
                                                            Expected
                                                        </Button>
                                                    )}
                                            </div>
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
