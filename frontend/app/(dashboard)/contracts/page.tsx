'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileSignature, Search } from 'lucide-react';
import { contractsApi } from '@/lib/api';
import { CONTRACT_TYPES } from '@/lib/constants';
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
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { ContractStatusPill, ExpiryCell } from './_components';
import type { ContractRow, ContractType } from '@/types';

/**
 * The contract register.
 *
 * Two decisions the table has to make visible, and both follow from the backend rule
 * that a status is **derived** and never stored:
 *
 * 1. **Status is a column, not a filter.** Filtering on it would mean either a stored
 *    value that can contradict the dates or a second implementation of the rules. So
 *    the filters here are the *columns* the derivation reads - type, a date window,
 *    whether a scan is attached - and status is what the server sends back for each
 *    row. The expiry report is the screen for "show me the ones I must act on".
 * 2. **The notice deadline is shown next to the expiry date.** A contract 45 days out
 *    that needed 90 days' notice is already committed, and an end-date-only column
 *    renders it as comfortable. `ExpiryCell` turns the whole notice/expire pair red
 *    once the deadline has gone, which is the single most useful thing on this screen.
 *
 * Sorted by expiry with open-ended agreements last, which is what the API already does
 * - re-sorting here would have to guess where a null goes and would eventually disagree.
 */
export default function ContractsPage() {
    const [contracts, setContracts] = useState<ContractRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [type, setType] = useState<ContractType | ''>('');
    const [search, setSearch] = useState('');
    const [expiresFrom, setExpiresFrom] = useState('');
    const [expiresTo, setExpiresTo] = useState('');
    const [hasDocument, setHasDocument] = useState<'' | 'yes' | 'no'>('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await contractsApi.contracts({
                type: type || undefined,
                search: search || undefined,
                expiresFrom: expiresFrom || undefined,
                expiresTo: expiresTo || undefined,
                hasDocument: hasDocument === '' ? undefined : hasDocument === 'yes',
            });
            setContracts(response.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the contract register.');
        } finally {
            setIsLoading(false);
        }
    }, [type, search, expiresFrom, expiresTo, hasDocument]);

    useEffect(() => {
        load();
    }, [load]);

    /** The counts in the header are derived here rather than asked for. */
    const summary = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const contract of contracts) {
            counts[contract.status] = (counts[contract.status] ?? 0) + 1;
        }
        return {
            total: contracts.length,
            needsAttention: contracts.filter(
                (c) => c.status === 'NOTICE_DUE' || c.status === 'EXPIRING_SOON',
            ).length,
            withoutScan: contracts.filter((c) => !c.documentId).length,
            counts,
        };
    }, [contracts]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Contract register</h1>
                    <p className="text-sm text-muted-foreground">
                        Every agreement the organization is a party to, and when each one
                        needs a decision.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <Link href="/contracts/expiry-report">Expiry report</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/contracts/new">File a contract</Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>In this view</CardDescription>
                        <CardTitle className="text-3xl">{summary.total}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Need a decision</CardDescription>
                        <CardTitle className="text-3xl">{summary.needsAttention}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        Past their notice deadline, or ending within 30 days.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>No signed copy</CardDescription>
                        <CardTitle className="text-3xl">{summary.withoutScan}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        The agreement exists as a row. The paper does not.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Notice period passed</CardDescription>
                        <CardTitle className="text-3xl">
                            {summary.counts.NOTICE_DUE ?? 0}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        Running, but can no longer be ended or extended.
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                    <CardDescription>
                        Filters read the columns the status is derived from, so they cannot
                        disagree with it.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-2">
                        <Label htmlFor="type">Type</Label>
                        <Select
                            id="type"
                            value={type}
                            onChange={(e) => setType(e.target.value as ContractType | '')}
                        >
                            <option value="">All types</option>
                            {CONTRACT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="expiresFrom">Ends after</Label>
                        <Input
                            id="expiresFrom"
                            type="date"
                            value={expiresFrom}
                            onChange={(e) => setExpiresFrom(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="expiresTo">Ends before</Label>
                        <Input
                            id="expiresTo"
                            type="date"
                            value={expiresTo}
                            onChange={(e) => setExpiresTo(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="hasDocument">Signed copy</Label>
                        <Select
                            id="hasDocument"
                            value={hasDocument}
                            onChange={(e) =>
                                setHasDocument(e.target.value as '' | 'yes' | 'no')
                            }
                        >
                            <option value="">Any</option>
                            <option value="yes">On file</option>
                            <option value="no">Missing</option>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="search">Search</Label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="search"
                                className="pl-8"
                                placeholder="Reference or title"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contracts</CardTitle>
                    <CardDescription>
                        Sorted by end date, soonest first. An agreement with no end date
                        sits last rather than at the top as if it were urgent.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <LoadingState label="Loading the register." />
                    ) : error ? (
                        <ErrorState message={error} onRetry={load} />
                    ) : contracts.length === 0 ? (
                        <EmptyState
                            icon={<FileSignature className="h-8 w-8" />}
                            title="No contracts match"
                            description={
                                type || search || expiresFrom || expiresTo || hasDocument
                                    ? 'Nothing in the register fits these filters. Widen the date window or clear the type.'
                                    : 'Nothing has been filed yet. Start with the agreement for the property you manage most, or the supplier you pay most.'
                            }
                            action={
                                <Button asChild>
                                    <Link href="/contracts/new">File a contract</Link>
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>Ends</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Copy</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contracts.map((contract) => (
                                    <TableRow key={contract.id}>
                                        <TableCell>
                                            <Link
                                                href={`/contracts/${contract.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {contract.reference}
                                            </Link>
                                            <span className="block text-xs text-muted-foreground">
                                                {contract.title}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {CONTRACT_TYPES.find((t) => t.value === contract.type)
                                                ?.label ?? contract.type}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {contract.relatedLabel ? (
                                                contract.relatedLabel
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    None - held centrally
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <ExpiryCell
                                                expiresAt={contract.expiresAt}
                                                daysUntilExpiry={contract.daysUntilExpiry}
                                                noticeDueAt={contract.noticeDueAt}
                                                noticeDays={contract.noticeDays}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <ContractStatusPill status={contract.status} />
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {contract.documentId ? (
                                                <span className="text-muted-foreground">
                                                    On file
                                                </span>
                                            ) : (
                                                <span className="font-medium text-amber-700">
                                                    Missing
                                                </span>
                                            )}
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