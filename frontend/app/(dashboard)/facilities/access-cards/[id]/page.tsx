'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Ban, PauseCircle, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { accessCardsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { ACCESS_CARD_STATUS_STYLES, ACCESS_CARD_TYPES } from '@/lib/constants';
import type { AccessCardAction, AccessCardRow } from '@/types';

/**
 * One access card.
 *
 * Six buttons, and **every one of them is an action rather than a field**: there is no
 * `PATCH /status` on this resource anywhere in the module. Two of them are the
 * interesting ones:
 *
 * - **There is no "reactivate" on a lost card**, and that refusal is the design. A
 *   lost card has been in somebody else's pocket, so its number is compromised.
 *   Reactivating it would mean two people hold "AC-0007" and one of them found it.
 *   The way back is a *new* card, recorded against this one, which is also the only
 *   way the history answers "how many times has this resident lost their fob".
 * - **Revoking needs a reason**, because it cannot be undone and it is the row
 *   somebody is asked about after a dispute.
 *
 * The card's state is shown as the *effective* status, so a lapsed date is visible
 * here rather than only at the reader.
 */
export default function AccessCardDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [card, setCard] = useState<AccessCardRow | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [noteAction, setNoteAction] = useState<
        'SUSPEND' | 'MARK_LOST' | 'REVOKE' | null
    >(null);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await accessCardsApi.accessCard(id);
            setCard(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That card does not exist in your organization.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the card.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const run = async (action: AccessCardAction, note?: string) => {
        if (!id) return;
        try {
            await callAction(id, action, note);
            toast.success(
                action === 'SUSPEND'
                    ? 'Card suspended. It will not open anything until it is brought back.'
                    : action === 'REACTIVATE'
                      ? 'Card is in use again.'
                      : action === 'MARK_LOST'
                        ? 'Recorded as lost. Issue a replacement — this number is treated as compromised.'
                        : action === 'MARK_EXPIRED'
                          ? 'Card ended early.'
                          : 'Card revoked.',
            );
            await load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                    'Could not do that',
                { duration: 9000 },
            );
        }
    };

    if (isLoading) return <LoadingState label="Loading the card…" />;
    if (error || !card) {
        return (
            <div className="space-y-4">
                <Button variant="ghost" asChild className="-ml-2">
                    <Link href="/facilities/access-cards">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to access cards
                    </Link>
                </Button>
                <ErrorState message={error ?? 'Card not found.'} onRetry={load} />
            </div>
        );
    }

    const statusStyle =
        ACCESS_CARD_STATUS_STYLES[card.effectiveStatus] ?? 'bg-gray-100 text-gray-800';
    const derived = card.effectiveStatus !== card.status;
    const isHeld = card.holder !== 'NONE';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/facilities/access-cards" aria-label="Back to access cards">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{card.cardNumber}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}
                                title={
                                    derived
                                        ? `The record still says ${card.status.toLowerCase()}, but the expiry date has passed, so this is what the gate honours.`
                                        : undefined
                                }
                            >
                                {card.statusLabel}
                                {derived && (
                                    <span className="ml-1 text-[10px] uppercase">by date</span>
                                )}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {card.holderName}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Opens: {card.opensDescription}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Only what the record's own state allows. The API refuses anything
                        else with a sentence explaining why, and offering it here would
                        be offering a 409. */}
                    {card.status === 'ACTIVE' && (
                        <>
                            <Button variant="outline" onClick={() => setNoteAction('SUSPEND')}>
                                <PauseCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                                Suspend
                            </Button>
                            <Button variant="outline" onClick={() => setNoteAction('MARK_LOST')}>
                                <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                                Report lost
                            </Button>
                        </>
                    )}
                    {card.status === 'SUSPENDED' && (
                        <Button variant="outline" onClick={() => run('REACTIVATE')}>
                            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Bring back into use
                        </Button>
                    )}
                    {/* Ending early is offered while the card is still ACTIVE or
                        SUSPENDED — the contractor whose visa ran out before the card
                        did. Nobody is at a reader at 23:59 on the expiry date. */}
                    {(card.status === 'ACTIVE' || card.status === 'SUSPENDED') &&
                        card.expiresAt != null && (
                            <Button variant="outline" onClick={() => run('MARK_EXPIRED')}>
                                End it now
                            </Button>
                        )}
                    {card.status !== 'REVOKED' && card.status !== 'LOST' && (
                        <Button variant="outline" onClick={() => setNoteAction('REVOKE')}>
                            <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                            Revoke
                        </Button>
                    )}
                </div>
            </div>

            {/* The lost case, explained rather than just refused. */}
            {card.status === 'LOST' && (
                <Card className="border-orange-300 bg-orange-50/50">
                    <CardHeader>
                        <CardTitle className="text-orange-900">Reported lost</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p className="text-orange-900">
                            A lost card has been in somebody else&rsquo;s pocket, so its
                            number is treated as compromised. It is deliberately{' '}
                            <strong>not reactivatable</strong> — bringing it back would mean
                            two people hold {card.cardNumber} and one of them found it.
                        </p>
                        {card.replacementCardId && (
                            <p>
                                Replaced by{' '}
                                <Link
                                    href={`/facilities/access-cards/${card.replacementCardId}`}
                                    className="font-medium underline underline-offset-4"
                                >
                                    its successor card
                                </Link>
                                , which is the only way back and the record that answers
                                &ldquo;how many times has this person lost their fob&rdquo;.
                            </p>
                        )}
                        {!card.replacementCardId && isHeld && (
                            <p className="text-xs text-orange-800">
                                No replacement has been recorded yet. Issue a new card and
                                record it here.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>The card</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div>
                            <dt className="text-muted-foreground">Type</dt>
                            <dd>
                                {ACCESS_CARD_TYPES.find((entry) => entry.value === card.type)
                                    ?.label ?? card.type}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Holder</dt>
                            <dd>{card.holderName}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Issued</dt>
                            <dd>{new Date(card.issuedAt).toLocaleDateString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Expires</dt>
                            <dd>
                                {card.expiresAt
                                    ? new Date(card.expiresAt).toLocaleDateString()
                                    : 'never'}
                                {card.expiringSoon && (
                                    <span className="ml-1 text-xs text-amber-700">
                                        {card.daysUntilExpiry} days
                                    </span>
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Property</dt>
                            <dd>{card.property?.name ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Unit</dt>
                            <dd>{card.unit?.name ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Facility</dt>
                            <dd>{card.facility?.name ?? '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Last seen</dt>
                            <dd>
                                {card.lastSeenAt ? (
                                    new Date(card.lastSeenAt).toLocaleString()
                                ) : (
                                    <span className="text-muted-foreground">
                                        no reader has seen it
                                    </span>
                                )}
                            </dd>
                        </div>
                    </dl>

                    {card.revokedReason && (
                        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm">
                            <p className="text-muted-foreground">Revoked</p>
                            <p className="text-red-900">{card.revokedReason}</p>
                            <p className="mt-1 text-xs text-red-700">
                                {card.revokedAt
                                    ? new Date(card.revokedAt).toLocaleString()
                                    : ''}
                                . This cannot be undone — that is why the reason is
                                required.
                            </p>
                        </div>
                    )}

                    {card.notes && (
                        <p className="mt-4 text-sm text-muted-foreground">{card.notes}</p>
                    )}

                    <p className="mt-4 text-xs text-muted-foreground">
                        Data tracking only — there is no reader integration yet, which is
                        why &ldquo;last seen&rdquo; is empty on every card. The column exists
                        so adding one does not need a migration later.
                    </p>
                </CardContent>
            </Card>

            {card.recentVisits && card.recentVisits.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Used for a visit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y">
                            {card.recentVisits.map((visit) => (
                                <li key={visit.id} className="py-2 text-sm">
                                    {new Date(visit.createdAt).toLocaleString()}
                                    {visit.checkedOutAt && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            left{' '}
                                            {new Date(
                                                visit.checkedOutAt,
                                            ).toLocaleTimeString(undefined, {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {noteAction && (
                <NoteModal
                    action={noteAction}
                    cardNumber={card.cardNumber}
                    holderName={card.holderName}
                    onClose={() => setNoteAction(null)}
                    onConfirm={async (note) => {
                        await run(noteAction, note);
                        setNoteAction(null);
                    }}
                />
            )}
        </div>
    );
}

/** One method per transition — never a generic `update(status)`. */
function callAction(
    id: string,
    action: AccessCardAction,
    note?: string,
): Promise<unknown> {
    switch (action) {
        case 'SUSPEND':
            return accessCardsApi.suspendCard(id, note ?? '');
        case 'REACTIVATE':
            return accessCardsApi.reactivateCard(id, note);
        case 'MARK_LOST':
            return accessCardsApi.markCardLost(id, note ?? '');
        case 'MARK_EXPIRED':
            return accessCardsApi.markCardExpired(id, note);
        case 'REVOKE':
            return accessCardsApi.revokeCard(id, note ?? '');
        case 'RECORD_REPLACEMENT':
            throw new Error('A replacement card must be issued first.');
        default:
            return Promise.reject(new Error(`Unknown card action: ${action}`));
    }
}

function NoteModal({
    action,
    cardNumber,
    holderName,
    onClose,
    onConfirm,
}: {
    action: 'SUSPEND' | 'MARK_LOST' | 'REVOKE';
    cardNumber: string;
    holderName: string;
    onClose: () => void;
    onConfirm: (note: string) => Promise<void>;
}) {
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const copy = {
        SUSPEND: {
            title: `Suspend ${cardNumber}`,
            body: `A suspension is temporary and ${holderName} can have it lifted. Say why, so that lifting it later is a decision rather than an afterthought.`,
            placeholder: 'Reported in the wrong pocket; not seen for a fortnight.',
            verb: 'Suspend it',
        },
        MARK_LOST: {
            title: `Report ${cardNumber} lost`,
            body: `${holderName} loses access to this card permanently — its number is treated as compromised, so there is no bringing it back. The way forward is a new card. Say where or how it was lost, because that is what a repeat tells you.`,
            placeholder: 'Left on a school trip in February; nobody has seen it since.',
            verb: 'Record it as lost',
        },
        REVOKE: {
            title: `Revoke ${cardNumber}`,
            body: `This ends ${holderName}'s access and cannot be undone. It is the record somebody will be asked about after a dispute, which is why the reason is required.`,
            placeholder: 'Resident moved out on 30 September; flat re-let.',
            verb: 'Revoke it',
        },
    }[action];

    return (
        <Modal isOpen onClose={onClose} title={copy.title}>
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{copy.body}</p>
                <div className="space-y-2">
                    <Label htmlFor="card-note">
                        Reason <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="card-note"
                        value={note}
                        placeholder={copy.placeholder}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Back
                    </Button>
                    <Button
                        variant={action === 'REVOKE' ? 'destructive' : 'default'}
                        disabled={isSaving || note.trim().length === 0}
                        onClick={async () => {
                            setIsSaving(true);
                            await onConfirm(note.trim());
                            setIsSaving(false);
                        }}
                    >
                        {isSaving ? 'Recording…' : copy.verb}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
