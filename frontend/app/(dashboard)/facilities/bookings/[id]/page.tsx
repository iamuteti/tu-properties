'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { facilityBookingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { FACILITY_BOOKING_STATUS_STYLES } from '@/lib/constants';
import type { FacilityBookingAction, FacilityBookingRow } from '@/types';

/**
 * One booking.
 *
 * **Every button on this page comes from `availableActions`, which the backend
 * computed.** That is the whole design of the row: the API refuses an illegal
 * transition with a sentence explaining why, and the client has no business deciding
 * differently. A `PENDING` booking offers approve and decline but not cancel-with-a-
 * reason-and-then-reschedule; a booking whose slot has passed offers exactly one
 * action, and it is the right one.
 *
 * The two actions that need a reason — `REJECT` and `CANCEL` — ask for it in a modal
 * rather than sending an empty note and letting the server refuse, because that note
 * is the only thing the person who booked it will ever read.
 */
export default function BookingDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = params?.id;

    const [booking, setBooking] = useState<FacilityBookingRow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [noteAction, setNoteAction] = useState<'REJECT' | 'CANCEL' | null>(null);
    const [rescheduling, setRescheduling] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await facilityBookingsApi.booking(id);
            setBooking(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That booking does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the booking.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const run = async (action: FacilityBookingAction, note?: string) => {
        if (!id) return;
        try {
            const { data } = await callAction(id, action, note);
            toast.success(data.statusAdvice);
            await load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not do that',
                { duration: 9000 },
            );
        }
    };

    if (isLoading) return <LoadingState label="Loading the booking…" />;
    if (error || !booking) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/facilities/bookings">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to bookings
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Booking not found.'} onRetry={load} />
            </div>
        );
    }

    const statusStyle =
        FACILITY_BOOKING_STATUS_STYLES[booking.status] ?? 'bg-gray-100 text-gray-800';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/facilities/bookings" aria-label="Back to bookings">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {booking.reference}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
                            >
                                {booking.statusLabel}
                            </span>
                            <span className="text-muted-foreground">
                                {booking.bookedForName} ·{' '}
                                {booking.facility?.name ?? 'a facility'}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {booking.statusAdvice}
                        </p>
                    </div>
                </div>

                {/* Every button here is one the server said it would accept. */}
                <div className="flex flex-wrap items-center gap-2">
                    {booking.availableActions.includes('APPROVE') && (
                        <Button onClick={() => run('APPROVE')}>
                            Confirm the slot
                        </Button>
                    )}
                    {booking.availableActions.includes('REJECT') && (
                        <Button
                            variant="outline"
                            onClick={() => setNoteAction('REJECT')}
                        >
                            Decline
                        </Button>
                    )}
                    {booking.availableActions.includes('CANCEL') && (
                        <Button
                            variant="outline"
                            onClick={() => setNoteAction('CANCEL')}
                        >
                            Cancel the slot
                        </Button>
                    )}
                    {booking.availableActions.includes('REACTIVATE') && (
                        <Button variant="outline" onClick={() => run('REACTIVATE')}>
                            Bring it back
                        </Button>
                    )}
                    {booking.availableActions.includes('MARK_NO_SHOW') && (
                        <Button variant="outline" onClick={() => run('MARK_NO_SHOW')}>
                            Record a no-show
                        </Button>
                    )}
                    {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                        <Button variant="outline" onClick={() => setRescheduling(true)}>
                            <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                            Move it
                        </Button>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>The slot</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Facility</dt>
                            <dd>
                                {booking.facility ? (
                                    <Link
                                        href={`/facilities/${booking.facility.id}`}
                                        className="underline underline-offset-4"
                                    >
                                        {booking.facility.name}
                                    </Link>
                                ) : (
                                    '—'
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Date</dt>
                            <dd>{new Date(booking.startsAt).toLocaleDateString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Time</dt>
                            <dd className="font-mono">{booking.slotLabel}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                {booking.timing.phase === 'UPCOMING'
                                    ? 'Starts in'
                                    : booking.timing.phase === 'NOW'
                                      ? 'Ends in'
                                      : 'Ended'}
                            </dt>
                            <dd>
                                {Math.abs(
                                    booking.timing.phase === 'PAST'
                                        ? booking.timing.minutesUntilEnd
                                        : booking.timing.phase === 'NOW'
                                          ? booking.timing.minutesUntilEnd
                                          : booking.timing.minutesUntilStart,
                                )}{' '}
                                minutes
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Booked for</dt>
                            <dd>{booking.bookedForName}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>{booking.bookedForPhone ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Attending</dt>
                            <dd>{booking.attendeeCount ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Fee</dt>
                            <dd>
                                {booking.fee == null
                                    ? 'Free'
                                    : `${booking.fee.toLocaleString('en-KE')} ${booking.feeCurrency ?? ''}`}
                            </dd>
                        </div>
                    </dl>

                    {booking.fee != null && (
                        <p className="mt-4 text-xs text-muted-foreground">
                            The fee is snapshotted at booking time, so a change next month
                            will not restate what this cost. It is recorded and reported,
                            not invoiced — see the module&rsquo;s open items.
                        </p>
                    )}

                    {booking.purpose && (
                        <div className="mt-4">
                            <p className="text-sm text-muted-foreground">Purpose</p>
                            <p className="text-sm">{booking.purpose}</p>
                        </div>
                    )}

                    {/* The party, when one is attached. A booking with neither is
                        legitimate — "a guest of the family in B4" — which is why this
                        card is conditional rather than the primary view. */}
                    {(booking.tenant || booking.contact) && (
                        <div className="mt-4 rounded-md border px-4 py-3 text-sm">
                            <p className="text-muted-foreground">On file</p>
                            {booking.tenant && (
                                <p className="mt-1">
                                    Resident{' '}
                                    <Link
                                        href={`/tenants/${booking.tenant.id}`}
                                        className="underline underline-offset-4"
                                    >
                                        {[booking.tenant.otherNames, booking.tenant.surname]
                                            .filter(Boolean)
                                            .join(' ')}{' '}
                                        ({booking.tenant.code})
                                    </Link>
                                </p>
                            )}
                            {booking.contact && (
                                <p className="mt-1">
                                    Contact{' '}
                                    <Link
                                        href={`/crm/contacts/${booking.contact.id}`}
                                        className="underline underline-offset-4"
                                    >
                                        {[
                                            booking.contact.company,
                                            booking.contact.firstName,
                                            booking.contact.lastName,
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                    </Link>
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* The trail. A decision note is required for a decline and a
                cancellation, so this panel is where the reason somebody was told
                lives. */}
            {(booking.decisionNote || booking.cancelReason || booking.decidedAt) && (
                <Card>
                    <CardHeader>
                        <CardTitle>What was decided</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {booking.decidedAt && (
                            <p className="text-muted-foreground">
                                {new Date(booking.decidedAt).toLocaleString()}
                                {booking.decidedByUser && (
                                    <>
                                        {' '}
                                        by {booking.decidedByUser.firstName}{' '}
                                        {booking.decidedByUser.lastName}
                                    </>
                                )}
                            </p>
                        )}
                        {booking.decisionNote && <p>{booking.decisionNote}</p>}
                        {booking.cancelReason && (
                            <p className="text-muted-foreground">
                                Cancelled: {booking.cancelReason}
                            </p>
                        )}
                        {booking.cancelledAt && (
                            <p className="text-xs text-muted-foreground">
                                Given up{' '}
                                {new Date(booking.cancelledAt).toLocaleString()}.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {booking.timing.hasEnded && booking.status === 'CONFIRMED' && (
                <p className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
                    This slot has passed and nobody has said whether they turned up.
                    Recording a no-show is a decision about somebody, so it is deliberate
                    rather than something the system concluded on its own.
                </p>
            )}

            {noteAction && (
                <NoteModal
                    action={noteAction}
                    bookingRef={booking.reference}
                    bookedForName={booking.bookedForName}
                    onClose={() => setNoteAction(null)}
                    onConfirm={async (note) => {
                        await run(noteAction, note);
                        setNoteAction(null);
                    }}
                />
            )}

            {rescheduling && (
                <RescheduleModal
                    booking={booking}
                    onClose={() => setRescheduling(false)}
                    onConfirm={async (startsAt, endsAt) => {
                        try {
                            const { data } = await facilityBookingsApi.rescheduleBooking(
                                booking.id,
                                { startsAt, endsAt },
                            );
                            toast.success(`${data.reference} moved to ${data.slotLabel}.`);
                            setRescheduling(false);
                            await load();
                        } catch (err) {
                            toast.error(
                                (err as { response?: { data?: { message?: string } } })?.response
                                    ?.data?.message ?? 'Could not move the booking',
                                { duration: 9000 },
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}

/** One method per transition — never a generic `update(status)`. */
function callAction(
    id: string,
    action: FacilityBookingAction,
    note?: string,
): Promise<{ data: FacilityBookingRow }> {
    switch (action) {
        case 'APPROVE':
            return facilityBookingsApi.approveBooking(id, note);
        case 'REJECT':
            return facilityBookingsApi.rejectBooking(id, note ?? '');
        case 'CANCEL':
            return facilityBookingsApi.cancelBooking(id, note ?? '');
        case 'REACTIVATE':
            return facilityBookingsApi.reactivateBooking(id);
        case 'MARK_NO_SHOW':
            return facilityBookingsApi.markBookingNoShow(id);
        default:
            return Promise.reject(new Error(`Unknown booking action: ${action}`));
    }
}

function NoteModal({
    action,
    bookingRef,
    bookedForName,
    onClose,
    onConfirm,
}: {
    action: 'REJECT' | 'CANCEL';
    bookingRef: string;
    bookedForName: string;
    onClose: () => void;
    onConfirm: (note: string) => Promise<void>;
}) {
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const declining = action === 'REJECT';

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={declining ? `Decline ${bookingRef}` : `Cancel ${bookingRef}`}
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    {declining
                        ? `${bookedForName} will be told why. This note is the only thing they will read, so "not available" helps nobody.`
                        : 'Give a reason so the diary explains itself to whoever reads it in three months.'}
                </p>
                <div className="space-y-2">
                    <Label htmlFor="decision-note">
                        Reason <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="decision-note"
                        value={note}
                        placeholder={
                            declining
                                ? 'The clubhouse is shown to prospective tenants only with a property manager present.'
                                : 'Client postponed to the new financial year.'
                        }
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Back
                    </Button>
                    <Button
                        variant={declining ? 'destructive' : 'default'}
                        disabled={isSaving || note.trim().length === 0}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(note.trim());
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Recording…' : declining ? 'Decline it' : 'Cancel it'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function RescheduleModal({
    booking,
    onClose,
    onConfirm,
}: {
    booking: FacilityBookingRow;
    onClose: () => void;
    onConfirm: (startsAt: string, endsAt: string) => Promise<void>;
}) {
    // Prefilled with the booking's own times, in the `datetime-local` format the
    // browser expects. A move is almost always a small change, and retyping the
    // window is how a booking ends up on the wrong grid.
    const toLocalInput = (iso: string) => {
        const date = new Date(iso);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
            date.getHours(),
        )}:${pad(date.getMinutes())}`;
    };

    const [startsAt, setStartsAt] = useState(toLocalInput(booking.startsAt));
    const [endsAt, setEndsAt] = useState(toLocalInput(booking.endsAt));
    const [isSaving, setIsSaving] = useState(false);

    return (
        <Modal isOpen onClose={onClose} title={`Move ${booking.reference}`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Moving a booking is the one edit that re-checks the whole diary, so it
                    is refused if the new window collides with anything, falls outside the
                    opening hours, or does not sit on the facility&rsquo;s grid. The
                    booking itself is excluded from that check, so it will not collide
                    with itself.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="move-from">Starts</Label>
                        <Input
                            id="move-from"
                            type="datetime-local"
                            value={startsAt}
                            onChange={(event) => setStartsAt(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="move-to">Ends</Label>
                        <Input
                            id="move-to"
                            type="datetime-local"
                            value={endsAt}
                            onChange={(event) => setEndsAt(event.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Back
                    </Button>
                    <Button
                        disabled={isSaving || !startsAt || !endsAt}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(
                                new Date(startsAt).toISOString(),
                                new Date(endsAt).toISOString(),
                            );
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Moving…' : 'Move the booking'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
