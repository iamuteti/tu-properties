'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Play, Receipt } from 'lucide-react';
import { utilityChargesApi, utilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { UTILITY_CHARGE_STATUSES, UTILITY_TYPES } from '@/lib/constants';
import type { BillRunResult, UtilityChargeRow, UtilityMeterRow, UtilityType } from '@/types';

/**
 * The billing screen — where a reading becomes an invoice.
 *
 * **Two actions, not one.** "Price this period" produces a charge and stops; "Price
 * and invoice" also raises the document. They are separate because they fail
 * independently, and because a figure you are about to send to a resident should be
 * reviewable *before* it is on a document — which is also what makes a wrong bill
 * correctable without raising a credit note against somebody else's invoice.
 *
 * The run's result is shown in full, and two parts of it are the reason the screen is
 * not just a button:
 *
 * - **consumption and whether the register rolled**, because a figure the operator
 *   did not expect is the moment to stop;
 * - **`unbilled`**, priced but with nobody to invoice. A vacant unit on a bulk meter
 *   still consumed water, and a silently dropped row is how that cost goes unnoticed.
 *
 * A charge already on an invoice cannot be voided here — the refusal names the Finance
 * action instead, because cancelling an invoice reverses its journal entry and that
 * is not this screen's business.
 */
export default function BillingPage() {
    const [charges, setCharges] = useState<UtilityChargeRow[]>([]);
    const [meters, setMeters] = useState<UtilityMeterRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');

    const now = new Date();
    const [meterId, setMeterId] = useState('');
    const [billingPeriod, setBillingPeriod] = useState(
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    );
    const [unitId, setUnitId] = useState('');
    const [runResult, setRunResult] = useState<BillRunResult | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [chargeRes, meterRes] = await Promise.all([
                utilityChargesApi.charges({ status: status || undefined }),
                utilitiesApi.meters({}),
            ]);
            setCharges(chargeRes.data ?? []);
            setMeters(meterRes.data ?? []);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load charges.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        void load();
    }, [load]);

    const billableMeters = useMemo(() => meters.filter((m) => m.status === 'ACTIVE'), [meters]);
    const selectedMeter = useMemo(() => meters.find((m) => m.id === meterId), [meters, meterId]);

    const run = async (andInvoice: boolean) => {
        setRunError(null);
        setRunResult(null);
        setRunning(true);
        try {
            const payload = {
                meterId,
                billingPeriod,
                ...(unitId.trim() ? { unitId: unitId.trim() } : {}),
            };
            const { data } = andInvoice
                ? await utilityChargesApi.billAndInvoice(payload)
                : await utilityChargesApi.billPeriod(payload);
            setRunResult(data);
            await load();
        } catch (err) {
            setRunError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not run billing for this period.',
            );
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Utility billing</h1>
                    <p className="text-sm text-muted-foreground">
                        Turn a period of readings into consumption charges, and into invoices.
                    </p>
                </div>
                <Button variant="outline" asChild>
                    <a href={utilityChargesApi.chargesExportUrl({ status: status || undefined })}>
                        <Download className="mr-2 h-4 w-4" />
                        Export
                    </a>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Run a period</CardTitle>
                    <CardDescription>
                        Consumption is the difference between the readings bracketing the period, priced at the tariff
                        in force on the first of the month. A meter can only be charged once per period.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="meterId">Meter</Label>
                            <Select id="meterId" value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                                <option value="">Choose a meter</option>
                                {billableMeters.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.meterNumber} — {m.type}
                                        {m.scope === 'BULK' ? ' (bulk)' : ''}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="billingPeriod">Period</Label>
                            <Input
                                id="billingPeriod"
                                type="month"
                                value={billingPeriod}
                                onChange={(e) => setBillingPeriod(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="unitId">Unit (bulk meters only)</Label>
                            <Input
                                id="unitId"
                                value={unitId}
                                onChange={(e) => setUnitId(e.target.value)}
                                placeholder={
                                    selectedMeter?.scope === 'BULK'
                                        ? 'Leave blank to charge every unit'
                                        : 'Not applicable'
                                }
                                disabled={selectedMeter?.scope !== 'BULK'}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void run(false)} disabled={running || !meterId}>
                            <Play className="mr-2 h-4 w-4" />
                            {running ? 'Running…' : 'Price this period'}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => void run(true)}
                            disabled={running || !meterId}
                        >
                            <Receipt className="mr-2 h-4 w-4" />
                            Price and invoice
                        </Button>
                    </div>

                    {runError && <ErrorState message={runError} />}

                    {runResult && (
                        <Card className="border-dashed">
                            <CardContent className="pt-6">
                                <p className="text-sm">
                                    <span className="font-medium">{runResult.meter.meterNumber}</span> used{' '}
                                    <span className="font-medium tabular-nums">{runResult.meterConsumption}</span>{' '}
                                    unit{runResult.meterConsumption === 1 ? '' : 's'} of{' '}
                                    {UTILITY_TYPES.find((t) => t.value === runResult.meter.type)?.label ??
                                        (runResult.meter.type as UtilityType)}{' '}
                                    in {runResult.billingPeriod}.
                                    {runResult.rolledOver && (
                                        <span className="text-muted-foreground">
                                            {' '}
                                            The register passed its maximum and wrapped, so this is the count after the
                                            wrap.
                                        </span>
                                    )}
                                </p>

                                {runResult.invoices && runResult.invoices.length > 0 && (
                                    <p className="mt-2 text-sm">
                                        Raised{' '}
                                        {runResult.invoices.map(
                                            (i) => `${i.invoiceNumber} (${i.unitCode ?? 'no unit'})`,
                                        ).join(', ')}
                                        .
                                    </p>
                                )}

                                {runResult.unbilled && runResult.unbilled.length > 0 && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {runResult.unbilled.length} priced but not invoiced:{' '}
                                        {runResult.unbilled.map((u) => u.unitCode ?? 'a unit').join(', ')}. Nobody is
                                        under a lease there, so the cost is measured and waiting on a decision about
                                        who carries it.
                                    </p>
                                )}

                                {runResult.skipped && runResult.skipped.length > 0 && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {runResult.skipped.length} voided as vacant:{' '}
                                        {runResult.skipped.map((s) => s.unitCode ?? 'a unit').join(', ')} — this
                                        organization does not bill vacant units, and the charge records that reason.
                                    </p>
                                )}

                                {runResult.vacancyPolicy && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Vacancy policy applied: {runResult.vacancyPolicy.replace('_', ' ').toLowerCase()}.
                                        {runResult.vacancyPolicy === 'REDISTRIBUTE' &&
                                            ' A redistribution has to be run deliberately rather than as a side effect of billing.'}
                                    </p>
                                )}

                                {!runResult.invoices?.length && !runResult.unbilled?.length && (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Priced only — nothing has been invoiced. Review the figures, then run “Price and
                                        invoice”.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex items-center gap-3 pt-6">
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-64">
                        <option value="">Every charge</option>
                        {UTILITY_CHARGE_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </Select>
                    <p className="text-sm text-muted-foreground">{charges.length} charge{charges.length === 1 ? '' : 's'}</p>
                </CardContent>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
            ) : charges.length === 0 ? (
                <EmptyState
                    title="Nothing charged yet"
                    description="Price a period above. A charge is created priced but not invoiced, so the figures can be reviewed before anyone is asked to pay."
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Meter</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">Consumption</TableHead>
                                    <TableHead className="text-right">Share</TableHead>
                                    <TableHead className="text-right">Rate</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>State</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {charges.map((charge) => (
                                    <TableRow key={charge.id}>
                                        <TableCell className="font-medium">{charge.billingPeriod}</TableCell>
                                        <TableCell>{charge.meterNumber}</TableCell>
                                        <TableCell>{charge.unitCode ?? <span className="text-muted-foreground">—</span>}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {charge.billableConsumption ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {charge.allocationShare}
                                            {charge.meterScope === 'BULK' && (
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    ({charge.allocationBasis})
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {Number(charge.ratePerUnit).toFixed(4)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                            {charge.total !== undefined ? charge.total.toFixed(2) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {charge.invoiceNumber ? (
                                                <span className="text-sm">{charge.invoiceNumber}</span>
                                            ) : (
                                                <span className="text-sm text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={charge.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}