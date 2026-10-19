'use client';

import Link from 'next/link';
import { ClipboardCheck, FileSignature, LogOut, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/entity-states';
import { Detail, Pill, SectionTitle, agreementEndDate, humanise } from './shared';
import { useOrgFormat } from '@/hooks/use-org-format';
import type { Agreement, MoveOutRequest } from '@/types';

interface HistoryProps {
    agreements: Agreement[];
    moveOutRequests: MoveOutRequest[];
}

/**
 * Everything that happened, in the order it happened.
 *
 * A tenant's file is not a snapshot of where they are now — it is the record of
 * every tenancy, every inspection and every exit, because the question that
 * matters about a former resident ("what did we let them with, and what did they
 * leave us with?") is answered by the history and by nothing else.
 */
export function TenantHistorySection({ agreements, moveOutRequests }: HistoryProps) {
    const fmt = useOrgFormat();
    const inspections = agreements.flatMap((a) =>
        (a.inspections ?? []).map((i) => ({ inspection: i, agreement: a })),
    );
    const contracts = agreements.flatMap((a) =>
        (a.contracts ?? []).map((c) => ({ contract: c, agreement: a })),
    );

    return (
        <div className="space-y-6">
            {/* Tenancy history */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Tenancy history
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {agreements.length === 0 ? (
                        <EmptyState
                            title="No tenancy history"
                            description="This tenant has never signed a lease or rental agreement."
                        />
                    ) : (
                        <div className="space-y-4">
                            {agreements.map((a) => (
                                <div key={a.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/agreements/${a.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {a.code ?? 'Agreement'}
                                            </Link>
                                            <Pill status={a.status} />
                                            <span className="text-xs text-muted-foreground">
                                                {humanise(a.agreementType)}
                                            </span>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {fmt.date(a.startDate)} →{' '}
                                            {agreementEndDate(a)
                                                ? fmt.date(agreementEndDate(a))
                                                : 'open-ended'}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                                        <Detail
                                            label="Unit"
                                            value={
                                                a.unit ? (
                                                    <Link
                                                        href={`/units/${a.unit.id}`}
                                                        className="hover:underline"
                                                    >
                                                        {a.unit.name}
                                                    </Link>
                                                ) : (
                                                    '—'
                                                )
                                            }
                                        />
                                        <Detail
                                            label="Property"
                                            value={
                                                a.unit?.property ? (
                                                    <Link
                                                        href={`/properties/${a.unit.property.id}`}
                                                        className="hover:underline"
                                                    >
                                                        {a.unit.property.name}
                                                    </Link>
                                                ) : (
                                                    '—'
                                                )
                                            }
                                        />
                                        <Detail
                                            label="Rent"
                                            value={fmt.money(a.rentAmount, a.currency)}
                                        />
                                        <Detail
                                            label="Security deposit"
                                            value={fmt.money(a.securityDeposit ?? 0, a.currency)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Move-outs */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Move-outs and deposit deductions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {moveOutRequests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No move-out requests on file.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {moveOutRequests.map((m) => (
                                <div key={m.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">
                                            Moving out on {fmt.date(m.moveoutDate)}
                                        </span>
                                        <Pill status={m.status} />
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                                        <Detail
                                            label="Deposit refund"
                                            value={fmt.money(m.depositRefundAmount ?? 0)}
                                        />
                                        <Detail
                                            label="Deposit refunded"
                                            value={m.depositRefunded ? 'Yes' : 'No'}
                                        />
                                        <Detail
                                            label="Approved on"
                                            value={m.approvalDate ? fmt.date(m.approvalDate) : '—'}
                                        />
                                    </div>

                                    {(m.deductions ?? []).length > 0 && (
                                        <div className="mt-3">
                                            <SectionTitle>Deductions</SectionTitle>
                                            <ul className="space-y-1 text-sm">
                                                {(m.deductions ?? []).map((d) => (
                                                    <li
                                                        key={d.id}
                                                        className="flex justify-between border-b last:border-0 py-1"
                                                    >
                                                        <span className="text-muted-foreground">
                                                            {d.category}
                                                            {d.description ? ` — ${d.description}` : ''}
                                                        </span>
                                                        <span className="tabular-nums">
                                                            -{fmt.amount(d.amount)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {m.notes && (
                                        <p className="mt-2 text-sm text-muted-foreground">{m.notes}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Inspections */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Condition reports
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {inspections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No move-in, periodic or move-out condition reports on file.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {inspections.map(({ inspection }) => (
                                <div key={inspection.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">
                                            {humanise(inspection.type)} ·{' '}
                                            {fmt.date(inspection.scheduledDate)}
                                        </span>
                                        <Pill status={inspection.status} />
                                    </div>
                                    {inspection.completedAt && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Completed {fmt.date(inspection.completedAt)}
                                        </p>
                                    )}
                                    {inspection.notes && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {inspection.notes}
                                        </p>
                                    )}
                                    {(inspection.items ?? []).length > 0 && (
                                        <div className="mt-3 overflow-x-auto rounded-lg border">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                                        <th className="py-2 px-3">Area</th>
                                                        <th className="py-2 px-3">Item</th>
                                                        <th className="py-2 px-3">Condition</th>
                                                        <th className="py-2 px-3 text-right">Est. cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(inspection.items ?? []).map((item) => (
                                                        <tr
                                                            key={item.id}
                                                            className="border-b last:border-0"
                                                        >
                                                            <td className="py-2 px-3">{item.area}</td>
                                                            <td className="py-2 px-3">
                                                                {item.item}
                                                                {item.notes && (
                                                                    <span className="block text-xs text-muted-foreground">
                                                                        {item.notes}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                <Pill status={item.condition} />
                                                            </td>
                                                            <td className="py-2 px-3 text-right tabular-nums">
                                                                {item.estimatedCost
                                                                    ? fmt.amount(item.estimatedCost)
                                                                    : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Contracts */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Contracts
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {contracts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No contracts are filed against the tenancies of this tenant.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="py-2 pr-3">Reference</th>
                                        <th className="py-2 pr-3">Title</th>
                                        <th className="py-2 pr-3">Type</th>
                                        <th className="py-2 pr-3">Starts</th>
                                        <th className="py-2 pr-3">Expires</th>
                                        <th className="py-2 pr-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contracts.map(({ contract }) => (
                                        <tr key={contract.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3">
                                                <Link
                                                    href={`/contracts/${contract.id}`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {contract.reference}
                                                </Link>
                                            </td>
                                            <td className="py-2 pr-3">{contract.title}</td>
                                            <td className="py-2 pr-3">{humanise(contract.type)}</td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {fmt.date(contract.startDate)}
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                {fmt.date(contract.expiresAt)}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <Pill status={contract.status} />
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
    );
}
