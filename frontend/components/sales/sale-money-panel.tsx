'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { useUsers } from '@/hooks/use-users';
import { salesApi } from '@/lib/api';
import type { Sale } from '@/types';

/**
 * Payment schedule + commission split for one sale.
 *
 * Both live on the detail page because they are money decisions taken together:
 * the instalment plan decides what is billed, the commission split decides what
 * the sale earns its agents. The split must add up to 100% — the server enforces
 * it and rejects anything else, so the form shows the total as you type.
 */
export function SaleMoneyPanel({ sale, onChanged }: { sale: Sale; onChanged: () => void | Promise<void> }) {
    const { users } = useUsers();
    const installments = sale.installments ?? [];
    const invoicedCount = installments.filter((i) => i.invoiceId).length;

    const [count, setCount] = useState(4);
    const [firstDueDate, setFirstDueDate] = useState(nextMonth());
    const [upfrontAmount, setUpfrontAmount] = useState('');
    const [isPlanning, setIsPlanning] = useState(false);

    const [rate, setRate] = useState(String(sale.commissionRate ?? ''));
    const [splits, setSplits] = useState<Array<{ agentUserId: string; splitPercentage: number }>>(
        sale.agentUserId ? [{ agentUserId: sale.agentUserId, splitPercentage: 100 }] : [],
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

    const splitTotal = splits.reduce((sum, split) => sum + Number(split.splitPercentage || 0), 0);
    const currency = sale.currency ?? 'KES';

    const plan = async () => {
        setIsPlanning(true);
        try {
            const response = await salesApi.createInstallmentPlan(sale.id, {
                installments: count,
                firstDueDate,
                ...(upfrontAmount ? { upfrontAmount: Number(upfrontAmount) } : {}),
            });
            toast.success(`Schedule created with ${response.data.length} instalment(s)`);
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not create the schedule.');
        } finally {
            setIsPlanning(false);
        }
    };

    const invoice = async (installmentId: string) => {
        try {
            await salesApi.invoiceInstallment(sale.id, installmentId);
            toast.success('Invoice raised');
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not raise the invoice.');
        }
    };

    const refresh = async () => {
        try {
            const response = await salesApi.refreshInstallments(sale.id);
            setRefreshMessage(
                response.data.updated === 0
                    ? 'Instalments already match the recorded payments.'
                    : `${response.data.updated} instalment(s) updated from payments.`,
            );
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Refresh failed.');
        }
    };

    const generateCommissions = async () => {
        setIsGenerating(true);
        try {
            const response = await salesApi.generateCommissions(sale.id, {
                ...(rate ? { commissionRate: Number(rate) } : {}),
                participants: splits
                    .filter((split) => split.agentUserId)
                    .map((split) => ({
                        agentUserId: split.agentUserId,
                        splitPercentage: Number(split.splitPercentage),
                    })),
            });
            toast.success(
                `${currency} ${Number(response.data.total).toLocaleString()} commission created`,
            );
            await onChanged();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Could not create the commissions.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Payment schedule</h3>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={refresh}>
                            Re-check payments
                        </Button>
                        <Button
                            size="sm"
                            onClick={plan}
                            disabled={isPlanning || invoicedCount > 0 || installments.length > 0}
                            title={
                                invoicedCount > 0
                                    ? 'Cancel the invoices first before re-planning'
                                    : undefined
                            }
                        >
                            {isPlanning ? 'Planning…' : 'Create schedule'}
                        </Button>
                    </div>
                </div>

                {invoicedCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {invoicedCount} instalment(s) already invoiced — cancel those invoices before
                        re-planning.
                    </p>
                )}
                {refreshMessage && (
                    <p className="mt-1 text-xs text-muted-foreground">{refreshMessage}</p>
                )}

                {installments.length === 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-4">
                        <Field label="Number of instalments" id="plan-count">
                            <Input
                                id="plan-count"
                                type="number"
                                min={1}
                                max={24}
                                value={count}
                                onChange={(e) => setCount(Number(e.target.value))}
                            />
                        </Field>
                        <Field label="First due date" id="plan-first-due">
                            <Input
                                id="plan-first-due"
                                type="date"
                                value={firstDueDate}
                                onChange={(e) => setFirstDueDate(e.target.value)}
                            />
                        </Field>
                        <Field label={`Up-front amount (${currency})`} id="plan-upfront">
                            <Input
                                id="plan-upfront"
                                type="number"
                                min={0}
                                placeholder="Deposit or booking fee"
                                value={upfrontAmount}
                                onChange={(e) => setUpfrontAmount(e.target.value)}
                            />
                        </Field>
                        <div className="flex items-end">
                            <span className="text-xs text-muted-foreground">
                                Split evenly, one month apart.
                            </span>
                        </div>
                    </div>
                )}

                {installments.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">Description</th>
                                    <th className="px-3 py-2">Due</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2 text-right">Invoice</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {installments.map((installment) => (
                                    <tr key={installment.id}>
                                        <td className="px-3 py-2">{installment.sequence}</td>
                                        <td className="px-3 py-2">{installment.description}</td>
                                        <td className="px-3 py-2">
                                            {new Date(installment.dueDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {currency} {Number(installment.amount).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2">
                                            <InstalmentBadge status={installment.status} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {installment.invoice ? (
                                                <a
                                                    href={`/finance/invoices/${installment.invoice.id}`}
                                                    className="text-xs text-sky-700 hover:underline"
                                                >
                                                    {installment.invoice.invoiceNumber}
                                                </a>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => invoice(installment.id)}
                                                >
                                                    Raise invoice
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="border-t pt-4">
                <h3 className="text-sm font-semibold">Commission split</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                    Earned on the agreed price. Splits must add up to 100%.
                </p>

                <div className="mt-3 space-y-2">
                    {splits.map((split, index) => (
                        <div key={index} className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[200px] flex-1">
                                <label className="mb-1 block text-xs font-medium">Agent</label>
                                <Select
                                    value={split.agentUserId}
                                    onChange={(e) =>
                                        setSplits((current) =>
                                            current.map((row, i) =>
                                                i === index
                                                    ? { ...row, agentUserId: e.target.value }
                                                    : row,
                                            ),
                                        )
                                    }
                                >
                                    <option value="">Select agent</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
                                                user.email}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div className="w-28">
                                <label className="mb-1 block text-xs font-medium">Share %</label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={split.splitPercentage}
                                    onChange={(e) =>
                                        setSplits((current) =>
                                            current.map((row, i) =>
                                                i === index
                                                    ? {
                                                          ...row,
                                                          splitPercentage: Number(e.target.value),
                                                      }
                                                    : row,
                                            ),
                                        )
                                    }
                                />
                            </div>
                            <button
                                type="button"
                                className="mb-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Remove split"
                                onClick={() =>
                                    setSplits((current) => current.filter((_, i) => i !== index))
                                }
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setSplits((current) => [
                                ...current,
                                { agentUserId: '', splitPercentage: 0 },
                            ])
                        }
                    >
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Add agent
                    </Button>

                    <div className="w-32">
                        <label className="mb-1 block text-xs font-medium">Commission rate %</label>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                        />
                    </div>

                    <span
                        className={`text-sm font-medium ${
                            Math.abs(splitTotal - 100) > 0.01 ? 'text-red-600' : 'text-green-700'
                        }`}
                    >
                        Splits total {splitTotal}%
                    </span>

                    <Button
                        size="sm"
                        onClick={generateCommissions}
                        disabled={
                            isGenerating ||
                            splits.length === 0 ||
                            Math.abs(splitTotal - 100) > 0.01 ||
                            !rate
                        }
                    >
                        {isGenerating ? 'Creating…' : 'Generate commissions'}
                    </Button>
                </div>

                {(sale.commissions ?? []).length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">Agent</th>
                                    <th className="px-3 py-2 text-right">Share</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">Paid ref</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(sale.commissions ?? []).map((commission) => (
                                    <tr key={commission.id}>
                                        <td className="px-3 py-2">
                                            {`${commission.agent.firstName} ${commission.agent.lastName}`.trim()}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {commission.splitPercentage != null
                                                ? `${commission.splitPercentage}%`
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {currency} {Number(commission.amount).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                                {commission.status.charAt(0) +
                                                    commission.status.slice(1).toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            {commission.paidRef ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium">
                {label}
            </label>
            {children}
        </div>
    );
}

function InstalmentBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        SCHEDULED: 'bg-slate-100 text-slate-700',
        INVOICED: 'bg-amber-100 text-amber-800',
        PAID: 'bg-green-100 text-green-800',
        OVERDUE: 'bg-red-100 text-red-800',
        WAIVED: 'bg-gray-200 text-gray-700',
    };
    return (
        <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                styles[status] ?? 'bg-slate-100 text-slate-700'
            }`}
        >
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}

function nextMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 10);
}