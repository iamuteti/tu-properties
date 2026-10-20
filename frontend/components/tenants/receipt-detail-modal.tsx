'use client';

import { Download, Printer, ReceiptText, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/entity-states';
import { tenantsApi } from '@/lib/api';
import { paymentMethodLabel } from '@/lib/constants';
import { useOrgFormat } from '@/hooks/use-org-format';
import type { Receipt } from '@/types';

const humanise = (value: string | null | undefined) =>
    value ? value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : '—';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="font-medium text-sm break-words">{value ?? '—'}</div>
        </div>
    );
}

/**
 * A receipt in full.
 *
 * The row on the tenant's page says an amount, a date and a method, which is
 * enough to recognise a receipt and not enough to check one. This modal shows the
 * two things that make a receipt a document: the **particulars** - which invoice
 * was settled, what was owed before, what it became after - and the **applied
 * payments**, each with its own method and reference.
 *
 * Print and download both point at the server-rendered document, so what the
 * resident is handed is the same HTML the screen describes, with a print stylesheet
 * that turns it into a PDF. There is no PDF library in this stack and the browser
 * already knows how to do this.
 */
export function ReceiptDetailModal({
    receipt,
    tenantId,
    isOpen,
    onClose,
}: {
    receipt: Receipt | null;
    tenantId: string;
    isOpen: boolean;
    onClose: () => void;
}) {
    const fmt = useOrgFormat();

    if (!receipt) return null;

    const currency = receipt.currency ?? 'KES';
    const lines = receipt.receiptLines ?? [];
    const payments = receipt.payments ?? [];
    const appliedTotal = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const onAccount = Math.max(0, Number(receipt.amountReceived ?? 0) - appliedTotal);

    const documentUrl = (download: boolean) =>
        tenantsApi.receiptDocumentUrl(tenantId, receipt.id, download);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Receipt ${receipt.receiptId}`} size="xl">
            <div className="space-y-6">
                {/* Headline */}
                <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Amount received
                        </p>
                        <p className="text-2xl font-semibold">
                            {fmt.money(receipt.amountReceived, currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Received {fmt.date(receipt.recordingDate)} by{' '}
                            {paymentMethodLabel(receipt.paymentMethod)}
                        </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                        <p>
                            <span className="font-medium text-foreground">
                                {humanise(receipt.receiptCategory)}
                            </span>{' '}
                            · {humanise(receipt.receiptType)}
                        </p>
                        {receipt.refNo && <p>Ref {receipt.refNo}</p>}
                        {receipt.paymentRefNo && <p>Payment ref {receipt.paymentRefNo}</p>}
                    </div>
                </div>

                {/* Payment details */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Row label="Received from" value={receipt.receivedFrom} />
                    <Row label="Payment method" value={paymentMethodLabel(receipt.paymentMethod)} />
                    <Row label="Currency" value={currency} />
                    {receipt.chequeNo && (
                        <Row
                            label="Cheque"
                            value={`${receipt.chequeNo} — ${fmt.date(receipt.chequeDate)}`}
                        />
                    )}
                    {receipt.paymentBank && <Row label="Bank" value={receipt.paymentBank} />}
                    {receipt.depositIntoAc && (
                        <Row label="Deposited into" value={receipt.depositIntoAc} />
                    )}
                    {receipt.recordDate && <Row label="Received on" value={fmt.date(receipt.recordDate)} />}
                    {receipt.bankingDate && <Row label="Banked on" value={fmt.date(receipt.bankingDate)} />}
                    <Row
                        label="VAT inclusive"
                        value={receipt.amountVatInclusive === false ? 'No' : 'Yes'}
                    />
                    <Row label="Receipt to" value={humanise(receipt.receiptTo)} />
                </div>

                {/* Particulars */}
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Particulars
                    </h3>
                    {lines.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            This receipt carries no particulars — it was recorded on account and not
                            applied to an invoice.
                        </p>
                    ) : (
                        <div className="mt-2 overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Invoice</th>
                                        <th className="py-2 px-3">Particular</th>
                                        <th className="py-2 px-3 text-right">Invoice total</th>
                                        <th className="py-2 px-3 text-right">Previously paid</th>
                                        <th className="py-2 px-3 text-right">Amount due</th>
                                        <th className="py-2 px-3 text-right">Payment</th>
                                        <th className="py-2 px-3 text-right">New balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line, index) => (
                                        <tr key={line.id ?? index} className="border-b last:border-0">
                                            <td className="whitespace-nowrap py-2 px-3">
                                                {fmt.date(line.date)}
                                            </td>
                                            <td className="py-2 px-3 font-mono text-xs">
                                                {line.invNo ?? '—'}
                                            </td>
                                            <td className="py-2 px-3">{line.particular}</td>
                                            <td className="py-2 px-3 text-right tabular-nums">
                                                {fmt.amount(line.invoiceTotal)}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                                                {fmt.amount(line.prevReceipts)}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums">
                                                {fmt.amount(line.amtDue)}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                                {fmt.amount(line.payment)}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums">
                                                {fmt.amount(line.newBalance)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Applied payments */}
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Applied payments
                    </h3>
                    {payments.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            No payments were applied to this receipt.
                        </p>
                    ) : (
                        <div className="mt-2 overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Applied to</th>
                                        <th className="py-2 px-3">Method</th>
                                        <th className="py-2 px-3">Reference</th>
                                        <th className="py-2 px-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="border-b last:border-0">
                                            <td className="whitespace-nowrap py-2 px-3">
                                                {fmt.date(payment.paymentDate)}
                                            </td>
                                            <td className="py-2 px-3 font-mono text-xs">
                                                {payment.invoice?.invoiceNumber ?? 'On account'}
                                            </td>
                                            <td className="py-2 px-3">
                                                {paymentMethodLabel(payment.paymentMethod)}
                                            </td>
                                            <td className="py-2 px-3 text-muted-foreground">
                                                {payment.paymentReference ?? '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                                {fmt.amount(payment.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Totals */}
                <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Total received</span>
                        <span className="tabular-nums">
                            {fmt.money(receipt.amountReceived, currency)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Applied to invoices</span>
                        <span className="tabular-nums">{fmt.money(appliedTotal, currency)}</span>
                    </div>
                    {onAccount > 0 && (
                        <div className="flex justify-between text-amber-700">
                            <span>On account</span>
                            <span className="tabular-nums">{fmt.money(onAccount, currency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between border-t pt-1 text-base font-semibold">
                        <span>Amount received</span>
                        <span className="tabular-nums">
                            {fmt.money(receipt.amountReceived, currency)}
                        </span>
                    </div>
                </div>

                {(receipt.memo || receipt.notes) && (
                    <div>
                        <h3 className="text-sm font-semibold">Notes</h3>
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                            {receipt.memo || receipt.notes}
                        </p>
                    </div>
                )}

                {lines.length === 0 && payments.length === 0 && (
                    <EmptyState
                        title="Nothing recorded against this receipt"
                        description="There are no particulars and no applied payments, so there is no breakdown to show."
                    />
                )}

                {/* Actions */}
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button variant="outline" onClick={() => window.open(documentUrl(false), '_blank')}>
                        <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                        Print / PDF
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const link = document.createElement('a');
                            link.href = documentUrl(true);
                            link.click();
                        }}
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Download
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
