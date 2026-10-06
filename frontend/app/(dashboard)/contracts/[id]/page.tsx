'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { contractsApi } from '@/lib/api';
import { CONTRACT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import { ContractStatusBadge, ExpiryCell } from '../_components';
import type { ContractDetail } from '@/types';

/**
 * One contract.
 *
 * **The renewal chain is the reason this screen exists.** An end date answers "when
 * does this end"; the chain answers "what happened to this one?", which is the
 * question a renewal negotiation actually turns on and the one a row of dates cannot.
 * It is walked server-side with a cycle guard, because `renewalOfId` is typed in by
 * hand from scanned paperwork and a↔b is possible to enter.
 *
 * Two things are deliberately absent:
 *
 * - **No status editor.** `status` is derived from the clock and is not a column. A
 *   control for it would either do nothing or lie.
 * - **No "edit type" or "edit counterparty".** Both are the record's identity: changing
 *   either would re-point a signed document at a different counterparty, which is a new
 *   contract rather than an edit. A mis-filed contract is deleted and refiled, and the
 *   delete button below says exactly that.
 */
export default function ContractDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const id = params?.id;

    const [contract, setContract] = useState<ContractDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isActing, setIsActing] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await contractsApi.contract(id);
            setContract(response.data ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load this contract.');
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    /**
     * Renew.
     *
     * A named action, not a date edit: it creates a **new** contract pointing back at
     * this one, because the end date below is evidence. Type and counterparty are
     * inherited by the server - a renewal naming a different landlord is not a renewal -
     * so this form only asks for the new dates.
     */
    const renew = async () => {
        if (!contract) return;
        const notice = contract.noticeDays ?? 90;
        // `expiresAt` is a `string` on the wire; `new Date(null)` would be the epoch and
        // silently produce a term ending in 1970, so the fallback is explicit.
        const startsAt = contract.expiresAt ? new Date(contract.expiresAt) : new Date();
        const endsAt = new Date(startsAt.getTime());
        endsAt.setFullYear(endsAt.getFullYear() + 1);

        setIsActing(true);
        setActionError(null);
        try {
            const response = await contractsApi.renewContract(contract.id, {
                expiresAt: endsAt.toISOString(),
                noticeDays: notice,
                autoRenew: contract.autoRenew,
            });
            const created = response.data;
            if (created?.id) {
                router.push(`/contracts/${created.id}`);
                return;
            }
            await load();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Could not renew this contract.');
        } finally {
            setIsActing(false);
        }
    };

    /**
     * Delete - meaning "this row was entered in error", not "the contract has lapsed".
     * A lapse is recorded by letting the term end, which keeps the counterparty and the
     * dates. The server refuses this on a contract that has been renewed and explains
     * why, because deleting it would silently orphan the successor.
     */
    const remove = async () => {
        if (!contract) return;
        if (
            !window.confirm(
                `Delete ${contract.reference}?\n\nThis is for a row entered in error. If the contract has actually lapsed, close this without deleting - the end date and the counterparty are the record.`,
            )
        ) {
            return;
        }
        setIsActing(true);
        setActionError(null);
        try {
            await contractsApi.deleteContract(contract.id);
            router.push('/contracts');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Could not delete this contract.');
        } finally {
            setIsActing(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the contract." />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!contract) return <ErrorState message="Contract not found." onRetry={load} />;

    const typeLabel =
        CONTRACT_TYPES.find((t) => t.value === contract.type)?.label ?? contract.type;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/contracts">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to the register
                        </Link>
                    </Button>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight">
                        {contract.reference}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {contract.title} &middot; {typeLabel}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={renew} disabled={isActing || contract.status === 'EXPIRED'}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Renew for a further term
                    </Button>
                    <Button variant="outline" onClick={remove} disabled={isActing}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </Button>
                </div>
            </div>

            {actionError ? <ErrorState message={actionError} onRetry={load} /> : null}

            <Card>
                <CardHeader>
                    <CardTitle>Terms</CardTitle>
                    <CardDescription>
                        Status is derived from these dates and from whether a successor
                        exists, so it is never stored and never editable.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <ContractStatusBadge status={contract.status} showHint />
                    </div>
                    <div className="space-y-2">
                        <Label>End date</Label>
                        <ExpiryCell
                            expiresAt={contract.expiresAt}
                            daysUntilExpiry={contract.daysUntilExpiry}
                            noticeDueAt={contract.noticeDueAt}
                            noticeDays={contract.noticeDays}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Counterparty</Label>
                        <p className="text-sm">
                            {contract.relatedLabel ?? (
                                <span className="text-muted-foreground">
                                    None. A compliance certificate is owed to the authority,
                                    not to a person.
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Auto-renews</Label>
                        <p className="text-sm">
                            {contract.autoRenew
                                ? 'Yes. It renews unless notice is served.'
                                : 'No. Somebody has to act before the end date.'}
                        </p>
                    </div>
                    {contract.startDate ? (
                        <div className="space-y-2">
                            <Label>Start date</Label>
                            <p className="text-sm">
                                {new Date(contract.startDate).toLocaleDateString()}
                            </p>
                        </div>
                    ) : null}
                    {contract.notes ? (
                        <div className="space-y-2 md:col-span-2">
                            <Label>Notes</Label>
                            <p className="whitespace-pre-wrap text-sm">{contract.notes}</p>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Renewal history</CardTitle>
                    <CardDescription>
                        Newest first, walked back to the original agreement. This is what
                        answers &ldquo;what happened to this one?&rdquo; - an end date cannot.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {contract.renewalChain.length <= 1 ? (
                        <p className="text-sm text-muted-foreground">
                            This contract has never been renewed. If it has been, it was
                            filed without pointing at its predecessor, and the chain below
                            will not know about it.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Ended</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contract.renewalChain.map((link) => (
                                    <TableRow key={link.id}>
                                        <TableCell>
                                            {link.isCurrent ? (
                                                <span className="font-medium">{link.reference}</span>
                                            ) : (
                                                <Link
                                                    href={`/contracts/${link.id}`}
                                                    className="underline-offset-4 hover:underline"
                                                >
                                                    {link.reference}
                                                </Link>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {link.expiresAt
                                                ? new Date(link.expiresAt).toLocaleDateString()
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {link.isCurrent ? 'This contract' : 'Superseded'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {contract.renewals.length > 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Renewed as{' '}
                            {contract.renewals.map((r) => r.reference).join(', ')}. This row
                            is kept because its end date is the record of what was agreed.
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Documents</CardTitle>
                    <CardDescription>
                        One authoritative signed copy, plus any addenda attached to this
                        contract.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {contract.document ? (
                        <div className="flex items-center gap-2 rounded-md border p-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{contract.document.fileName}</span>
                            <span className="text-xs text-muted-foreground">
                                Authoritative copy &middot; v{contract.document.version}
                            </span>
                        </div>
                    ) : (
                        <p className="text-sm text-amber-700">
                            No signed copy on file. The register has the row; the paper is
                            somewhere else. Attach it from the Documents screen against
                            this contract.
                        </p>
                    )}

                    {contract.attachments.length > 0 ? (
                        <div>
                            <Label>Addenda and riders</Label>
                            <ul className="mt-2 space-y-1">
                                {contract.attachments.map((attachment) => (
                                    <li
                                        key={attachment.id}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        {attachment.fileName}
                                        <span className="text-xs text-muted-foreground">
                                            v{attachment.version}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}