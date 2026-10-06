'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { contractsApi } from '@/lib/api';
import { CONTRACT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ContractStatusBadge, ExpiryCell } from '../_components';
import type { ContractExpiryReport, ContractType } from '@/types';

/**
 * The expiry report.
 *
 * **This screen is ordered by urgency, not by date, and that is the whole point of
 * it.** The backend sorts `needsAttention` that way and this page preserves the order
 * rather than re-sorting, because the two questions are different:
 *
 * - "What ends soonest?" - answered by the register, sorted by date.
 * - "What has already become unchangeable?" - answered here.
 *
 * A contract 45 days out that needed 90 days' notice is committed to ending; one 14
 * days out is still freely negotiable. Sorting by date puts the negotiable one above
 * the committed one and tells the reader the opposite of the truth.
 *
 * The window is bounded on the server (180 days by default, 1095 maximum) because the
 * report derives a status per contract in JavaScript. An unbounded window on an
 * organization with decades of closed contracts would load its whole register to
 * report on the next fortnight.
 */
export default function ExpiryReportPage() {
    const [report, setReport] = useState<ContractExpiryReport | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [withinDays, setWithinDays] = useState('180');
    const [type, setType] = useState<ContractType | ''>('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await contractsApi.expiryReport({
                withinDays: Number(withinDays) || 180,
                type: type || undefined,
            });
            setReport(response.data ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not build the expiry report.');
        } finally {
            setIsLoading(false);
        }
    }, [withinDays, type]);

    useEffect(() => {
        load();
    }, [load]);

    const noticeDue = report?.byStatus?.NOTICE_DUE ?? 0;
    const expiringSoon = report?.byStatus?.EXPIRING_SOON ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Expiry report</h1>
                    <p className="text-sm text-muted-foreground">
                        What ends in the next {withinDays || 180} days, and what has already
                        become unchangeable.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/contracts">Back to the register</Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Scope</CardTitle>
                    <CardDescription>
                        Bounded on purpose: the status of every contract is derived as it is
                        read, so an unbounded window would load the whole register.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="withinDays">Looking ahead</Label>
                        <Select
                            id="withinDays"
                            value={withinDays}
                            onChange={(e) => setWithinDays(e.target.value)}
                        >
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="180">180 days</option>
                            <option value="365">1 year</option>
                            <option value="1095">3 years</option>
                        </Select>
                    </div>
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
                </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Notice period passed</CardDescription>
                        <CardTitle className="text-3xl text-red-700">{noticeDue}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        Cannot be ended or extended. The decision was due before the term
                        began.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Ends within 30 days</CardDescription>
                        <CardTitle className="text-3xl text-amber-700">{expiringSoon}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        Notice can still be served.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Ending in the window</CardDescription>
                        <CardTitle className="text-3xl">{report?.total ?? 0}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground">
                        Generated {report ? new Date(report.generatedAt).toLocaleString() : '-'}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Needs attention</CardTitle>
                    <CardDescription>
                        Ordered by urgency, not by date. The first row is the one where the
                        options have already run out.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <LoadingState label="Building the report." />
                    ) : error ? (
                        <ErrorState message={error} onRetry={load} />
                    ) : !report || report.needsAttention.length === 0 ? (
                        <EmptyState
                            icon={<CalendarClock className="h-8 w-8" />}
                            title="Nothing needs a decision"
                            description={`No contract ends in the next ${withinDays || 180} days with an unserved notice period. Widen the window if you are looking further ahead.`}
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Counterparty</TableHead>
                                    <TableHead>Ends</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>What to do</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.needsAttention.map((contract) => (
                                    <TableRow key={contract.id}>
                                        <TableCell>
                                            <Link
                                                href={`/contracts/${contract.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {contract.reference}
                                            </Link>
                                            <span className="block text-xs text-muted-foreground">
                                                {CONTRACT_TYPES.find(
                                                    (t) => t.value === contract.type,
                                                )?.label ?? contract.type}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {contract.relatedLabel ?? (
                                                <span className="text-muted-foreground">
                                                    Held centrally
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
                                            <ContractStatusBadge status={contract.status} />
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {contract.status === 'NOTICE_DUE'
                                                ? 'Treat as committed. Renegotiate from here or accept the end date.'
                                                : contract.noticeDays
                                                    ? `Decide by ${new Date(contract.noticeDueAt!).toLocaleDateString()} to serve ${contract.noticeDays} days' notice.`
                                                    : 'No notice period. Confirm what happens at the end date.'}
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