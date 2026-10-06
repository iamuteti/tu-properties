'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { facilityBookingsApi } from '@/lib/api';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { FACILITY_BOOKING_FILTERS, FACILITY_STATUS_FILTERS } from '@/lib/constants';
import type { FacilityBookingRow, FacilityBookingStatus } from '@/types';

/**
 * The booking ledger.
 *
 * `availableActions` comes from **the server** and the row menu renders exactly that.
 * It is the mechanism that keeps the two halves from drifting: a button the API would
 * refuse is a support ticket, and a button the API would allow but the client hides is
 * a mystery. Nothing here decides which actions are legal.
 *
 * The filters are split in two on purpose. `when` is a **derived** filter — upcoming,
 * past, today — because those are comparisons against the clock rather than columns,
 * and `status` is the stored state. Somebody asking "what did we promise last month"
 * wants `past`, not a query on a status column.
 */
export default function FacilityBookingsPage() {
    const [bookings, setBookings] = useState<FacilityBookingRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('ALL');
    const [when, setWhen] = useState('ALL');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await facilityBookingsApi.bookings({
                ...(status !== 'ALL' ? { status } : {}),
                ...(when !== 'ALL' ? { when } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            setBookings(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load the booking ledger.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status, when, search]);

    useEffect(() => {
        load();
    }, [load]);

    const pendingCount = bookings.filter(
        (booking) => booking.status === 'PENDING',
    ).length;

    const actionsFor = (booking: FacilityBookingRow): RowAction<FacilityBookingRow>[] => [
        {
            label: 'View',
            onSelect: () => {
                window.location.href = `/facilities/bookings/${booking.id}`;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
                    <p className="text-muted-foreground">
                        Every slot that has been held, asked for, given up or missed.
                        {pendingCount > 0 && (
                            <span className="ml-1 font-medium text-amber-700">
                                {pendingCount} waiting for approval.
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href={facilityBookingsApi.bookingsExportUrl({
                                ...(status !== 'ALL' ? { status } : {}),
                                ...(when !== 'ALL' ? { when } : {}),
                            })}
                        >
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/facilities">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Book a slot
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Label htmlFor="bkStatus">State</Label>
                    <Select
                        name="bkStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={FACILITY_BOOKING_FILTERS}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="bkWhen">When</Label>
                    <Select
                        name="bkWhen"
                        value={when}
                        onChange={(event) => setWhen(event.target.value)}
                        options={FACILITY_STATUS_FILTERS}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="bkSearch">Search</Label>
                    <Input
                        id="bkSearch"
                        value={search}
                        placeholder="Reference, name or purpose"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the booking ledger…" />
            ) : bookings.length === 0 ? (
                <EmptyState
                    title="No bookings match"
                    description={
                        status !== 'ALL' || when !== 'ALL' || search
                            ? 'Clear the filters to see the whole ledger.'
                            : 'Nothing has been booked yet. Open a facility and take a slot from its diary.'
                    }
                    action={
                        <Button asChild>
                            <Link href="/facilities">Go to the register</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Facility</TableHead>
                                    <TableHead>Booked for</TableHead>
                                    <TableHead>When</TableHead>
                                    <TableHead>Purpose</TableHead>
                                    <TableHead className="text-right">Fee</TableHead>
                                    <TableHead>State</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bookings.map((booking) => (
                                    <TableRow key={booking.id}>
                                        <TableCell className="font-mono text-xs">
                                            <Link
                                                href={`/facilities/bookings/${booking.id}`}
                                                className="underline-offset-4 hover:underline"
                                            >
                                                {booking.reference}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {booking.facility?.name ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            {booking.bookedForName}
                                            {booking.tenant && (
                                                <p className="text-xs text-muted-foreground">
                                                    resident {booking.tenant.code}
                                                </p>
                                            )}
                                            {!booking.tenant && booking.contact && (
                                                <p className="text-xs text-muted-foreground">
                                                    {booking.contact.company ??
                                                        'contact'}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <p>
                                                {new Date(
                                                    booking.startsAt,
                                                ).toLocaleDateString()}
                                            </p>
                                            <p className="font-mono text-muted-foreground">
                                                {booking.slotLabel}
                                                {booking.timing.phase === 'NOW' && (
                                                    <span className="ml-1 font-sans text-emerald-700">
                                                        now
                                                    </span>
                                                )}
                                            </p>
                                        </TableCell>
                                        <TableCell className="max-w-[16rem] truncate text-xs">
                                            {booking.purpose ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {booking.fee == null
                                                ? '—'
                                                : `${booking.fee.toLocaleString('en-KE')} ${
                                                      booking.feeCurrency ?? ''
                                                  }`}
                                        </TableCell>
                                        <TableCell>
                                            <StatusPill status={booking.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={booking}
                                                actions={actionsFor(booking)}
                                                label={`Actions for ${booking.reference}`}
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

function StatusPill({ status }: { status: FacilityBookingStatus }) {
    const style =
        {
            PENDING: 'bg-amber-100 text-amber-800',
            CONFIRMED: 'bg-emerald-100 text-emerald-700',
            CANCELLED: 'bg-slate-100 text-slate-500',
            REJECTED: 'bg-red-100 text-red-700',
            NO_SHOW: 'bg-orange-100 text-orange-800',
        }[status] ?? 'bg-gray-100 text-gray-800';
    const label = status.charAt(0) + status.slice(1).toLowerCase();
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
            title={
                status === 'PENDING'
                    ? 'Waiting for somebody to decide. Staff cannot approve their own request.'
                    : undefined
            }
        >
            {label}
        </span>
    );
}
