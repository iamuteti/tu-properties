'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { meterReadingsApi, utilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { METER_READING_SOURCES } from '@/lib/constants';
import type { MeterReadingSource, UtilityMeterRow } from '@/types';

/**
 * Reading entry.
 *
 * Two things this form deliberately does not do:
 *
 * 1. **It does not ask for a period.** A reading is what the register showed *at a
 *    moment*; the period it belongs to follows from the date. Asking for both would
 *    let somebody file a January figure under February, and the module would then
 *    price the wrong delta.
 * 2. **It does not offer a "consumption" field.** Consumption is derived from this
 *    reading and the one before it. A form that accepted it would be a form that
 *    accepted a client's own arithmetic.
 *
 * `source` defaults to MANUAL and offers ESTIMATED, because "the box was locked" is a
 * real and frequent case — and marking it is what stops an estimate being read later
 * as a measurement.
 */
export default function NewReadingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedMeterId = searchParams.get('meterId') ?? '';

    const [meters, setMeters] = useState<UtilityMeterRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [meterId, setMeterId] = useState(preselectedMeterId);
    const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
    const [reading, setReading] = useState('');
    const [source, setSource] = useState<MeterReadingSource>('MANUAL');
    const [note, setNote] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const { data } = await utilitiesApi.meters({ status: 'ACTIVE' });
            setMeters(data ?? []);
        } catch (err) {
            setLoadError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load meters.',
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            const value = Number(reading);
            if (Number.isNaN(value) || value < 0) {
                setError('Enter the number shown on the register. A negative reading is not a meter reading.');
                return;
            }
            await meterReadingsApi.createReading({
                meterId,
                readingDate: new Date(`${readingDate}T00:00:00Z`).toISOString(),
                reading: value,
                source,
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            router.push(`/utilities/meters/${meterId}`);
        } catch (err) {
            // The server's refusal is a sentence explaining the conflict - a duplicate
            // reading for the day, a retired meter, a backwards figure. Shown verbatim
            // rather than replaced with something generic.
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not record this reading.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState />;
    if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <Button variant="ghost" onClick={() => router.push('/utilities/readings')} className="mb-2 -ml-2">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Readings
                </Button>
                <h1 className="text-2xl font-bold">Record a reading</h1>
                <p className="text-sm text-muted-foreground">
                    What the register showed, on the day you read it.
                </p>
            </div>

            <form onSubmit={submit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>The register</CardTitle>
                        <CardDescription>
                            Retired meters are not listed — one is no longer read.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="meterId">Meter</Label>
                            <Select id="meterId" value={meterId} onChange={(e) => setMeterId(e.target.value)} required>
                                <option value="">Choose a meter</option>
                                {meters.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.meterNumber} — {m.type}
                                        {m.unitCode ? ` (${m.unitCode})` : ' (bulk)'}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="readingDate">Date read</Label>
                                <Input
                                    id="readingDate"
                                    type="date"
                                    value={readingDate}
                                    onChange={(e) => setReadingDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reading">Reading on the register</Label>
                                <Input
                                    id="reading"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={reading}
                                    onChange={(e) => setReading(e.target.value)}
                                    placeholder="e.g. 4150"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="source">How was it read?</Label>
                            <Select
                                id="source"
                                value={source}
                                onChange={(e) => setSource(e.target.value as MeterReadingSource)}
                            >
                                {METER_READING_SOURCES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </Select>
                            {source === 'ESTIMATED' && (
                                <p className="text-sm text-muted-foreground">
                                    Marked as estimated so a later audit can tell it from a real reading. Say why
                                    in the note.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="note">Note</Label>
                            <Input
                                id="note"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Optional — access refused, estimated from last month, …"
                            />
                        </div>
                    </CardContent>
                </Card>

                {error && <ErrorState message={error} />}

                <div className="flex gap-2">
                    <Button type="submit" disabled={isSaving || !meterId}>
                        {isSaving ? 'Recording…' : 'Record reading'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancel
                    </Button>
                </div>
            </form>
        </div>
    );
}