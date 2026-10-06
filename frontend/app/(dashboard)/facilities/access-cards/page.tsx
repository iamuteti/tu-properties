'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, KeyRound, Plus } from 'lucide-react';
import { accessCardsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { ACCESS_CARD_STATUSES, ACCESS_CARD_STATUS_STYLES, ACCESS_CARD_TYPES } from '@/lib/constants';
import type { AccessCardRow, AccessCardStatus } from '@/types';

/**
 * The access-card register.
 *
 * **The most sensitive list in the product**, and the two things on it that are easy
 * to get wrong are both handled deliberately:
 *
 * - **The status column shown is `effectiveStatus`, not `status`.** A card whose
 *   `expiresAt` has passed *behaves* as expired whether or not anybody flipped the
 *   column, because nobody is going to be standing at a reader at 23:59 on the expiry
 *   date. Showing the raw column would tell a guard a lapsed contractor pass is fine.
 *   Where they differ, the row says so.
 * - **`?status=EXPIRED` filters on the same derived value**, which is why the filter
 *   lives in the API rather than in the browser: a filter that disagreed with what the
 *   gate honours would hide live cards.
 *
 * Data tracking only — there is no reader integration. `lastSeenAt` exists so that
 * adding one does not need a migration in the middle of the project.
 */
export default function AccessCardsPage() {
    const router = useRouter();
    const [cards, setCards] = useState<AccessCardRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await accessCardsApi.accessCards({
                ...(type ? { type } : {}),
                ...(status ? { status } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            setCards(data);
        } catch (err) {
            const code = (err as { response?: { status?: number } })?.response?.status;
            setError(
                code === 403
                    ? 'The card register is restricted to the roles that control access to the building. If that is your job, ask an administrator for the `access_cards` permission.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the card register.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [type, status, search]);

    useEffect(() => {
        load();
    }, [load]);

    const usable = cards.filter((card) => card.isUsable).length;
    const lapsed = cards.filter(
        (card) => card.effectiveStatus !== card.status,
    ).length;
    const expiringSoon = cards.filter((card) => card.expiringSoon).length;

    const actionsFor = (card: AccessCardRow): RowAction<AccessCardRow>[] => [
        {
            label: 'Open the card',
            onSelect: () => router.push(`/facilities/access-cards/${card.id}`),
        },
        // No "delete". A card that issued access and no longer does so is revoked with
        // a reason instead — deleting the row would make "who could get in last
        // month" unanswerable.
        {
            label: 'Issue a card',
            onSelect: () => router.push('/facilities/access-cards/new'),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Access cards</h1>
                    <p className="text-muted-foreground">
                        Who holds a fob, what it opens and when it stops working.
                        {usable > 0 && (
                            <span className="ml-1 font-medium text-emerald-700">
                                {usable} in use.
                            </span>
                        )}
                        {expiringSoon > 0 && (
                            <span className="ml-1 font-medium text-amber-700">
                                {expiringSoon} expiring within 30 days.
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={accessCardsApi.accessCardsExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/facilities/access-cards/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Issue a card
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                    <Label htmlFor="cardType">Type</Label>
                    <Select
                        name="cardType"
                        value={type}
                        onChange={(event) => setType(event.target.value)}
                        options={[
                            { value: '', label: 'Every kind' },
                            ...ACCESS_CARD_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-48">
                    <Label htmlFor="cardStatus">Status</Label>
                    <Select
                        name="cardStatus"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        options={[
                            // Empty means no filter at all, which is a different meaning
                            // from "every status" and the query string wants this one.
                            { value: '', label: 'Any status' },
                            ...ACCESS_CARD_STATUSES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="cardSearch">Search</Label>
                    <Input
                        id="cardSearch"
                        value={search}
                        placeholder="Card number, holder, unit or property"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the card register…" />
            ) : cards.length === 0 ? (
                <EmptyState
                    title="No cards match"
                    description={
                        cards.length === 0 && (type || status || search)
                            ? 'Clear the filters to see the whole register.'
                            : 'No cards have been issued. Whoever holds one can be a member of staff, a resident, a contact, or a visitor handed a temporary permit.'
                    }
                    icon={<KeyRound className="h-8 w-8" aria-hidden="true" />}
                    action={
                        <Button asChild>
                            <Link href="/facilities/access-cards/new">Issue the first card</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Card</TableHead>
                                    <TableHead>Holder</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Opens</TableHead>
                                    <TableHead>Issued</TableHead>
                                    <TableHead>Expires</TableHead>
                                    <TableHead>Standing</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cards.map((card) => (
                                    <TableRow key={card.id}>
                                        <TableCell className="font-mono text-xs">
                                            <Link
                                                href={`/facilities/access-cards/${card.id}`}
                                                className="underline-offset-4 hover:underline"
                                            >
                                                {card.cardNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            {card.holderName}
                                            <p className="text-xs text-muted-foreground">
                                                {card.holder === 'NONE'
                                                    ? 'gate spare'
                                                    : card.holder.toLowerCase()}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {ACCESS_CARD_TYPES.find(
                                                (entry) => entry.value === card.type,
                                            )?.label ?? card.type}
                                        </TableCell>
                                        <TableCell className="max-w-[14rem] truncate text-xs">
                                            {card.opensDescription}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {new Date(
                                                card.issuedAt,
                                            ).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {card.expiresAt ? (
                                                <>
                                                    {new Date(
                                                        card.expiresAt,
                                                    ).toLocaleDateString()}
                                                    {card.expiringSoon && (
                                                        <span className="ml-1 text-amber-700">
                                                            soon
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                'never'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusPill
                                                effective={card.effectiveStatus}
                                                raw={card.status}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={card}
                                                actions={actionsFor(card)}
                                                label={`Actions for card ${card.cardNumber}`}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

/**
 * Shows the **effective** status, and says so when it differs from the column.
 *
 * That distinction is the point: a card whose date has passed while its column still
 * says ACTIVE is the exact case a guard needs to be warned about, and a badge that
 * quietly showed `ACTIVE` would defeat the whole mechanism.
 */
function StatusPill({
    effective,
    raw,
}: {
    effective: AccessCardStatus;
    raw: AccessCardStatus;
}) {
    const style = ACCESS_CARD_STATUS_STYLES[effective] ?? 'bg-gray-100 text-gray-800';
    const label = effective.charAt(0) + effective.slice(1).toLowerCase();
    const derived = effective !== raw;

    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
            title={
                derived
                    ? `The record still says ${raw.toLowerCase()}, but the expiry date has passed, so this is what the gate honours.`
                    : undefined
            }
        >
            {label}
            {derived && <span className="ml-1 text-[10px] uppercase">by date</span>}
        </span>
    );
}
