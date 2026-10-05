'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { CURRENCIES, PAYROLL_RUN_STATUS_LABELS } from '@/lib/constants';
import type { PayrollRunRow } from '@/types';

/**
 * Payroll runs.
 *
 * A run is the document: `create → calculate → approve → post → pay`, and the
 * whole reason this list exists in that order is that **posting** is the step
 * that touches the ledger. Every transition is a button on the run's own page
 * rather than a status dropdown, because a dropdown that offers PAID on a run
 * with no payslips is a way of losing a month's payroll in one click.
 *
 * The summary columns come from the backend, and `summary.gross` is `null`
 * rather than a number when a run somehow holds two currencies — an
 * unattributable total is worse than none, so the table says "mixed" instead of
 * adding two currencies from different countries together.
 */
export default function PayrollRunsPage() {
    const router = useRouter();
    const [runs, setRuns] = useState<PayrollRunRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.payrollRuns({ status: status || undefined });
            setRuns(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the payroll runs.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return runs;
        return runs.filter(
            (run) =>
                run.reference.toLowerCase().includes(term) ||
                run.currency.toLowerCase().includes(term),
        );
    }, [runs, search]);

    const remove = async (run: PayrollRunRow) => {
        try {
            await hrApi.deletePayrollRun(run.id);
            toast.success(`${run.reference} deleted`);
            load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not delete that run',
            );
        }
    };

    const actionsFor = (run: PayrollRunRow): RowAction<PayrollRunRow>[] => [
        {
            label: 'View',
            onSelect: () => router.push(`/hr/payroll/${run.id}`),
        },
        ...(run.status === 'DRAFT'
            ? [
                  {
                      label: 'Delete draft',
                      variant: 'danger' as const,
                      onSelect: () => remove(run),
                  },
              ]
            : [
                  {
                      label: 'View payslips',
                      disabled: run.summary.payslips === 0,
                      disabledReason:
                        run.summary.payslips === 0
                            ? 'Nothing has been calculated on this run yet'
                            : undefined,
                      onSelect: () => router.push(`/hr/payroll/${run.id}`),
                  },
              ]),
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payroll runs</h1>
                    <p className="text-muted-foreground">
                        One run per pay period. Figures are calculated, approved, posted to
                        the ledger and only then paid.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={hrApi.payrollRunsExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button onClick={() => setIsCreating(true)}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        New run
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="runStatus">Status</Label>
                    <Select
                        name="runStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            { value: '', label: 'All statuses' },
                            ...Object.entries(PAYROLL_RUN_STATUS_LABELS).map(
                                ([key, meta]) => ({ value: key, label: meta.label }),
                            ),
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="runSearch">Search</Label>
                    <Input
                        id="runSearch"
                        value={search}
                        placeholder="Reference or currency"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading payroll runs…" />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No payroll runs yet"
                    description="Create a run for the period, calculate it, then approve and post it."
                    icon={<Receipt className="h-6 w-6" aria-hidden="true" />}
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Pay date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Payslips</TableHead>
                                    <TableHead className="text-right">Gross</TableHead>
                                    <TableHead className="text-right">Net</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((run) => (
                                    <TableRow key={run.id}>
                                        <TableCell>
                                            <Link
                                                href={`/hr/payroll/${run.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {run.reference}
                                            </Link>
                                            {run.summary.mixedCurrency && (
                                                <p className="text-xs text-amber-700">
                                                    Mixed currencies
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(run.periodStart).toLocaleDateString()} –{' '}
                                            {new Date(run.periodEnd).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(run.payDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={run.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {run.summary.payslips}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {formatTotals(run.summary.gross, run.currency)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {formatTotals(run.summary.net, run.currency)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={run}
                                                actions={actionsFor(run)}
                                                label={`Actions for ${run.reference}`}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <CreateRunModal
                isOpen={isCreating}
                onClose={() => setIsCreating(false)}
                onCreated={() => {
                    setIsCreating(false);
                    load();
                }}
            />
        </div>
    );
}

/** `null` total means the run is multi-currency, which is stated rather than summed. */
function formatTotals(value: number | null, currency: string) {
    if (value == null) return <span className="text-xs text-muted-foreground">mixed</span>;
    return value.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function CreateRunModal({
    isOpen,
    onClose,
    onCreated,
}: {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}) {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

    const [reference, setReference] = useState(
        `PR-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
    );
    const [periodStart, setPeriodStart] = useState(monthStart);
    const [periodEnd, setPeriodEnd] = useState(monthEnd);
    const [payDate, setPayDate] = useState(monthEnd);
    const [currency, setCurrency] = useState('');
    const [scope, setScope] = useState<'all' | 'one'>('all');
    const [employees, setEmployees] = useState<
        { id: string; label: string }[]
    >([]);
    const [employeeIds, setEmployeeIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || scope !== 'one') return;
        hrApi
            .employees({ status: 'active' })
            .then(({ data }) =>
                setEmployees(
                    data.map((employee) => ({
                        id: employee.id,
                        label: `${employee.displayName} (${employee.employeeNumber})`,
                    })),
                ),
            )
            .catch(() => setEmployees([]));
    }, [isOpen, scope]);

    const submit = async () => {
        if (!/^PR-\d{4}-[A-Za-z0-9]{1,12}$/.test(reference)) {
            toast.error('The reference must look like PR-2026-01');
            return;
        }
        if (periodEnd < periodStart) {
            toast.error('The period ends before it starts');
            return;
        }
        setIsSaving(true);
        try {
            const { data } = await hrApi.createPayrollRun({
                reference,
                periodStart,
                periodEnd,
                payDate,
                ...(currency ? { currency } : {}),
                ...(scope === 'one' && employeeIds.length > 0 ? { employeeIds } : {}),
            });
            toast.success(`${data.reference} created — calculate it next`);
            onCreated();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not create the payroll run',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New payroll run" size="lg">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    A run starts as a draft with no figures on it. Calculating it prices
                    every active employee through the statutory rules in force on the pay
                    date.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="run-reference">Reference</Label>
                        <Input
                            id="run-reference"
                            value={reference}
                            onChange={(event) => setReference(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="run-currency">Currency (optional)</Label>
                        <Select
                            name="run-currency"
                            value={currency}
                            onChange={(event) => setCurrency(event.target.value)}
                            placeholder="Each employee's own"
                            options={CURRENCIES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="run-start">Period start</Label>
                        <Input
                            id="run-start"
                            type="date"
                            value={periodStart}
                            onChange={(event) => setPeriodStart(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="run-end">Period end</Label>
                        <Input
                            id="run-end"
                            type="date"
                            value={periodEnd}
                            onChange={(event) => setPeriodEnd(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="run-payDate">Pay date</Label>
                        <Input
                            id="run-payDate"
                            type="date"
                            value={payDate}
                            onChange={(event) => setPayDate(event.target.value)}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="run-scope">Who is in this run</Label>
                    <Select
                        name="run-scope"
                        value={scope}
                        onChange={(event) =>
                            setScope(event.target.value === 'one' ? 'one' : 'all')
                        }
                        options={[
                            { value: 'all', label: 'Every active employee' },
                            { value: 'one', label: 'Only selected employees' },
                        ]}
                    />
                    {scope === 'one' && (
                        <>
                            <p className="text-xs text-muted-foreground">
                                Employees who were not employed during the period, or who are
                                paid in another currency, are skipped by the calculation and
                                listed on the run with the reason.
                            </p>
                            <div className="max-h-56 overflow-y-auto rounded-md border p-2">
                                {employees.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        No active employees to choose from.
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {employees.map((employee) => (
                                            <li key={employee.id}>
                                                <label className="flex items-center gap-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={employeeIds.includes(employee.id)}
                                                        onChange={(event) =>
                                                            setEmployeeIds((current) =>
                                                                event.target.checked
                                                                    ? [...current, employee.id]
                                                                    : current.filter(
                                                                          (id) =>
                                                                              id !== employee.id,
                                                                      ),
                                                            )
                                                        }
                                                    />
                                                    {employee.label}
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving}>
                        {isSaving ? 'Creating…' : 'Create the run'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}