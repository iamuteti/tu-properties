'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Download, Plus } from 'lucide-react';
import { facilitiesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { FACILITY_KINDS } from '@/lib/constants';
import type { FacilityRow } from '@/types';

/**
 * The facility register.
 *
 * The page a question gets asked of: *is the clubhouse free on Saturday?* So the
 * opening hours and the "open now" flag are columns rather than something you open
 * a record to find, and `isOpenNow` is **derived by the backend on read** — there is
 * no column for it and no sweep that could leave it stale.
 *
 * Filters are sent to the API rather than applied here, because the export is the
 * same query. A filter that only worked on screen would be a filter that quietly
 * disagreed with the CSV.
 */
export default function FacilitiesPage() {
    const router = useRouter();
    const [facilities, setFacilities] = useState<FacilityRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState('');
    const [openNow, setOpenNow] = useState(false);
    const [includeInactive, setIncludeInactive] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await facilitiesApi.facilities({
                ...(kind ? { kind } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
                ...(openNow ? { openNow: true } : {}),
                ...(includeInactive ? { includeInactive: true } : {}),
            });
            setFacilities(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the facility register.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [kind, search, openNow, includeInactive]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Grouped by property rather than by kind.
     *
     * The register is an estate's book of rooms, and the estate is organised into
     * buildings — so the list is one table with a property column, and the *filter*
     * is what answers "show me every meeting room". Sorting by property also makes
     * "which tower has a pool" answerable at a glance, which a kind-sorted list does
     * not.
     */
    const grouped = useMemo(() => {
        const byProperty = new Map<string, { name: string; rows: FacilityRow[] }>();
        for (const facility of facilities) {
            const key = facility.property?.id ?? 'unassigned';
            const existing = byProperty.get(key) ?? {
                name: facility.property?.name ?? 'No property',
                rows: [],
            };
            existing.rows.push(facility);
            byProperty.set(key, existing);
        }
        return [...byProperty.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [facilities]);

    const actionsFor = (facility: FacilityRow): RowAction<FacilityRow>[] => [
        { label: 'View', onSelect: () => router.push(`/facilities/${facility.id}`) },
        {
            label: 'Edit',
            onSelect: () => router.push(`/facilities/${facility.id}/edit`),
        },
        { label: 'See the diary', onSelect: () => router.push(`/facilities/${facility.id}`) },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Facilities</h1>
                    <p className="text-muted-foreground">
                        The bookable things this estate owns — clubhouses, meeting rooms,
                        parking, the gym. Opening hours and the booking grid live here, so
                        &ldquo;when is it free&rdquo; is a question with a column.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={facilitiesApi.facilitiesExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/facilities/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add facility
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Label htmlFor="facKind">Kind</Label>
                    <Select
                        name="facKind"
                        value={kind}
                        onChange={(event) => setKind(event.target.value)}
                        options={[
                            { value: '', label: 'Everything' },
                            ...FACILITY_KINDS.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="facSearch">Search</Label>
                    <Input
                        id="facSearch"
                        value={search}
                        placeholder="Name, description or property"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="facOpenNow">Availability</Label>
                    <Select
                        name="facOpenNow"
                        value={openNow ? 'yes' : 'all'}
                        onChange={(event) => setOpenNow(event.target.value === 'yes')}
                        options={[
                            { value: 'all', label: 'Any' },
                            { value: 'yes', label: 'Open right now' },
                        ]}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="facInactive">Retired</Label>
                    <Select
                        name="facInactive"
                        value={includeInactive ? 'yes' : 'no'}
                        onChange={(event) => setIncludeInactive(event.target.value === 'yes')}
                        options={[
                            { value: 'no', label: 'In service' },
                            { value: 'yes', label: 'Including retired' },
                        ]}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the facility register…" />
            ) : facilities.length === 0 ? (
                <EmptyState
                    title="No facilities match"
                    description={
                        facilities.length === 0 && (kind || search || openNow)
                            ? 'Clear the filters to see everything on the register.'
                            : 'Nothing is on the register yet. A facility is what makes a room bookable — add the clubhouse and it appears here with its hours and grid.'
                    }
                    icon={<Building2 className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild>
                            <Link href="/facilities/new">Add the first facility</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-6">
                    {grouped.map((group) => (
                        <div key={group.name} className="space-y-2">
                            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                                {group.name}
                            </h2>
                            <Card>
                                <CardContent className="pt-6">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Facility</TableHead>
                                                <TableHead>Kind</TableHead>
                                                <TableHead>Hours</TableHead>
                                                <TableHead>Grid</TableHead>
                                                <TableHead>Seats</TableHead>
                                                <TableHead>Booking</TableHead>
                                                <TableHead className="text-right">Bookings</TableHead>
                                                <TableHead>State</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {group.rows.map((facility) => (
                                                <TableRow key={facility.id}>
                                                    <TableCell>
                                                        <Link
                                                            href={`/facilities/${facility.id}`}
                                                            className="font-medium underline-offset-4 hover:underline"
                                                        >
                                                            {facility.name}
                                                        </Link>
                                                        {facility.description && (
                                                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                                                                {facility.description}
                                                            </p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {FACILITY_KINDS.find(
                                                            (entry) => entry.value === facility.kind,
                                                        )?.label ?? facility.kind}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <span className="font-mono">
                                                            {facility.opensAtLabel}–{facility.closesAtLabel}
                                                        </span>
                                                        {facility.isOpenNow && (
                                                            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                                open now
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {facility.slotMinutes} min
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {facility.capacity ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {facility.isBookable ? (
                                                            facility.requiresApproval ? (
                                                                <span className="text-amber-700">
                                                                    needs approval
                                                                </span>
                                                            ) : (
                                                                'immediate'
                                                            )
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                not bookable
                                                            </span>
                                                        )}
                                                        {facility.bookingFee != null && (
                                                            <p className="text-muted-foreground">
                                                                {facility.bookingFee.toLocaleString('en-KE')}{' '}
                                                                {facility.bookingFeeCurrency ?? ''}
                                                            </p>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right text-xs">
                                                        {facility.totalBookings ?? 0}
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge
                                                            status={facility.isActive ? 'ACTIVE' : 'INACTIVE'}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <RowActionsMenu
                                                            row={facility}
                                                            actions={actionsFor(facility)}
                                                            label={`Actions for ${facility.name}`}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
