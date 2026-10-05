'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/entity-states';
import { LEAVE_TYPES } from '@/lib/constants';
import type { EmployeeRow } from '@/types';

/**
 * Filing leave, from either side.
 *
 * `scope` is the whole point of this component being one file rather than two.
 * The two routes are genuinely different requests: the manager one names an
 * employee, the self one **cannot** — there is no parameter for it, because the
 * backend resolves the caller from their login and discards an `employeeId` even
 * if one is sent. So the self form has no employee field to wire up by mistake,
 * and submits to `createSelfLeave`.
 *
 * The dates are validated against the calendar server-side (`workingDays` is
 * derived, never accepted), so the manager scope previews the answer through
 * `previewLeave` rather than computing it in the browser: five calendar days over
 * a weekend and a public holiday is three days of leave, and a form that promises
 * five is a form somebody will be embarrassed by.
 */

type Scope = 'self' | 'manager';

interface LeaveRequestFormProps {
    scope?: Scope;
    /** The employee, manager scope only. Defaults to the first active employee. */
    employeeId?: string;
    initialLeaveType?: string;
}

interface FormErrors {
    [key: string]: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function LeaveRequestForm({
    scope = 'manager',
    employeeId,
    initialLeaveType = 'ANNUAL',
}: LeaveRequestFormProps) {
    const router = useRouter();
    const [leaveType, setLeaveType] = useState(initialLeaveType);
    const [startDate, setStartDate] = useState(today());
    const [endDate, setEndDate] = useState(today());
    const [reason, setReason] = useState('');
    const [employee, setEmployee] = useState<EmployeeRow | null>(null);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [isLoading, setIsLoading] = useState(scope === 'manager');
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [preview, setPreview] = useState<{
        allowed: boolean;
        workingDays: number;
        remaining: number;
        reason?: string;
    } | null>(null);

    useEffect(() => {
        if (scope !== 'manager') return;
        let cancelled = false;
        hrApi
            .employees()
            .then(({ data }) => {
                if (cancelled) return;
                setEmployees(data);
                if (!employeeId) setEmployee(data[0] ?? null);
            })
            .catch(() => setEmployees([]));
        return () => {
            cancelled = true;
        };
    }, [scope, employeeId]);

    // Read-only in effect: what would this request do to the balance. Asked for
    // only once both dates are plausible, so a half-typed range does not produce
    // a confident answer about nothing.
    const loadPreview = useCallback(async () => {
        if (scope !== 'manager' || !employee || !startDate || !endDate || endDate < startDate) {
            setPreview(null);
            return;
        }
        try {
            const { data } = await hrApi.previewLeave(employee.id, {
                startDate,
                endDate,
                leaveType,
            });
            setPreview(data);
        } catch {
            setPreview(null);
        }
    }, [scope, employee, startDate, endDate, leaveType]);

    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    const submit = async () => {
        const nextErrors: FormErrors = {};
        if (!leaveType) nextErrors.leaveType = 'Choose a leave type';
        if (!startDate) nextErrors.startDate = 'Choose a start date';
        if (!endDate) nextErrors.endDate = 'Choose an end date';
        if (startDate && endDate && endDate < startDate) {
            nextErrors.endDate = 'The last day cannot be before the first';
        }
        if (scope === 'manager' && !employee) {
            nextErrors.employeeId = 'Choose the employee this is for';
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setIsSaving(true);
        try {
            if (scope === 'self') {
                const { data } = await hrApi.createSelfLeave({
                    leaveType,
                    startDate,
                    endDate,
                    reason: reason.trim() || undefined,
                });
                // The backend says so out loud if an `employeeId` was sent and
                // discarded, and that message is more useful than a plain
                // "leave filed" — so it replaces the toast rather than hiding
                // behind it.
                toast.success(data.note ?? 'Leave filed — the decision appears on your leave page');
                router.push('/hr/me/leave');
            } else {
                await hrApi.createLeave({
                    employeeId: employee!.id,
                    leaveType,
                    startDate,
                    endDate,
                    reason: reason.trim() || undefined,
                });
                toast.success('Leave filed');
                router.push('/hr/leave');
            }
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not file the leave request',
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading employees…" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>
                        {scope === 'self' ? 'Request leave' : 'File leave for an employee'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {scope === 'manager' && (
                        <div className="space-y-2">
                            <Label htmlFor="lr-employee">Employee</Label>
                            <Select
                                name="lr-employee"
                                value={employee?.id ?? ''}
                                onChange={(event) =>
                                    setEmployee(
                                        employees.find((row) => row.id === event.target.value) ?? null,
                                    )
                                }
                                options={employees.map((row) => ({
                                    value: row.id,
                                    label: `${row.displayName} (${row.employeeNumber})`,
                                }))}
                                placeholder="Choose an employee"
                            />
                            {errors.employeeId && (
                                <p className="text-sm text-destructive">{errors.employeeId}</p>
                            )}
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="lr-leaveType">Leave type</Label>
                            <Select
                                name="lr-leaveType"
                                value={leaveType}
                                onChange={(event) => setLeaveType(event.target.value)}
                                options={LEAVE_TYPES.map((entry) => ({
                                    value: entry.value,
                                    label: entry.label,
                                }))}
                            />
                            {errors.leaveType && (
                                <p className="text-sm text-destructive">{errors.leaveType}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lr-startDate">First day</Label>
                            <Input
                                id="lr-startDate"
                                type="date"
                                value={startDate}
                                onChange={(event) => setStartDate(event.target.value)}
                            />
                            {errors.startDate && (
                                <p className="text-sm text-destructive">{errors.startDate}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lr-endDate">Last day</Label>
                            <Input
                                id="lr-endDate"
                                type="date"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                            />
                            {errors.endDate && (
                                <p className="text-sm text-destructive">{errors.endDate}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lr-reason">Reason (optional)</Label>
                        <Textarea
                            id="lr-reason"
                            rows={2}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Anything your approver should know"
                        />
                    </div>

                    {preview && (
                        <div
                            className={`rounded-md border px-3 py-2 text-sm ${
                                preview.allowed
                                    ? 'border-slate-300 bg-slate-50 text-slate-700'
                                    : 'border-amber-300 bg-amber-50 text-amber-900'
                            }`}
                            role="status"
                        >
                            {preview.workingDays} working day
                            {preview.workingDays === 1 ? '' : 's'} after weekends and public
                            holidays — {preview.remaining} remaining.
                            {!preview.allowed && preview.reason
                                ? ` This would not be granted: ${preview.reason}`
                                : ''}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Filing…' : 'File the request'}
                </Button>
            </div>
        </div>
    );
}