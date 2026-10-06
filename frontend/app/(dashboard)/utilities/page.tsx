'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { utilitiesApi } from '@/lib/api';
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
import { METER_SCOPES, METER_STATUSES, UTILITY_TYPES } from '@/lib/constants';
import type { MeterScope, UtilityMeterRow, UtilityType } from '@/types';

/**
 * The meter register.
 *
 * The column that earns the screen is **"Billed to"**, and it exists because the
 * register has to answer two quite different questions. A sub-meter bills one unit;
 * a bulk meter bills *nobody* individually until its consumption has been divided,
 * and until then nobody can say what any resident owes. So `billsTo` is a column
 * rather than something you discover by opening each row, and it comes from the
 * server - the shape of "who pays for this" is a fact about scope and
 * apportionment, not something a table should re-derive.
 *
 * `canBeBilled` is likewise server-computed. A form that guessed at it would let
 * somebody try, and then explain a refusal the page could have shown in advance.
 *
 * Filters go to the API rather than being applied here, because the export is the
 * same query. A filter that only worked on screen would quietly disagree with the
 * CSV a finance user then reconciles against a utility bill.
 */
export default function UtilitiesPage() {
    const router = useRouter();
    const [meters, setMeters] = useState<UtilityMeterRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [type, setType] = useState<UtilityType | ''>('');
    const [scope, setScope] = useState<MeterScope | ''>('');
    const [status, setStatus] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await utilitiesApi.meters({
                ...(type ? { type } : {}),
                ...(scope ? { scope } : {}),
                ...(status ? { status } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            setMeters(data ?? []);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load the meter register.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [type, scope, status, search]);

    useEffect(() => {
        void load();
    }, [load]);

    const counts = useMemo(
        () => ({
            total: meters.length,
            bulk: meters.filter((m) => m.scope === 'BULK').length,
            unread: meters.filter((m) => m.readingCount === 0 && m.status === 'ACTIVE').length,
        }),
        [meters],
    );


    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Meter register</h1>
                    <p className="text-sm text-muted-foreground">
                        Every meter the organization is responsible for, and who each one bills.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <a href={utilitiesApi.metersExportUrl({ type: type || undefined })}>
                            <Download className="mr-2 h-4 w-4" />
                            Export
                        </a>
                    </Button>
                    <Button onClick={() => router.push('/utilities/meters/new')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Register a meter
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="search">Meter number</Label>
                            <Input
                                id="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search meter or serial number"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="type">Utility</Label>
                            <Select id="type" value={type} onChange={(e) => setType(e.target.value as UtilityType | '')}>
                                <option value="">All utilities</option>
                                {UTILITY_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="scope">Scope</Label>
                            <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as MeterScope | '')}>
                                <option value="">Both</option>
                                {METER_SCOPES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
                            <option value="">Active and retired</option>
                            {METER_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </Select>
                        <p className="text-sm text-muted-foreground">
                            {counts.total} meter{counts.total === 1 ? '' : 's'}
                            {counts.bulk > 0 && ` · ${counts.bulk} bulk`}
                            {counts.unread > 0 && ` · ${counts.unread} never read`}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState message={error} onRetry={() => void load()} />
            ) : meters.length === 0 ? (
                <EmptyState
                    title="No meters registered"
                    description="Register the water and electricity meters for this organization to start recording readings and billing consumption."
                    action={
                        <Button onClick={() => router.push('/utilities/meters/new')}>
                            <Plus className="mr-2 h-4 w-4" />
                            Register a meter
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Meter</TableHead>
                                    <TableHead>Utility</TableHead>
                                    <TableHead>Scope</TableHead>
                                    <TableHead>Property / unit</TableHead>
                                    <TableHead>Billed to</TableHead>
                                    <TableHead className="text-right">Readings</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {meters.map((meter) => (
                                    <TableRow key={meter.id}>
                                        <TableCell>
                                            <Link
                                                href={`/utilities/meters/${meter.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {meter.meterNumber}
                                            </Link>
                                            {meter.serialNumber && (
                                                <p className="text-xs text-muted-foreground">{meter.serialNumber}</p>
                                            )}
                                        </TableCell>
                                        <TableCell>{meter.type}</TableCell>
                                        <TableCell>
                                            {meter.scope === 'BULK' ? (
                                                <span title={meter.apportionmentMethod ?? undefined}>
                                                    Bulk
                                                    {meter.apportionmentMethod
                                                        ? ` · ${meter.apportionmentMethod.toLowerCase()}`
                                                        : ''}
                                                </span>
                                            ) : (
                                                'Sub-meter'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <p>{meter.propertyName ?? '—'}</p>
                                            {meter.unitCode && (
                                                <p className="text-xs text-muted-foreground">{meter.unitCode}</p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">{meter.billsTo}</TableCell>
                                        <TableCell className="text-right tabular-nums">{meter.readingCount}</TableCell>
<TableCell>
                                            <StatusBadge status={meter.isTerminal ? 'RETIRED' : 'ACTIVE'} />
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