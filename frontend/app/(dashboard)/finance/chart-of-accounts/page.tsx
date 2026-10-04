"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { accountingApi, GLAccount } from "@/lib/api";

const TYPE_LABELS: Record<GLAccount["type"], string> = {
    ASSET: "Assets",
    LIABILITY: "Liabilities",
    EQUITY: "Equity",
    REVENUE: "Revenue",
    EXPENSE: "Expenses",
};

const TYPE_ORDER: GLAccount["type"][] = [
    "ASSET",
    "LIABILITY",
    "EQUITY",
    "REVENUE",
    "EXPENSE",
];

/**
 * Chart of accounts (Module 7). The standard chart is seeded automatically the
 * first time the organization posts anything, so this page is mostly read-only
 * for day-to-day use — an accountant adds custom accounts and deactivates ones
 * they no longer post to. Codes cannot be edited: journal entries key off them.
 */
export default function ChartOfAccountsPage() {
    const router = useRouter();
    const [accounts, setAccounts] = useState<GLAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        code: "",
        name: "",
        type: "EXPENSE" as GLAccount["type"],
        subtype: "",
        normalBalance: "DEBIT" as "DEBIT" | "CREDIT",
    });

    const fetchAccounts = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await accountingApi.listAccounts();
            setAccounts(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load the chart of accounts",
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const grouped = useMemo(
        () =>
            TYPE_ORDER.map((type) => ({
                type,
                accounts: accounts.filter((account) => account.type === type),
            })).filter((group) => group.accounts.length > 0),
        [accounts],
    );

    const handleCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            await accountingApi.createAccount({
                code: form.code.trim(),
                name: form.name.trim(),
                type: form.type,
                subtype: form.subtype.trim() || undefined,
                normalBalance: form.normalBalance,
            });
            setForm({ code: "", name: "", type: "EXPENSE", subtype: "", normalBalance: "DEBIT" });
            setShowForm(false);
            fetchAccounts();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to create the account",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (account: GLAccount) => {
        try {
            await accountingApi.updateAccount(account.id, { isActive: !account.isActive });
            fetchAccounts();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to update the account",
            );
        }
    };

    const handleDelete = async (account: GLAccount) => {
        if (!confirm(`Delete account ${account.code} — ${account.name}?`)) return;
        try {
            await accountingApi.deleteAccount(account.id);
            fetchAccounts();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to delete the account",
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
                    <p className="text-muted-foreground">
                        The double-entry backbone every invoice, payment and payout posts into
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push("/finance/journal-entries")}>
                        <BookOpen className="mr-2 h-4 w-4" /> Journal Entries
                    </Button>
                    <Button onClick={() => setShowForm((value) => !value)}>
                        <Layers className="mr-2 h-4 w-4" /> New Account
                    </Button>
                </div>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">New account</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="code">Code</Label>
                                <Input
                                    id="code"
                                    required
                                    value={form.code}
                                    placeholder="5055"
                                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="name">Account name</Label>
                                <Input
                                    id="name"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="accountType">Type</Label>
                                <Select
                                    name="accountType"
                                    value={form.type}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            type: event.target.value as GLAccount["type"],
                                            normalBalance:
                                                event.target.value === "ASSET" || event.target.value === "EXPENSE"
                                                    ? "DEBIT"
                                                    : "CREDIT",
                                        })
                                    }
                                    options={TYPE_ORDER.map((type) => ({
                                        value: type,
                                        label: TYPE_LABELS[type],
                                    }))}
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="subtype">Group (optional)</Label>
                                <Input
                                    id="subtype"
                                    value={form.subtype}
                                    placeholder="Operating Expense"
                                    onChange={(e) => setForm({ ...form, subtype: e.target.value })}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Create account"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div>Loading chart of accounts...</div>
            ) : (
                <div className="space-y-6">
                    {grouped.map((group) => (
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
                                            <TableHead>Group</TableHead>
                                            <TableHead>Normal side</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead />
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {group.accounts.map((account) => (
                                            <TableRow key={account.id}>
                                                <TableCell className="font-mono">{account.code}</TableCell>
                                                <TableCell>{account.name}</TableCell>
                                                <TableCell>{account.subtype || "—"}</TableCell>
                                                <TableCell>{account.normalBalance === "DEBIT" ? "Debit" : "Credit"}</TableCell>
                                                <TableCell>
                                                    {account.isActive ? "Active" : "Inactive"}
                                                    {account.isSystem && (
                                                        <span className="ml-2 text-xs text-muted-foreground">System</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {!account.isSystem && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleToggleActive(account)}
                                                        >
                                                            {account.isActive ? "Deactivate" : "Activate"}
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(account)}>
                                                        Delete
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
