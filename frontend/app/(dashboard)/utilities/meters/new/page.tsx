'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { propertiesApi, unitsApi, utilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import {
    APPORTIONMENT_METHODS,
    METER_SCOPES,
    METER_READING_SOURCES,
    UTILITY_TYPES,
} from '@/lib/constants';
import type {
    ApportionmentMethod,
    MeterReadingSource,
    MeterScope,
    Property,
    Unit,
    UtilityType,
} from '@/types';

/**
 * Meter registration.
 *
 * **The form is driven by `scope`, and that is the module's design rather than a UI
 * convenience.** A bulk meter feeds many units, so asking for a unit is a category
 * error, and it has to say how its consumption is divided before it can ever be
 * billed — so the apportionment field is not optional once `scope = BULK`, it is the
 * field the rest of the form is about. The module **refuses** a bulk meter with no
 * method and will not pick one, because area, headcount, occupancy days and a
 * negotiated split are all defensible and all produce different bills.
 *
 * The rollover fields are cross-validated here for the same reason the service
 * re-validates them: a meter with a digit count but no wrap point is the configuration
 * that makes consumption arithmetic divide by nothing. The service still checks,
 * because a browser is not a guarantee.
 */
export default function NewMeterPage() {
    const router = useRouter();

    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [scope, setScope] = useState<MeterScope>('SUBMETER');
    const [form, setForm] = useState({
        propertyId: '',
        unitId: '',
        type: 'WATER' as UtilityType,
        meterNumber: '',
        serialNumber: '',
        apportionmentMethod: '' as ApportionmentMethod | '',
        digits: '',
        digitWrapAt: '',
        source: 'MANUAL' as MeterReadingSource,
        readingSetup: '',
    });

    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const { data } = await propertiesApi.findAll();
            setProperties(data?.data ?? []);
        } catch (err) {
            setLoadError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load properties.',
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Units are scoped by their property, because `Unit` carries no organizationId
    // (master doc issue 25) — the same rule the API enforces.
    useEffect(() => {
        if (!form.propertyId) {
            setUnits([]);
            return;
        }
        let cancelled = false;
        void unitsApi
            .findAll({ propertyId: form.propertyId })
            .then((res) => {
                if (!cancelled) setUnits(res.data?.data ?? []);
            })
            .catch(() => {
                if (!cancelled) setUnits([]);
            });
        return () => {
            cancelled = true;
        };
    }, [form.propertyId]);

    const setDigitCount = (digits: string) => {
        const n = Number(digits);
        setForm((f) => ({
            ...f,
            digits,
            // The wrap point is *derived*, never typed. `10 ** digits` is the only
            // correct value, and letting it be typed is how the two drift apart.
            digitWrapAt: Number.isFinite(n) && n > 0 ? String(10 ** n) : '',
        }));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (scope === 'SUBMETER' && !form.unitId) {
            setError('A sub-meter serves one unit. Choose the unit this meter belongs to.');
            return;
        }
        if (scope === 'BULK' && !form.apportionmentMethod) {
            setError(
                'A bulk meter bills nobody until its consumption is divided. Choose how it should be split — the module will not pick one for you.',
            );
            return;
        }

        setIsSaving(true);
        try {
            const digits = form.digits ? Number(form.digits) : undefined;
            const { data } = await utilitiesApi.createMeter({
                propertyId: form.propertyId,
                ...(scope === 'SUBMETER' ? { unitId: form.unitId } : {}),
                type: form.type,
                meterNumber: form.meterNumber.trim(),
                ...(form.serialNumber.trim() ? { serialNumber: form.serialNumber.trim() } : {}),
                scope,
                ...(scope === 'BULK' && form.apportionmentMethod
                    ? { apportionmentMethod: form.apportionmentMethod }
                    : {}),
                ...(digits ? { digits, digitWrapAt: 10 ** digits } : {}),
                source: form.source,
                ...(form.readingSetup.trim() ? { readingSetup: form.readingSetup.trim() } : {}),
            });
            router.push(`/utilities/meters/${data.id}`);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not register this meter.',
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
                <Button variant="ghost" onClick={() => router.push('/utilities')} className="mb-2 -ml-2">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Meter register
                </Button>
                <h1 className="text-2xl font-bold">Register a meter</h1>
                <p className="text-sm text-muted-foreground">
                    A device bolted to a building — so it belongs to a property, and optionally to one unit.
                </p>
            </div>

            <form onSubmit={submit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>What it measures</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="type">Utility</Label>
                                <Select
                                    id="type"
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
                                <Label htmlFor="meterNumber">Meter number</Label>
                                <Input
                                    id="meterNumber"
                                    value={form.meterNumber}
                                    onChange={(e) => setForm({ ...form, meterNumber: e.target.value })}
                                    placeholder="The number the utility company bills against"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="scope">Scope</Label>
                            <Select
                                id="scope"
                                value={scope}
                                onChange={(e) => setScope(e.target.value as MeterScope)}
                            >
                                {METER_SCOPES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label} — {s.hint}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="propertyId">Property</Label>
                            <Select
                                id="propertyId"
                                value={form.propertyId}
                                onChange={(e) => setForm({ ...form, propertyId: e.target.value, unitId: '' })}
                                required
                            >
                                <option value="">Choose a property</option>
                                {properties.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        {scope === 'SUBMETER' ? (
                            <div className="space-y-2">
                                <Label htmlFor="unitId">Unit</Label>
                                <Select
                                    id="unitId"
                                    value={form.unitId}
                                    onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                                    required
                                >
                                    <option value="">Choose a unit</option>
                                    {units.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.code} — {u.name}
                                        </option>
                                    ))}
                                </Select>
                                <p className="text-sm text-muted-foreground">
                                    A sub-meter&apos;s consumption is that unit&apos;s bill, undivided.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 rounded-md border border-dashed p-4">
                                <Label htmlFor="apportionmentMethod">
                                    How is this meter&apos;s consumption divided? <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    id="apportionmentMethod"
                                    value={form.apportionmentMethod}
                                    onChange={(e) =>
                                        setForm({ ...form, apportionmentMethod: e.target.value as ApportionmentMethod })
                                    }
                                >
                                    <option value="">Choose a method</option>
                                    {APPORTIONMENT_METHODS.map((m) => (
                                        <option key={m.value} value={m.value}>
                                            {m.label}
                                        </option>
                                    ))}
                                </Select>
                                {form.apportionmentMethod && (
                                    <p className="text-sm text-muted-foreground">
                                        {APPORTIONMENT_METHODS.find(
                                            (m) => m.value === form.apportionmentMethod,
                                        )?.hint}
                                    </p>
                                )}
                                <p className="text-sm text-muted-foreground">
                                    A bulk meter has no single unit, so nothing can be billed from it until this is
                                    set. There is no default: each method produces a different bill.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>The register itself</CardTitle>
                        <CardDescription>
                            Leave the digit count empty unless the register actually rolls over. An old
                            electromechanical meter that passes its maximum and returns to zero needs this, or its
                            next reading looks like the meter ran backwards.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="digits">Digits (optional)</Label>
                                <Input
                                    id="digits"
                                    type="number"
                                    min="1"
                                    max="12"
                                    value={form.digits}
                                    onChange={(e) => setDigitCount(e.target.value)}
                                    placeholder="e.g. 5"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="digitWrapAt">Wraps at</Label>
                                <Input
                                    id="digitWrapAt"
                                    value={form.digitWrapAt}
                                    readOnly
                                    placeholder="Derived"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Always 10 to the power of the digits. Not typed on purpose.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="source">Read how?</Label>
                                <Select
                                    id="source"
                                    value={form.source}
                                    onChange={(e) =>
                                        setForm({ ...form, source: e.target.value as MeterReadingSource })
                                    }
                                >
                                    {METER_READING_SOURCES.map((s) => (
                                        <option key={s.value} value={s.value}>
                                            {s.label}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="serialNumber">Serial number</Label>
                                <Input
                                    id="serialNumber"
                                    value={form.serialNumber}
                                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                                    placeholder="Optional — the device's own tag"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="readingSetup">Reading setup</Label>
                                <Input
                                    id="readingSetup"
                                    value={form.readingSetup}
                                    onChange={(e) => setForm({ ...form, readingSetup: e.target.value })}
                                    placeholder="Optional — direct read, riser bulk meter, …"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error && <ErrorState message={error} />}

                <div className="flex gap-2">
                    <Button type="submit" disabled={isSaving || !form.propertyId || !form.meterNumber.trim()}>
                        {isSaving ? 'Registering…' : 'Register meter'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.push('/utilities')}>
                        Cancel
                    </Button>
                </div>
            </form>
        </div>
    );
}