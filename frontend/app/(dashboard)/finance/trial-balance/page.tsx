"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { AlertTriangle, BookOpen, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountingApi, GLTrialBalanceRow } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
    ASSET: "Assets",
    LIABILITY: "Liabilities",
    EQUITY: "Equity",
    REVENUE: "Revenue",
    EXPENSE: "Expenses",
};

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

const money = (value: number) =>
    Math.abs(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Trial balance (Module 7). The check that matters: total debits must equal
 * total credits. If they ever diverge, an entry bypassed `postEntry` — the
 * banner says so rather than quietly showing numbers that do not add up.
 */
export default function TrialBalancePage() {
    const router = useRouter();
    const [rows, setRows] = useState<GLTrialBalanceRow[]>([]);
    const [totals, setTotals] = useState({ totalDebit: 0, totalCredit: 0 });
    const [balanced, setBalanced] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");

    const fetchTrialBalance = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await accountingApi.trialBalance({
                from: from || undefined,
                to: to || undefined,
            });
            setRows(response.data.rows);
            setTotals({
                totalDebit: response.data.totalDebit,
                totalCredit: response.data.totalCredit,
            });
            setBalanced(response.data.balanced);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load the trial balance",
            );
        } finally {
            setIsLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        fetchTrialBalance();
    }, [fetchTrialBalance]);

    const grouped = useMemo(
        () =>
            TYPE_ORDER.map((type) => ({
                type,
                rows: rows.filter((row) => row.type === type),
            })).filter((group) => group.rows.length > 0),
        [rows],
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
                    <p className="text-muted-foreground">
                        What every account has been posted to over a period
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push("/finance/journal-entries")}>
                        <BookOpen className="mr-2 h-4 w-4" /> Journal Entries
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/finance/chart-of-accounts")}>
                        <Scale className="mr-2 h-4 w-4" /> Chart of Accounts
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-4 md:grid-cols-4 md:items-end">
                        <div className="space-y-2">
                            <Label htmlFor="from">From</Label>
                            <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="to">To</Label>
                            <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                            {balanced ? (
                                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                                    Debits {money(totals.totalDebit)} = credits {money(totals.totalCredit)} — the
                                    ledger balances.
                                </p>
                            ) : (
                                <p className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                                    <AlertTriangle className="h-4 w-4" /> Debits {money(totals.totalDebit)} do not
                                    equal credits {money(totals.totalCredit)} — investigate before filing.
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading trial balance...</div>
            ) : (
                grouped.map((group) => (
                    <Card key={group.type}>
                        <CardHeader>
                            <CardTitle className="text-lg">{TYPE_LABELS[group.type]}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-24">Code</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {group.rows.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-mono">{row.code}</TableCell>
                                            <TableCell>{row.name}</TableCell>
                                            <TableCell className="text-right">{row.debit ? money(row.debit) : ""}</TableCell>
                                            <TableCell className="text-right">{row.credit ? money(row.credit) : ""}</TableCell>
                                            <TableCell className="text-right font-medium">{money(row.balance)}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50 font-medium">
                                        <TableCell colSpan={2}>Totals</TableCell>
                                        <TableCell className="text-right">
                                            {money(
                                                group.rows.reduce((sum, row) => sum + row.debit, 0),
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(
                                                group.rows.reduce((sum, row) => sum + row.credit, 0),
                                            )}
                                        </TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    );
}
