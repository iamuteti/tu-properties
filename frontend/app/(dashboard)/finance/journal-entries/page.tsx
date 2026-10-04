"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { BookOpen, RotateCcw, Scale, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountingApi, GLAccount, GLJournalEntry } from "@/lib/api";

const SOURCES = [
    { value: "", label: "All sources" },
    { value: "INVOICE", label: "Invoices" },
    { value: "RECEIPT", label: "Receipts" },
    { value: "PAYMENT", label: "Payments" },
    { value: "PAYOUT", label: "Landlord payouts" },
    { value: "MANUAL", label: "Manual" },
];

const SOURCE_LABELS: Record<string, string> = {
    INVOICE: "Invoice",
    RECEIPT: "Receipt",
    PAYMENT: "Payment",
    PAYOUT: "Landlord payout",
    LEASE: "Lease",
    MANUAL: "Manual",
};

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface DraftLine {
    accountCode: string;
    debit: string;
    credit: string;
    description: string;
}

/**
 * Journal entries (Module 7). Routine transactions are posted automatically by
 * the backend when an invoice is issued or money is received — this page shows
 * that ledger and allows the manual adjusting entry or the reversal an
 * accountant occasionally needs. Nothing is ever edited in place: an entry that
 * was wrong gets a reversing entry.
 */
