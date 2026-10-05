"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AxiosError } from "axios";
import {
    ArrowLeft,
    Ban,
    CheckCircle2,
    PackageCheck,
    Receipt,
    Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { ReceiptProgress } from "@/components/procurement/quote-comparison";
import { StockInPanel } from "@/components/inventory/stock-in-panel";
import { procurementApi } from "@/lib/api";
import type { PurchaseOrder } from "@/types";

const money = (value: number | string | null | undefined) =>
    value == null
        ? '—'
        : Number(value).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

type Dialog = 'cancel' | 'receive' | 'bill' | null;

/**
 * One purchase order (Module 10).
 *
 * The receipts are listed as rows rather than summarised, because goods arrive
 * in instalments and a single "received: yes" would lose the history of what
 * came when. What has arrived is always derived from those rows.
 *
 * Recording a receipt derives RECEIVED versus PARTIALLY_RECEIVED from the
 * arithmetic — the form cannot say which one it is, because that is a fact about
 * the order, not a choice the person making the form is making.
 */
export default function PurchaseOrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [reason, setReason] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await procurementApi.purchaseOrder(id);
            setOrder(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load this order',
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

    if (isLoading) return <LoadingState label="Loading the order..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;
    if (!order) return null;

    const actions = order.availableActions ?? [];
    const canReceive = actions.includes('RECEIVE') || actions.includes('RECEIVE_PART');
    const canBill =
        order.status === 'RECEIVED' && !order.supplierBillId && order.deliveries.length > 0;

    return (
        <div className="space-y-6">
            <div>
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/procurement/purchase-orders">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        All purchase orders
                    </Link>
                </Button>

                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">
                                {order.reference}
                            </h1>
                            <StatusBadge status={order.status} />
                            {order.overdue && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                    {order.daysOverdue} days late
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            {order.supplier?.name}
                            {order.rfq && (
                                <>
                                    {' · from round '}
                                    <Link
                                        href={`/procurement/rfqs/${order.rfq.id}`}
                                        className="underline-offset-4 hover:underline"
                                    >
                                        {order.rfq.reference}
                                    </Link>
                                </>
                            )}
                            {order.purchaseRequest && (
                                <>
                                    {' · request '}
                                    <Link
                                        href={`/procurement/purchase-requests/${order.purchaseRequest.id}`}
                                        className="underline-offset-4 hover:underline"
                                    >
                                        {order.purchaseRequest.reference}
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {actions.includes('SEND') && (
                            <Button
                                disabled={busy === 'send'}
                                onClick={() => void run('send', () => procurementApi.sendPurchaseOrder(id))}
                            >
                                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                                Send to supplier
                            </Button>
                        )}
                        {actions.includes('ACCEPT') && (
                            <Button
                                variant="outline"
                                disabled={busy === 'accept'}
                                onClick={() =>
                                    void run('accept', () =>
                                        procurementApi.acceptPurchaseOrder(id),
                                    )
                                }
                            >
                                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                Record supplier acceptance
                            </Button>
                        )}
                        {canReceive && (
                            <Button onClick={() => setDialog('receive')}>
                                <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                                Record a delivery
                            </Button>
                        )}
                        {canBill && (
                            <Button onClick={() => setDialog('bill')}>
                                <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
                                Raise the supplier bill
                            </Button>
                        )}
                        {actions.includes('CLOSE') && (
                            <Button
                                variant="outline"
                                disabled={busy === 'close'}
                                onClick={() =>
                                    void run('close', () => procurementApi.closePurchaseOrder(id))
                                }
                            >
                                Close the order
                            </Button>
                        )}
                        {actions.includes('CANCEL') && (
                            <Button variant="ghost" onClick={() => setDialog('cancel')}>
                                <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {actionError && <ErrorState message={actionError} />}

            {dialog === 'cancel' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Cancel this order</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Once goods have arrived against an order it can no longer be cancelled
                            — a cancellation with receipts on it is a contradiction an auditor
                            cannot read past. Receive the goods and write off what should not have
                            been ordered instead.
                        </p>
                        <div>
                            <Label htmlFor="poCancelReason">Reason</Label>
                            <Textarea
                                id="poCancelReason"
                                rows={3}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="destructive"
                                disabled={busy === 'cancel' || reason.trim().length < 5}
                                onClick={() =>
                                    void run('cancel', () =>
                                        procurementApi.cancelPurchaseOrder(id, reason.trim()),
                                    )
                                }
                            >
                                Cancel the order
                            </Button>
                            <Button variant="ghost" onClick={() => setDialog(null)}>
                                Back
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {dialog === 'receive' && (
                <ReceiveForm
                    order={order}
                    busy={busy === 'receive'}
                    onCancel={() => setDialog(null)}
                    onConfirm={(lines, deliveryNote, conditionNote) =>
                        void run('receive', () =>
                            procurementApi.receivePurchaseOrder(id, {
                                lines,
                                deliveryNote,
                                conditionNote,
                            }),
                        )
                    }
                />
            )}

            {dialog === 'bill' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Raise the supplier bill</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            This hands the order to accounts payable, which prices it through the
                            tax engine and posts the ledger entry. Only what has been received is
                            billed, so a part delivery bills the part.
                        </p>
                        <p className="text-sm">
                            Order total {money(order.totalAmount)}; outstanding{' '}
                            {money(order.outstandingValue)}.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                disabled={busy === 'bill'}
                                onClick={() =>
                                    void run('bill', () =>
                                        procurementApi.createBillFromPurchaseOrder(id),
                                    )
                                }
                            >
                                Raise the bill
                            </Button>
                            <Button variant="ghost" onClick={() => setDialog(null)}>
                                Not yet
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">What was ordered</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Ordered</TableHead>
                                        <TableHead className="text-right">Received</TableHead>
                                        <TableHead className="text-right">Unit</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.lines.map((line) => (
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
                                                <span
                                                    className={
                                                        Number(line.receivedQuantity) >
                                                        Number(line.quantity) - 0.001
                                                            ? 'text-emerald-700'
                                                            : Number(line.receivedQuantity) > 0
                                                              ? 'text-amber-700'
                                                              : 'text-muted-foreground'
                                                    }
                                                >
                                                    {Number(line.receivedQuantity)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {money(line.unitPrice)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {money(line.amount)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="mt-4 flex flex-wrap justify-end gap-6 text-sm">
                                <span>
                                    Subtotal{' '}
                                    <span className="font-medium">
                                        {money(order.subtotal)}
                                    </span>
                                </span>
                                <span>
                                    Tax <span className="font-medium">{money(order.taxAmount)}</span>
                                </span>
                                <span>
                                    Total{' '}
                                    <span className="font-semibold">
                                        {money(order.totalAmount)} {order.currency}
                                    </span>
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">
                                Deliveries
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                    {order.deliveries.length} recorded
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {order.deliveries.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing has arrived yet. An order is not marked received
                                    because the supplier sent an invoice.
                                </p>
                            ) : (
                                order.deliveries.map((delivery) => (
                                    <div key={delivery.id} className="rounded-md border px-4 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-medium">
                                                {new Date(delivery.receivedAt).toLocaleString()}
                                                {delivery.deliveryNote
                                                    ? ` · ${delivery.deliveryNote}`
                                                    : ''}
                                            </p>
                                            {delivery.receivedBy && (
                                                <p className="text-xs text-muted-foreground">
                                                    Signed for by{' '}
                                                    {delivery.receivedBy.firstName}{' '}
                                                    {delivery.receivedBy.lastName}
                                                </p>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {delivery.lines
                                                .map(
                                                    (line) =>
                                                        `${Number(line.quantity)} × ${
                                                            order.lines.find(
                                                                (candidate) =>
                                                                    candidate.id ===
                                                                    line.purchaseOrderLineId,
                                                            )?.description ?? 'item'
                                                        }`,
                                                )
                                                .join(', ')}
                                        </p>
                                        {delivery.conditionNote && (
                                            <p className="mt-1 text-sm italic text-muted-foreground">
                                                “{delivery.conditionNote}”
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <StockInPanel purchaseOrderId={order.id} />
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Delivery</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <ReceiptProgress
                                receivedPercent={order.receivedPercent ?? 0}
                                outstandingQuantity={order.outstandingQuantity ?? 0}
                            />
                            <div>
                                <p className="text-muted-foreground">Promised</p>
                                <p>
                                    {order.expectedDelivery
                                        ? new Date(order.expectedDelivery).toLocaleDateString()
                                        : 'Not stated by the supplier'}
                                </p>
                                {order.receivedAt && (
                                    <p className="mt-1 text-muted-foreground">
                                        Last of it arrived{' '}
                                        {new Date(order.receivedAt).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                            {order.deliveryAddress && (
                                <div>
                                    <p className="text-muted-foreground">Deliver to</p>
                                    <p>{order.deliveryAddress}</p>
                                </div>
                            )}
                            {order.terms && (
                                <div>
                                    <p className="text-muted-foreground">Terms</p>
                                    <p>{order.terms}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Billing</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            {order.supplierBill ? (
                                <>
                                    <p>
                                        Raised as{' '}
                                        <span className="font-medium">
                                            {order.supplierBill.billNumber}
                                        </span>
                                    </p>
                                    <p className="text-muted-foreground">
                                        {money(order.supplierBill.totalAmount)} ·{' '}
                                        {money(order.supplierBill.balanceAmount)} outstanding ·{' '}
                                        <StatusBadge status={order.supplierBill.status} />
                                    </p>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/finance/payables?billId=${order.supplierBill.id}`}>
                                            Open in accounts payable
                                        </Link>
                                    </Button>
                                </>
                            ) : (
                                <p className="text-muted-foreground">
                                    No bill raised yet. A bill can only be raised once something
                                    has arrived — the invoice is finance&apos;s to price, not this
                                    screen&apos;s.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {order.cancellationReason && (
                        <Card className="border-red-200 bg-red-50">
                            <CardContent className="pt-6 text-sm">
                                <p className="font-medium text-red-800">Why it was cancelled</p>
                                <p className="mt-1 text-red-900">{order.cancellationReason}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReceiveForm({
    order,
    busy,
    onCancel,
    onConfirm,
}: {
    order: PurchaseOrder;
    busy: boolean;
    onCancel: () => void;
    onConfirm: (
        lines: { purchaseOrderLineId: string; quantity: number }[],
        deliveryNote?: string,
        conditionNote?: string,
    ) => void;
}) {
    const outstanding = (lineId: string) => {
        const line = order.lines.find((candidate) => candidate.id === lineId);
        return line ? Number(line.quantity) - Number(line.receivedQuantity) : 0;
    };

    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [deliveryNote, setDeliveryNote] = useState('');
    const [conditionNote, setConditionNote] = useState('');

    const receivable = order.lines.filter((line) => outstanding(line.id) > 0.001);
    const lines = receivable
        .filter((line) => Number(quantities[line.id]) > 0)
        .map((line) => ({
            purchaseOrderLineId: line.id,
            quantity: Number(quantities[line.id]),
        }));

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Record a delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {receivable.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Everything on this order has already been received.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                                <TableHead className="w-40">Arrived now</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {receivable.map((line) => (
                                <TableRow key={line.id}>
                                    <TableCell>{line.description}</TableCell>
                                    <TableCell className="text-right">
                                        {outstanding(line.id)}
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="text-right"
                                            value={quantities[line.id] ?? ''}
                                            onChange={(event) =>
                                                setQuantities((current) => ({
                                                    ...current,
                                                    [line.id]: event.target.value,
                                                }))
                                            }
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <Label htmlFor="deliveryNote">Delivery note</Label>
                        <Input
                            id="deliveryNote"
                            value={deliveryNote}
                            onChange={(event) => setDeliveryNote(event.target.value)}
                            placeholder="DN-44821"
                        />
                    </div>
                    <div>
                        <Label htmlFor="conditionNote">Condition</Label>
                        <Input
                            id="conditionNote"
                            value={conditionNote}
                            onChange={(event) => setConditionNote(event.target.value)}
                            placeholder="One crate, one roll loose"
                        />
                    </div>
                </div>

                <p className="text-sm text-muted-foreground">
                    Record only what physically arrived. Whether this completes the order or
                    leaves it part-received is worked out from these figures, not chosen — and
                    nothing can be received before the supplier has accepted the order.
                </p>

                <div className="flex gap-2">
                    <Button
                        disabled={busy || lines.length === 0}
                        onClick={() =>
                            onConfirm(
                                lines,
                                deliveryNote.trim() || undefined,
                                conditionNote.trim() || undefined,
                            )
                        }
                    >
                        Record what arrived
                    </Button>
                    <Button variant="ghost" onClick={onCancel}>
                        Back
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}