'use client';

import { useMemo, useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ownerStatementsApi } from '@/lib/api';
import { STATEMENT_PERIOD_PRESETS } from '@/lib/constants';
import { useStatementPreview } from '@/hooks/use-owner-statements';
import { useLandlords } from '@/hooks/use-landlords';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { StatementSummary } from './statement-summary';
import type { OwnerStatement } from '@/types';

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function presetRange(preset: string): { start: string; end: string } {
    const now = new Date();
    const lastDay = (year: number, month: number) =>
        new Date(Date.UTC(year, month + 1, 0));

    if (preset === 'last-month') {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        return {
            start: isoDay(start),
            end: isoDay(lastDay(start.getUTCFullYear(), start.getUTCMonth())),
        };
    }

    if (preset === 'this-month') {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return {
            start: isoDay(start),
            end: isoDay(new Date()),
        };
    }

    // last-quarter: the three full months before this one
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return {
        start: isoDay(start),
        end: isoDay(lastDay(endMonth.getUTCFullYear(), endMonth.getUTCMonth())),
    };
}

/**
 * Generate an owner statement for a period.
 *
 * The preview is the point: `GET /owner-statements/preview` runs exactly the
 * calculation `generate` will run, so the operator sees the income lines, the
 * charges that will be deducted and the resulting net payout *before* a
 * document exists. Nothing here accepts a money figure — the period is the only
 * input.
 */
export function StatementGenerateDialog({
    isOpen,
    onClose,
    landlordId: initialLandlordId,
    onGenerated,
}: {
    isOpen: boolean;
    onClose: () => void;
    landlordId?: string;
    onGenerated?: (statement: OwnerStatement) => void;
}) {
    const { landlords } = useLandlords({ limit: 200, sortBy: 'name', sortOrder: 'asc' });

    const [landlordId, setLandlordId] = useState(initialLandlordId ?? '');
    const [preset, setPreset] = useState('last-month');
    const initialRange = useMemo(() => presetRange('last-month'), []);
    const [periodStart, setPeriodStart] = useState(initialRange.start);
    const [periodEnd, setPeriodEnd] = useState(initialRange.end);
    const [notes, setNotes] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const { preview, isLoading: isPreviewing, error: previewError } = useStatementPreview(
        landlordId || undefined,
        periodStart || undefined,
        periodEnd || undefined,
    );

    const applyPreset = (value: string) => {
        setPreset(value);
        if (value === 'custom') return;
        const range = presetRange(value);
        setPeriodStart(range.start);
        setPeriodEnd(range.end);
    };

    const handleGenerate = async () => {
        if (!landlordId) {
            toast.error('Choose the landlord this statement is for');
            return;
        }

        setIsGenerating(true);
        try {
            const response = await ownerStatementsApi.generate({
                landlordId,
                periodStart,
                periodEnd,
                notes: notes.trim() || undefined,
            });
            toast.success(`Statement ${response.data.statementNumber} created as a draft`);
            onGenerated?.(response.data);
            onClose();
        } catch (error) {
            const message =
                (error as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message;
            toast.error(
                Array.isArray(message) ? message.join('. ') : message || 'Could not generate the statement',
            );
        } finally {
            setIsGenerating(false);
        }
    };

    const invalidRange = periodStart > periodEnd;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate owner statement" size="xl">
            <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
<div className="space-y-2 md:col-span-2">
                        <Label htmlFor="landlord">Landlord</Label>
                        <Select
                            value={landlordId}
                            options={landlords.map((landlord) => ({
                                value: landlord.id,
                                label: `${landlord.code} — ${landlord.name}`,
                            }))}
                            onChange={(event) => setLandlordId(event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="preset">Period</Label>
                        <Select
                            value={preset}
                            options={STATEMENT_PERIOD_PRESETS}
                            onChange={(event) => applyPreset(event.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="periodStart">From</Label>
                            <Input
                                id="periodStart"
                                type="date"
                                value={periodStart}
                                onChange={(event) => setPeriodStart(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="periodEnd">To</Label>
                            <Input
                                id="periodEnd"
                                type="date"
                                value={periodEnd}
                                onChange={(event) => setPeriodEnd(event.target.value)}
                            />
                        </div>
                    </div>

                    {invalidRange && (
                        <p className="text-xs text-destructive md:col-span-2">
                            The period must end on or after it starts.
                        </p>
                    )}

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notes">Notes for the owner (optional)</Label>
                        <Textarea
                            id="notes"
                            rows={2}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Printed on the statement, under the totals"
                        />
                    </div>
                </div>

                <div className="rounded-lg border bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="h-4 w-4 text-cyan-600" aria-hidden="true" />
                        What this period will produce
                    </div>

                    {!landlordId ? (
                        <p className="text-sm text-muted-foreground">
                            Choose a landlord to see the derived figures.
                        </p>
                    ) : isPreviewing ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Reading payments and charges…
                        </p>
                    ) : previewError ? (
                        <p className="text-sm text-destructive">{previewError}</p>
                    ) : preview ? (
                        <div className="space-y-4">
                            <StatementSummary values={preview} />

                            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                                <p>
                                    {preview.incomeLines.length} invoice
                                    {preview.incomeLines.length === 1 ? '' : 's'} contributed rent
                                    in this period.
                                </p>
                                <p>
                                    {preview.expenseLines.length} charge
                                    {preview.expenseLines.length === 1 ? '' : 's'} will be deducted.
                                </p>
                            </div>

                            {preview.expenseLines.length > 0 && (
                                <ul className="space-y-1 rounded border bg-white p-3 text-xs">
                                    {preview.expenseLines.map((line) => (
                                        <li key={line.ref} className="flex justify-between gap-4">
                                            <span className="truncate">
                                                {line.category} — {line.description}
                                            </span>
                                            <span className="tabular-nums">
                                                {line.amount.toLocaleString()}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {preview.priorStatements.some(
                                (statement) => statement.status !== 'VOID',
                            ) && (
                                <p className="text-xs text-amber-700">
                                    A statement already covers part of this period — generating
                                    this one will be refused until it is voided.
                                </p>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isGenerating}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGenerate}
                        disabled={
                            isGenerating ||
                            !landlordId ||
                            invalidRange ||
                            !periodStart ||
                            !periodEnd
                        }
                    >
                        <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isGenerating ? 'Generating…' : 'Generate statement'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}