'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { EMPLOYMENT_TYPES, PAY_FREQUENCIES } from '@/lib/constants';
import type { EmployeeDetail } from '@/types';

/**
 * One employee's record.
 *
 * Two halves with different permissions behind them, which is why this page is
 * worth reading carefully: the backend only attaches `basicSalary`, bank details
 * and national identifiers once the caller holds `employees.compensation`. A
 * property manager reaching this screen sees the record and gets a 403 for the
 * sensitive half rather than an empty panel — so nothing here may *assume* those
 * fields are present.
 *
 * **Termination is a date, not a delete.** The employee row is referenced by every
 * payslip ever issued, and a payslip is a document somebody may need years later.
 * `terminateEmployee` records the last day and the backend refuses if an open run
 * spans it, so this dialog says which run that is rather than silently
 * succeeding.
 */
export default function EmployeeDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [detail, setDetail] = useState<EmployeeDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTerminating, setIsTerminating] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.employee(id);
            setDetail(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 403
                    ? 'You can see the staff directory but not this employee’s compensation details.'
                    : status === 404
                      ? 'That employee does not exist in your organization.'
                      : (err as { response?: { data?: { message?: string } } })?.response?.data
                            ?.message ?? 'Could not load the employee.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading the employee…" />;
    if (error || !detail) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/hr/employees">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to employees
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Employee not found.'} onRetry={load} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/hr/employees" aria-label="Back to employees">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {detail.preferredName || `${detail.firstName} ${detail.lastName}`}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge status={detail.isActive ? 'ACTIVE' : 'INACTIVE'} />
                            <span className="text-sm text-muted-foreground">
                                {detail.employeeNumber}
                                {detail.jobTitle ? ` · ${detail.jobTitle}` : ''}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/hr/employees/${detail.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            Edit
                        </Link>
                    </Button>
                    {detail.isActive && !detail.terminationDate && (
                        <Button variant="outline" onClick={() => setIsTerminating(true)}>
                            <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Record leaving
                        </Button>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Employment</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Department</dt>
                            <dd>{detail.department ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Employment type</dt>
                            <dd>
                                {EMPLOYMENT_TYPES.find(
                                    (entry) => entry.value === detail.employmentType,
                                )?.label ?? detail.employmentType}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Hired</dt>
                            <dd>{new Date(detail.hireDate).toLocaleDateString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Left</dt>
                            <dd>
                                {detail.terminationDate
                                    ? new Date(detail.terminationDate).toLocaleDateString()
                                    : 'Still here'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Paid</dt>
                            <dd>
                                {PAY_FREQUENCIES.find(
                                    (entry) => entry.value === detail.payFrequency,
                                )?.label ?? detail.payFrequency}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Periods a year</dt>
                            <dd>{detail.periodsPerYear}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Payslip locale</dt>
                            <dd>{detail.preferredLocale ?? "the organization's default"}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Login</dt>
                            <dd>
                                {detail.user ? (
                                    <Link
                                        href={`/users/${detail.user.id}`}
                                        className="underline underline-offset-4"
                                    >
                                        {detail.user.email}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">
                                        no login linked
                                    </span>
                                )}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="break-words">{detail.email ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>{detail.phone ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Address</dt>
                            <dd>{detail.address ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Preferred name</dt>
                            <dd>{detail.preferredName ?? '—'}</dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            {/* Requires `employees.compensation`. The backend never fetched these
                fields for a caller without it, so this card only renders when the
                detail read carried them. */}
            {detail.basicSalary != null && (
                <Card>
                    <CardHeader>
                        <CardTitle>Compensation and identifiers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-muted-foreground">Basic salary</dt>
                                <dd className="font-medium">
                                    {detail.basicSalary.toLocaleString('en-KE', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}{' '}
                                    {detail.salaryCurrency}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">National ID</dt>
                                <dd>{detail.nationalId ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Tax number</dt>
                                <dd>{detail.taxNumber ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Social security</dt>
                                <dd>{detail.socialSecurityNumber ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Bank</dt>
                                <dd>{detail.bankName ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Account</dt>
                                <dd>{detail.bankAccount ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Branch</dt>
                                <dd>{detail.bankBranch ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Bank code</dt>
                                <dd>{detail.bankCode ?? '—'}</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>
            )}

            {detail.components && detail.components.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Standing pay components</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-3 text-sm text-muted-foreground">
                            A pension an employee contributes 5% to and the employer 10% of is
                            two figures from one arrangement, so it is a row here rather than
                            a column on the employee.
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Component</TableHead>
                                    <TableHead>Side</TableHead>
                                    <TableHead className="text-right">Employee</TableHead>
                                    <TableHead className="text-right">Employer</TableHead>
                                    <TableHead>From</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detail.components.map((component) => (
                                    <TableRow key={component.id}>
                                        <TableCell>
                                            <p className="font-medium">
                                                {component.payComponent.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {component.payComponent.code}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {component.payComponent.direction === 'EARNING'
                                                ? 'Earning'
                                                : component.payComponent.direction ===
                                                    'EMPLOYEE_DEDUCTION'
                                                  ? 'Deducted'
                                                  : 'Employer cost'}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {component.percentage != null
                                                ? `${Number(component.percentage)}%`
                                                : component.amount != null
                                                  ? `${Number(component.amount).toLocaleString(
                                                        'en-KE',
                                                    )} ${component.currency}`
                                                  : '—'}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {component.payComponent.direction ===
                                            'EMPLOYER_CONTRIBUTION'
                                                ? component.percentage != null
                                                    ? `${Number(component.percentage)}%`
                                                    : component.amount != null
                                                      ? Number(component.amount).toLocaleString(
                                                            'en-KE',
                                                        )
                                                      : '—'
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(
                                                component.effectiveFrom,
                                            ).toLocaleDateString()}
                                            {component.effectiveTo
                                                ? ` – ${new Date(
                                                      component.effectiveTo,
                                                  ).toLocaleDateString()}`
                                                : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Leave</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                        <div>
                            <dt className="text-muted-foreground">Policy</dt>
                            <dd>
                                {detail.leavePolicy
                                    ? `${detail.leavePolicy.code} — ${detail.leavePolicy.name}`
                                    : 'default policy'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Entitlement</dt>
                            <dd className="font-medium">{detail.leaveBalance.entitlement}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Carried in</dt>
                            <dd>{detail.leaveBalance.carriedIn}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Taken</dt>
                            <dd>{detail.leaveBalance.taken}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Remaining</dt>
                            <dd className="font-medium">
                                {detail.leaveBalance.remaining}
                                {detail.leaveBalance.booked > 0 && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                        ({detail.leaveBalance.booked} booked ahead)
                                    </span>
                                )}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Payslips</CardTitle>
                </CardHeader>
                <CardContent>
                    {detail.payslips.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No payslips yet — they appear once a payroll run covering a period
                            they were employed in has been calculated.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Run</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Pay date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detail.payslips.map((payslip) => (
                                    <TableRow key={payslip.id}>
                                        <TableCell className="font-medium">
                                            {payslip.reference}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(payslip.periodStart).toLocaleDateString()}{' '}
                                            – {new Date(payslip.periodEnd).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(payslip.payDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={payslip.runStatus} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link href={`/hr/payslips/${payslip.id}`}>
                                                    Open
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {isTerminating && (
                <TerminateModal
                    employeeName={
                        detail.preferredName || `${detail.firstName} ${detail.lastName}`
                    }
                    onClose={() => setIsTerminating(false)}
                    onConfirm={async (terminationDate) => {
                        try {
                            const { data } = await hrApi.terminateEmployee(detail.id, terminationDate);
                            if (data.openRun) {
                                toast.warning(
                                    `Recorded, but ${data.openRun.reference} is still open over that date — check who it covers.`,
                                    { duration: 8000 },
                                );
                            } else {
                                toast.success(data.message);
                            }
                            setIsTerminating(false);
                            await load();
                        } catch (err) {
                            toast.error(
                                (err as { response?: { data?: { message?: string } } })?.response
                                    ?.data?.message ?? 'Could not record the leaving date',
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}

function TerminateModal({
    employeeName,
    onClose,
    onConfirm,
}: {
    employeeName: string;
    onClose: () => void;
    onConfirm: (date: string) => Promise<void>;
}) {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [isSaving, setIsSaving] = useState(false);

    return (
        <Modal isOpen onClose={onClose} title={`Record ${employeeName} leaving`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    This records the last working day. Nothing is deleted — payslips, leave
                    history and the ledger entries that came from them all stay, because they
                    are records rather than data about a current employee.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="termination-date">Last working day</Label>
                    <Input
                        id="termination-date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(date);
                            setIsSaving(false);
                        }}
                        disabled={isSaving || !date}
                    >
                        {isSaving ? 'Recording…' : 'Record the leaving date'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}