export default function JournalEntriesPage() {
    const router = useRouter();
    const [entries, setEntries] = useState<GLJournalEntry[]>([]);
    const [accounts, setAccounts] = useState<GLAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [memo, setMemo] = useState("");
    const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [lines, setLines] = useState<DraftLine[]>([
        { accountCode: "", debit: "", credit: "", description: "" },
        { accountCode: "", debit: "", credit: "", description: "" },
    ]);

    const postableAccounts = useMemo(
        () => accounts.filter((account) => account.isPostable && account.isActive),
        [accounts],
    );

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await accountingApi.listEntries(source ? { source } : undefined);
            setEntries(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load journal entries",
            );
        } finally {
            setIsLoading(false);
        }
    }, [source]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    useEffect(() => {
        accountingApi
            .listAccounts()
            .then((response) => setAccounts(response.data))
            .catch(() => setAccounts([]));
    }, []);

    const draftTotals = useMemo(() => {
        const debit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const credit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        return { debit, credit, difference: Math.round((debit - credit) * 100) / 100 };
    }, [lines]);

    const updateLine = (index: number, patch: Partial<DraftLine>) => {
        setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    };

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await accountingApi.createEntry({
                entryDate,
                memo,
                lines: lines
                    .filter((line) => line.accountCode && (Number(line.debit) > 0 || Number(line.credit) > 0))
                    .map((line) => ({
                        accountCode: line.accountCode,
                        debit: Number(line.debit || 0),
                        credit: Number(line.credit || 0),
                        description: line.description || undefined,
                    })),
            });
            setMemo("");
            setLines([
                { accountCode: "", debit: "", credit: "", description: "" },
                { accountCode: "", debit: "", credit: "", description: "" },
            ]);
            setShowForm(false);
            fetchEntries();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to post the journal entry",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleReverse = async (entry: GLJournalEntry) => {
        if (
            !confirm(
                `Reverse ${entry.entryNumber}? A matching reversing entry will be posted — nothing is deleted.`,
            )
        ) {
            return;
        }
        try {
            await accountingApi.reverseEntry(entry.id);
            fetchEntries();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to reverse the entry",
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Journal Entries</h1>
                    <p className="text-muted-foreground">
                        Every posting the ledger has made, and the ones you post by hand
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push("/finance/trial-balance")}>
                        <Scale className="mr-2 h-4 w-4" /> Trial Balance
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/finance/chart-of-accounts")}>
                        <BookOpen className="mr-2 h-4 w-4" /> Chart of Accounts
                    </Button>
                    <Button onClick={() => setShowForm((value) => !value)}>
                        <Plus className="mr-2 h-4 w-4" /> Manual Entry
                    </Button>
                </div>
            </div>

            <div className="max-w-xs">
                <Select
                    name="source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    options={SOURCES}
                />
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Manual journal entry</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="entryDate">Date</Label>
                                    <Input
                                        id="entryDate"
                                        type="date"
                                        value={entryDate}
                                        onChange={(event) => setEntryDate(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="memo">Memo</Label>
                                    <Input
                                        id="memo"
                                        value={memo}
                                        placeholder="What this entry is for"
                                        onChange={(event) => setMemo(event.target.value)}
                                    />
                                </div>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line, index) => (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <Select
                                                    name={`account-${index}`}
                                                    value={line.accountCode}
                                                    placeholder="Select account"
                                                    search
                                                    onChange={(event) => updateLine(index, { accountCode: event.target.value })}
                                                    options={postableAccounts.map((account) => ({
                                                        value: account.code,
                                                        label: `${account.code} — ${account.name}`,
                                                    }))}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={line.description}
                                                    onChange={(event) => updateLine(index, { description: event.target.value })}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    className="text-right"
                                                    inputMode="decimal"
                                                    value={line.debit}
                                                    onChange={(event) => updateLine(index, { debit: event.target.value, credit: "" })}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    className="text-right"
                                                    inputMode="decimal"
                                                    value={line.credit}
                                                    onChange={(event) => updateLine(index, { credit: event.target.value, debit: "" })}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {lines.length > 2 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="text-sm text-muted-foreground">
                                    Debits {money(draftTotals.debit)} · Credits {money(draftTotals.credit)} ·{" "}
                                    <span className={draftTotals.difference === 0 ? "text-green-700" : "text-destructive"}>
                                        {draftTotals.difference === 0
                                            ? "Balanced"
                                            : `Out by ${money(Math.abs(draftTotals.difference))}`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            setLines((current) => [
                                                ...current,
                                                { accountCode: "", debit: "", credit: "", description: "" },
                                            ])
                                        }
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Add line
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSaving || draftTotals.difference !== 0}
                                    >
                                        {isSaving ? "Posting..." : "Post entry"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div>Loading journal entries...</div>
            ) : entries.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No journal entries yet. They are posted automatically when you issue an
                        invoice or receive money.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Entry</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Memo</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries.map((entry) => {
                                    const total = entry.lines.reduce(
                                        (sum, line) => sum + Number(line.debit),
                                        0,
                                    );
                                    const isOpen = expanded === entry.id;
                                    return (
                                        <React.Fragment key={entry.id}>
                                            <TableRow>
                                                <TableCell
                                                    className="cursor-pointer font-mono"
                                                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                                                >
                                                    {entry.entryNumber}
                                                </TableCell>
                                                <TableCell>{new Date(entry.entryDate).toLocaleDateString()}</TableCell>
                                                <TableCell>{SOURCE_LABELS[entry.source] ?? entry.source}</TableCell>
                                                <TableCell className="max-w-xs truncate">{entry.memo || "—"}</TableCell>
                                                <TableCell className="text-right">{money(total)}</TableCell>
                                                <TableCell>
                                                    {entry.status === "REVERSED" ? (
                                                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                                            Reversed
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                                            Posted
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {entry.status === "POSTED" && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleReverse(entry)}
                                                        >
                                                            <RotateCcw className="mr-2 h-4 w-4" /> Reverse
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            {isOpen && (
                                                <TableRow key={`${entry.id}-lines`}>                                                    <TableCell colSpan={7} className="bg-muted/30">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Account</TableHead>
                                                                    <TableHead>Description</TableHead>
                                                                    <TableHead className="text-right">Debit</TableHead>
                                                                    <TableHead className="text-right">Credit</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {entry.lines.map((line) => (
                                                                    <TableRow key={line.id}>
                                                                        <TableCell className="font-mono">
                                                                            {line.account.code} — {line.account.name}
                                                                        </TableCell>
                                                                        <TableCell>{line.description || "—"}</TableCell>
                                                                        <TableCell className="text-right">
                                                                            {Number(line.debit) ? money(line.debit) : ""}
                                                                        </TableCell>
                                                                        <TableCell className="text-right">
                                                                            {Number(line.credit) ? money(line.credit) : ""}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
