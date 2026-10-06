'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { utilityRatesApi, utilitiesApi } from '@/lib/api';
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
import { UTILITY_TYPES } from '@/lib/constants';
import type { UtilityMeterRow, UtilityRateRow, UtilityType } from '@/types';

/**
 * Tariffs.
 *
 * The narrowest screen in the module, and the roles list in the sidebar mirrors that:
 * only the roles that may *write* a tariff can see it. An accountant can bill from a
 * tariff all day and must not be able to change what every resident owes.
 *
 * Two things the table has to make obvious, because they are the whole design:
 *
 * - **"Open" versus a closed window.** A tariff is superseded rather than edited, so
 *   there are always two rows for a changed utility. Which one bills is decided by the
 *   period being billed, not by which is newer — which is why the window is a column
 *   rather than a "current" flag.
 * - **Scope.** A rate can be the organization's default, one property's, or one
 *   meter's, and the most specific one wins. Showing the scope is what stops somebody
 *   adding a second organization-wide default and making every bill ambiguous.
 */
export default function TariffsPage() {
    const [rates, setRates] = useState<UtilityRateRow[]>([]);
    const [meters, setMeters] = useState<UtilityMeterRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [type, setType] = useState<UtilityType | ''>('');

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        type: 'WATER' as UtilityType,
        ratePerUnit: '',
        standingCharge: '0',
        meterId: '',
        validFrom: new Date().toISOString().slice(0, 10),
    });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [rateRes, meterRes] = await Promise.all([
                utilityRatesApi.rates({ type: type || undefined }),
                utilitiesApi.meters({}),
            ]);
            setRates(rateRes.data ?? []);
            setMeters(meterRes.data ?? []);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load tariffs.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [type]);

    useEffect(() => {
        void load();
    }, [load]);

    const openCount = useMemo(() => rates.filter((r) => r.validTo === null).length, [rates]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSaving(true);
        try {
            await utilityRatesApi.createRate({
                type: form.type,
                ratePerUnit: Number(form.ratePerUnit),
                standingCharge: Number(form.standingCharge || 0),
                ...(form.meterId ? { meterId: form.meterId } : {}),
                validFrom: new Date(`${form.validFrom}T00:00:00Z`).toISOString(),
            });
            setShowForm(false);
            setForm({ ...form, ratePerUnit: '', meterId: '' });
            await load();
        } catch (err) {
            setFormError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not create this tariff.',
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Tariffs</h1>
                    <p className="text-sm text-muted-foreground">
                        What one unit of each utility costs, and over which period it applied.
                    </p>
                </div>
                <Button onClick={() => setShowForm((s) => !s)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {showForm ? 'Cancel' : 'Add a tariff'}
                </Button>
            </div>

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>Add a tariff</CardTitle>
                        <CardDescription>
                            Only one tariff may be open per utility and scope. To change a rate, supersede it —
                            the old row is closed and a new one opens, so an invoice raised last quarter still explains
                            itself.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="rateType">Utility</Label>
                                    <Select
                                        id="rateType"
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value as UtilityType })}
                                    >
                                        {UTILITY_TYPES.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scopeMeter">Applies to</Label>
                                    <Select
                                        id="scopeMeter"
                                        value={form.meterId}
                                        onChange={(e) => setForm({ ...form, meterId: e.target.value })}
                                    >
                                        <option value="">The whole organization</option>
                                        {meters.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                Meter only — {m.meterNumber}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ratePerUnit">Price per unit</Label>
                                    <Input
                                        id="ratePerUnit"
                                        type="number"
                                        step="0.0001"
                                        min="0"
                                        value={form.ratePerUnit}
                                        onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="standingCharge">Standing charge per period</Label>
                                    <Input
                                        id="standingCharge"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.standingCharge}
                                        onChange={(e) => setForm({ ...form, standingCharge: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="validFrom">Applies from</Label>
                                    <Input
                                        id="validFrom"
                                        type="date"
                                        value={form.validFrom}
                                        onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {formError && <ErrorState message={formError} />}

                            <Button type="submit" disabled={saving}>
                                {saving ? 'Creating…' : 'Create tariff'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="flex items-center gap-3 pt-6">
                    <Select value={type} onChange={(e) => setType(e.target.value as UtilityType | '')} className="w-56">
                        <option value="">Every utility</option>
                        {UTILITY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        {rates.length} tariff{rates.length === 1 ? '' : 's'} · {openCount} open
                    </p>
                </CardContent>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
            ) : rates.length === 0 ? (
                <EmptyState
                    title="No tariffs set"
                    description="Consumption cannot be priced without a tariff. A period billed with no rate in force is refused rather than guessed."
                    action={
                        <Button onClick={() => setShowForm(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add a tariff
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Utility</TableHead>
                                    <TableHead>Applies to</TableHead>
                                    <TableHead className="text-right">Per unit</TableHead>
                                    <TableHead className="text-right">Standing</TableHead>
                                    <TableHead>From</TableHead>
                                    <TableHead>Until</TableHead>
                                    <TableHead>State</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rates.map((rate) => (
                                    <TableRow key={rate.id}>
                                        <TableCell className="font-medium">{rate.type}</TableCell>
                                        <TableCell className="text-sm">
                                            {rate.meter?.meterNumber
                                                ? `Meter ${rate.meter.meterNumber}`
                                                : rate.property?.name
                                                  ? rate.property.name
                                                  : 'Whole organization'}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {Number(rate.ratePerUnit).toFixed(4)} {rate.currency}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {Number(rate.standingCharge).toFixed(2)}
                                        </TableCell>
                                        <TableCell>{new Date(rate.validFrom).toISOString().slice(0, 10)}</TableCell>
                                        <TableCell>
                                            {rate.validTo ? new Date(rate.validTo).toISOString().slice(0, 10) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={rate.validTo === null ? 'OPEN' : 'SUPERSEDED'} />
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