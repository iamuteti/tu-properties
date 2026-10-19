'use client';

import Link from 'next/link';
import { Droplets, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/entity-states';
import { Detail, Pill, SectionTitle } from './shared';
import { useOrgFormat } from '@/hooks/use-org-format';
import type { Agreement } from '@/types';

interface UtilitiesProps {
    agreements: Agreement[];
    /** The currency this file's totals are in, taken from the records. */
    currency?: string;
}

const METER_ICON: Record<string, typeof Droplets> = {
    WATER: Droplets,
    ELECTRICITY: Zap,
    SEWAGE: Droplets,
    GAS: Zap,
};

/**
 * What this resident has been charged for their utilities.
 *
 * The charges hang off the tenancy rather than off the tenant, so before the
 * tenant page loaded them a resident's water bill simply did not exist there.
 *
 * The money is recomputed by the server from the two readings each charge names,
 * because a charge stores the *inputs* to its price and never a copy of the
 * answer — so the figure shown here is the current truth, and a period that
 * cannot be priced says so instead of showing a blank.
 */
export function TenantUtilitiesSection({ agreements, currency }: UtilitiesProps) {
    const fmt = useOrgFormat();
    const charges = agreements.flatMap((a) =>
        (a.utilityCharges ?? []).map((c) => ({ charge: c, agreement: a })),
    );

    const billed = charges.filter(
        ({ charge }) => charge.status === 'INVOICED' && charge.invoiceId,
    );
    const totalBilled = billed.reduce(
        (s, { charge }) => s + Number(charge.pricing?.total ?? 0),
        0,
    );
    const unbilled = charges.filter((c) => c.charge.status !== 'INVOICED');
    const totalUnbilled = unbilled.reduce(
        (s, { charge }) => s + Number(charge.pricing?.total ?? 0),
        0,
    );

    const byType = charges.reduce<Record<string, number>>((acc, { charge }) => {
        const key = charge.meter?.type ?? 'OTHER';
        acc[key] = (acc[key] ?? 0) + Number(charge.pricing?.total ?? 0);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Billed
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(totalBilled, currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            {billed.length} charge(s) on an invoice
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Not yet billed
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(totalUnbilled, currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            {unbilled.length} priced charge(s) awaiting a bill
                        </p>
                    </CardContent>
                </Card>
                {Object.entries(byType).map(([type, total]) => {
                    const Icon = METER_ICON[type] ?? Droplets;
                    return (
                        <Card key={type}>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {type.charAt(0) + type.slice(1).toLowerCase()}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-semibold">{fmt.money(total, currency)}</p>
                                <p className="text-sm text-muted-foreground">charged to date</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Charges */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Metered charges</CardTitle>
                </CardHeader>
                <CardContent>
                    {charges.length === 0 ? (
                        <EmptyState
                            title="No utility charges"
                            description="This tenant has no metered water, electricity, gas or sewage charges on file."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Period</th>
                                        <th className="py-2 pr-3">Meter</th>
                                        <th className="py-2 pr-3">Type</th>
                                        <th className="py-2 pr-3 text-right">Consumption</th>
                                        <th className="py-2 pr-3 text-right">Rate</th>
                                        <th className="py-2 pr-3 text-right">Amount</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2">Invoice</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {charges.map(({ charge, agreement }) => (
                                        <tr key={charge.id} className="border-b last:border-0 align-top">
                                            <td className="whitespace-nowrap py-2 pr-3 font-medium">
                                                {charge.billingPeriod}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span className="font-medium">
                                                    {charge.meter?.meterNumber ?? '—'}
                                                </span>
                                                <br />
                                                <span className="text-xs text-muted-foreground">
                                                    {charge.unit?.name ??
                                                        charge.unit?.code ??
                                                        agreement.unit?.name ??
                                                        '—'}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3">
                                                {charge.meter?.type ?? '—'}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {charge.pricing
                                                    ? fmt.amount(charge.pricing.billableConsumption)
                                                    : '—'}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {fmt.money(charge.ratePerUnit, charge.currency)}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums font-medium">
                                                {charge.pricing
                                                    ? fmt.money(charge.pricing.total, charge.currency)
                                                    : '—'}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <Pill status={charge.status} />
                                                {charge.pricingError && (
                                                    <p className="mt-1 max-w-xs text-xs text-amber-700">
                                                        {charge.pricingError}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-2 text-xs">
                                                {charge.invoice ? (
                                                    <Link
                                                        href={`/finance/invoices/${charge.invoice.id}`}
                                                        className="font-mono hover:underline"
                                                    >
                                                        {charge.invoice.invoiceNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* How a charge is made up */}
            {charges.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">How a charge is made up</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <SectionTitle hint="The most recent charge on each tenancy">
                            Latest charge per tenancy
                        </SectionTitle>
                        <div className="space-y-4">
                            {agreements
                                .filter((a) => (a.utilityCharges ?? []).length > 0)
                                .map((agreement) => {
                                    const latest = (agreement.utilityCharges ?? [])[0];
                                    const pricing = latest?.pricing;
                                    return (
                                        <div key={agreement.id} className="rounded-lg border p-4">
                                            <p className="text-sm font-medium">
                                                {agreement.code ?? 'Agreement'} ·{' '}
                                                {latest?.meter?.type ?? '—'} ·{' '}
                                                {latest?.billingPeriod ?? '—'}
                                            </p>
                                            <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                                                <Detail
                                                    label="Meter consumption"
                                                    value={
                                                        pricing
                                                            ? `${fmt.amount(pricing.meterConsumption)} units`
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="This unit's share"
                                                    value={
                                                        pricing
                                                            ? `${fmt.amount(pricing.billableConsumption)} units`
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="Consumption charge"
                                                    value={
                                                        pricing
                                                            ? fmt.money(pricing.consumptionAmount, currency)
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="Standing charge"
                                                    value={
                                                        pricing
                                                            ? fmt.money(pricing.standingChargeAmount, currency)
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="VAT"
                                                    value={
                                                        pricing
                                                            ? fmt.money(pricing.vatAmount, currency)
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="Total"
                                                    value={
                                                        pricing
                                                            ? fmt.money(pricing.total, currency)
                                                            : '—'
                                                    }
                                                />
                                                <Detail
                                                    label="Allocation basis"
                                                    value={latest?.allocationBasis ?? '—'}
                                                />
                                                <Detail
                                                    label="Share of the meter"
                                                    value={
                                                        latest
                                                            ? `${(Number(latest.allocationShare) * 100).toFixed(2)}%`
                                                            : '—'
                                                    }
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
