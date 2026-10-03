'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Banknote,
    Building2,
    FileText,
    Landmark,
    Pencil,
    Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { landlordsApi } from '@/lib/api';
import { CHARGE_CATEGORIES, OWNER_STATEMENT_STATUSES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { StatementGenerateDialog } from '@/components/landlords/statement-generate-dialog';
import { PayoutFormDialog } from '@/components/landlords/payout-form-dialog';
import { ChargeFormDialog } from '@/components/landlords/charge-form-dialog';
import { PayoutStatusBadge } from '@/components/landlords/payout-status-dialog';
import { OwnerStatementTable } from '@/components/landlords/statement-table';
import type { LandlordDetail, LandlordCharge } from '@/types';

const money = (amount: number) =>
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const categoryLabel = (value: string) =>
    CHARGE_CATEGORIES.find((option) => option.value === value)?.label ?? value;

const statementTone = (status: string) =>
    OWNER_STATEMENT_STATUSES.find((option) => option.value === status)?.className ??
    'bg-gray-100 text-gray-800';

/**
 * Landlord detail (Module 6).
 *
 * One screen, three questions: who is this owner, what has been billed out of
 * their rent, and what is still owed. The money history is read-only here —
 * statements and payouts are documents, changed through their own flows.
 */
export default function LandlordDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [landlord, setLandlord] = useState<LandlordDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const [isPayoutOpen, setIsPayoutOpen] = useState(false);
    const [isChargeOpen, setIsChargeOpen] = useState(false);
    const [editingCharge, setEditingCharge] = useState<LandlordCharge | null>(null);

    const fetchLandlord = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const response = await landlordsApi.findOne(id);
            setLandlord(response.data);
            setError(null);
        } catch (err) {
            setLandlord(null);
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not load this landlord',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchLandlord();
    }, [fetchLandlord]);

    if (isLoading) return <LoadingState label="Loading landlord…" />;
    if (error) return <ErrorState message={error} onRetry={fetchLandlord} />;
    if (!landlord) return null;

    const fee =
        landlord.managementFeeType === 'FIXED'
            ? `${money(landlord.managementFeeAmount ?? 0)} per period`
            : `${landlord.managementFeeRate ?? 0}% of rent collected`;

    const outstandingStatements = landlord.statements.filter(
        (statement) => statement.status === 'ISSUED' || statement.status === 'SETTLED',
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/landlords')}
                        className="mb-2 -ml-2"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Landlords
                    </Button>
                    <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
                        {landlord.name}
                        <StatusBadge status={landlord.status} />
                    </h1>
                    <p className="text-muted-foreground">
                        {landlord.code}
                        {landlord.email ? ` · ${landlord.email}` : ''}
                        {landlord.phone ? ` · ${landlord.phone}` : ''}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => router.push(`/landlords/${id}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button variant="outline" onClick={() => setIsChargeOpen(true)}>
                        <Receipt className="mr-2 h-4 w-4" aria-hidden="true" />
                        Charge a cost
                    </Button>
                    <Button variant="outline" onClick={() => setIsPayoutOpen(true)}>
                        <Banknote className="mr-2 h-4 w-4" aria-hidden="true" />
                        Record payout
                    </Button>
                    <Button onClick={() => setIsStatementOpen(true)}>
                        <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                        Generate statement
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Portfolio
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{landlord.totals.properties}</p>
                        <p className="text-sm text-muted-foreground">
                            {landlord.totals.units} units
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Paid out
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{money(landlord.totals.paidOut)}</p>
                        <p className="text-sm text-muted-foreground">transfers made</p>
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
                                landlord.totals.outstanding > 0 ? 'text-amber-700' : ''
                            }`}
                        >
                            {money(landlord.totals.outstanding)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            across {outstandingStatements.length} statement(s)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Unstated charges
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {money(landlord.totals.unstatedCharges)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            waiting for a statement
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Landmark className="h-4 w-4" aria-hidden="true" />
                            Agreement & payouts
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <Detail label="Management fee" value={fee} />
                        <Detail
                            label="Payout to"
                            value={[
                                landlord.accountName,
                                landlord.bankName,
                                landlord.accountNumber,
                            ]
                                .filter(Boolean)
                                .join(' · ') || 'No bank details on file'}
                        />
                        <Detail label="Tax PIN" value={landlord.taxPin || '—'} />
                        <Detail label="VAT registered" value={landlord.vatRegistered ? 'Yes' : 'No'} />
                        {landlord.notes && (
                            <div>
                                <p className="text-muted-foreground">Notes</p>
                                <p className="whitespace-pre-wrap">{landlord.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Building2 className="h-4 w-4" aria-hidden="true" />
                            Properties ({landlord.totals.properties})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {landlord.properties?.length ? (
                            <ul className="space-y-2">
                                {landlord.properties.map((property) => (
                                    <li key={property.id} className="text-sm">
                                        <Link
                                            href={`/properties/${property.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {property.name}
                                        </Link>
                                        <span className="ml-2 text-muted-foreground">
                                            {property._count?.units ?? 0} units
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No properties are assigned to this landlord yet, so there is no
                                rent to bill them on.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent payouts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {landlord.payouts.length ? (
                            <ul className="space-y-2 text-sm">
                                {landlord.payouts.slice(0, 6).map((payout) => (
                                    <li key={payout.id} className="flex items-center justify-between gap-3">
                                        <span className="truncate">
                                            {payout.ownerStatement
                                                ? payout.ownerStatement.statementNumber
                                                : 'No statement'}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className="tabular-nums">{money(payout.amount)}</span>
                                            <PayoutStatusBadge status={payout.status} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Nothing has been paid out yet.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Owner statements</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/landlords/statements')}>
                        View all
                    </Button>
                </CardHeader>
                <CardContent>
                    <OwnerStatementTable
                        statements={landlord.statements}
                        onSelect={(statement) =>
                            router.push(`/landlords/statements/${statement.id}`)
                        }
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Charges</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setIsChargeOpen(true)}>
                        Add charge
                    </Button>
                </CardHeader>
                <CardContent>
                    {landlord.charges.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Date</th>
                                        <th className="py-2 pr-3">Category</th>
                                        <th className="py-2 pr-3">Description</th>
                                        <th className="py-2 pr-3">Property</th>
                                        <th className="py-2 pr-3">Statement</th>
                                        <th className="py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {landlord.charges.map((charge) => (
                                        <tr key={charge.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {charge.chargeDate?.slice(0, 10)}
                                            </td>
                                            <td className="py-2 pr-3">
                                                {categoryLabel(charge.category)}
                                            </td>
                                            <td className="py-2 pr-3">{charge.description}</td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {charge.property?.name ?? '—'}
                                            </td>
                                            <td className="py-2 pr-3">
                                                {charge.ownerStatementId ? (
                                                    <span className="text-muted-foreground">Claimed</span>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 px-2"
                                                        onClick={() => {
                                                            setEditingCharge(charge);
                                                            setIsChargeOpen(true);
                                                        }}
                                                    >
                                                        Edit
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {money(charge.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No costs have been charged to this landlord. Repairs you carry out on
                            their property are deducted from the next statement.
                        </p>
                    )}
                </CardContent>
            </Card>

            <StatementGenerateDialog
                isOpen={isStatementOpen}
                onClose={() => setIsStatementOpen(false)}
                landlordId={landlord.id}
                onGenerated={() => {
                    fetchLandlord();
                    toast.success('Statement generated');
                }}
            />

            <PayoutFormDialog
                isOpen={isPayoutOpen}
                onClose={() => setIsPayoutOpen(false)}
                landlordId={landlord.id}
                landlordName={landlord.name}
                onRecorded={fetchLandlord}
            />

            <ChargeFormDialog
                isOpen={isChargeOpen}
                onClose={() => {
                    setIsChargeOpen(false);
                    setEditingCharge(null);
                }}
                landlords={[landlord]}
                properties={landlord.properties ?? []}
                charge={editingCharge}
                defaultLandlordId={landlord.id}
                onSaved={fetchLandlord}
            />
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-muted-foreground">{label}</p>
            <p>{value}</p>
        </div>
    );
}
