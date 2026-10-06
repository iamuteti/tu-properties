'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarPlus, Lock, Pencil, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { facilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import {
    FACILITY_BOOKING_STATUS_STYLES,
    FACILITY_KINDS,
} from '@/lib/constants';
import type {
    FacilityAvailability,
    FacilityBookingStatus,
    FacilityDetail,
} from '@/types';

/**
 * One facility: its rules, its diary, and its closures.
 *
 * **The slot grid is the point of this page.** A list of bookings cannot answer
 * "when is the clubhouse free?", because that is a question about *empty* slots —
 * the answer is a shape, not a set of rows. So the diary renders every slot on the
 * facility's own grid for the next fortnight, and each one says whether it is free,
 * who holds it, or that the facility is closed. The grid is the server's, not the
 * browser's, which is why a facility with a 15-minute grid and one with a
 * two-hour grid are both drawn correctly by the same code.
 *
 * The availability read is separate from the bookings list for the same reason:
 * `facilityAvailability` returns the empty slots *and* the occupied ones, so one
 * fetch draws the whole diary and the two can never disagree about a slot.
 */
export default function FacilityDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [detail, setDetail] = useState<FacilityDetail | null>(null);
    const [availability, setAvailability] = useState<FacilityAvailability | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState(0);
    const [isClosing, setIsClosing] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            // Both reads in parallel: the detail carries the rules and the closures,
            // the availability carries the diary. Neither depends on the other.
            const [detailResponse, availabilityResponse] = await Promise.all([
                facilitiesApi.facility(id),
                facilitiesApi.facilityAvailability(id, { days: 14 }),
            ]);
            setDetail(detailResponse.data);
            setAvailability(availabilityResponse.data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 403
                    ? 'You do not have access to the facility register.'
                    : status === 404
                      ? 'That facility does not exist in your organization.'
                      : (err as { response?: { data?: { message?: string } } })?.response?.data
                            ?.message ?? 'Could not load the facility.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const day = availability?.days[selectedDay] ?? availability?.days[0];

    /**
     * The per-day totals, computed here from the slots rather than fetched.
     *
     * Deliberately not a backend aggregate: it is the same arithmetic over a list the
     * browser already has, and a second endpoint that could return a different
     * number than the grid it is supposed to describe is worse than no number.
     */
    const dayCounts = useMemo(() => {
        if (!day) return { free: 0, taken: 0, closed: 0 };
        let free = 0;
        let taken = 0;
        let closed = 0;
        for (const slot of day.slots) {
            if (!day.isOpen) {
                closed += 1;
            } else if (slot.available) {
                free += 1;
            } else {
                taken += 1;
            }
        }
        return { free, taken, closed };
    }, [day]);

    if (isLoading) return <LoadingState label="Loading the facility…" />;
    if (error || !detail) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/facilities">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to facilities
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Facility not found.'} onRetry={load} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/facilities" aria-label="Back to facilities">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>
                                {FACILITY_KINDS.find((entry) => entry.value === detail.kind)?.label ??
                                    detail.kind}
                            </span>
                            <span>·</span>
                            <span>{detail.property?.name}</span>
                            {!detail.isBookable && (
                                <>
                                    <span>·</span>
                                    <span className="text-amber-700">not bookable</span>
                                </>
                            )}
                            {detail.requiresApproval && detail.isBookable && (
                                <>
                                    <span>·</span>
                                    <span className="text-amber-700">needs approval</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setIsClosing(true)}>
                        <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                        Close for a period
                    </Button>
                    <Button asChild>
                        <Link
                            href={`/facilities/${detail.id}/book`}
                            className={!detail.isBookable ? 'pointer-events-none opacity-50' : ''}
                        >
                            <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Book a slot
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={`/facilities/${detail.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            Edit
                        </Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>The rules</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Open</dt>
                            <dd className="font-mono">
                                {detail.opensAtLabel}–{detail.closesAtLabel}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Booking grid</dt>
                            <dd>{detail.slotMinutes} minutes</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Book ahead</dt>
                            <dd>{detail.maxAdvanceDays} days</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Seats</dt>
                            <dd>{detail.capacity ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Fee</dt>
                            <dd>
                                {detail.bookingFee == null
                                    ? 'Free'
                                    : `${detail.bookingFee.toLocaleString('en-KE')} ${detail.bookingFeeCurrency ?? ''}`}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Confirmed</dt>
                            <dd>{detail.statistics.confirmed}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Awaiting approval</dt>
                            <dd>{detail.statistics.awaitingApproval}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Did not turn up</dt>
                            <dd>{detail.statistics.noShow}</dd>
                        </div>
                    </dl>
                    {detail.description && (
                        <p className="mt-4 text-sm text-muted-foreground">{detail.description}</p>
                    )}
                    {detail.bookingFee != null && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            The fee is recorded on each booking and reported, but it is not
                            invoiced yet — billing it is a Finance change, and a facilities
                            screen is the wrong place to quietly create a money document.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ── The diary ─────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle>The diary</CardTitle>
                </CardHeader>
                <CardContent>
                    {!availability || availability.days.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No days to show. The facility may be retired, or its booking
                            horizon may be shorter than a day.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {/* Day picker. A horizontal strip rather than a dropdown
                                because the point is to see a fortnight at once and
                                compare which days have room. */}
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {availability.days.map((entry, index) => {
                                    const free = entry.slots.filter((slot) => slot.available).length;
                                    const isSelected = index === selectedDay;
                                    return (
                                        <button
                                            key={entry.date}
                                            type="button"
                                            onClick={() => setSelectedDay(index)}
                                            aria-pressed={isSelected}
                                            className={`min-w-[5.5rem] shrink-0 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                                isSelected
                                                    ? 'border-cyan-600 bg-cyan-50'
                                                    : 'border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="block font-medium">
                                                {new Date(`${entry.date}T00:00:00`).toLocaleDateString(
                                                    undefined,
                                                    { weekday: 'short', day: 'numeric' },
                                                )}
                                            </span>
                                            <span
                                                className={
                                                    entry.isOpen
                                                        ? free > 0
                                                            ? 'text-emerald-700'
                                                            : 'text-muted-foreground'
                                                        : 'text-muted-foreground'
                                                }
                                            >
                                                {!entry.isOpen
                                                    ? 'closed'
                                                    : free === 0
                                                      ? 'full'
                                                      : `${free} free`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {day && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <p className="font-medium">
                                            {new Date(`${day.date}T00:00:00`).toLocaleDateString(
                                                undefined,
                                                { dateStyle: 'full' },
                                            )}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {dayCounts.free} free · {dayCounts.taken} taken
                                            {dayCounts.closed > 0 ? ` · ${dayCounts.closed} closed` : ''}
                                        </p>
                                    </div>

                                    {!day.isOpen ? (
                                        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                            {day.reason ?? 'Closed all day.'}
                                        </p>
                                    ) : (
                                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                            {day.slots.map((slot) => (
                                                <li
                                                    key={slot.minutes}
                                                    className={`rounded-lg border px-3 py-2 text-xs ${
                                                        slot.available
                                                            ? 'border-emerald-200 bg-emerald-50'
                                                            : 'border-slate-200 bg-slate-50'
                                                    }`}
                                                >
                                                    <p className="font-mono font-medium">
                                                        {slot.label}
                                                    </p>
                                                    <p
                                                        className={
                                                            slot.available
                                                                ? 'text-emerald-700'
                                                                : 'text-muted-foreground'
                                                        }
                                                    >
                                                        {slot.available
                                                            ? 'free'
                                                            : (slot.bookedBy ?? 'unavailable')}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Upcoming bookings ──────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle>Upcoming bookings</CardTitle>
                </CardHeader>
                <CardContent>
                    {detail.upcomingBookings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nothing booked. The diary above shows which slots are free.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {detail.upcomingBookings.map((booking) => (
                                <li key={booking.id} className="flex flex-wrap items-center gap-3 py-3">
                                    <span className="w-28 shrink-0 font-mono text-sm">
                                        {booking.slotLabel}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <Link
                                            href={`/facilities/bookings/${booking.id}`}
                                            className="font-medium underline-offset-4 hover:underline"
                                        >
                                            {booking.bookedForName}
                                        </Link>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            {booking.reference}
                                        </span>
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(booking.startsAt).toLocaleDateString()}
                                    </span>
                                    <StatusPill status={booking.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {/* ── Closures ───────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle>Closures</CardTitle>
                </CardHeader>
                <CardContent>
                    {detail.blackouts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No closures scheduled. Closing the facility for a period is how
                            &ldquo;the clubhouse is being repainted&rdquo; stops being
                            something somebody has to remember.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {detail.blackouts.map((blackout) => (
                                <li key={blackout.id} className="flex flex-wrap items-center gap-3 py-3">
                                    <span className="min-w-0 flex-1">
                                        <span className="font-medium">{blackout.reason}</span>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            {new Date(blackout.startsAt).toLocaleString()} –{' '}
                                            {new Date(blackout.endsAt).toLocaleString()}
                                        </span>
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                            try {
                                                const { data } = await facilitiesApi.reopenFacility(
                                                    detail.id,
                                                    blackout.id,
                                                );
                                                toast.success(data.message);
                                                await load();
                                            } catch (err) {
                                                toast.error(
                                                    (err as { response?: { data?: { message?: string } } })
                                                        ?.response?.data?.message ??
                                                        'Could not lift the closure',
                                                );
                                            }
                                        }}
                                    >
                                        <Unlock className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Lift
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {isClosing && (
                <CloseFacilityModal
                    facilityName={detail.name}
                    onClose={() => setIsClosing(false)}
                    onConfirm={async (reason, startsAt, endsAt) => {
                        try {
                            await facilitiesApi.closeFacility(detail.id, {
                                reason,
                                startsAt,
                                endsAt,
                            });
                            toast.success(
                                'Closure recorded. Any live booking inside that period had to be moved first — the API refuses otherwise.',
                            );
                            setIsClosing(false);
                            await load();
                        } catch (err) {
                            toast.error(
                                (err as { response?: { data?: { message?: string } } })?.response?.data
                                    ?.message ?? 'Could not close the facility',
                                { duration: 9000 },
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}

/**
 * Local badge rather than the shared `StatusBadge`.
 *
 * `FacilityBookingStatus` and `AccessCardStatus` both contain values the shared
 * `STATUS_STYLES` record already colours for other modules — `PENDING`, `ACTIVE`,
 * `EXPIRED` — and a booking that borrows the procurement `PENDING` colour because it
 * happens to share a name is exactly the kind of cross-module confusion the shared
 * table invites. Each module maps its own.
 */
function StatusPill({ status }: { status: FacilityBookingStatus }) {
    const style = FACILITY_BOOKING_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800';
    const label = status.charAt(0) + status.slice(1).toLowerCase();
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
        >
            {label}
        </span>
    );
}

function CloseFacilityModal({
    facilityName,
    onClose,
    onConfirm,
}: {
    facilityName: string;
    onClose: () => void;
    onConfirm: (reason: string, startsAt: string, endsAt: string) => Promise<void>;
}) {
    const today = new Date().toISOString().slice(0, 10);
    const [reason, setReason] = useState('');
    const [startsAt, setStartsAt] = useState(`${today}T08:00`);
    const [endsAt, setEndsAt] = useState(`${today}T22:00`);
    const [isSaving, setIsSaving] = useState(false);

    return (
        <Modal isOpen onClose={onClose} title={`Close ${facilityName}`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Nobody will be able to book this facility between these times. A
                    closure is refused outright if live bookings fall inside it — move or
                    cancel them first, because a closure that quietly overrides a booking
                    somebody is relying on is not a closure.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="closure-reason">Reason</Label>
                    <Textarea
                        id="closure-reason"
                        value={reason}
                        placeholder="Floors stripped and refinished"
                        onChange={(event) => setReason(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Required, and not merely good manners: a closure with nothing behind
                        it is indistinguishable from a mistake.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="closure-from">From</Label>
                        <Input
                            id="closure-from"
                            type="datetime-local"
                            value={startsAt}
                            onChange={(event) => setStartsAt(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="closure-to">Until</Label>
                        <Input
                            id="closure-to"
                            type="datetime-local"
                            value={endsAt}
                            onChange={(event) => setEndsAt(event.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        disabled={isSaving || reason.trim().length < 3 || endsAt <= startsAt}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(reason.trim(), new Date(startsAt).toISOString(), new Date(endsAt).toISOString());
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Recording…' : 'Close the facility'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
