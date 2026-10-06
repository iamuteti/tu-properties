'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { facilityBookingsApi, facilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { FacilityAvailability, FacilityBookingPreview } from '@/types';

/**
 * Book a slot.
 *
 * **The slot grid is the form.** An hour and a minute picker is the obvious thing to
 * build and it is the wrong one: it lets somebody ask for 10:37 on a facility whose
 * grid is 60 minutes, and then the API refuses them for a rule the form never showed
 * them. So the picker *is* the facility's own grid, taken from the same availability
 * read the detail page uses, and a taken slot is not clickable at all.
 *
 * The preview call is the other half of the idea. `POST /facilities/bookings/preview`
 * runs the identical `checkSlot` the create path runs, so the refusal — "the
 * clubhouse closes at 22:00", "that slot is already taken by FB-0007" — arrives while
 * the form is still open rather than after the button. It writes nothing.
 *
 * Blanks are sent as `undefined` rather than `""`: the DTO runs `@CleanOptional()`,
 * which reads an empty string as &ldquo;not provided&rdquo; and a `null` as a
 * validation failure.
 */
export default function BookFacilityPage() {
    const params = useParams<{ id: string }>();
    const facilityId = params?.id;

    const [availability, setAvailability] = useState<FacilityAvailability | null>(null);
    const [selectedDay, setSelectedDay] = useState(0);
    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    const [duration, setDuration] = useState(1);
    const [bookedForName, setBookedForName] = useState('');
    const [bookedForPhone, setBookedForPhone] = useState('');
    const [purpose, setPurpose] = useState('');
    const [attendeeCount, setAttendeeCount] = useState('');
    const [preview, setPreview] = useState<FacilityBookingPreview | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!facilityId) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await facilitiesApi.facilityAvailability(facilityId, { days: 14 });
            setAvailability(data);
            // Default to the grid's own size, so the common case is "one slot" and
            // somebody booking for two hours has to say so rather than assume it.
            setDuration(Math.max(1, Math.round(data.facility.slotMinutes / 60)));
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load the diary.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [facilityId]);

    useEffect(() => {
        load();
    }, [load]);

    const slotMinutes = availability?.facility.slotMinutes ?? 60;
    const day = availability?.days[selectedDay] ?? availability?.days[0];

    /**
     * Which slots the current duration needs, so the picker can grey out the ones
     * that would run past the end of a taken booking or the closing time. Computed
     * from the availability the server already sent — no second request.
     */
    const requiredSlots = useMemo(() => {
        const count = Math.max(1, Math.round((duration * 60) / slotMinutes));
        if (selectedSlot == null) return [];
        return Array.from({ length: count }, (_, index) => selectedSlot + index * slotMinutes);
    }, [duration, slotMinutes, selectedSlot]);

    const pickable = useMemo(() => {
        if (!day) return new Set<number>();
        const count = Math.max(1, Math.round((duration * 60) / slotMinutes));
        const usable = new Set<number>();
        for (const slot of day.slots) {
            if (!slot.available) continue;
            // Every slot the duration covers must itself be free.
            const covered = Array.from(
                { length: count },
                (_, index) => slot.minutes + index * slotMinutes,
            );
            const allFree = covered.every((minutes) =>
                day.slots.some((entry) => entry.minutes === minutes && entry.available),
            );
            if (allFree) usable.add(slot.minutes);
        }
        return usable;
    }, [day, duration, slotMinutes]);

    const slotsNeeded = Math.max(1, Math.round((duration * 60) / slotMinutes));

    /**
     * Local wall clock → the ISO instant the API expects, for the chosen window.
     *
     * One helper rather than two copies: the preview and the save have to ask about
     * the *same* window, and a booking of N slots starting at S ends at S + N×grid
     * is arithmetic that is easy to get subtly wrong twice.
     */
    const windowFor = (startSlot: number): { startsAt: string; endsAt: string } => {
        const at = (minutes: number) => {
            const date = new Date(`${day!.date}T00:00:00`);
            date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
            return date.toISOString();
        };
        return {
            startsAt: at(startSlot),
            endsAt: at(startSlot + slotsNeeded * slotMinutes),
        };
    };

    // Ask the server what it thinks of the chosen window, on every change. It runs
    // the identical `checkSlot` the create path runs, so it cannot answer
    // differently from what the save is about to do.
    useEffect(() => {
        if (selectedSlot == null || !day || !facilityId) {
            setPreview(null);
            return;
        }
        let cancelled = false;
        facilityBookingsApi
            .previewBooking({ facilityId, ...windowFor(selectedSlot) })
            .then(({ data }) => {
                if (!cancelled) setPreview(data);
            })
            .catch(() => {
                if (!cancelled) setPreview(null);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSlot, duration, day?.date, facilityId]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!day || selectedSlot == null || !facilityId) return;

        setIsSaving(true);
        try {
            const { data } = await facilityBookingsApi.createBooking({
                facilityId,
                ...windowFor(selectedSlot),
                bookedForName: bookedForName.trim() || undefined,
                bookedForPhone: bookedForPhone.trim() || undefined,
                purpose: purpose.trim() || undefined,
                attendeeCount:
                    attendeeCount.trim() === '' ? undefined : Number(attendeeCount),
            });

            toast.success(
                data.status === 'PENDING'
                    ? `${data.reference} is waiting for approval.`
                    : `${data.reference} — the slot is held.`,
            );
            window.location.href = `/facilities/bookings/${data.id}`;
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not book that slot.',
                { duration: 9000 },
            );
            // The slot may have been taken in the moment between the preview and the
            // save. Reloading the diary is the only useful response.
            await load();
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the diary…" />;
    if (error || !availability) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/facilities">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to facilities
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Could not load the diary.'} onRetry={load} />
            </div>
        );
    }

    if (!availability.facility.isBookable) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href={`/facilities/${facilityId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to the facility
                    </Link>
                </Button>
                <ErrorState message={`${availability.facility.name} is on the register but not bookable — it may be a store or a plant room rather than a room somebody can reserve.`} />
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-6">
            <div>
                <Link
                    href={`/facilities/${facilityId}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to {availability.facility.name}
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">
                    Book {availability.facility.name}
                </h1>
                <p className="text-muted-foreground">
                    Open {availability.openingHours}, in {slotMinutes}-minute slots, bookable
                    up to {availability.facility.maxAdvanceDays} days ahead
                    {availability.facility.requiresApproval &&
                        ' — a resident’s own request waits for somebody to agree, though staff booking on a resident’s behalf is confirmed straight away.'}
                    {availability.facility.bookingFee != null &&
                        ` — ${availability.facility.bookingFee.toLocaleString('en-KE')} ${availability.facility.bookingFeeCurrency ?? ''} per booking.`}
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pick a day</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {availability.days.map((entry, index) => {
                            const free = entry.slots.filter((slot) => slot.available).length;
                            const isSelected = index === selectedDay;
                            return (
                                <button
                                    key={entry.date}
                                    type="button"
                                    onClick={() => {
                                        setSelectedDay(index);
                                        setSelectedSlot(null);
                                    }}
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
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Pick a slot
                        {duration > 1 && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                for {duration} hour{duration === 1 ? '' : 's'} ({' '}
                                {Math.round((duration * 60) / slotMinutes)} slot
                                {Math.round((duration * 60) / slotMinutes) === 1 ? '' : 's'})
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-end gap-3">
                        <div className="w-48">
                            <Label htmlFor="book-duration">How long</Label>
                            <Input
                                id="book-duration"
                                type="number"
                                min={1}
                                max={12}
                                step={slotMinutes / 60 < 1 ? slotMinutes / 60 : 1}
                                value={duration}
                                onChange={(event) => {
                                    setDuration(Math.max(1, Number(event.target.value) || 1));
                                    setSelectedSlot(null);
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Whole slots only — a {slotMinutes}-minute facility cannot be
                            booked for half one.
                        </p>
                    </div>

                    {!day?.isOpen ? (
                        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                            {day?.reason ?? 'Closed all day.'}
                        </p>
                    ) : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            {day.slots.map((slot) => {
                                const isSelected = selectedSlot === slot.minutes;
                                const canPick = pickable.has(slot.minutes);
                                const covered = requiredSlots.includes(slot.minutes);
                                return (
                                    <li key={slot.minutes}>
                                        <button
                                            type="button"
                                            disabled={!canPick}
                                            onClick={() => setSelectedSlot(slot.minutes)}
                                            aria-pressed={isSelected}
                                            className={`w-full rounded-lg border px-2 py-2 text-xs transition-colors ${
                                                isSelected
                                                    ? 'border-cyan-600 bg-cyan-50 font-medium'
                                                    : canPick
                                                      ? covered
                                                        ? 'border-cyan-300 bg-cyan-50/60 hover:border-cyan-500'
                                                        : 'border-emerald-200 bg-emerald-50 hover:border-emerald-400'
                                                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-muted-foreground'
                                            }`}
                                            title={
                                                canPick
                                                    ? `${slot.label} is free`
                                                    : (slot.bookedBy ?? 'Not available')
                                            }
                                        >
                                            <span className="block font-mono">{slot.label}</span>
                                            <span className="block">
                                                {canPick ? 'free' : 'taken'}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* The server's own answer, not a client-side guess. */}
                    {preview && !preview.ok && (
                        <p
                            role="alert"
                            className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                        >
                            {preview.reason}
                        </p>
                    )}
                    {preview?.ok && (
                        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                            That slot is free. It will be confirmed immediately, or held
                            for approval if the facility needs it.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Who it is for</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="book-for">Name</Label>
                            <Input
                                id="book-for"
                                value={bookedForName}
                                placeholder="Kariuki Otieno"
                                onChange={(event) => setBookedForName(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                What the day sheet will say. Leave it blank only if the
                                slot is genuinely for nobody in particular.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="book-phone">Phone</Label>
                            <Input
                                id="book-phone"
                                value={bookedForPhone}
                                placeholder="+254…"
                                onChange={(event) => setBookedForPhone(event.target.value)}
                            />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="book-purpose">Purpose</Label>
                            <Input
                                id="book-purpose"
                                value={purpose}
                                placeholder="Residents association meeting"
                                onChange={(event) => setPurpose(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="book-attendees">How many</Label>
                            <Input
                                id="book-attendees"
                                value={attendeeCount}
                                inputMode="numeric"
                                onChange={(event) => setAttendeeCount(event.target.value)}
                            />
                            {availability.facility.capacity != null && (
                                <p className="text-xs text-muted-foreground">
                                    The facility seats {availability.facility.capacity}. Shown,
                                    not enforced — a pool with a capacity of 8 would be
                                    refused by anybody bringing nine people.
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" asChild>
                    <Link href={`/facilities/${facilityId}`}>Cancel</Link>
                </Button>
                <Button
                    type="submit"
                    disabled={isSaving || selectedSlot == null || preview?.ok === false}
                >
                    <CalendarCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving
                        ? 'Holding the slot…'
                        : availability.facility.requiresApproval
                          ? 'Request the slot'
                          : 'Hold the slot'}
                </Button>
            </div>
        </form>
    );
}
