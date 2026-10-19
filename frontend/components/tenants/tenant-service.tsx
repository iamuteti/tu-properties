'use client';

import Link from 'next/link';
import { Bell, KeyRound, MessageSquare, Ticket, UserCheck, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/entity-states';
import { Detail, Pill, humanise } from './shared';
import { useOrgFormat } from '@/hooks/use-org-format';
import type {
    AccessCardRow,
    Agreement,
    FacilityBookingRow,
    TenantEmergencyContact,
    TenantNotification,
    TenantRequest,
    VisitorVisitRow,
    WorkOrder,
} from '@/types';

interface ServiceProps {
    agreements: Agreement[];
    emergencyContacts: TenantEmergencyContact[];
    requests: TenantRequest[];
    notifications: TenantNotification[];
    workOrders: WorkOrder[];
    facilityBookings: FacilityBookingRow[];
    accessCards: AccessCardRow[];
    visitorVisits: VisitorVisitRow[];
}

/**
 * How this resident is served.
 *
 * The things a resident asks for and the things that go wrong in their home are
 * the same subject from two directions, and the tenant's file is the only place
 * where somebody can see both: a broken heater that was reported three times and
 * a maintenance request that was approved while the resident was still waiting.
 *
 * Every request a resident has raised is here, in one list, whether it was raised
 * against a tenancy or on their own account. Splitting them by origin was tried
 * and it was a fiction: a request belongs to the resident and may name a tenancy,
 * so a "tenancy requests" list and a "portal requests" list are the same rows
 * seen through two different filters - and the resident who raised one request
 * appeared to have raised two.
 */
export function TenantServiceSection({
    agreements,
    emergencyContacts,
    requests,
    notifications,
    workOrders,
    facilityBookings,
    accessCards,
    visitorVisits,
}: ServiceProps) {
    const fmt = useOrgFormat();
    const openWorkOrders = workOrders.filter(
        (w) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status),
    );
    const pendingRequests = requests.filter((r) => r.status === 'PENDING');
    const agreementById = new Map(agreements.map((a) => [a.id, a]));

    return (
        <div className="space-y-6">
            {/* Emergency contacts */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <UserCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Emergency contacts
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {emergencyContacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No emergency contacts on file.
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {emergencyContacts.map((c, index) => (
                                <div key={c.id ?? index} className="rounded-lg border p-3">
                                    <p className="font-medium">{c.contactName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {c.relationship ?? '—'}
                                    </p>
                                    <p className="mt-1 text-sm">{c.phone ?? '—'}</p>
                                    {c.email && (
                                        <p className="text-xs text-muted-foreground">{c.email}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Requests */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Requests
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {requests.length === 0 ? (
                        <EmptyState
                            title="No requests"
                            description="This tenant has not raised any requests, on a tenancy or on their own account."
                        />
                    ) : (
                        <div className="space-y-3">
                            {requests.map((r) => (
                                <RequestCard
                                    key={r.id}
                                    request={r}
                                    agreement={
                                        r.agreementId
                                            ? agreementById.get(r.agreementId)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Work orders */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Work orders reported
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {workOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No work orders reported by this tenant.
                        </p>
                    ) : (
                        <>
                            <p className="mb-3 text-sm text-muted-foreground">
                                {openWorkOrders.length} still open of {workOrders.length} reported.
                            </p>
                            <div className="space-y-3">
                                {workOrders.slice(0, 20).map((w) => (
                                    <div key={w.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-medium">
                                                <Link
                                                    href={`/maintenance/work-orders/${w.id}`}
                                                    className="hover:underline"
                                                >
                                                    {w.reference ?? w.title}
                                                </Link>
                                            </span>
                                            <Pill status={w.status} />
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {w.title}
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                            <Detail label="Category" value={humanise(w.category)} />
                                            <Detail label="Priority" value={humanise(w.priority)} />
                                            <Detail
                                                label="Reported"
                                                value={fmt.date(w.reportedAt)}
                                            />
                                            <Detail
                                                label="Completed"
                                                value={w.completedAt ? fmt.date(w.completedAt) : '—'}
                                            />
                                        </div>
                                        {w.resolutionNote && (
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {w.resolutionNote}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {workOrders.length > 20 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Showing 20 of {workOrders.length} work orders.
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Access, bookings and visits */}
            <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            Access cards
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {accessCards.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No access cards issued.</p>
                        ) : (
                            <ul className="space-y-2">
                                {accessCards.map((c) => (
                                    <li key={c.id} className="rounded border p-3 text-sm">
                                        <p className="font-medium">{c.cardNumber}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {humanise(c.type)} · {humanise(c.effectiveStatus)}
                                        </p>
                                        {c.expiresAt && (
                                            <p className="text-xs text-muted-foreground">
                                                Expires {fmt.date(c.expiresAt)}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Ticket className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            Facility bookings
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {facilityBookings.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No facility bookings.</p>
                        ) : (
                            <ul className="space-y-2">
                                {facilityBookings.slice(0, 10).map((b) => (
                                    <li key={b.id} className="rounded border p-3 text-sm">
                                        <p className="font-medium">{b.bookedForName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {fmt.date(b.startsAt)} → {fmt.date(b.endsAt)} ·{' '}
                                            {b.statusLabel ?? humanise(b.status)}
                                        </p>
                                        {b.fee ? (
                                            <p className="text-xs text-muted-foreground">
                                                Fee {fmt.money(b.fee, b.feeCurrency)}
                                            </p>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Visitor visits</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {visitorVisits.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No visitor visits on file.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {visitorVisits.slice(0, 10).map((v) => (
                                    <li key={v.id} className="rounded border p-3 text-sm">
                                        <p className="font-medium">{v.visitorName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {v.stateLabel ?? humanise(v.state)}
                                        </p>
                                        {v.expectedAt && (
                                            <p className="text-xs text-muted-foreground">
                                                Expected {fmt.date(v.expectedAt)}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            {pendingRequests.length > 0 && (
                <p className="text-sm text-amber-700">
                    {pendingRequests.length} request(s) are still waiting for a decision.
                </p>
            )}

            {/* Messages sent to this resident */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Messages
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No messages have been sent to this resident.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map((n) => (
                                <div key={n.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-medium">{n.title}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {humanise(n.channel)}
                                            </span>
                                            <Pill status={n.status} />
                                        </div>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {n.sentAt ? `Sent ${fmt.date(n.sentAt)}` : `Created ${fmt.date(n.createdAt)}`}
                                        {n.readAt ? ` · read ${fmt.date(n.readAt)}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
function RequestCard({
    request,
    agreement,
}: {
    request: TenantRequest;
    agreement?: Agreement;
}) {
    const fmt = useOrgFormat();

    return (
        <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{humanise(request.type)}</span>
                <div className="flex items-center gap-2">
                    {agreement ? (
                        <span className="text-xs text-muted-foreground">
                            {agreement.code ?? 'Tenancy'} · {agreement.unit?.name ?? ''}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">General</span>
                    )}
                    <Pill status={request.status} />
                </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Detail label="Created" value={fmt.date(request.createdAt)} />
                <Detail
                    label="Preferred date"
                    value={request.preferredDate ? fmt.date(request.preferredDate) : '—'}
                />
                <Detail
                    label="Decided"
                    value={request.decidedAt ? fmt.date(request.decidedAt) : 'Pending'}
                />
                <Detail label="Early notice" value={request.earlyNotice ? 'Yes' : 'No'} />
            </div>
            {request.note && <p className="mt-2 text-sm text-muted-foreground">{request.note}</p>}
            {request.decisionNote && (
                <p className="mt-2 text-sm">Decision: {request.decisionNote}</p>
            )}
        </div>
    );
}
