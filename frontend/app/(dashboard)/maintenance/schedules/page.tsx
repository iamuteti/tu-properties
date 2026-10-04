'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronLeft, ChevronRight, Play, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { ASSET_TYPES, describeCadence } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAssets, usePmSchedules, useTechnicians } from '@/hooks/use-maintenance';
import type { PmSchedule } from '@/types';

/**
 * Preventive maintenance (Module 9).
 *
 * Two views of the same thing: the list, which is what you act from, and a month
 * grid, which is what shows a collision — three services falling due in the same
 * week is a scheduling problem, and it is invisible in a table sorted by asset.
 *
 * "Run due now" is safe to press twice: the API raises each service at most once
 * per period and reports the rest as skipped, so recovering a missed day costs a
 * click rather than a duplicate invoice.
 */
export default function PmSchedulesPage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [showPaused, setShowPaused] = useState(false);
    const [formFor, setFormFor] = useState<PmSchedule | 'new' | null>(null);
    const [isSweeping, setIsSweeping] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);

    const { schedules, runs, stats, isLoading, error, refetch } = usePmSchedules();
    const { assets } = useAssets();
    const { technicians } = useTechnicians();

    const visible = useMemo(
        () => (showPaused ? schedules : schedules.filter((schedule) => schedule.active)),
        [schedules, showPaused],
    );

    const runDue = async () => {
        setIsSweeping(true);
        try {
            const response = await maintenanceApi.runDuePmSchedules();
            const run = response.data;
            toast.success(
                run.workOrdersCreated > 0
                    ? `${run.workOrdersCreated} service${run.workOrdersCreated === 1 ? '' : 's'} raised`
                    : 'Nothing was due',
                {
                    description: `${run.schedulesConsidered} schedule(s) checked · ${run.schedulesSkipped} skipped · ${run.schedulesFailed} failed`,
                },
            );
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'The sweep could not run'));
        } finally {
            setIsSweeping(false);
        }
    };

    const runOne = async (schedule: PmSchedule) => {
        setRunningId(schedule.id);
        try {
            const response = await maintenanceApi.runPmSchedule(schedule.id);
            toast.success(
                response.data.created
                    ? `${response.data.reference} raised`
                    : 'Already raised for this period',
            );
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not raise that service'));
        } finally {
            setRunningId(null);
        }
    };

    const lastRun = runs?.[0];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Preventive maintenance
                    </h1>
                    <p className="text-muted-foreground">
                        What gets looked at on a date, whether or not anybody complains
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={runDue} disabled={isSweeping}>
                        <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isSweeping ? 'Running…' : 'Run due now'}
                    </Button>
                    <Button onClick={() => setFormFor('new')}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        New schedule
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid grid-cols-3 gap-3">
                    <Counter label="Active" value={stats.active} />
                    <Counter
                        label="Overdue"
                        value={stats.overdue}
                        tone={stats.overdue > 0 ? 'warn' : 'plain'}
                    />
                    <Counter label="Due this week" value={stats.dueThisWeek} />
                </div>
            )}

            {lastRun && (
                <p className="text-xs text-muted-foreground">
                    Last sweep {new Date(lastRun.runOn).toLocaleDateString()} —{' '}
                    {lastRun.workOrdersCreated} raised, {lastRun.schedulesSkipped} skipped,{' '}
                    {lastRun.schedulesFailed} failed
                    {lastRun.triggeredBy ? ` (${lastRun.triggeredBy})` : ''}. The sweep runs
                    itself daily; this button is for recovering a missed day.
                </p>
            )}

            {error ? (
                <ErrorState message={error} onRetry={refetch} />
            ) : isLoading && schedules.length === 0 ? (
                <LoadingState label="Loading maintenance schedules…" />
            ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-3 lg:col-span-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Schedules</h2>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showPaused}
                                    onChange={(event) => setShowPaused(event.target.checked)}
                                />
                                Include paused
                            </label>
                        </div>

                        {visible.length === 0 ? (
                            <EmptyState
                                icon={<CalendarClock className="h-8 w-8" aria-hidden="true" />}
                                title="No maintenance schedule"
                                description="A schedule is a promise that somebody looks at a machine on a date. Without one, plant is only visited when it breaks."
                                action={
                                    <Button onClick={() => setFormFor('new')}>
                                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                                        New schedule
                                    </Button>
                                }
                            />
                        ) : (
                            visible.map((schedule) => {
                                const due = new Date(schedule.nextDueAt);
                                const overdue = schedule.active && due < new Date();
                                return (
                                    <Card key={schedule.id}>
                                        <CardContent className="space-y-2 py-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium">
                                                        {schedule.title}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {schedule.asset?.assetTag
                                                            ? `${schedule.asset.assetTag} · `
                                                            : ''}
                                                        {schedule.asset?.name ?? 'Unknown asset'}
                                                        {schedule.asset?.property
                                                            ? ` · ${schedule.asset.property.name}`
                                                            : ''}
                                                    </p>
                                                </div>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        !schedule.active
                                                            ? 'bg-slate-100 text-slate-500'
                                                            : overdue
                                                              ? 'bg-amber-100 text-amber-800'
                                                              : 'bg-emerald-100 text-emerald-700'
                                                    }`}
                                                >
                                                    {!schedule.active
                                                        ? 'Paused'
                                                        : overdue
                                                          ? 'Overdue'
                                                          : `In ${schedule.daysUntilDue}d`}
                                                </span>
                                            </div>

                                            <p className="text-sm text-muted-foreground">
                                                {describeCadence(schedule.frequencyDays)}
                                                {schedule.leadTimeDays > 0 &&
                                                    ` · raised ${schedule.leadTimeDays} day(s) early`}
                                                {' · next due '}
                                                {due.toLocaleDateString(undefined, {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                                {schedule.lastRunAt &&
                                                    ` · last serviced ${new Date(
                                                        schedule.lastRunAt,
                                                    ).toLocaleDateString()}`}
                                            </p>

                                            {(schedule.checklist?.length ?? 0) > 0 && (
                                                <ul className="list-inside list-disc text-sm text-muted-foreground">
                                                    {schedule.checklist?.map((step) => (
                                                        <li key={step}>{step}</li>
                                                    ))}
                                                </ul>
                                            )}

                                            <div className="flex flex-wrap gap-2 pt-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        runningId === schedule.id || !schedule.active
                                                    }
                                                    onClick={() => runOne(schedule)}
                                                >
                                                    <Play className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                                    Raise work order
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setFormFor(schedule)}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        try {
                                                            await maintenanceApi.updatePmSchedule(
                                                                schedule.id,
                                                                { active: !schedule.active },
                                                            );
                                                            toast.success(
                                                                schedule.active
                                                                    ? 'Schedule paused'
                                                                    : 'Schedule resumed',
                                                            );
                                                            refetch();
                                                        } catch (err) {
                                                            toast.error(
                                                                apiMessage(err, 'Could not change that'),
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {schedule.active ? 'Pause' : 'Resume'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        if (
                                                            !window.confirm(
                                                                `Delete this schedule? Only possible while it has no open work orders — pause it instead if the service still matters.`,
                                                            )
                                                        ) {
                                                            return;
                                                        }
                                                        try {
                                                            await maintenanceApi.deletePmSchedule(
                                                                schedule.id,
                                                            );
                                                            toast.success('Schedule deleted');
                                                            refetch();
                                                        } catch (err) {
                                                            toast.error(
                                                                apiMessage(err, 'Could not delete it'),
                                                            );
                                                        }
                                                    }}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })
                        )}
                    </div>

                    <div>
                        <Card>
                            <CardHeader>
                                <CardTitle>Due calendar</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <MonthCalendar
                                    month={month}
                                    onMonthChange={setMonth}
                                    schedules={visible}
                                    onOpen={(id) =>
                                        router.push(`/maintenance/assets/${id}`)
                                    }
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {formFor && (
                <PmScheduleDialog
                    schedule={formFor === 'new' ? undefined : formFor}
                    assets={assets.map((asset) => ({
                        value: asset.id,
                        label: `${asset.assetTag ? `${asset.assetTag} · ` : ''}${asset.name} (${
                            ASSET_TYPES.find((type) => type.value === asset.type)?.label ??
                            asset.type
                        })`,
                    }))}
                    technicians={technicians.map((technician) => ({
                        value: technician.id,
                        label: `${technician.firstName} ${technician.lastName}`,
                    }))}
                    onClose={() => setFormFor(null)}
                    onSaved={() => {
                        setFormFor(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}

function Counter({
    label,
    value,
    tone = 'plain',
}: {
    label: string;
    value: number;
    tone?: 'plain' | 'warn';
}) {
    return (
        <div className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p
                className={`text-2xl font-semibold tabular-nums ${
                    tone === 'warn' ? 'text-amber-600' : 'text-slate-900'
                }`}
            >
                {value}
            </p>
        </div>
    );
}

/**
 * The month grid.
 *
 * A calendar because the failure this catches is a collision: two services due on
 * the same day means one technician, and which one is skipped is a decision
 * somebody has to make deliberately rather than discover on the day.
 */
function MonthCalendar({
    month,
    onMonthChange,
    schedules,
    onOpen,
}: {
    month: Date;
    onMonthChange: (month: Date) => void;
    schedules: PmSchedule[];
    onOpen: (assetId: string) => void;
}) {
    const byDay = useMemo(() => {
        const map = new Map<number, PmSchedule[]>();
        for (const schedule of schedules) {
            if (!schedule.active) continue;
            const day = new Date(schedule.nextDueAt).getDate();
            map.set(day, [...(map.get(day) ?? []), schedule]);
        }
        return map;
    }, [schedules]);

    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const today = new Date().getDate();

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() =>
                        onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
                    }
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <p className="font-medium">
                    {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next month"
                    onClick={() =>
                        onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
                    }
                >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <span key={day}>{day.slice(0, 1)}</span>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-sm">
                {Array.from({ length: firstWeekday }).map((_, index) => (
                    <span key={`pad-${index}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const due = byDay.get(day) ?? [];
                    const isToday = day === today && month.getMonth() === new Date().getMonth();
                    return (
                        <div
                            key={day}
                            className={`min-h-[3.25rem] rounded-md border p-1 ${
                                isToday ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200'
                            }`}
                        >
                            <span className="text-xs text-muted-foreground">{day}</span>
                            <div className="mt-1 space-y-0.5">
                                {due.map((schedule) => (
                                    <button
                                        key={schedule.id}
                                        type="button"
                                        onClick={() =>
                                            schedule.assetId ? onOpen(schedule.assetId) : undefined
                                        }
                                        className={`block w-full truncate rounded px-1 text-left text-[10px] ${
                                            new Date(schedule.nextDueAt) < new Date()
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                        title={`${schedule.title} — ${schedule.asset?.name ?? ''}`}
                                    >
                                        {schedule.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PmScheduleDialog({
    schedule,
    assets,
    technicians,
    onClose,
    onSaved,
}: {
    schedule?: PmSchedule;
    assets: { value: string; label: string }[];
    technicians: { value: string; label: string }[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = Boolean(schedule);
    const [title, setTitle] = useState(schedule?.title ?? '');
    const [assetId, setAssetId] = useState(schedule?.assetId ?? '');
    const [frequencyDays, setFrequencyDays] = useState(
        String(schedule?.frequencyDays ?? 30),
    );
    const [leadTimeDays, setLeadTimeDays] = useState(
        String(schedule?.leadTimeDays ?? 0),
    );
    const [nextDueAt, setNextDueAt] = useState(
        schedule ? schedule.nextDueAt.slice(0, 10) : '',
    );
    const [description, setDescription] = useState(schedule?.description ?? '');
    const [checklistText, setChecklistText] = useState(
        schedule?.checklist?.join('\n') ?? '',
    );
    const [assignedTechnicianId, setAssignedTechnicianId] = useState(
        schedule?.assignedTechnicianId ?? '',
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (title.trim().length < 2) {
            setError('Name the service');
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            const payload: Record<string, string | number | string[]> = {
                title: title.trim(),
                frequencyDays: Number(frequencyDays) || 30,
                leadTimeDays: Number(leadTimeDays) || 0,
                checklist: checklistText
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
            };
            if (assetId) payload.assetId = assetId;
            if (description.trim()) payload.description = description.trim();
            if (nextDueAt) payload.nextDueAt = new Date(nextDueAt).toISOString();
            if (assignedTechnicianId) payload.assignedTechnicianId = assignedTechnicianId;

            if (isEdit && schedule) {
                await maintenanceApi.updatePmSchedule(schedule.id, payload);
            } else {
                await maintenanceApi.createPmSchedule(payload);
            }
            toast.success(isEdit ? 'Schedule updated' : 'Schedule created');
            onSaved();
        } catch (err) {
            setError(apiMessage(err, 'Could not save the schedule'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={isEdit ? 'Edit maintenance schedule' : 'New maintenance schedule'}
            size="lg"
        >
            <div className="space-y-4">
                {!isEdit && (
                    <div className="space-y-2">
                        <Label>Asset</Label>
                        <Select
                            value={assetId}
                            onChange={(event) => setAssetId(event.target.value)}
                            options={assets}
                            placeholder="Choose the machine"
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="pm-title">Service</Label>
                    <Input
                        id="pm-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="e.g. Monthly generator service"
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label>How often</Label>
                        <Select
                            value={frequencyDays}
                            onChange={(event) => setFrequencyDays(event.target.value)}
                            options={[
                                { value: '7', label: 'Weekly' },
                                { value: '14', label: 'Fortnightly' },
                                { value: '30', label: 'Monthly' },
                                { value: '90', label: 'Quarterly' },
                                { value: '180', label: 'Every six months' },
                                { value: '365', label: 'Yearly' },
                                ...(frequencyDays &&
                                ![7, 14, 30, 90, 180, 365].includes(Number(frequencyDays))
                                    ? [
                                          {
                                              value: frequencyDays,
                                              label: `Every ${frequencyDays} days`,
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pm-lead">Raise early by (days)</Label>
                        <Input
                            id="pm-lead"
                            inputMode="numeric"
                            value={leadTimeDays}
                            onChange={(event) => setLeadTimeDays(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Time to book a contractor.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pm-due">First due</Label>
                        <Input
                            id="pm-due"
                            type="date"
                            value={nextDueAt}
                            onChange={(event) => setNextDueAt(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Blank starts it tomorrow.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Technician (optional)</Label>
                    <Select
                        value={assignedTechnicianId}
                        onChange={(event) => setAssignedTechnicianId(event.target.value)}
                        options={[{ value: '', label: 'Whoever is free' }, ...technicians]}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="pm-description">Description</Label>
                    <Textarea
                        id="pm-description"
                        rows={2}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="pm-checklist">Checklist</Label>
                    <Textarea
                        id="pm-checklist"
                        rows={5}
                        value={checklistText}
                        onChange={(event) => setChecklistText(event.target.value)}
                        placeholder={'One step per line\ne.g. Check oil level'}
                    />
                    <p className="text-xs text-muted-foreground">
                        Copied onto every work order this schedule raises, so a historic
                        visit keeps the list it was performed against.
                    </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving}>
                        <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isSaving ? 'Saving…' : isEdit ? 'Save schedule' : 'Create schedule'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
