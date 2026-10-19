'use client';

import Link from 'next/link';
import { Home, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/entity-states';
import { AgreementStatusBadge } from '@/components/agreements/agreement-status-badge';
import { Detail, agreementEndDate } from './shared';
import { useOrgFormat } from '@/hooks/use-org-format';
import type { Agreement, Tenant } from '@/types';

interface OverviewProps {
    tenant: Tenant;
    agreements: Agreement[];
}

/**
 * Who this person is, and what they are paying for.
 *
 * The identity block and the current tenancy sit side by side because the two
 * questions are asked together — "is this the right Jane Doe, and is the flat
 * she is in the flat she says it is?" — and splitting them across a scroll makes
 * the reader hold the name in their head to make sense of the second half.
 */
export function TenantOverviewSection({ tenant, agreements }: OverviewProps) {
    const fmt = useOrgFormat();
    const activeAgreement = agreements.find((a) => a.status === 'ACTIVE');

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-4 w-4" aria-hidden="true" />
                        Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <Detail label="Account number" value={tenant.accountNumber} />
                    <Detail label="Code" value={tenant.code} />
                    <Detail label="Phone" value={tenant.phone} />
                    <Detail label="Email" value={tenant.email} />
                    <Detail label="National ID / Reg No" value={tenant.idNoRegNo} />
                    <Detail label="Tax PIN" value={tenant.taxPin} />
                    <Detail label="Tenant type" value={tenant.tenantType} />
                    <Detail label="Gender" value={tenant.gender} />
                    <Detail label="Town" value={tenant.town} />
                    <Detail label="Postal address" value={tenant.postalAddress} />
                    <Detail label="Postal code" value={tenant.postalCode} />
                    <Detail label="Country" value={tenant.country} />
                    <Detail
                        label="Send mobile number"
                        value={tenant.sendMobileNumber ? 'Yes' : 'No'}
                    />
                    <Detail label="Member since" value={fmt.date(tenant.createdAt)} />
                    <Detail label="Last updated" value={fmt.date(tenant.updatedAt)} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Home className="h-4 w-4" aria-hidden="true" />
                        Current tenancy
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!activeAgreement ? (
                        <EmptyState
                            title="No active tenancy"
                            description="This tenant has no current lease or rental agreement."
                        />
                    ) : (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <Detail
                                label="Agreement"
                                value={
                                    <Link
                                        href={`/agreements/${activeAgreement.id}`}
                                        className="hover:underline"
                                    >
                                        {activeAgreement.code}
                                    </Link>
                                }
                            />
                            <Detail
                                label="Type"
                                value={activeAgreement.agreementType ?? '—'}
                            />
                            <Detail
                                label="Status"
                                value={
                                    <AgreementStatusBadge
                                        status={activeAgreement.status as
                                            | 'DRAFT'
                                            | 'ACTIVE'
                                            | 'EXPIRED'
                                            | 'TERMINATED'
                                            | 'RENEWED'}
                                    />
                                }
                            />
                            <Detail
                                label="Unit"
                                value={
                                    activeAgreement.unit ? (
                                        <Link
                                            href={`/units/${activeAgreement.unit.id}`}
                                            className="hover:underline"
                                        >
                                            {activeAgreement.unit.name}
                                        </Link>
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                            <Detail
                                label="Property"
                                value={
                                    activeAgreement.unit?.property ? (
                                        <Link
                                            href={`/properties/${activeAgreement.unit.property.id}`}
                                            className="hover:underline"
                                        >
                                            {activeAgreement.unit.property.name}
                                        </Link>
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                            <Detail
                                label="Rent"
                                value={fmt.money(activeAgreement.rentAmount, activeAgreement.currency)}
                            />
                            <Detail
                                label="Payment day"
                                value={String(activeAgreement.paymentDay ?? '—')}
                            />
                            <Detail
                                label="Term"
                                value={`${fmt.date(activeAgreement.startDate)} → ${
                                    agreementEndDate(activeAgreement)
                                        ? fmt.date(agreementEndDate(activeAgreement))
                                        : 'N/A'
                                }`}
                            />
                            <Detail
                                label="Security deposit"
                                value={fmt.money(activeAgreement.securityDeposit ?? 0, activeAgreement.currency)}
                            />
                            <Detail
                                label="Balance"
                                value={
                                    activeAgreement.invoices?.length
                                        ? fmt.money(
                                              activeAgreement.invoices.reduce(
                                                  (s, inv) =>
                                                      s + Number(inv.balanceAmount ?? 0),
                                                  0,
                                              ),
                                              activeAgreement.currency,
                                          )
                                        : '—'
                                }
                            />
                            {activeAgreement.noticePeriodDays && (
                                <Detail
                                    label="Notice period"
                                    value={`${activeAgreement.noticePeriodDays} days`}
                                />
                            )}
                            {activeAgreement.escalationRate && (
                                <Detail
                                    label="Escalation rate"
                                    value={`${activeAgreement.escalationRate}%`}
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
