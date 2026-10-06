'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { contractsApi } from '@/lib/api';
import { CONTRACT_ENTITY_FOR_TYPE, CONTRACT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ui/entity-states';
import type { ContractType } from '@/types';

/**
 * File a contract.
 *
 * The form's real job is to make **the shape rule visible before the user hits
 * submit**, because the server refuses anything else with a sentence naming the field:
 *
 * - Four of the five types require exactly one related record, and which one depends on
 *   the type. Picking `LEASE` and then a supplier is the single most likely mistake
 *   here, and the server's answer - "A lease contract must be linked to its own record
 *   type" - is a good one, but arriving after a round trip is worse than not needing it.
 * - `COMPLIANCE` requires **none**, and that is the one genuinely surprising rule in
 *   this form. A gas safety certificate is owed to the authority and has no
 *   counterparty, so the record picker disappears rather than being disabled.
 *
 * The notice-period field carries a hint that says what it is *for*, because it is the
 * field nobody fills in and everybody needs: it is the deadline before which a decision
 * has to be made, which is not the same date as the end of the term.
 *
 * Type, the counterparty and the renewal parent are **not** editable after filing. The
 * form says so rather than offering an edit that does not exist.
 */
export default function NewContractPage() {
    const router = useRouter();
    const [type, setType] = useState<ContractType>('VENDOR');
    const [reference, setReference] = useState('');
    const [title, setTitle] = useState('');
    const [relatedId, setRelatedId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [noticeDays, setNoticeDays] = useState('');
    const [autoRenew, setAutoRenew] = useState('no');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const entity = CONTRACT_ENTITY_FOR_TYPE[type];
    const selectedType = useMemo(
        () => CONTRACT_TYPES.find((t) => t.value === type),
        [type],
    );

    // Switching type changes which record is required, so a selection made for the
    // previous type is not silently carried over - it would become a wrong-typed FK
    // that reads as "linked to something" on the register.
    useEffect(() => {
        setRelatedId('');
    }, [type]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const payload: Record<string, unknown> = {
            reference: reference.trim(),
            title: title.trim(),
            type,
            startDate: startDate || undefined,
            expiresAt: expiresAt || undefined,
            autoRenew: autoRenew === 'yes',
            notes: notes.trim() || undefined,
        };

        if (noticeDays !== '') payload.noticeDays = Number(noticeDays);
        if (entity && relatedId) payload[entity.field] = relatedId;

        try {
            const response = await contractsApi.createContract(payload as never);
            const created = response.data;
            if (created?.id) {
                router.push(`/contracts/${created.id}`);
                return;
            }
            router.push('/contracts');
        } catch (e) {
            // The server's refusals are sentences, so show the sentence rather than a
            // status code. That is the whole reason they are phrased that way.
            setError(e instanceof Error ? e.message : 'Could not file this contract.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <Button asChild variant="ghost" size="sm">
                    <Link href="/contracts">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to the register
                    </Link>
                </Button>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">File a contract</h1>
                <p className="text-sm text-muted-foreground">
                    The reference is permanent once people start citing it in letters.
                </p>
            </div>

            <form onSubmit={submit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>What it is</CardTitle>
                        <CardDescription>
                            The type decides which record the contract must be linked to, and
                            cannot be changed afterwards.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="type">Type</Label>
                            <Select
                                id="type"
                                value={type}
                                onChange={(e) => setType(e.target.value as ContractType)}
                            >
                                {CONTRACT_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </Select>
                            {selectedType?.hint ? (
                                <p className="text-xs text-muted-foreground">
                                    {selectedType.hint}
                                </p>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reference">Reference</Label>
                            <Input
                                id="reference"
                                required
                                placeholder="CON-2026-0001"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Unique within this organization. Two organizations can both
                                start at CON-0001.
                            </p>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                required
                                placeholder="Supply agreement - Nairobi Water"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Who it is with</CardTitle>
                        <CardDescription>
                            {entity
                                ? `A ${type.toLowerCase()} contract must point at exactly one ${entity.label.toLowerCase()}.`
                                : 'No record is required. A compliance certificate is owed to the authority, not to a person.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        {entity ? (
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="relatedId">{entity.label} ID</Label>
                                <Input
                                    id="relatedId"
                                    required
                                    placeholder="Paste the record id"
                                    value={relatedId}
                                    onChange={(e) => setRelatedId(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    The id of the {entity.label.toLowerCase()} in this
                                    organization. Anything else is refused &mdash; including
                                    a record from another organization, which would pass every
                                    database constraint and still be wrong.
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground md:col-span-2">
                                Nothing to link. Filing it without a counterparty is the
                                correct shape for a certificate, not an oversight.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Term and notice</CardTitle>
                        <CardDescription>
                            Leave the end date empty for an agreement that rolls until
                            terminated.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="startDate">Start date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expiresAt">End date</Label>
                            <Input
                                id="expiresAt"
                                type="date"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="noticeDays">Notice period (days)</Label>
                            <Input
                                id="noticeDays"
                                type="number"
                                min={0}
                                max={730}
                                placeholder="90"
                                value={noticeDays}
                                onChange={(e) => setNoticeDays(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Days of notice required <em>before</em> the end date. This is
                                not the same date: a 90-day notice period on a contract
                                ending in 45 days means the deadline has already passed and
                                the contract can no longer be ended. This is the field the
                                expiry report reads.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="autoRenew">Auto-renews</Label>
                            <Select
                                id="autoRenew"
                                value={autoRenew}
                                onChange={(e) => setAutoRenew(e.target.value)}
                            >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                A self-renewing contract is not nagged about; it is only
                                flagged when the notice period is the issue, because serving
                                notice is how you stop it.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Anything a reader of this register would want to know."
                        />
                    </CardContent>
                </Card>

                {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

                <div className="flex gap-2">
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Filing...' : 'File contract'}
                    </Button>
                    <Button asChild type="button" variant="outline">
                        <Link href="/contracts">Cancel</Link>
                    </Button>
                </div>
            </form>
        </div>
    );
}