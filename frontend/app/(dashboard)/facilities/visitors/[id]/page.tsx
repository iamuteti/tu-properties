'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Ban, LogIn, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { visitorsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { ACCESS_CARD_STATUS_STYLES, VISIT_STATE_STYLES } from '@/lib/constants';
import type { VisitorDetail } from '@/types';

/**
 * One visitor.
 *
 * The bar is the thing on this screen, and it is worth saying why it needs a reason
 * and cannot be a checkbox: "do not admit" with nothing behind it is
 * indistinguishable from a mistake, and this is the decision somebody will be asked to
 * justify at the gate. So barring is its own action with a required reason, it is
 * refused while the person is still on site — barring somebody already inside creates
 * a situation the guard has to resolve in person — and lifting it **keeps** the
 * original reason, because a history with a blank "why" cannot answer a question
 * about whether they have been in trouble before.
 *
 * There is also no delete, and the API says so rather than returning a bare 405: the
 * visit log is the record of who came into the building.
 */
export default function VisitorDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [visitor, setVisitor] = useState<VisitorDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [barring, setBarring] = useState(false);
    const [logging, setLogging] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await visitorsApi.visitor(id);
            setVisitor(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That visitor does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the visitor.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading the visitor…" />;
    if (error || !visitor) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/facilities/visitors">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to visitors
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Visitor not found.'} onRetry={load} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/facilities/visitors" aria-label="Back to visitors">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {visitor.displayName}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {visitor.company && <span>{visitor.company}</span>}
                            {visitor.isBlacklisted ? (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                                    Barred from the site
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                    May be admitted
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setLogging(true)}>
                        <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
                        Log an arrival
                    </Button>
                    {visitor.isBlacklisted ? (
                        <Button
                            variant="outline"
                            onClick={async () => {
                                try {
                                    const { data } = await visitorsApi.unbarVisitor(visitor.id);
                                    toast.success(data.message, { duration: 8000 });
                                    await load();
                                } catch (err) {
                                    toast.error(
                                        (err as { response?: { data?: { message?: string } } })
                                            ?.response?.data?.message ??
                                            'Could not lift the bar',
                                    );
                                }
                            }}
                        >
                            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                            Lift the bar
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => setBarring(true)}>
                            <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                            Bar from the site
                        </Button>
                    )}
                </div>
            </div>

            {/* The bar. Placed above everything else on the page because it is the
                fact a guard is looking for, and burying it under a phone number is
                how somebody waves through the person they were told not to admit. */}
            {visitor.isBlacklisted && (
                <Card className="border-red-300 bg-red-50/50">
                    <CardHeader>
                        <CardTitle className="text-red-800">Barred from the site</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <p className="text-red-900">{visitor.blacklistReason}</p>
                        <p className="text-xs text-red-700">
                            Barred{' '}
                            {visitor.blacklistedAt
                                ? new Date(visitor.blacklistedAt).toLocaleDateString()
                                : 'on an unrecorded date'}
                            . Lifting the bar keeps this reason on the record — it is the
                            fact that explains a later decision to bar them again.
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>What a gate needs</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>{visitor.phone ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="break-words">{visitor.email ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Identification</dt>
                            <dd>
                                {visitor.idNumber
                                    ? `${visitor.idType ? `${visitor.idType}: ` : ''}${visitor.idNumber}`
                                    : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">On our books</dt>
                            <dd>
                                {visitor.contact ? (
                                    <Link
                                        href={`/crm/contacts/${visitor.contact.id}`}
                                        className="underline underline-offset-4"
                                    >
                                        {visitor.contact.company ??
                                            `${visitor.contact.firstName} ${visitor.contact.lastName}`}
                                    </Link>
                                ) : (
                                    'a walk-in — no contact record'
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Visits</dt>
                            <dd>{visitor.statistics.totalVisits}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">On site now</dt>
                            <dd>{visitor.statistics.onSiteNow}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Overstaying</dt>
                            <dd>{visitor.statistics.overdue}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Cards held</dt>
                            <dd>
                                {visitor.accessCards.length > 0 ? (
                                    <Link
                                        href="/facilities/access-cards"
                                        className="underline underline-offset-4"
                                    >
                                        {visitor.accessCards.length}
                                    </Link>
                                ) : (
                                    0
                                )}
                            </dd>
                        </div>
                    </dl>
                    {visitor.notes && (
                        <p className="mt-4 text-sm text-muted-foreground">{visitor.notes}</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Their visits</CardTitle>
                </CardHeader>
                <CardContent>
                    {visitor.visits.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Never been here. Their first visit will appear here the moment it
                            is logged.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {visitor.visits.map((visit) => (
                                <li
                                    key={visit.id}
                                    className="flex flex-wrap items-center gap-3 py-3 text-sm"
                                >
                                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                                        {new Date(
                                            visit.expectedAt,
                                        ).toLocaleDateString(undefined, {
                                            dateStyle: 'medium',
                                        })}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="font-medium">{visit.hostName}</span>
                                        {visit.purpose && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {visit.purpose}
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            VISIT_STATE_STYLES[visit.state] ??
                                            'bg-gray-100 text-gray-800'
                                        }`}
                                    >
                                        {visit.stateLabel}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {visitor.accessCards.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Cards they have held</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y">
                            {visitor.accessCards.map((card) => (
                                <li
                                    key={card.id}
                                    className="flex flex-wrap items-center gap-3 py-3 text-sm"
                                >
                                    <span className="font-mono">{card.cardNumber}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {card.type.replace(/_/g, ' ').toLowerCase()}
                                    </span>
                                    <span
                                        className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            ACCESS_CARD_STATUS_STYLES[card.status] ??
                                            'bg-gray-100 text-gray-800'
                                        }`}
                                    >
                                        {card.status.toLowerCase()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {barring && (
                <BarModal
                    visitorName={visitor.displayName}
                    onClose={() => setBarring(false)}
                    onConfirm={async (reason) => {
                        try {
                            const { data } = await visitorsApi.barVisitor(visitor.id, reason);
                            toast.success(data.message, { duration: 8000 });
                            setBarring(false);
                            await load();
                        } catch (err) {
                            toast.error(
                                (err as { response?: { data?: { message?: string } } })?.response
                                    ?.data?.message ?? 'Could not bar this visitor',
                                { duration: 9000 },
                            );
                        }
                    }}
                />
            )}

            {logging && (
                <LogArrivalModal
                    visitorId={visitor.id}
                    visitorName={visitor.displayName}
                    onClose={() => setLogging(false)}
                    onConfirm={async (form) => {
                        try {
                            const { data } = await visitorsApi.logArrival({
                                visitorId: visitor.id,
                                ...form,
                            });
                            toast.success(
                                `${data.visitorName} logged. Expected to leave ${
                                    data.expectedOutAt
                                        ? new Date(data.expectedOutAt).toLocaleTimeString(undefined, {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })
                                        : 'when they choose'
                                }.`,
                            );
                            setLogging(false);
                            await load();
                        } catch (err) {
                            toast.error(
                                (err as { response?: { data?: { message?: string } } })?.response
                                    ?.data?.message ?? 'Could not log the arrival',
                                { duration: 9000 },
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}

function BarModal({
    visitorName,
    onClose,
    onConfirm,
}: {
    visitorName: string;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
}) {
    const [reason, setReason] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    return (
        <Modal isOpen onClose={onClose} title={`Bar ${visitorName} from the site`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Any arrival they attempt from now on is refused outright — the API will
                    not record it, and there is no override. That is deliberate: a warning
                    the guard can wave through just means the paper and the system will
                    disagree. If they should genuinely be admitted, lift the bar on their
                    record first, which keeps the decision and the reason together.
                </p>
                <p className="text-sm text-muted-foreground">
                    This is refused while they are on site. Check them out first.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="bar-reason">
                        Reason <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                        id="bar-reason"
                        value={reason}
                        placeholder="Caught on CCTV taking residents' mail from the lobby postbox on two occasions. Do not admit; contact the property manager."
                        onChange={(event) => setReason(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Written for whoever is on the gate at 7am, six months from now.
                    </p>
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Back
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={isSaving || reason.trim().length < 3}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(reason.trim());
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Recording…' : 'Bar from the site'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function LogArrivalModal({
    visitorId,
    visitorName,
    onClose,
    onConfirm,
}: {
    visitorId: string;
    visitorName: string;
    onClose: () => void;
    onConfirm: (form: {
        hostName: string;
        purpose?: string;
        expectedOutAt?: string;
        notes?: string;
    }) => Promise<void>;
}) {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
        now.getHours(),
    )}:${pad(now.getMinutes())}`;
    const fourHours = new Date(now.getTime() + 4 * 3600000);
    const localOut = `${fourHours.getFullYear()}-${pad(fourHours.getMonth() + 1)}-${pad(
        fourHours.getDate(),
    )}T${pad(fourHours.getHours())}:${pad(fourHours.getMinutes())}`;

    const [hostName, setHostName] = useState('');
    const [purpose, setPurpose] = useState('');
    const [expectedOutAt, setExpectedOutAt] = useState(localOut);
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    void visitorId;

    return (
        <Modal isOpen onClose={onClose} title={`Log ${visitorName} arriving`}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    They are logged as arriving now. The expected leaving time is what
                    &ldquo;overstayed&rdquo; is measured against — leave it blank and they
                    are not expected to leave on their own.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="arrival-host">
                        Here to see <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="arrival-host"
                        value={hostName}
                        placeholder="Kariuki Otieno, or 'Maintenance office'"
                        onChange={(event) => setHostName(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        A gate book with no host is a visit nobody can be asked about.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="arrival-purpose">Purpose</Label>
                        <Input
                            id="arrival-purpose"
                            value={purpose}
                            placeholder="Measuring the kitchen units"
                            onChange={(event) => setPurpose(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="arrival-out">Expected to leave by</Label>
                        <Input
                            id="arrival-out"
                            type="datetime-local"
                            value={expectedOutAt}
                            onChange={(event) => setExpectedOutAt(event.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="arrival-notes">Notes</Label>
                    <Input
                        id="arrival-notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    Arrival is {localNow.replace('T', ' ')}. Checking them in or out happens
                    from the gate book, so a pre-booked visitor and somebody at the door are
                    the same kind of record.
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        disabled={isSaving || hostName.trim().length < 2}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm({
                                hostName: hostName.trim(),
                                purpose: purpose.trim() || undefined,
                                expectedOutAt: expectedOutAt
                                    ? new Date(expectedOutAt).toISOString()
                                    : undefined,
                                notes: notes.trim() || undefined,
                            });
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Logging…' : 'Log the arrival'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
