"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeDollarSign, Check, ChevronLeft, HandCoins, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { Select } from "@/components/ui/select";
import { useUsers } from "@/hooks/use-users";
import { salesApi } from "@/lib/api";
import { COMMISSION_STATUS_OPTIONS } from "@/lib/constants";
import type { Commission, CommissionReport } from "@/types";

/**
 * Commission report — per agent, with split support.
 *
 * This is the screen that answers "what has each agent earned and what has
 * actually been paid", which is the acceptance criterion for this module.
 * Approval is a deliberate two-step: approve, then pay with a reference.
 */
export default function CommissionReportPage() {
    const router = useRouter();
    const { users } = useUsers();
    const [report, setReport] = useState<CommissionReport | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [agentId, setAgentId] = useState('');
    const [status, setStatus] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const agentOptions = useMemo(
        () =>
            users.map((u) => ({
                value: u.id,
                label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
            })),
        [users],
    );

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await salesApi.commissionReport({
                agentUserId: agentId || undefined,
                status: status || undefined,
            });
            setReport(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load commissions.');
        } finally {
            setIsLoading(false);
        }
    }, [agentId, status]);

    useEffect(() => {
        load();
    }, [load]);

    const setCommission = async (commission: Commission, next: 'APPROVED' | 'PAID' | 'REJECTED') => {
        let paidRef: string | undefined;
        if (next === 'PAID') {
            paidRef = window.prompt('Payment reference (required)') ?? undefined;
            if (!paidRef?.trim()) {
                toast.error('A payment reference is required to mark a commission paid.');
                return;
            }
        }
        setBusyId(commission.id);
        try {
            await salesApi.setCommissionStatus(commission.id, next, { paidRef });
            toast.success(`Commission marked ${next.toLowerCase()}`);
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not update the commission.');
        } finally {
            setBusyId(null);
        }
    };

    const totals = (report?.byAgent ?? []).reduce(
        (acc, row) => ({
            total: acc.total + row.total,
            pending: acc.pending + row.pending,
            approved: acc.approved + row.approved,
            paid: acc.paid + row.paid,
        }),
        { total: 0, pending: 0, approved: 0, paid: 0 },
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/sales')} aria-label="Back to sales">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
                            Commissions
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            What each agent has earned, and what has been paid out
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[180px]">
                        <label htmlFor="commission-agent" className="mb-1 block text-xs font-medium">
                            Agent
                        </label>
                        <Select
                            id="commission-agent"
                            options={agentOptions}
                            value={agentId}
                            onChange={(e) => setAgentId(e.target.value)}
                            placeholder="All agents"
                        />
                    </div>
                    <div className="min-w-[150px]">
                        <label htmlFor="commission-status" className="mb-1 block text-xs font-medium">
                            Status
                        </label>
                        <Select
                            id="commission-status"
                            options={COMMISSION_STATUS_OPTIONS}
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            placeholder="All statuses"
                        />
                    </div>
                </div>
            </div>

            {isLoading && <LoadingState label="Loading commissions…" />}
            {error && <ErrorState message={error} onRetry={load} />}

            {!isLoading && !error && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardContent className="py-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Earned</p>
                                <p className="mt-1 text-2xl font-bold">{totals.total.toLocaleString()}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="py-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
                                <p className="mt-1 text-2xl font-bold text-amber-700">
                                    {totals.pending.toLocaleString()}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="py-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved</p>
                                <p className="mt-1 text-2xl font-bold text-sky-700">
                                    {totals.approved.toLocaleString()}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="py-4">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
                                <p className="mt-1 text-2xl font-bold text-green-700">
                                    {totals.paid.toLocaleString()}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>By agent</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {(report?.byAgent ?? []).length === 0 ? (
                                <EmptyState
                                    title="No commissions yet"
                                    description="Generate a commission split from a sale once it has an agreed price."
                                    icon={<HandCoins className="h-10 w-10" aria-hidden="true" />}
                                />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Agent</TableHead>
                                            <TableHead className="text-right">Sales</TableHead>
                                            <TableHead className="text-right">Earned</TableHead>
                                            <TableHead className="text-right">Pending</TableHead>
                                            <TableHead className="text-right">Approved</TableHead>
                                            <TableHead className="text-right">Paid</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(report?.byAgent ?? []).map((row) => (
                                            <TableRow key={row.agentUserId}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{row.agentName}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.agentEmail}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{row.saleCount}</TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {row.total.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-amber-700">
                                                    {row.pending.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-sky-700">
                                                    {row.approved.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right text-green-700">
                                                    {row.paid.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Individual commissions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {(report?.rows ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing matches these filters.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Agent</TableHead>
                                                <TableHead>Sale</TableHead>
                                                <TableHead className="text-right">Share</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Paid ref</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(report?.rows ?? []).map((commission) => (
                                                <TableRow key={commission.id}>
                                                    <TableCell>
                                                        {`${commission.agent.firstName} ${commission.agent.lastName}`.trim()}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {commission.saleTransaction?.code ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {commission.splitPercentage != null
                                                            ? `${commission.splitPercentage}%`
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {Number(commission.amount).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                                            {commission.status.charAt(0) +
                                                                commission.status.slice(1).toLowerCase()}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {commission.paidRef ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <CommissionActions
                                                            commission={commission}
                                                            isBusy={busyId === commission.id}
                                                            onAction={setCommission}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

function CommissionActions({
    commission,
    isBusy,
    onAction,
}: {
    commission: Commission;
    isBusy: boolean;
    onAction: (commission: Commission, next: 'APPROVED' | 'PAID' | 'REJECTED') => void;
}) {
    if (commission.status === 'PENDING') {
        return (
            <span className="inline-flex gap-1">
                <Button size="sm" disabled={isBusy} onClick={() => onAction(commission, 'APPROVED')}>
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Approve
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => onAction(commission, 'REJECTED')}
                >
                    <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Reject
                </Button>
            </span>
        );
    }

    if (commission.status === 'APPROVED') {
        return (
            <Button size="sm" disabled={isBusy} onClick={() => onAction(commission, 'PAID')}>
                <HandCoins className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Mark paid
            </Button>
        );
    }

    return <span className="text-xs text-muted-foreground">Settled</span>;
}