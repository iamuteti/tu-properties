'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileText, ReceiptText, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/entity-states';
import { Detail, Pill, SectionTitle, humanise } from './shared';
import { useOrgFormat } from '@/hooks/use-org-format';
import type { Agreement, CreditNote, CustomerCredit, Invoice, Receipt } from '@/types';

interface FinancialProps {
    agreements: Agreement[];
    receipts: Receipt[];
    creditNotes: CreditNote[];
    credits: CustomerCredit[];
    /** The currency this file's totals are in, taken from the records. */
    currency?: string;
    onViewReceipt: (receipt: Receipt) => void;
}

/**
 * Everything this resident owes, has paid and has been credited.
 *
 * The three tables are the ones a money conversation actually needs, in the order
 * it happens: what was billed, what was paid against it, and what was given back
 * or written off. An invoice row expands to show its own line items, because a
 * total with no breakdown is the number a resident disputes — "what am I paying
 * for?" is answered by the particulars, not by the total.
 */
export function TenantFinancialSection({
    agreements,
    receipts,
    creditNotes,
    credits,
    currency,
    onViewReceipt,
}: FinancialProps) {
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
    const fmt = useOrgFormat();

    const invoices = agreements.flatMap((a) =>
        (a.invoices ?? []).map((inv) => ({ invoice: inv, agreement: a })),
    );
    const payments = agreements.flatMap((a) =>
        (a.payments ?? []).map((p) => ({ payment: p, agreement: a })),
    );

    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.invoice.totalAmount ?? 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + Number(i.invoice.paidAmount ?? 0), 0);
    const totalOutstanding = invoices.reduce(
        (s, i) => s + Number(i.invoice.balanceAmount ?? 0),
        0,
    );
    const totalReceived = receipts.reduce((s, r) => s + Number(r.amountReceived ?? 0), 0);
    const openCredit = credits.reduce(
        (s, c) => s + (Number(c.amount ?? 0) - Number(c.appliedAmount ?? 0)),
        0,
    );

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Invoiced
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(totalInvoiced, currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            across {invoices.length} invoice(s)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Paid
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(totalPaid, currency)}</p>
                        <p className="text-sm text-muted-foreground">settled on invoices</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Outstanding
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p
                            className={`text-2xl font-semibold ${
                                totalOutstanding > 0 ? 'text-amber-700' : ''
                            }`}
                        >
                            {fmt.money(totalOutstanding, currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">unpaid balance</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cash received
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{fmt.money(totalReceived, currency)}</p>
                        <p className="text-sm text-muted-foreground">
                            {receipts.length} receipt(s) · credit {fmt.money(openCredit, currency)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Invoices */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Invoices
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {invoices.length === 0 ? (
                        <EmptyState
                            title="No invoices"
                            description="Nothing has been billed to this tenant."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3" />
                                        <th className="py-2 pr-3">Invoice</th>
                                        <th className="py-2 pr-3">Agreement</th>
                                        <th className="py-2 pr-3">Issued</th>
                                        <th className="py-2 pr-3">Due</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 pr-3 text-right">Amount</th>
                                        <th className="py-2 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map(({ invoice, agreement }) => {
                                        const open = expandedInvoice === invoice.id;
                                        return (
                                            <Fragment key={invoice.id}>
                                                <tr className="border-b last:border-0">
                                                    <td className="py-2 pr-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() =>
                                                                setExpandedInvoice(
                                                                    open ? null : invoice.id,
                                                                )
                                                            }
                                                            aria-label={
                                                                open
                                                                    ? 'Hide invoice breakdown'
                                                                    : 'Show invoice breakdown'
                                                            }
                                                            aria-expanded={open}
                                                        >
                                                            {open ? (
                                                                <ChevronDown className="h-4 w-4" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <Link
                                                            href={`/finance/invoices/${invoice.id}`}
                                                            className="font-medium hover:underline"
                                                        >
                                                            {invoice.invoiceNumber}
                                                        </Link>
                                                        {invoice.transactionClass && (
                                                            <span className="ml-2 text-xs text-muted-foreground">
                                                                {humanise(invoice.transactionClass)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 pr-3 text-muted-foreground">
                                                        {agreement.code ?? '—'}
                                                    </td>
                                                    <td className="py-2 pr-3 whitespace-nowrap">
                                                        {fmt.date(invoice.issueDate)}
                                                    </td>
                                                    <td className="py-2 pr-3 whitespace-nowrap">
                                                        {fmt.date(invoice.dueDate)}
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <Pill status={invoice.status} />
                                                    </td>
                                                    <td className="py-2 pr-3 text-right tabular-nums">
                                                        {fmt.money(invoice.totalAmount, invoice.currency)}
                                                    </td>
                                                    <td className="py-2 text-right tabular-nums">
                                                        {fmt.money(invoice.balanceAmount, invoice.currency)}
                                                    </td>
                                                </tr>
                                                {open && (
                                                    <tr className="border-b">
                                                        <td colSpan={8} className="bg-muted/30 px-3 py-3">
                                                            <InvoiceBreakdown invoice={invoice} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Receipts */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Receipts
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {receipts.length === 0 ? (
                        <EmptyState
                            title="No receipts"
                            description="No money has been received from this tenant."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Receipt</th>
                                        <th className="py-2 pr-3">Method</th>
                                        <th className="py-2 pr-3">Reference</th>
                                        <th className="py-2 pr-3">Date</th>
                                        <th className="py-2 pr-3">Particulars</th>
                                        <th className="py-2 pr-3 text-right">Amount</th>
                                        <th className="py-2 text-right" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {receipts.map((r) => (
                                        <tr key={r.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 font-medium">{r.receiptId}</td>
                                            <td className="py-2 pr-3">{humanise(r.paymentMethod)}</td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {r.refNo ?? r.paymentRefNo ?? '—'}
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {fmt.date(r.recordingDate)}
                                            </td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {(r.receiptLines ?? []).length} line(s)
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums font-medium">
                                                {fmt.money(r.amountReceived, r.currency)}
                                            </td>
                                            <td className="py-2 text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => onViewReceipt(r)}
                                                >
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payments */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Payments
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {payments.length === 0 ? (
                        <EmptyState
                            title="No payments recorded"
                            description="No payment has been applied to this tenant's invoices."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Date</th>
                                        <th className="py-2 pr-3">Invoice</th>
                                        <th className="py-2 pr-3">Method</th>
                                        <th className="py-2 pr-3">Reference</th>
                                        <th className="py-2 pr-3">Payee</th>
                                        <th className="py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map(({ payment }) => (
                                        <tr key={payment.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {fmt.date(payment.paymentDate)}
                                            </td>
                                            <td className="py-2 pr-3 font-mono text-xs">
                                                {payment.invoice?.invoiceNumber ?? 'On account'}
                                            </td>
                                            <td className="py-2 pr-3">
                                                {humanise(payment.paymentMethod)}
                                            </td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {payment.paymentReference ?? '—'}
                                            </td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {payment.payee ?? '—'}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {fmt.money(payment.amount, payment.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Credits and credit notes */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Customer credits</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {credits.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No credits are held for this tenant.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {credits.map((c) => (
                                    <div key={c.id} className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium">
                                                {c.reason ?? humanise(c.source)}
                                            </span>
                                            <Pill status={c.status} />
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {fmt.money(c.amount, c.currency)} raised ·{' '}
                                            {fmt.amount(c.appliedAmount)} applied
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {fmt.date(c.createdAt)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Credit notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {creditNotes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No credit notes have been issued to this tenant.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="py-2 pr-3">Number</th>
                                            <th className="py-2 pr-3">Issued</th>
                                            <th className="py-2 pr-3">Status</th>
                                            <th className="py-2 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {creditNotes.map((c) => (
                                            <tr key={c.id} className="border-b last:border-0">
                                                <td className="py-2 pr-3 font-medium">
                                                    {c.creditNoteNumber}
                                                </td>
                                                <td className="py-2 pr-3 whitespace-nowrap">
                                                    {fmt.date(c.issueDate)}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    <Pill status={c.status} />
                                                </td>
                                                <td className="py-2 text-right tabular-nums">
                                                    {fmt.money(c.totalAmount, c.currency)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/** The line items behind one invoice, plus what has been paid against it. */
function InvoiceBreakdown({ invoice }: { invoice: Invoice }) {
    const fmt = useOrgFormat();
    const items = invoice.invoiceItems ?? [];
    return (
        <div className="space-y-3">
            <SectionTitle>Invoice breakdown</SectionTitle>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    This invoice has no line items recorded against it.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border bg-background">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="py-2 px-3">Description</th>
                                <th className="py-2 px-3 text-right">Qty</th>
                                <th className="py-2 px-3 text-right">Unit price</th>
                                <th className="py-2 px-3 text-right">VAT</th>
                                <th className="py-2 px-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id} className="border-b last:border-0">
                                    <td className="py-2 px-3">{item.description}</td>
                                    <td className="py-2 px-3 text-right tabular-nums">
                                        {fmt.amount(item.quantity)}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums">
                                        {fmt.amount(item.unitPrice)}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                                        {item.vatAmount != null ? fmt.amount(item.vatAmount) : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                                        {fmt.amount(item.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Detail label="Total" value={fmt.money(invoice.totalAmount, invoice.currency)} />
                <Detail label="Paid" value={fmt.money(invoice.paidAmount, invoice.currency)} />
                <Detail label="Balance" value={fmt.money(invoice.balanceAmount, invoice.currency)} />
                <Detail label="Due date" value={fmt.date(invoice.dueDate)} />
            </div>

            {invoice.memo && (
                <p className="text-sm text-muted-foreground">Memo: {invoice.memo}</p>
            )}
        </div>
    );
}
