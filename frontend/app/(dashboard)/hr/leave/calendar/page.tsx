'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { LeaveCalendar } from '@/types';

/**
 * The working calendar: which days are working days.
 *
 * This screen answers one question that otherwise needs a support ticket — *"my
 * five-day request came out as three"*. The backend derives `isWorkingDay` per day
 * from the weekend pattern and the organization's holidays, and this page renders
 * that answer rather than recomputing it, because a browser-side calendar and the
 * leave policy's are two implementations of the same rule and only one of them is
 * the one that pays.
 *
 * `isoDay` is what the colouring keys off, rather than the date's weekday: the
 * weekend pattern is configured (a Gulf weekend is Friday and Saturday), so
 * "Saturday" is not a constant.
 */
export default function LeaveCalendarPage() {
    const [calendar, setCalendar] = useState<LeaveCalendar | null>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.leaveCalendar({
                from: from || undefined,
                to: to || undefined,
            });
            setCalendar(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the leave calendar.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Day names in the organization's own order, starting at its first weekend
     * day. `isoDay` is 1 = Sunday, so the grid starts wherever this
     * organization's weekend does rather than assuming Saturday.
     */
    const weekdays = useMemo(() => {
        const names = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
        ];
        if (!calendar) return { names, weekendNames: [] as string[] };
        const weekend = [...calendar.weekendDays].sort((a, b) => a - b);
        const start = weekend[0] ?? 1;
        return {
            names: [...names.slice(start - 1), ...names.slice(0, start - 1)],
            weekendNames: weekend.map((day) => names[day - 1] ?? String(day)),
        };
    }, [calendar]);

    const days = calendar?.days ?? [];
    const leadingBlanks = days.length > 0 ? (days[0].isoDay - (calendar?.weekendDays[0] ?? 1) + 7) % 7 : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Button variant="ghost" asChild className="mb-2 -ml-2">
                        <Link href="/hr/leave">
                            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                            Back to leave requests
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">Working calendar</h1>
                    <p className="text-muted-foreground">
                        Which days count as working days. This is what decides how many days
                        a leave request actually costs.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                    <Label htmlFor="cal-from">From</Label>
                    <Input
                        id="cal-from"
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                    />
                </div>
                <div className="w-44">
                    <Label htmlFor="cal-to">To</Label>
                    <Input
                        id="cal-to"
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        setFrom('');
                        setTo('');
                    }}
                >
                    Clear
                </Button>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            {isLoading ? (
                <LoadingState label="Loading the calendar…" />
            ) : !calendar ? null : (
                <>
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground">
Weekend:{' '}
                                <span className="font-medium text-foreground">
                                    {weekdays.weekendNames.length > 0
                                        ? weekdays.weekendNames.join(', ')
                                        : 'none configured'}
                                </span>
                                {calendar.holidays.length > 0 && (
                                    <>
                                        {' · '}
                                        {calendar.holidays.length} public holiday
                                        {calendar.holidays.length === 1 ? '' : 's'} in range
                                    </>
                                )}
                            </p>

                            <div className="mt-4 grid grid-cols-7 gap-1">
                                {weekdays.names.map((name) => (
                                    <div
                                        key={name}
                                        className="text-center text-xs font-medium uppercase text-muted-foreground"
                                    >
                                        {name.slice(0, 3)}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-2 grid grid-cols-7 gap-1">
                                {Array.from({ length: leadingBlanks }).map((_, index) => (
                                    <div key={`blank-${index}`} />
                                ))}
                                {days.map((day) => (
                                    <div
                                        key={day.date}
                                        title={
                                            day.isWorkingDay
                                                ? 'Working day'
                                                : day.holiday
                                                  ? day.holiday
                                                  : day.reason ?? 'Not a working day'
                                        }
                                        className={`rounded border p-1.5 text-center text-xs ${
                                            day.isWorkingDay
                                                ? 'border-slate-200 bg-white'
                                                : day.holiday
                                                  ? 'border-red-200 bg-red-50 text-red-900'
                                                  : 'border-slate-200 bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        <p className="font-medium">
                                            {new Date(day.date).getDate()}
                                        </p>
                                        <p className="text-[10px]">
                                            {day.isWorkingDay
                                                ? 'Work'
                                                : day.holiday
                                                  ? day.holiday
                                                  : day.reason ?? '—'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {calendar.holidays.length > 0 && (
                        <Card>
                            <CardContent className="pt-6">
                                <p className="mb-2 text-sm font-medium">Public holidays</p>
                                <ul className="space-y-1 text-sm">
                                    {calendar.holidays.map((holiday) => (
                                        <li key={`${holiday.date}-${holiday.name}`}>
                                            <span className="font-medium">
                                                {new Date(holiday.date).toLocaleDateString()}
                                            </span>{' '}
                                            — {holiday.name}
                                            {holiday.isRecurring && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    repeats yearly
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}