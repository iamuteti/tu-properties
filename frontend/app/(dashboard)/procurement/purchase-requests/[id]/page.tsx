"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AxiosError } from "axios";
import {
    ArrowLeft,
    Ban,
    CheckCircle2,
    FileStack,
    RotateCcw,
    Send,
    Truck,
    Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { ApprovalHistory, ApprovalTimeline } from "@/components/workflow/approval-timeline";
import { procurementApi } from "@/lib/api";
import type { PurchaseRequest } from "@/types";

/**
 * One purchase request (Module 10).
 *
 * The action bar is built from the record's own `availableActions`, computed by
 * the state machine on the server. The client never decides what is allowed —
 * it renders what the API says this record can do, so a screen can never offer a
 * button whose gate rejects it.
 */
const money = (value: number | string | null | undefined) =>
    value == null
        ? '—'
        : Number(value).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

type Dialog = 'approve' | 'reject' | 'cancel' | null;

export default function PurchaseRequestDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await procurementApi.purchaseRequest(id);
            setRequest(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load this request',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const run = async (key: string, action: () => Promise<unknown>) => {
        setBusy(key);
        setActionError(null);
        try {
            await action();
            setDialog(null);
            setReason('');
            setNote('');
            await fetchData();
        } catch (err) {
            setActionError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'That action could not be completed',
            );
        } finally {
            setBusy(null);
        }
    };

    if (isLoading) return <LoadingState label="Loading the request..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;
    if (!request) return null;

    const actions = request.availableActions ?? [];

    return (
        <div className="space-y-6">
            <div>
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/procurement/purchase-requests">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        All purchase requests
                    </Link>
                </Button>

                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">{request.title}</h1>
                            <StatusBadge status={request.status} />
                        </div>
                        <p className="text-muted-foreground">
                            {request.reference}
                            {request.department ? ` · ${request.department}` : ''}
                            {request.requestedBy
                                ? ` · raised by ${request.requestedBy.firstName} ${request.requestedBy.lastName}`
                                : ''}
                            {request.neededBy
                                ? ` · needed by ${new Date(request.neededBy).toLocaleDateString()}`
                                : ''}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {actions.includes('SUBMIT') && (
                            <Button
                                disabled={busy === 'submit'}
                                onClick={() =>
                                    void run('submit', () =>
                                        procurementApi.submitPurchaseRequest(id, note || undefined),
                                    )
                                }
                            >
                                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                                Send for approval
                            </Button>
                        )}
                        {actions.includes('APPROVE') && (
                            <Button
                                variant="outline"
                                onClick={() => setDialog('approve')}
                                disabled={busy !== null}
                            >
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Approve
                            </Button>
                        )}
                        {actions.includes('REJECT') && (
                            <Button variant="outline" onClick={() => setDialog('reject')}>
                                <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                                Reject
                            </Button>
                        )}
                        {actions.includes('CANCEL') && (
                            <Button variant="ghost" onClick={() => setDialog('cancel')}>
                                <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Cancel
                            </Button>
                        )}
                        {actions.includes('REOPEN') && (
                            <Button
                                variant="outline"
                                disabled={busy === 'reopen'}
                                onClick={() =>
                                    void run('reopen', () =>
                                        procurementApi.reopenPurchaseRequest(id),
                                    )
                                }
                            >
                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                                Reopen as a draft
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {actionError && <ErrorState message={actionError} />}

            {dialog === 'approve' && (
                <ReasonPanel
                    title="Approve this request"
                    description="Where no approval policy is configured, approving directly is the whole decision. Where one is, use the approval engine instead so the levels are enforced."
                    label="Note (optional)"
                    value={note}
                    onChange={setNote}
                    minLength={0}
                    busy={busy === 'approve'}
                    confirmLabel="Approve"
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run('approve', () =>
                            procurementApi.approvePurchaseRequest(id, note || undefined),
                        )
                    }
                />
            )}

            {dialog === 'reject' && (
                <ReasonPanel
                    title="Reject this request"
                    description="The person who raised it reads this. “We do not want this” and “we did not approve this” are different answers, which is why rejection and cancellation are separate states."
                    label="Why"
                    value={reason}
                    onChange={setReason}
                    minLength={5}
                    busy={busy === 'reject'}
                    confirmLabel="Reject"
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run('reject', () =>
                            procurementApi.rejectPurchaseRequest(id, reason.trim()),
                        )
                    }
                />
            )}

            {dialog === 'cancel' && (
                <ReasonPanel
                    title="Cancel this request"
                    description="Cancelling keeps the record — it is not the same as deleting it, because the request may already have been read by an approver."
                    label="Why"
                    value={reason}
                    onChange={setReason}
                    minLength={5}
                    busy={busy === 'cancel'}
                    confirmLabel="Cancel the request"
                    onCancel={() => setDialog(null)}
                    onConfirm={() =>
                        void run('cancel', () =>
                            procurementApi.cancelPurchaseRequest(id, reason.trim()),
                        )
                    }
                />
            )}

            {request.rejectionReason && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-red-800">Why this was rejected</p>
                        <p className="mt-1 text-sm text-red-900">{request.rejectionReason}</p>
                        <p className="mt-1 text-xs text-red-700">
                            Kept on the record when the request is reopened, so the same request
                            cannot come back with the same problem.
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                What is being bought
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                    {request.lineCount} item
                                    {(request.lineCount ?? 0) === 1 ? '' : 's'}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {request.lines.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    This request has no lines, so there is nothing to compare
                                    quotations against and nothing to approve.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">Qty</TableHead>
                                            <TableHead className="text-right">Unit</TableHead>
                                            <TableHead className="text-right">Estimate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {request.lines.map((line) => (
                                            <TableRow key={line.id}>
                                                <TableCell>
                                                    {line.description}
                                                    {line.specification && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {line.specification}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {Number(line.quantity)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {line.unitPrice != null
                                                        ? money(line.unitPrice)
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {money(line.estimatedAmount)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                            <p className="mt-4 text-sm text-muted-foreground">
                                Estimated total{' '}
                                <span className="font-medium text-foreground">
                                    {money(request.estimatedAmount)} {request.currency}
                                </span>
                                . An estimate, not a commitment — the commitment happens when a
                                purchase order is sent.
                            </p>
                        </CardContent>
                    </Card>

                    {request.description && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Why it is needed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-line text-sm">
                                    {request.description}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {request.approval && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Approval trail</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <ApprovalTimeline instance={request.approval} />
                                <div>
                                    <h3 className="mb-2 text-sm font-medium">Decisions</h3>
                                    <ApprovalHistory instance={request.approval} />
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Where it has got to</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Decision</p>
                                <p>
                                    {request.decidedAt
                                        ? new Date(request.decidedAt).toLocaleString()
                                        : 'Not decided yet'}
                                    {request.decidedBy &&
                                        ` · ${request.decidedBy.firstName} ${request.decidedBy.lastName}`}
                                </p>
                                {request.decisionNote && (
                                    <p className="mt-1 italic text-muted-foreground">
                                        “{request.decisionNote}”
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-muted-foreground">Quotation rounds</p>
                                {request.rfqs && request.rfqs.length > 0 ? (
                                    <ul className="mt-1 space-y-1">
                                        {request.rfqs.map((rfq) => (
                                            <li key={rfq.id}>
                                                <Link
                                                    href={`/procurement/rfqs/${rfq.id}`}
                                                    className="underline-offset-4 hover:underline"
                                                >
                                                    {rfq.reference}
                                                </Link>{' '}
                                                <StatusBadge status={rfq.status} />
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-1 text-muted-foreground">
                                        None yet. Suppliers can only be asked once this is
                                        approved.
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-muted-foreground">Purchase orders</p>
                                {request.orders && request.orders.length > 0 ? (
                                    <ul className="mt-1 space-y-1">
                                        {request.orders.map((order) => (
                                            <li key={order.id}>
                                                <Link
                                                    href={`/procurement/purchase-orders/${order.id}`}
                                                    className="underline-offset-4 hover:underline"
                                                >
                                                    {order.reference}
                                                </Link>{' '}
                                                <StatusBadge status={order.status} />{' '}
                                                {money(order.totalAmount)}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-1 text-muted-foreground">
                                        None raised yet.
                                    </p>
                                )}
                            </div>

                            {request.status === 'APPROVED' && (
                                <Button asChild className="w-full">
                                    <Link
                                        href={`/procurement/rfqs/new?purchaseRequestId=${request.id}`}
                                    >
                                        <FileStack className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Ask suppliers to quote
                                    </Link>
                                </Button>
                            )}

                            {request.orders && request.orders.length > 0 && (
                                <Button variant="outline" asChild className="w-full">
                                    <Link
                                        href={`/procurement/purchase-orders?purchaseRequestId=${request.id}`}
                                    >
                                        <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Orders from this request
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function ReasonPanel({
    title,
    description,
    label,
    value,
    onChange,
    minLength,
    busy,
    confirmLabel,
    onCancel,
    onConfirm,
}: {
    title: string;
    description: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    minLength: number;
    busy: boolean;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{description}</p>
                <div>
                    <Label htmlFor="reason">{label}</Label>
                    <Textarea
                        id="reason"
                        rows={3}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={minLength > 0 ? 'destructive' : 'default'}
                        disabled={busy || value.trim().length < minLength}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                    <Button variant="ghost" onClick={onCancel}>
                        Back
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}