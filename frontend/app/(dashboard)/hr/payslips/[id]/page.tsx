'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { hrApi } from '@/lib/api';
import { PayslipDisplay } from '@/components/hr/payslip-display';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PayslipDetail } from '@/types';

/**
 * A payslip, read by somebody who runs payroll rather than by its owner.
 *
 * The counterpart to `/hr/me/payslips/[id]`, and the reason there are two routes
 * at all is on the backend: the self-service read is scoped by the caller's own
 * employment record, so it cannot be reused to look at somebody else's — and the
 * `employee` block below (national ID, bank details) is only ever attached to
 * this one.
 */
export default function PayslipDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [payslip, setPayslip] = useState<PayslipDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.payslip(id);
            setPayslip(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That payslip does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the payslip.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading the payslip…" />;
    if (error || !payslip) return <ErrorState message={error ?? 'Payslip not found.'} onRetry={load} />;

    const employee = payslip.employee;

    return (
        <div className="space-y-4">
            <PayslipDisplay
                payslip={payslip}
                employeeName={payslip.employeeName}
                backHref={employee ? `/hr/employees/${employee.id}` : '/hr/payroll'}
                backLabel={employee ? 'Back to the employee record' : 'Back to payroll runs'}
            />

            {employee && (
                <Card>
                    <CardHeader>
                        <CardTitle>Employee and payment details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-muted-foreground">Employee number</dt>
                                <dd className="font-medium">{employee.employeeNumber}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Job title</dt>
                                <dd>{employee.jobTitle ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Department</dt>
                                <dd>{employee.department ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Paid to</dt>
                                <dd>
                                    {employee.bankName ?? '—'}
                                    {employee.bankAccount
                                        ? ` · ${employee.bankAccount}`
                                        : ' · no bank details on file'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">National ID</dt>
                                <dd>{employee.nationalId ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Tax number</dt>
                                <dd>{employee.taxNumber ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Social security</dt>
                                <dd>{employee.socialSecurityNumber ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Bank branch</dt>
                                <dd>{employee.bankBranch ?? '—'}</dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>
            )}

            {payslip.applied && payslip.applied.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Rules that produced this payslip</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Every statutory figure above came from one of these rows, so a
                            payslip from last year still explains itself after a rate change.
                        </p>
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {payslip.applied.map((rule) => (
                                <li
                                    key={rule.ruleId}
                                    className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                                >
                                    {rule.code} — {rule.name}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}