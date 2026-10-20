'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Banknote, Check, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useOrgFormat } from '@/hooks/use-org-format';
import { useTenants } from '@/hooks/use-tenants';
import { financeApi, tenantsApi } from '@/lib/api';
import { CURRENCIES, PAYMENT_METHODS } from '@/lib/constants';
import type { Agreement, Invoice, PaymentMethodValue, Tenant } from '@/types';

/**
 * Capture Manually.
 *
 * Money arrives in ways no automation can see: a tenant walks into the office
 * with an envelope of cash, a tenant pays the owner directly because the
 * owner's bank details were easier, a caretaker collects from three flats at
 * once. The capture is the moment somebody says "this much, from this person,
 * this way" and the system writes it down as a receipt.
 *
 * **The method dropdown is the point of this screen.** The old way to record
 * this was to pick the nearest instrument, which meant that money the tenant
 * paid straight to the owner was filed as "cash" — a receipt that says the
 * estate is holding money it has never seen, and a ledger that agrees with the
 * receipt and is wrong in the same way. So the dropdown says what actually
 * happened, and `DIRECT_REMIT` is a method of its own: the money bypassed the
 * estate, and the ledger books it as money the owner owes us rather than as
 * cash we hold.
 */

interface CaptureManuallyFormProps {
    /**
     * Lock the capture to one tenant. Set when the form is opened from a
     * resident's file; left off when somebody captures on behalf of a tenant
     * they pick here.
     */
    tenantId?: string;
    /** The locked tenant's name, for the heading. */
    tenantName?: string;
}

/** An invoice that can still receive money. */
function isOpen(invoice: Invoice): boolean {
    return (
        invoice.status !== 'PAID' &&
        invoice.status !== 'CANCELLED' &&
        Number(invoice.balanceAmount ?? 0) > 0
    );
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * The tenant picker.
 *
 * Its own component so that the list of every resident is fetched **only**
 * when somebody has to pick one. Opened from a resident's file the tenant is
 * already known, and pulling the whole register of residents to show a
 * dropdown nobody can use is a request nobody asked for.
 */
function TenantPicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (tenantId: string) => void;
}) {
    const { tenants } = useTenants({ limit: 1000 });

    return (
        <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium leading-none">Tenant</label>
            <Select
                options={[
                    { value: '', label: 'Select a tenant' },
                    ...tenants.map((t) => ({
                        value: t.id,
                        label: `${t.surname} ${t.otherNames ?? ''}`.trim(),
                    })),
                ]}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                search
            />
        </div>
    );
}

