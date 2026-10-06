'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { visitorsApi } from '@/lib/api';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { VisitorRow } from '@/types';

/**
 * The visitor directory.
 *
 * A table of **people**, not of arrivals — the arrivals live at `/facilities/visits`.
 * Keeping them apart is what lets two questions be answered at all: "have we had this
 * person before" and "are they on the barred list". Both are questions about a person,
 * and a name typed onto yesterday's gate-book row cannot answer either.
 *
 * The screen is behind the narrowest permission in the product. The people in it did
 * not choose to be recorded and have no other relationship with the organization, which
 * is why a leasing officer and an accountant are both excluded from it.
 */
export default function VisitorsPage() {
    const router = useRouter();
    const [visitors, setVisitors] = useState<VisitorRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [barFilter, setBarFilter] = useState('all');
    const [includeInactive, setIncludeInactive] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await visitorsApi.visitors({
                ...(search.trim() ? { search: search.trim() } : {}),
                ...(barFilter !== 'all' ? { isBlacklisted: barFilter } : {}),
                ...(includeInactive ? { includeInactive: true } : {}),
            });
            setVisitors(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 403
                    ? 'The visitor log is restricted to the roles that staff the gate. If that is your job, ask an administrator for the `visitors` permission.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the visitor directory.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [search, barFilter, includeInactive]);

    useEffect(() => {
        load();
    }, [load]);

    const barredCount = visitors.filter((visitor) => visitor.isBlacklisted).length;
    const onSiteCount = visitors.reduce(
        (total, visitor) => total + (visitor.onSiteNow ?? 0),
        0,
    );

    const actionsFor = (visitor: VisitorRow): RowAction<VisitorRow>[] => [
        {
            label: 'Open their record',
            onSelect: () => router.push(`/facilities/visitors/${visitor.id}`),
        },
        {
            label: 'Log an arrival',
            onSelect: () =>
                router.push(`/facilities/visits?visitorId=${visitor.id}`),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Visitors</h1>
                    <p className="text-muted-foreground">
                        The people who come to this site, with what a gate needs to know
                        about them.
                        {onSiteCount > 0 && (
                            <span className="ml-1 font-medium text-emerald-700">
                                {onSiteCount} on site now.
                            </span>
                        )}
                        {barredCount > 0 && (
                            <span className="ml-1 font-medium text-red-700">
                                {barredCount} barred.
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={visitorsApi.visitorsExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/facilities/visits">The gate book</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/facilities/visitors/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add visitor
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-60">
                    <Label htmlFor="visSearch">Search</Label>
                    <Input
                        id="visSearch"
                        value={search}
                        placeholder="Name, phone, company or email"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="visBarred">Barred</Label>
                    <Select
                        name="visBarred"
                        value={barFilter}
                        onChange={(event) => setBarFilter(event.target.value)}
                        options={[
                            { value: 'all', label: 'Everybody' },
                            { value: 'false', label: 'May be admitted' },
                            { value: 'true', label: 'Barred' },
                        ]}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="visInactive">Retired</Label>
                    <Select
                        name="visInactive"
                        value={includeInactive ? 'yes' : 'no'}
                        onChange={(event) => setIncludeInactive(event.target.value === 'yes')}
                        options={[
                            { value: 'no', label: 'On the list' },
                            { value: 'yes', label: 'Including retired' },
                        ]}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the visitor directory…" />
            ) : visitors.length === 0 ? (
                <EmptyState
                    title="No visitors match"
                    description={
                        visitors.length === 0 && (search || barFilter !== 'all')
                            ? 'Clear the filters to see everybody on the list.'
                            : 'Nobody has been added yet. A visitor is a row rather than a line on a gate book, so that "have we had this person before" and "are they barred" have answers.'
                    }
                    action={
                        <Button asChild>
                            <Link href="/facilities/visitors/new">
                                Add the first visitor
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
                                    <TableHead>Name</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Identification</TableHead>
                                    <TableHead className="text-right">Visits</TableHead>
                                    <TableHead className="text-right">On site</TableHead>
                                    <TableHead>Standing</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visitors.map((visitor) => (
                                    <TableRow key={visitor.id}>
                                        <TableCell>
                                            <Link
                                                href={`/facilities/visitors/${visitor.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {visitor.displayName}
                                            </Link>
                                            {!visitor.isActive && (
                                                <p className="text-xs text-muted-foreground">
                                                    retired from the list
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visitor.company ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visitor.phone ?? '—'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {visitor.idNumber ? (
                                                <>
                                                    {visitor.idType ? `${visitor.idType}: ` : ''}
                                                    {visitor.idNumber}
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {visitor.totalVisits ?? 0}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                            {(visitor.onSiteNow ?? 0) > 0 ? (
                                                <span className="font-medium text-emerald-700">
                                                    {visitor.onSiteNow}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {visitor.isBlacklisted ? (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                                                    Barred
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    may be admitted
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={visitor}
                                                actions={actionsFor(visitor)}
                                                label={`Actions for ${visitor.displayName}`}
                                            />
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
