'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Banknote,
    Ban,
    Download,
    FileText,
    Printer,
    Send,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOwnerStatement } from '@/hooks/use-owner-statements';
import { landlordPayoutsApi, ownerStatementsApi } from '@/lib/api';
import { CHARGE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { StatementSummary } from '@/components/landlords/statement-summary';
import { StatementStatusBadge } from '@/components/landlords/statement-status-badge';
import { PayoutFormDialog } from '@/components/landlords/payout-form-dialog';
import { PayoutStatusBadge } from '@/components/landlords/payout-status-dialog';
import type { PayoutStatus } from '@/types';

const money = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const categoryLabel = (value: string) =>
    CHARGE_CATEGORIES.find((option) => option.value === value)?.label ?? value;

const methodLabel = (value: string) =>
    PAYMENT_METHODS.find((option) => option.value === value)?.label ?? value;

/**
 * Owner statement detail (Module 6).
 *
 * The statement is a frozen document: it carries the lines it was generated
 * from, not a live recalculation. The available actions follow that — a draft
 * can be deleted, an issued one can only be voided, and a settled one is done.
 */
export default function OwnerStatementDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const { statement, isLoading, error, refetch } = useOwnerStatement(id);
    const [isWorking, setIsWorking] = useState(false);
    const [isVoidOpen, setIsVoidOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isPayoutOpen, setIsPayoutOpen] = useState(false);
    const [voidReason, setVoidReason] = useState('');

    const run = async (action: () => Promise<void>) => {
        setIsWorking(true);
        try {
            await action();
        } finally {
            setIsWorking(false);
        }
    };

    const handleIssue = () =>
        run(async () => {
            try {
                await ownerStatementsApi.issue(statement!.id);
                toast.success('Statement issued — the figures are now fixed');
                await refetch();
            } catch (err) {
                toast.error(message(err, 'Could not issue the statement'));
            }
        });

    const handleVoid = () =>
        run(async () => {
            try {
                await ownerStatementsApi.void(statement!.id, voidReason.trim() || undefined);
                toast.success('Statement voided; its charges are available again');
                setIsVoidOpen(false);
                setVoidReason('');
                await refetch();
            } catch (err) {
                toast.error(message(err, 'Could not void the statement'));
            }
        });

    const handleDelete = () =>
        run(async () => {
            try {
                await ownerStatementsApi.remove(statement!.id);
                toast.success('Draft statement deleted');
                router.push('/landlords/statements');
            } catch (err) {
                toast.error(message(err, 'Could not delete the statement'));
                setIsDeleteOpen(false);
            }
        });

    const markPayout = (payoutId: string, status: PayoutStatus, reference?: string) =>
        run(async () => {
            try {
                await landlordPayoutsApi.updateStatus(payoutId, { status, reference });
                toast.success(`Payout marked ${status.toLowerCase()}`);
                await refetch();
            } catch (err) {
                toast.error(message(err, 'Could not update the payout'));
            }
        });

    if (isLoading) return <LoadingState label="Loading statement…" />;
    if (error) return <ErrorState message={error} onRetry={refetch} />;
    if (!statement) return null;

    const isDraft = statement.status === 'DRAFT';
    const isVoid = statement.status === 'VOID';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/landlords/statements')}
                        className="mb-2 -ml-2"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Owner statements
                    </Button>
                    <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
                        {statement.statementNumber}
                        <StatementStatusBadge status={statement.status} />
                    </h1>
                    <p className="text-muted-foreground">
                        {statement.landlord?.name ?? 'Landlord'} ·{' '}
                        {statement.periodStart.slice(0, 10)} – {statement.periodEnd.slice(0, 10)}
                        {statement.issuedAt
                            ? ` · issued ${statement.issuedAt.slice(0, 10)}`
                            : ' · not yet issued'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() =>
                            window.open(ownerStatementsApi.documentUrl(statement.id), '_blank')
                        }
                    >
                        <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                        Print / PDF
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const url = ownerStatementsApi.documentUrl(statement.id, true);
                            const link = document.createElement('a');
                            link.href = url;
                            link.click();
                        }}
                    >
                        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                        Download
                    </Button>

                    {isDraft && (
                        <Button
                            variant="outline"
                            onClick={handleIssue}
                            disabled={isWorking}
                        >
                            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                            Issue
                        </Button>
                    )}

                    {!isVoid && statement.status !== 'SETTLED' && (
                        <Button variant="outline" onClick={() => setIsVoidOpen(true)}>
                            <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                            Void
                        </Button>
                    )}

                    {isDraft && (
                        <Button
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setIsDeleteOpen(true)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                            Delete
                        </Button>
                    )}

                    {!isVoid && statement.outstandingAmount > 0 && (
                        <Button onClick={() => setIsPayoutOpen(true)}>
                            <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
                            Record payout
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-base">Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatementSummary values={statement} currency={statement.currency} />
                        {statement.notes && (
                            <div className="mt-4 border-t pt-3 text-sm">
                                <p className="text-muted-foreground">Notes</p>
                                <p className="whitespace-pre-wrap">{statement.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Rental income collected ({statement.incomeLines.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {statement.incomeLines.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No rent was collected in this period, so nothing is payable.
                            </p>
                        ) : (
                            <LineTable
                                headers={['Invoice', 'Property', 'Date', 'Amount']}
                                rows={statement.incomeLines.map((line) => [
                                    <span key="ref" className="font-mono text-xs">{line.ref}</span>,
                                    line.property ?? '—',
                                    line.paymentDate,
                                    money(line.amount),
                                ])}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Expenses charged ({statement.expenseLines.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {statement.expenseLines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No costs were charged to the owner in this period.
                        </p>
                    ) : (
                        <LineTable
                            headers={['Category', 'Description', 'Property', 'Date', 'Amount']}
                            rows={statement.expenseLines.map((line) => [
                                categoryLabel(line.category),
                                line.description,
                                line.property ?? '—',
                                line.chargeDate,
                                money(line.amount),
                            ])}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        Payouts against this statement
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {statement.payouts && statement.payouts.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Recorded</th>
                                        <th className="py-2 pr-3">Method</th>
                                        <th className="py-2 pr-3">Reference</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 text-right">Amount</th>
                                        <th className="py-2 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statement.payouts.map((payout) => (
                                        <tr key={payout.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {payout.createdAt?.slice(0, 10)}
                                            </td>
                                            <td className="py-2 pr-3">{methodLabel(payout.method)}</td>
                                            <td className="py-2 pr-3">{payout.reference || '—'}</td>
                                            <td className="py-2 pr-3">
                                                <PayoutStatusBadge status={payout.status} />
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {money(payout.amount)}
                                            </td>
                                            <td className="py-2 text-right">
                                                {payout.status === 'PENDING' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={isWorking}
                                                        onClick={() =>
                                                            markPayout(
                                                                payout.id,
                                                                'PROCESSING',
                                                            )
                                                        }
                                                    >
                                                        Mark processing
                                                    </Button>
                                                )}
                                                {payout.status === 'PROCESSING' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={isWorking}
                                                        onClick={() => {
                                                            const reference =
                                                                window.prompt(
                                                                    'Transfer reference',
                                                                ) ?? '';
                                                            if (reference.trim()) {
                                                                markPayout(
                                                                    payout.id,
                                                                    'PAID',
                                                                    reference.trim(),
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Mark paid
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Nothing has been paid against this statement yet.
                        </p>
                    )}
                </CardContent>
            </Card>

            <PayoutFormDialog
                isOpen={isPayoutOpen}
                onClose={() => setIsPayoutOpen(false)}
                landlordId={statement.landlordId}
                landlordName={statement.landlord?.name}
                statement={statement}
                onRecorded={refetch}
            />

            <ConfirmDialog
                isOpen={isVoidOpen}
                onClose={() => setIsVoidOpen(false)}
                onConfirm={handleVoid}
                title="Void this statement?"
                message="It stays on record as void, and the charges it used become available for a corrected statement. This cannot be undone."
                confirmText="Void statement"
            >
                <div className="mt-3 space-y-2">
                    <label htmlFor="void-reason" className="text-sm font-medium">
                        Reason (recorded on the statement)
                    </label>
                    <input
                        id="void-reason"
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="e.g. Wrong period — March figures were restated"
                    />
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDelete}
                title="Delete this draft?"
                message="A draft was never sent to the owner, so it can be removed. The charges it used become available again."
                confirmText="Delete draft"
            />
        </div>
    );
}

function message(err: unknown, fallback: string): string {
    const value = (err as { response?: { data?: { message?: string | string[] } } })?.response
        ?.data?.message;
    return Array.isArray(value) ? value.join('. ') : value ?? fallback;
}

function LineTable({
    headers,
    rows,
}: {
    headers: string[];
    rows: React.ReactNode[][];
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        {headers.map((header, index) => (
                            <th
                                key={header}
                                className={
                                    index === headers.length - 1
                                        ? 'py-2 text-right'
                                        : 'py-2 pr-3'
                                }
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b last:border-0">
                            {row.map((cell, cellIndex) => (
                                <td
                                    key={cellIndex}
                                    className={
                                        cellIndex === row.length - 1
                                            ? 'py-2 text-right tabular-nums'
                                            : 'py-2 pr-3'
                                    }
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}