export function CaptureManuallyForm({ tenantId: lockedTenantId, tenantName: lockedTenantName }: CaptureManuallyFormProps) {
    const router = useRouter();
    const fmt = useOrgFormat();
    const { user } = useAuth();

    const [tenantId, setTenantId] = useState(lockedTenantId ?? '');
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [agreementId, setAgreementId] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('CASH');
    const [currency, setCurrency] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    /**
     * Invoice id -> the amount of this capture applied to it.
     */
    const [applied, setApplied] = useState<Record<string, number>>({});
    const [onAccountAmount, setOnAccountAmount] = useState('0');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // The tenant's file is the source of their agreements and the invoices on
    // them, so it is the one call this form needs.
    useEffect(() => {
        if (!tenantId) {
            setTenant(null);
            return;
        }
        // Clear the previous resident straight away. Otherwise the tenancy
        // dropdown keeps offering the last resident's tenancies under the new
        // resident's name until the fetch lands, and a pick made in that
        // window is silently discarded.
        setTenant(null);
        let cancelled = false;
        (async () => {
            try {
                const response = await tenantsApi.findOne(tenantId);
                if (!cancelled) setTenant(response.data);
            } catch (err: unknown) {
                if (!cancelled) {
                    const e = err as { response?: { data?: { message?: string } } };
                    setError(e.response?.data?.message || 'Failed to load the tenant.');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    const agreements = useMemo<Agreement[]>(
        () => (tenant?.agreements ?? []).filter((a) => a.status === 'ACTIVE'),
        [tenant],
    );

    // A new tenant invalidates everything the last one had selected.
    useEffect(() => {
        setAgreementId('');
        setApplied({});
        setOnAccountAmount('0');
    }, [tenantId]);

    // Default to the tenant's active tenancy, and the currency of that tenancy
    // — a lease denominated in USD is in USD whatever the organization's
    // default happens to be.
    useEffect(() => {
        if (!agreements.length) {
            setAgreementId('');
            return;
        }
        setAgreementId((current) =>
            current && agreements.some((a) => a.id === current) ? current : agreements[0].id,
        );
    }, [agreements]);

    const agreement = useMemo(
        () => agreements.find((a) => a.id === agreementId) ?? null,
        [agreements, agreementId],
    );

    useEffect(() => {
        setCurrency((current) => current || agreement?.currency || fmt.currency || 'KES');
    }, [agreement, fmt.currency]);

    const openInvoices = useMemo(
        () => (agreement?.invoices ?? []).filter(isOpen),
        [agreement],
    );

    const appliedTotal = useMemo(
        () => round2(Object.values(applied).reduce((sum, value) => sum + Number(value || 0), 0)),
        [applied],
    );

    /**
     * What was actually received.
     *
     * Money applied to a bill is the sum of what was applied, and money not
     * applied to a bill is what the person typed. There is no third case: the
     * server refuses a receipt whose payments do not add up to the amount
     * received, and a form that could produce that would be a form that fails
     * at the last step.
     */
    const amountReceived = appliedTotal > 0 ? appliedTotal : round2(Number(onAccountAmount || 0));

    /** The owner whose rent this is, when the property has one. */
    const landlordId = useMemo(() => {
        const property = agreement?.unit?.property;
        return property?.landlordId ?? undefined;
    }, [agreement]);

    const tenantDisplayName = useMemo(() => {
        if (lockedTenantName) return lockedTenantName;
        if (!tenant) return '';
        return `${tenant.surname} ${tenant.otherNames ?? ''}`.trim();
    }, [tenant, lockedTenantName]);

    const toggleInvoice = (invoice: Invoice, checked: boolean) => {
        setApplied((current) => {
            const next = { ...current };
            if (checked) {
                next[invoice.id] = round2(Number(invoice.balanceAmount ?? 0));
            } else {
                delete next[invoice.id];
            }
            return next;
        });
    };

    const setInvoiceAmount = (invoice: Invoice, raw: string) => {
        const parsed = Math.max(0, Number(raw) || 0);
        setApplied((current) => ({
            ...current,
            [invoice.id]: round2(parsed),
        }));
    };

    const handleSubmit = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();
            setError(null);

            if (!tenantId) {
                setError('Choose the tenant this money came from.');
                return;
            }
            if (!agreementId) {
                setError('Choose the tenancy this money settles.');
                return;
            }
            if (!(amountReceived > 0)) {
                setError(
                    appliedTotal > 0
                        ? 'The amount applied to a bill must be more than zero.'
                        : 'Enter the amount that was received.',
                );
                return;
            }

            setIsSaving(true);
            try {
                const appliedInvoices = Object.entries(applied)
                    .filter(([, value]) => Number(value) > 0)
                    .map(([id, value]) => ({ id, amount: round2(Number(value)) }));

                const receiptLines = appliedInvoices.map(({ id, amount }) => {
                    const invoice = openInvoices.find((i) => i.id === id);
                    return {
                        date: paymentDate,
                        invNo: invoice?.invoiceNumber,
                        particular: 'Payment received',
                        invoiceTotal: Number(invoice?.totalAmount ?? 0),
                        prevReceipts: Number(invoice?.paidAmount ?? 0),
                        amtDue: Number(invoice?.balanceAmount ?? 0),
                        payment: amount,
                        newBalance: round2(Math.max(0, Number(invoice?.balanceAmount ?? 0) - amount)),
                        whtTax: 0,
                    };
                });

                const payments = appliedInvoices.map(({ id, amount }) => ({
                    invoiceId: id,
                    agreementId,
                    paymentDate,
                    amount,
                    currency,
                    paymentMethod,
                    paymentReference: reference || undefined,
                    paymentType: 'ApplyToBill' as const,
                    notes: notes || undefined,
                }));

                await financeApi.createReceipt({
                    // A receipt that settles a bill is applied to that bill; one
                    // that does not is a plain money-in receipt.
                    receiptType: appliedInvoices.length > 0 ? 'ApplyToInvoice' : 'CashReceipt',
                    receiptCategory: 'Rent',
                    receivedFrom: tenantDisplayName,
                    tenantId,
                    landlordId,
                    paymentMethod,
                    paymentRefNo: reference || undefined,
                    recordingDate: paymentDate,
                    amountReceived,
                    currency,
                    notes: notes || undefined,
                    memo: notes || undefined,
                    drtOrDrf: 'DirectReceipt',
                    recordedBy: user ? `${user.firstName} ${user.lastName}` : undefined,
                    receiptLines,
                    payments,
                });

                router.push(lockedTenantId ? `/tenants/${tenantId}` : '/finance/receipts');
            } catch (err: unknown) {
                const e = err as { response?: { data?: { message?: string } }; message?: string };
                setError(e.response?.data?.message || e.message || 'Failed to capture the payment.');
            } finally {
                setIsSaving(false);
            }
        },
        [
            agreementId,
            amountReceived,
            applied,
            appliedTotal,
            currency,
            landlordId,
            notes,
            openInvoices,
            paymentDate,
            paymentMethod,
            reference,
            router,
            tenantDisplayName,
            tenantId,
            lockedTenantId,
            user,
        ],
    );

    const methodIsDirectRemit = paymentMethod === 'DIRECT_REMIT';

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Who paid, and what it was for
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    {!lockedTenantId && (
                        <TenantPicker value={tenantId} onChange={setTenantId} />
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">
                            Tenancy
                        </label>
                        <Select
                            options={[
                                { value: '', label: tenantId ? 'Select a tenancy' : 'Choose a tenant first' },
                                ...agreements.map((a) => ({
                                    value: a.id,
                                    label: `${a.code ?? 'Tenancy'} — ${a.unit?.name ?? ''}`.trim(),
                                })),
                            ]}
                            value={agreementId}
                            onChange={(e) => setAgreementId(e.target.value)}
                            disabled={!tenantId || agreements.length === 0}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">
                            Date received
                        </label>
                        <Input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                        />
                    </div>

                    {landlordId && (
                        <p className="text-xs text-muted-foreground md:col-span-2">
                            Collected for the owner of {agreement?.unit?.property?.name ?? 'this property'}.
                            Money held on an owner&rsquo;s behalf is not income until it is paid out.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Banknote className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        How the money was paid
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">
                            Payment method
                        </label>
                        <Select
                            options={PAYMENT_METHODS}
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodValue)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">
                            Currency
                        </label>
                        <Select
                            options={CURRENCIES.map((c) => ({ value: c.value, label: c.label }))}
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">
                            Reference
                        </label>
                        <Input
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder={
                                paymentMethod === 'CHEQUE'
                                    ? 'Cheque number'
                                    : paymentMethod === 'MPESA'
                                      ? 'M-Pesa confirmation code'
                                      : 'Transaction reference'
                            }
                        />
                    </div>

                    {methodIsDirectRemit && (
                        <p className="self-end rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 md:col-span-2">
                            <strong className="font-semibold">This money did not reach the estate.</strong>{' '}
                            It was remitted straight to the party it was due to, so it is booked as money
                            the owner owes the estate — not as cash the estate is holding.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">What it settles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {openInvoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            This tenancy has no open invoice, so the money is captured on account
                            and sits against the tenant until it is matched to a bill.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="w-10 py-2 pr-2" />
                                        <th className="py-2 pr-3">Invoice</th>
                                        <th className="py-2 pr-3">Due</th>
                                        <th className="py-2 pr-3 text-right">Balance</th>
                                        <th className="py-2 pr-3 text-right">Applied now</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openInvoices.map((invoice) => {
                                        const checked = applied[invoice.id] !== undefined;
                                        return (
                                            <tr key={invoice.id} className="border-b last:border-0">
                                                <td className="py-2 pr-2">
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={(next) => toggleInvoice(invoice, next)}
                                                        aria-label={`Apply this capture to ${invoice.invoiceNumber}`}
                                                    />
                                                </td>
                                                <td className="py-2 pr-3 font-medium">
                                                    {invoice.invoiceNumber}
                                                </td>
                                                <td className="py-2 pr-3 text-muted-foreground">
                                                    {fmt.date(invoice.dueDate)}
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                    {fmt.money(invoice.balanceAmount, invoice.currency)}
                                                </td>
                                                <td className="py-2 pr-3 text-right">
                                                    {checked ? (
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            step="0.01"
                                                            className="w-32 text-right"
                                                            value={applied[invoice.id]}
                                                            onChange={(e) => setInvoiceAmount(invoice, e.target.value)}
                                                            aria-label={`Amount applied to ${invoice.invoiceNumber}`}
                                                        />
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        {appliedTotal === 0 && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium leading-none">
                                    Amount received
                                </label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={onAccountAmount}
                                    onChange={(e) => setOnAccountAmount(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Captured on account — not matched to a bill yet.
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5 md:ml-auto md:w-full md:max-w-xs">
                            <p className="text-sm font-medium leading-none">Total captured</p>
                            <p className="text-2xl font-semibold tabular-nums">
                                {fmt.money(amountReceived, currency)}
                            </p>
                            {appliedTotal > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {fmt.money(appliedTotal, currency)} applied to{' '}
                                    {Object.keys(applied).length} invoice(s)
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">Notes</label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Anything the next person needs to know about this payment"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Capturing…' : 'Capture Manually'}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.back()}
                    disabled={isSaving}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                    Cancel
                </Button>
                {amountReceived > 0 && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                        {fmt.money(amountReceived, currency)} will be captured for{' '}
                        {tenantDisplayName || 'the selected tenant'}.
                    </p>
                )}
            </div>
        </form>
    );
}

export default CaptureManuallyForm;
