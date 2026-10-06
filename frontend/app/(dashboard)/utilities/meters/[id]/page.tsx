'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { meterReadingsApi, utilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import type { UtilityMeterDetail } from '@/types';

/**
 * One meter, and its reading ledger.
 *
 * The ledger is the screen's reason to exist, and the column that makes it worth
 * looking at is **consumption**, which is *derived* - each reading is paired with
 * the one before it on the server. There is no stored delta, so a corrected reading
 * cannot leave a stale consumption sitting beside it.
 *
 * Two states the table has to get right, because both are things a naive ledger
 * shows wrongly:
 *
 * - The **oldest** reading reports `null` for both previous and consumption. It
 *   establishes the baseline; it is not a period, and showing `0` would claim the
 *   meter did not move.
 * - A **rolled-over** register is flagged, because 99998 → 00003 is 5 units and not
 *   −99995. Without the flag a reader sees a register that appears to have run
 *   backwards.
 */
export default function MeterDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [meter, setMeter] = useState<UtilityMeterDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await utilitiesApi.meter(params.id);
            setMeter(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load this meter.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [params.id]);

    useEffect(() => {
        void load();
    }, [load]);

    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={() => void load()} />;
    if (!meter) return <ErrorState message="Meter not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Button variant="ghost" onClick={() => router.push('/utilities')} className="mb-2 -ml-2">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Meter register
                    </Button>
                    <h1 className="text-2xl font-bold">{meter.meterNumber}</h1>
                    <p className="text-sm text-muted-foreground">
                        {meter.type} · {meter.scope === 'BULK' ? 'Bulk meter' : 'Sub-meter'} · {meter.billsTo}
                    </p>
                </div>
                <Button onClick={() => router.push(`/utilities/readings?meterId=${meter.id}`)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Record a reading
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Register</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <p className="text-xs text-muted-foreground">Property</p>
                        <p className="font-medium">{meter.propertyName ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="font-medium">
                            {meter.unitCode ? `${meter.unitCode}${meter.unitName ? ` · ${meter.unitName}` : ''}` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Apportionment</p>
                        <p className="font-medium">
                            {meter.apportionmentMethod ? meter.apportionmentMethod.toLowerCase() : 'Not applicable'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <StatusBadge status={meter.status} />
                    </div>
                    {meter.digits !== null && meter.digits !== undefined && (
                        <div>
                            <p className="text-xs text-muted-foreground">Register</p>
                            <p className="font-medium">
                                {meter.digits} digits, wraps at {meter.digitWrapAt}
                            </p>
                        </div>
                    )}
                    {meter.serialNumber && (
                        <div>
                            <p className="text-xs text-muted-foreground">Serial</p>
                            <p className="font-medium">{meter.serialNumber}</p>
                        </div>
                    )}
                    {meter.readingSetup && (
                        <div className="sm:col-span-2">
                            <p className="text-xs text-muted-foreground">Reading setup</p>
                            <p className="font-medium">{meter.readingSetup}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Reading ledger</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    {meter.readings.length === 0 ? (
                        <EmptyState
                            title="This meter has never been read"
                            description="Consumption is the difference between two readings, so nothing can be billed until the first one is recorded."
                            action={
                                <Button onClick={() => router.push(`/utilities/readings?meterId=${meter.id}`)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Record the first reading
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Previous</TableHead>
                                    <TableHead className="text-right">Register</TableHead>
                                    <TableHead className="text-right">Consumption</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Note</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meter.readings.map((reading) => (
                                    <TableRow key={reading.id}>
                                        <TableCell>{new Date(reading.readingDate).toISOString().slice(0, 10)}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {reading.previousReading ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                            {reading.currentReading}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {reading.consumption === null ? (
                                                <span className="text-muted-foreground">baseline</span>
                                            ) : (
                                                <>
                                                    {reading.consumption}
                                                    {reading.rolledOver && (
                                                        <span className="ml-1 text-xs text-muted-foreground">
                                                            (register wrapped)
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={reading.source} />
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {reading.note ?? '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}