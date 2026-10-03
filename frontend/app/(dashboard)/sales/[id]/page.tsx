"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, FileText, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { SaleStageActions } from "@/components/sales/sale-stage-actions";
import { SaleMoneyPanel } from "@/components/sales/sale-money-panel";
import { SALE_STAGES } from "@/lib/constants";
import { salesApi } from "@/lib/api";
import type { Sale } from "@/types";

export default function SaleDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [sale, setSale] = useState<Sale | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const loadSale = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await salesApi.findSale(id);
            setSale(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? 'Sale not found. It may have been deleted.'
                    : err.response?.data?.message || 'Failed to load the sale.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadSale();
    }, [loadSale]);

    const handleDelete = async () => {
        if (!sale) return;
        if (!confirm(`Delete sale ${sale.code}? This cannot be undone.`)) return;
        setIsBusy(true);
        try {
            await salesApi.removeSale(sale.id);
            toast.success('Sale deleted');
            router.push('/sales');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to delete the sale.');
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading sale…" />;
    if (error || !sale) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" size="icon" onClick={() => router.push('/sales')} aria-label="Back to sales">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || 'Sale not found.'} onRetry={loadSale} />
            </div>
        );
    }

    const currency = sale.currency ?? 'KES';
    const money = sale.money ?? {
        agreedPrice: Number(sale.agreedPrice ?? 0),
        scheduled: 0,
        outstanding: 0,
        commission: 0,
    };
    const invoiced = (sale.installments ?? []).filter((i) => i.invoiceId).length;
    const paid = (sale.installments ?? []).filter((i) => i.status === 'PAID').length;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/sales')} aria-label="Back to sales">
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">{sale.code}</h1>
                            <StatusBadge status={sale.stage} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {sale.propertyTitle ?? sale.property?.name}
                            {sale.property && (
                                <>
                                    {' · '}
                                    <Link href={`/properties/${sale.property.id}`} className="hover:underline">
                                        View property
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => router.push(`/sales/${sale.id}/edit`)} disabled={isBusy}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isBusy || sale.stage === 'HANDOVER'}
                        title={sale.stage === 'HANDOVER' ? 'A completed sale cannot be deleted' : undefined}
                    >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Agreed price</p>
                        <p className="mt-1 text-2xl font-bold">
                            {currency} {Number(money.agreedPrice).toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
                        <p
                            className={`mt-1 text-2xl font-bold ${
                                money.outstanding > 0 ? 'text-red-600' : 'text-green-700'
                            }`}
                        >
                            {currency} {Number(money.outstanding).toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</p>
                        <p className="mt-1 text-2xl font-bold">
                            {paid}/{sale.installments?.length ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            paid · {invoiced} invoiced
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Commission</p>
                        <p className="mt-1 text-2xl font-bold">
                            {currency} {Number(money.commission).toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pipeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ol className="flex flex-wrap items-center gap-2 text-xs">
                        {SALE_STAGES.filter((stage) => stage.value !== 'CANCELLED').map((stage, index) => {
                            const reached = SALE_STAGES.findIndex(
                                (s) => s.value === sale.stage,
                            ) >= index;
                            return (
                                <li key={stage.value} className="flex items-center gap-2">
                                    <span
                                        className={`rounded-full px-2.5 py-1 font-medium ${
                                            reached
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {stage.label}
                                    </span>
                                    {index < SALE_STAGES.filter((s) => s.value !== 'CANCELLED').length - 1 && (
                                        <span className="text-slate-300">→</span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    <SaleStageActions sale={sale} onChanged={loadSale} />

                    {sale.cancellationReason && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                            Cancelled: {sale.cancellationReason}
                        </p>
                    )}

                    <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm md:grid-cols-4">
                        <StageDate label="Quotation" value={sale.quotationDate} />
                        <StageDate label="Offer" value={sale.offerDate} />
                        <StageDate label="Reservation" value={sale.reservationDate} />
                        <StageDate label="Agreement" value={sale.agreementDate} />
                        <StageDate label="Payment" value={sale.paymentDate} />
                        <StageDate label="Handover" value={sale.handoverDate} />
                    </dl>
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Parties</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <Detail
                            label="Buyer"
                            value={
                                sale.buyerContact
                                    ? `${sale.buyerContact.firstName} ${sale.buyerContact.lastName ?? ''}`.trim()
                                    : undefined
                            }
                            href={sale.buyerContact ? `/crm/contacts/${sale.buyerContact.id}` : undefined}
                        />
                        <Detail
                            label="Agent"
                            value={sale.agent ? `${sale.agent.firstName} ${sale.agent.lastName}` : undefined}
                        />
                        <Detail
                            label="From lead"
                            value={
                                sale.lead
                                    ? `${sale.lead.firstName} ${sale.lead.lastName ?? ''}`.trim()
                                    : undefined
                            }
                            href={sale.lead ? `/crm/leads/${sale.lead.id}` : undefined}
                        />
                        <Detail label="Asking price" value={formatMoney(sale.askingPrice, currency)} />
                        <Detail label="Booking fee" value={formatMoney(sale.bookingFee, currency)} />
                        <Detail label="Deposit" value={formatMoney(sale.depositAmount, currency)} />
                        <Detail label="Commission rate" value={sale.commissionRate != null ? `${sale.commissionRate}%` : undefined} />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {sale.notes || 'No notes recorded.'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Payment schedule &amp; commissions</CardTitle>
                </CardHeader>
                <CardContent>
                    {sale.agreedPrice == null && (sale.installments ?? []).length === 0 ? (
                        <EmptyState
                            title="No money set up yet"
                            description="Record the agreed price, then create a payment schedule and the commission split."
                            icon={<FileText className="h-10 w-10" aria-hidden="true" />}
                            action={
                                <Button onClick={() => router.push(`/sales/${sale.id}/edit`)}>
                                    Edit the sale
                                </Button>
                            }
                        />
                    ) : (
                        <SaleMoneyPanel sale={sale} onChanged={loadSale} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function StageDate({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value ? new Date(value).toLocaleDateString() : '—'}</dd>
        </div>
    );
}

function Detail({
    label,
    value,
    href,
}: {
    label: string;
    value?: string | null;
    href?: string;
}) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            {href && value ? (
                <Link href={href} className="font-medium hover:underline">
                    {value}
                </Link>
            ) : (
                <p className="font-medium">{value || '—'}</p>
            )}
        </div>
    );
}

function formatMoney(value: number | string | null | undefined, currency: string) {
    if (value === null || value === undefined || value === '') return undefined;
    return `${currency} ${Number(value).toLocaleString()}`;
}