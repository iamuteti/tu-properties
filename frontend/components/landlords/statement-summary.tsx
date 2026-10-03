'use client';

import { cn } from '@/lib/utils';

/**
 * The money block of an owner statement, shared by the live preview and the
 * saved statement so an operator sees the same numbers in both places.
 *
 * The order is the arithmetic: collected, minus what it cost to run, minus the
 * fee, minus anything still owed from last time — which is the order the owner
 * reads it in.
 */
export interface StatementSummaryValues {
    grossIncome: number;
    expenses: number;
    managementFee: number;
    carriedForward: number;
    netPayout: number;
    settledAmount?: number;
    outstandingAmount?: number;
    currency?: string;
}

const money = (amount: number, currency: string) =>
    `${currency} ${amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

export function StatementSummary({
    values,
    currency: currencyOverride,
    className,
}: {
    values: StatementSummaryValues;
    /** Overrides the currency carried on `values` (statements store their own). */
    currency?: string;
    className?: string;
}) {
    const currency = currencyOverride ?? values.currency ?? 'KES';
    const owed = values.netPayout < 0;

    return (
        <dl className={cn('space-y-2 text-sm', className)}>
            <Row label="Rent collected" value={money(values.grossIncome, currency)} />

            <Row
                label="Expenses charged"
                value={`- ${money(values.expenses, currency)}`}
                tone={values.expenses > 0 ? 'deduct' : undefined}
            />

            <Row
                label="Management fee"
                value={`- ${money(values.managementFee, currency)}`}
                tone={values.managementFee > 0 ? 'deduct' : undefined}
            />

            <Row
                label="Balance brought forward"
                value={`- ${money(values.carriedForward, currency)}`}
                tone={values.carriedForward > 0 ? 'deduct' : undefined}
            />

            <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">
                    Net {owed ? 'owed by the owner' : 'payable to the owner'}
                </dt>
                <dd
                    className={cn(
                        'text-base font-bold tabular-nums',
                        owed ? 'text-red-600' : 'text-emerald-700',
                    )}
                >
                    {money(values.netPayout, currency)}
                </dd>
            </div>

            {values.settledAmount !== undefined && values.outstandingAmount !== undefined && (
                <>
                    <Row
                        label="Paid against this statement"
                        value={money(values.settledAmount, currency)}
                    />
                    <div className="flex items-baseline justify-between pt-1">
                        <dt className="text-muted-foreground">Still outstanding</dt>
                        <dd className="font-semibold tabular-nums">
                            {money(values.outstandingAmount, currency)}
                        </dd>
                    </div>
                </>
            )}
        </dl>
    );
}

function Row({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: 'deduct';
}) {
    return (
        <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'tabular-nums',
                    tone === 'deduct' ? 'text-red-600' : undefined,
                )}
            >
                {value}
            </dd>
        </div>
    );
}