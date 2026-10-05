'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Calculator, Ban, CheckCircle2, Landmark, Wallet } from 'lucide-react';
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
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import {
    PAYROLL_RUN_SEQUENCE,
    PAYROLL_RUN_STATUS_LABELS,
    PAYROLL_WARNING_LABELS,
} from '@/lib/constants';
import type { PayrollRunDetail } from '@/types';

/**
 * One payroll run, and the four buttons that move it along.
 *
 * The screen is built around one rule that is easy to get wrong: **posting
 * happens before paying.** `APPROVED` is a state on the way, not the destination
 * — the cost of employing these people is a ledger entry, and releasing the
 * money before that entry exists leaves the trial balance a work of fiction. So
 * the only button offered is the next step in `PAYROLL_RUN_SEQUENCE`, and `pay`
 * is deliberately not offered while `post` has not run.
 *
 * The second thing on this screen is `coverage`. A jurisdiction with no statutory
 * rules configured pays everybody, withholds nothing, and reports success — so
 * the warning the backend computes is rendered in full rather than being reduced
 * to a count somebody has to interpret.
 */
export default function PayrollRunDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [run, setRun] = useState<PayrollRunDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [lastWarnings, setLastWarnings] = useState<{ code: string; message: string }[]>([]);
    const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
    const [isPaying, setIsPaying] = useState(false);
    const [isVoiding, setIsVoiding] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.payrollRun(id);
            setRun(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That payroll run does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the payroll run.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const step = useMemo(
        () => (run ? PAYROLL_RUN_SEQUENCE.find((entry) => entry.status === run.status) : undefined),
        [run],
    );

    if (isLoading) return <LoadingState label="Loading the payroll run…" />;
    if (error || !run) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild>
                    <Link href="/hr/payroll">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to payroll runs
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Payroll run not found.'} onRetry={load} />
            </div>
        );
    }

    const runAction = async (action: string) => {
        setBusy(action);
        try {
            if (action === 'calculate') {
                const { data } = await hrApi.calculatePayrollRun(run.id);
                setLastWarnings(data.warnings);
                setSkipped(
                    data.skipped.map((row) => ({
                        name: row.employeeNumber,
                        reason: row.reason,
                    })),
                );
                toast.success(
                    `${data.summary.payslips} payslips calculated — ${data.summary.gross.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gross`,
                );
            } else if (action === 'approve') {
                await hrApi.approvePayrollRun(run.id);
                toast.success('Figures approved — post them to the ledger next');
            } else if (action === 'post') {
                const { data } = await hrApi.postPayrollRun(run.id);
                toast.success(`Posted to the ledger as ${data.entryNumber}`);
            }
            await load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'The payroll run refused that',
            );
        } finally {
            setBusy(null);
        }
    };

    const statusMeta = PAYROLL_RUN_STATUS_LABELS[run.status];
    const canVoid = run.status !== 'VOID' && run.status !== 'PAID';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/hr/payroll" aria-label="Back to payroll runs">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{run.reference}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge status={run.status} />
                            {statusMeta && (
                                <p className="text-sm text-muted-foreground">{statusMeta.hint}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {step?.action === 'calculate' && (
                        <Button
                            onClick={() => runAction('calculate')}
                            disabled={busy !== null}
                        >
                            <Calculator className="mr-2 h-4 w-4" aria-hidden="true" />
                            {busy === 'calculate' ? 'Calculating…' : 'Calculate'}
                        </Button>
                    )}
                    {step?.action === 'approve' && (
                        <Button
                            onClick={() => runAction('approve')}
                            disabled={busy !== null}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            {busy === 'approve' ? 'Approving…' : 'Approve the figures'}
                        </Button>
                    )}
                    {step?.action === 'post' && (
                        <Button onClick={() => runAction('post')} disabled={busy !== null}>
                            <Landmark className="mr-2 h-4 w-4" aria-hidden="true" />
                            {busy === 'post' ? 'Posting…' : 'Post to the ledger'}
                        </Button>
                    )}
                    {step?.action === 'pay' && (
                        <Button onClick={() => setIsPaying(true)} disabled={busy !== null}>
                            <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
                            Release the money
                        </Button>
                    )}
                    {canVoid && (
                        <Button variant="outline" onClick={() => setIsVoiding(true)}>
                            <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                            Void
                        </Button>
                    )}
                </div>
            </div>

            {run.voidReason && (
                <div
                    className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
                    role="alert"
                >
                    <p className="font-medium">This run was voided</p>
                    <p className="mt-1">{run.voidReason}</p>
                </div>
            )}

            {run.coverage?.warning && (
                <div
                    className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    role="alert"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="font-medium">Check the statutory rules before paying</p>
                        <p className="mt-1">{run.coverage.warning}</p>
                        <Link
                            href="/hr/settings/payroll-rules"
                            className="mt-2 inline-block underline underline-offset-4"
                        >
                            Review the rules for {run.coverage.jurisdiction.label}
                        </Link>
                    </div>
                </div>
            )}

            {lastWarnings.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Warnings from the last calculation</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-1 text-sm">
                            {lastWarnings.map((warning) => (
                                <li key={warning.code} className="flex items-start gap-2">
                                    <AlertTriangle
                                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                                        aria-hidden="true"
                                    />
                                    <span>
                                        {PAYROLL_WARNING_LABELS[warning.code] ?? warning.message}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {skipped.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Left out of this run</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            {skipped.map((row) => (
                                <li key={row.name}>
                                    <span className="font-medium text-foreground">{row.name}</span>{' '}
                                    — {row.reason}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Run summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Period</dt>
                            <dd>
                                {new Date(run.periodStart).toLocaleDateString()} –{' '}
                                {new Date(run.periodEnd).toLocaleDateString()}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Pay date</dt>
                            <dd>{new Date(run.payDate).toLocaleDateString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Payslips</dt>
                            <dd>{run.summary.payslips}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Journal entry</dt>
                            <dd>{run.journalEntryId ?? 'Not posted'}</dd>
                        </div>
                    </dl>

                    <div className="mt-4 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Currency</TableHead>
                                    <TableHead className="text-right">Payslips</TableHead>
                                    <TableHead className="text-right">Gross</TableHead>
                                    <TableHead className="text-right">Deductions</TableHead>
                                    <TableHead className="text-right">Employer cost</TableHead>
                                    <TableHead className="text-right">Net</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {run.summary.currencies.map((row) => (
                                    <TableRow key={row.currency}>
                                        <TableCell className="font-medium">{row.currency}</TableCell>
                                        <TableCell className="text-right">{row.payslips}</TableCell>
                                        <TableCell className="text-right">{amount(row.gross)}</TableCell>
                                        <TableCell className="text-right">
                                            {amount(row.employeeDeductions)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {amount(row.employerContributions)}
                                        </TableCell>
                                        <TableCell className="text-right">{amount(row.net)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Payslips</CardTitle>
                </CardHeader>
                <CardContent>
                    {run.payslips.length === 0 ? (
                        <EmptyState
                            title="Nothing calculated yet"
                            description="Calculate the run and the payslips appear here, one per employee."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Number</TableHead>
                                        <TableHead className="text-right">Basic</TableHead>
                                        <TableHead className="text-right">Gross</TableHead>
                                        <TableHead className="text-right">Deductions</TableHead>
                                        <TableHead className="text-right">Net</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {run.payslips.map((payslip) => (
                                        <TableRow key={payslip.id}>
                                            <TableCell>
                                                <Link
                                                    href={`/hr/payslips/${payslip.id}`}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                >
                                                    {payslip.employeeName ?? '—'}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {payslip.employee?.employeeNumber ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {amount(payslip.basicSalary)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {amount(payslip.totals.gross)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {amount(payslip.totals.employeeDeductions)}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {amount(payslip.totals.net)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <PayDialog
                isOpen={isPaying}
                onClose={() => setIsPaying(false)}
                onConfirm={async (reference) => {
                    setBusy('pay');
                    try {
                        await hrApi.payPayrollRun(run.id, reference || undefined);
                        toast.success('Money released — the run is paid');
                        setIsPaying(false);
                        await load();
                    } catch (err) {
                        toast.error(
                            (err as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ?? 'Could not release the money',
                        );
                    } finally {
                        setBusy(null);
                    }
                }}
            />

            <VoidDialog
                isOpen={isVoiding}
                onClose={() => setIsVoiding(false)}
                onConfirm={async (reason) => {
                    setBusy('void');
                    try {
                        await hrApi.voidPayrollRun(run.id, reason);
                        toast.success(`${run.reference} voided — its payslips are kept as the record`);
                        setIsVoiding(false);
                        await load();
                    } catch (err) {
                        toast.error(
                            (err as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message ?? 'Could not void the run',
                        );
                    } finally {
                        setBusy(null);
                    }
                }}
            />
        </div>
    );
}

const amount = (value: number) =>
    value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PayDialog({
    isOpen,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reference: string) => Promise<void>;
}) {
    const [reference, setReference] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Release the money">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Record the bank reference for this payment. It is optional in the API and
                    worth typing here: a paid payroll with no reference is an untraceable
                    payroll.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="pay-reference">Payment reference</Label>
                    <Input
                        id="pay-reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="e.g. MPESA-BANK-2026-10-31"
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(reference);
                            setIsSaving(false);
                        }}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Releasing…' : 'Mark as paid'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function VoidDialog({
    isOpen,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
}) {
    const [reason, setReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const tooShort = reason.trim().length > 0 && reason.trim().length < 10;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Void this payroll run">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Voiding keeps the run and its payslips as the record of what happened — it
                    does not delete anything. Say why, in a sentence somebody will understand
                    in six months.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="void-reason">Reason</Label>
                    <Input
                        id="void-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="e.g. Wrong period — October figures were paid twice"
                        aria-invalid={tooShort}
                    />
                    {tooShort && (
                        <p className="text-sm text-destructive">
                            Give at least ten characters of explanation.
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={async () => {
                            if (reason.trim().length < 10) return;
                            setIsSaving(true);
                            await onConfirm(reason.trim());
                            setIsSaving(false);
                        }}
                        disabled={isSaving || reason.trim().length < 10}
                    >
                        {isSaving ? 'Voiding…' : 'Void the run'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}