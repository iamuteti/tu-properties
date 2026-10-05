"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { ClipboardList, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { procurementApi } from "@/lib/api";
import type { PurchaseRequest, PurchaseRequestStats } from "@/types";

/**
 * Module 10 — purchase requests.
 *
 * "Somebody in a department said what is needed, and an approver agreed." The
 * queue that matters is PENDING: a request nobody has decided is the only number
 * here that is somebody's job to change, so it leads.
 */
const CATEGORY_LABELS: Record<string, string> = {
    MAINTENANCE_PARTS: 'Maintenance parts',
    EQUIPMENT: 'Equipment',
    FURNITURE: 'Furniture',
    IT_AND_TECH: 'IT and tech',
    STATIONERY: 'Stationery',
    CLEANING: 'Cleaning',
    SECURITY: 'Security',
    UTILITIES: 'Utilities',
    PROFESSIONAL_SERVICES: 'Professional services',
    OTHER: 'Other',
};

const PRIORITY_LABELS: Record<string, string> = {
    LOW: 'Low',
    NORMAL: 'Normal',
    HIGH: 'High',
    URGENT: 'Urgent',
};

const money = (value: number | string | null | undefined) =>
    value == null
        ? '—'
        : Number(value).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

export default function PurchaseRequestsPage() {
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [stats, setStats] = useState<PurchaseRequestStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [search, setSearch] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (status) params.status = status;
            if (priority) params.priority = priority;
            if (search.trim()) params.search = search.trim();
            const [list, summary] = await Promise.all([
                procurementApi.purchaseRequests(params),
                procurementApi.purchaseRequestStats(),
            ]);
            setRequests(list.data);
            setStats(summary.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load purchase requests',
            );
        } finally {
            setIsLoading(false);
        }
    }, [status, priority, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Purchase requests</h1>
                    <p className="text-muted-foreground">
                        What the business needs, before anyone commits money to it
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href={procurementApi.purchaseRequestsExportUrl({
                                status: status || undefined,
                                search: search.trim() || undefined,
                            })}
                        >
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/procurement/purchase-requests/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Raise a request
                        </Link>
                    </Button>
                </div>
            </div>

            {stats && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Stat label="Requests" value={stats.total} />
                    <Stat
                        label="Waiting for a decision"
                        value={stats.awaitingApproval}
                        tone={stats.awaitingApproval > 0 ? 'amber' : undefined}
                    />
                    <Stat
                        label="Open, urgent"
                        value={stats.urgentOpen}
                        tone={stats.urgentOpen > 0 ? 'amber' : undefined}
                    />
                    <Stat
                        label="Estimated, still open"
                        value={money(stats.estimatedOpen)}
                        note="An estimate, not a commitment"
                    />
                </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Label htmlFor="prStatus">Status</Label>
                    <Select
                        name="prStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            { value: '', label: 'All requests' },
                            { value: 'DRAFT', label: 'Draft' },
                            { value: 'PENDING', label: 'Waiting for approval' },
                            { value: 'APPROVED', label: 'Approved' },
                            { value: 'REJECTED', label: 'Rejected' },
                            { value: 'CANCELLED', label: 'Cancelled' },
                        ]}
                    />
                </div>
                <div className="w-44">
                    <Label htmlFor="prPriority">Priority</Label>
                    <Select
                        name="prPriority"
                        value={priority}
                        onChange={(event) => setPriority(event.target.value)}
                        options={[
                            { value: '', label: 'Any priority' },
                            { value: 'URGENT', label: 'Urgent' },
                            { value: 'HIGH', label: 'High' },
                            { value: 'NORMAL', label: 'Normal' },
                            { value: 'LOW', label: 'Low' },
                        ]}
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="prSearch">Search</Label>
                    <Input
                        id="prSearch"
                        value={search}
                        placeholder="Reference or title"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={fetchData} />}

            {isLoading ? (
                <LoadingState label="Loading purchase requests..." />
            ) : requests.length === 0 ? (
                <EmptyState
                    title="No purchase requests yet"
                    description="Raise one for what is needed — parts, furniture, a service. It has to be approved before suppliers can be asked to quote."
                    icon={<ClipboardList className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild variant="outline">
                            <Link href="/procurement/purchase-requests/new">
                                Raise the first one
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
                                    <TableHead>Reference</TableHead>
                                    <TableHead>What is needed</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Raised by</TableHead>
                                    <TableHead className="text-right">Estimate</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell className="font-medium">
                                            <Link
                                                href={`/procurement/purchase-requests/${request.id}`}
                                                className="underline-offset-4 hover:underline"
                                            >
                                                {request.reference}
                                            </Link>
                                            {request.priority === 'URGENT' && (
                                                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                                    Urgent
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="block max-w-xs truncate">
                                                {request.title}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {request.lineCount} item
                                                {(request.lineCount ?? 0) === 1 ? '' : 's'}
                                                {request.department ? ` · ${request.department}` : ''}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {CATEGORY_LABELS[request.category] ?? request.category}
                                            {request.priority !== 'NORMAL' && (
                                                <p className="text-xs text-muted-foreground">
                                                    {PRIORITY_LABELS[request.priority]}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {request.requestedBy
                                                ? `${request.requestedBy.firstName} ${request.requestedBy.lastName}`
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(request.estimatedAmount)}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={request.status} />
                                            {(request.rfqCount ?? 0) > 0 && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {request.rfqCount} round
                                                    {request.rfqCount === 1 ? '' : 's'} out
                                                </p>
                                            )}
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

function Stat({
    label,
    value,
    note,
    tone,
}: {
    label: string;
    value: number | string;
    note?: string;
    tone?: 'amber';
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p
                    className={`text-2xl font-semibold ${
                        tone === 'amber' && Number(value) > 0 ? 'text-amber-700' : ''
                    }`}
                >
                    {value}
                </p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}