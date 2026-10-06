'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { meterReadingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { METER_READING_SOURCES, UTILITY_TYPES } from '@/lib/constants';
import type { MeterReadingRow, MeterReadingSource, UtilityType } from '@/types';

/**
 * The reading ledger, across every meter.
 *
 * Consumption is derived by the server - each reading paired with the one before it -
 * so this screen has no stored delta to drift, and correcting a reading immediately
 * changes the consumption shown beside it.
 *
 * `?meterId=` in the URL is honoured on load, which is what makes "record a reading"
 * on a meter's own page land here pre-filtered rather than dumping the reader into
 * the whole organization's ledger.
 */
export default function ReadingsPage() {
    const searchParams = useSearchParams();
    const meterId = searchParams.get('meterId') ?? '';

    const [readings, setReadings] = useState<MeterReadingRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<MeterReadingSource | ''>('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await meterReadingsApi.readings({
                ...(meterId ? { meterId } : {}),
                ...(source ? { source } : {}),
            });
            setReadings(data ?? []);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load readings.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [meterId, source]);

    useEffect(() => {
        void load();
    }, [load]);

    /** Consumption is only a real figure on the newest few rows; the rest is a baseline. */
    const withConsumption = useMemo(() => readings.filter((r) => r.consumption !== null).length, [readings]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Readings</h1>
                    <p className="text-sm text-muted-foreground">
                        What each register showed, and the consumption between consecutive readings.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <a href={meterReadingsApi.readingsExportUrl({ meterId: meterId || undefined })}>
                            <Download className="mr-2 h-4 w-4" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/utilities/readings/new">
                            <Plus className="mr-2 h-4 w-4" />
                            Record a reading
                        </Link>
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="flex items-center gap-3 pt-6">
                    <Select
                        value={source}
                        onChange={(e) => setSource(e.target.value as MeterReadingSource | '')}
                        className="w-56"
                    >
                        <option value="">Every source</option>
                        {METER_READING_SOURCES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </Select>
                    {meterId && (
                        <Button variant="ghost" asChild>
                            <Link href="/utilities/readings">Clear the meter filter</Link>
                        </Button>
                    )}
                    <p className="text-sm text-muted-foreground">
                        {readings.length} reading{readings.length === 1 ? '' : 's'}
                        {withConsumption > 0 && ` · ${withConsumption} with a measurable delta`}
                    </p>
                </CardContent>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
            ) : readings.length === 0 ? (
                <EmptyState
                    title="No readings recorded"
                    description="Record what each register shows. Consumption is the difference between two readings, so a period cannot be billed until both ends of it exist."
                    action={
                        <Button asChild>
                            <Link href="/utilities/readings/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Record a reading
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Meter</TableHead>
                                    <TableHead>Utility</TableHead>
                                    <TableHead className="text-right">Previous</TableHead>
                                    <TableHead className="text-right">Register</TableHead>
                                    <TableHead className="text-right">Consumption</TableHead>
                                    <TableHead>Source</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {readings.map((reading) => (
                                    <TableRow key={reading.id}>
                                        <TableCell>
                                            {new Date(reading.readingDate).toISOString().slice(0, 10)}
                                        </TableCell>
                                        <TableCell className="font-medium">{reading.meterNumber}</TableCell>
                                        <TableCell>
                                            {UTILITY_TYPES.find((t) => t.value === reading.type)?.label ??
                                                (reading.type as UtilityType)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {reading.previousReading ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{reading.currentReading}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {reading.consumption ?? (
                                                <span className="text-muted-foreground">baseline</span>
                                            )}
                                            {reading.rolledOver && (
                                                <span className="ml-1 text-xs text-muted-foreground">wrapped</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={reading.source} />
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