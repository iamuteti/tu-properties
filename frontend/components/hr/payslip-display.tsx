'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/entity-states';
import type { PayrollLineDirection, PayslipRow } from '@/types';

/**
 * A payslip as a document.
 *
 * Shared by the three places one is read — the employee's own payslip, the HR
 * view reached from an employee record, and the one inside a payroll run — so
 * that the same figures can never be presented two ways.
 *
 * Two properties of the data this leans on rather than recomputing:
 *
 * - `totals` is **derived from `lines`** by the backend on every read. Nothing
 *   here adds up a column, because a payslip whose footer disagrees with its own
 *   body is the failure this component would otherwise be blamed for.
 * - Every line carries its own `explanation` from the engine, and the reason it
 *   is rendered next to the figure rather than behind a hover: "PAYE 24,000" and
 *   "PAYE 24,000 — 10% above the 240,000 monthly threshold" are not the same
 *   sentence to somebody checking whether they were taxed correctly.
 *
 * `paymentState` exists because **posted to the ledger is not the same as paid**,
 * and an employee reading "approved" as "the money is in the bank" is a support
 * ticket every month.
 */

const money = (value: number | null | undefined, currency?: string | null) => {
    if (value == null) return '—';
    const formatted = value.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return currency ? `${currency} ${formatted}` : formatted;
};

const DIRECTION_ORDER: PayrollLineDirection[] = [
    'EARNING',
    'EMPLOYEE_DEDUCTION',
    'EMPLOYER_CONTRIBUTION',
];

const DIRECTION_HEADING: Record<PayrollLineDirection, string> = {
    EARNING: 'Earnings',
    EMPLOYEE_DEDUCTION: 'Deductions from your pay',
    EMPLOYER_CONTRIBUTION: 'Paid by the employer',
};

const DIRECTION_ROW: Record<PayrollLineDirection, string> = {
    EARNING: 'text-slate-900',
    EMPLOYEE_DEDUCTION: 'text-amber-800',
    EMPLOYER_CONTRIBUTION: 'text-sky-800',
};

export interface PayslipDisplayProps {
    payslip: PayslipRow;
    /** Who the payslip is for. Omitted when the reader already knows. */
    employeeName?: string | null;
    /** Link to the payslip's own detail route, when there is one. */
    selfHref?: string;
    /** Back link shown above the document. */
    backHref?: string;
    backLabel?: string;
    /** Printed on the document itself rather than in the page furniture. */
    organisationName?: string | null;
}

export function PayslipDisplay({
    payslip,
    employeeName,
    selfHref,
    backHref,
    backLabel = 'Back',
    organisationName,
}: PayslipDisplayProps) {
    const { lines, totals } = payslip;
    const byDirection = DIRECTION_ORDER.map((direction) => ({
        direction,
        rows: lines
            .filter((line) => line.direction === direction)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    })).filter((group) => group.rows.length > 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                {backHref ? (
                    <Link
                        href={backHref}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                        {backLabel}
                    </Link>
                ) : (
                    <span />
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                    Print
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                        <span>Payslip</span>
                        {payslip.runReference && (
                            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                                {payslip.runReference}
                                {payslip.runStatus && <StatusBadge status={payslip.runStatus} />}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Employee</dt>
                            <dd className="font-medium">
                                {employeeName ?? payslip.employeeName ?? '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Period</dt>
                            <dd>
                                {new Date(payslip.periodStart).toLocaleDateString()} –{' '}
                                {new Date(payslip.periodEnd).toLocaleDateString()}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Pay date</dt>
                            <dd>{new Date(payslip.payDate).toLocaleDateString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Basic salary</dt>
                            <dd>{money(payslip.basicSalary, payslip.currency)}</dd>
                        </div>
                    </dl>

                    {payslip.paymentState === 'approved-not-released' && (
                        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            This period has been approved and posted to the ledger, but the
                            money has not been released yet.
                        </p>
                    )}

                    {lines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            This payslip has no lines — it was created by hand rather than by
                            a payroll run.
                        </p>
                    ) : (
                        <div className="space-y-6">
                            {byDirection.map((group) => (
                                <div key={group.direction}>
                                    <p className="mb-2 text-sm font-medium">
                                        {DIRECTION_HEADING[group.direction]}
                                    </p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead className="text-right">
                                                    Amount
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.rows.map((line) => (
                                                <TableRow key={line.id ?? `${line.code}-${line.sortOrder}`}>
                                                    <TableCell>
                                                        <span
                                                            className={`text-sm ${DIRECTION_ROW[line.direction]}`}
                                                        >
                                                            {line.name}
                                                        </span>
                                                        {line.code && (
                                                            <span className="ml-2 text-xs text-muted-foreground">
                                                                {line.code}
                                                            </span>
                                                        )}
                                                        {line.explanation && (
                                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                                {line.explanation}
                                                            </p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right align-top">
                                                        {money(line.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                        </div>
                    )}

                    <dl className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
                        <div>
                            <dt className="text-sm text-muted-foreground">Gross</dt>
                            <dd className="text-lg font-semibold">
                                {money(totals.gross, payslip.currency)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">Deductions</dt>
                            <dd className="text-lg font-semibold text-amber-800">
                                {money(totals.employeeDeductions, payslip.currency)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">
                                Employer contributions
                            </dt>
                            <dd className="text-lg font-semibold text-sky-800">
                                {money(totals.employerContributions, payslip.currency)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-muted-foreground">Net pay</dt>
                            <dd className="text-xl font-bold">
                                {money(totals.net, payslip.currency)}
                            </dd>
                        </div>
                    </dl>

                    {organisationName && (
                        <p className="text-xs text-muted-foreground">{organisationName}</p>
                    )}

                    {selfHref && (
                        <p className="text-xs text-muted-foreground">
                            <Link
                                href={selfHref}
                                className="text-primary underline-offset-4 hover:underline"
                            >
                                Open the full payslip
                            </Link>
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}