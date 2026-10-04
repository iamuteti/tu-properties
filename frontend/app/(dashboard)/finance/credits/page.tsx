"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowRightLeft, PiggyBank, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { creditsApi, CustomerCredit } from "@/lib/api";

const SOURCE_LABELS: Record<CustomerCredit["source"], string> = {
    OVERPAYMENT: "Overpayment",
    UNALLOCATED_RECEIPT: "Unallocated receipt",
    GOODWILL: "Goodwill",
    REFUND_UNSPENT: "Unspent refund",
    MANUAL: "Manual",
};

const STATUS_LABELS: Record<CustomerCredit["status"], string> = {
    OPEN: "Available",
    PARTIALLY_APPLIED: "Partly used",
    APPLIED: "Fully used",
    VOID: "Void",
};

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const balanceOf = (credit: CustomerCredit) =>
    Number(credit.amount) - Number(credit.appliedAmount);

/**
 * Credit balances (Module 8). Every overpayment lands here automatically, and
 * the default action — "Apply to invoices" — spends it oldest bill first,
 * which is what an accountant almost always wants. Anything else is the
 * override.
 */
export default function CreditsPage() {
    const router = useRouter();
    const [credits, setCredits] = useState<CustomerCredit[]>([]);
    const [balances, setBalances] = useState<
        { customerKey: string; label: string; balance: number; credits: number }[]
    >([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("OPEN");
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [creditsResponse, balancesResponse] = await Promise.all([
                creditsApi.findAll(filter ? { status: filter } : undefined),
                creditsApi.balances(),
            ]);
            setCredits(creditsResponse.data);
            setBalances(balancesResponse.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load credits",
            );
        } finally {
            setIsLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalAvailable = useMemo(
        () => balances.reduce((sum, entry) => sum + entry.balance, 0),
        [balances],
    );

    const customerName = (credit: CustomerCredit) => {
        if (credit.tenant) {
            return `${credit.tenant.surname} ${credit.tenant.otherNames ?? ""}`.trim();
        }
        return credit.landlord?.name ?? credit.customerName ?? "Unassigned";
    };

    const handleApply = async (credit: CustomerCredit) => {
        const amount = balanceOf(credit);
        if (
            !confirm(
                `Apply ${money(amount)} of ${customerName(credit)}'s credit to their oldest outstanding invoices?`,
            )
        ) {
            return;
        }
        setBusyId(credit.id);
        try {
            await creditsApi.applyToInvoices(credit.id);
            fetchData();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to apply the credit",
            );
        } finally {
            setBusyId(null);
        }
    };

    const handleVoid = async (credit: CustomerCredit) => {
        if (!confirm(`Void the ${money(balanceOf(credit))} credit for ${customerName(credit)}?`)) {
            return;
        }
        setBusyId(credit.id);
        try {
            await creditsApi.void(credit.id);
            fetchData();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to void the credit",
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Customer Credits</h1>
                    <p className="text-muted-foreground">
                        Money customers are owed back — overpayments, unallocated transfers, goodwill
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push("/finance/refunds")}>
                        <Undo2 className="mr-2 h-4 w-4" /> Refunds
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Available in total</p>
                        <p className="text-2xl font-semibold">{money(totalAvailable)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Customers holding credit</p>
                        <p className="text-2xl font-semibold">{balances.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Open credits</p>
                        <p className="text-2xl font-semibold">
                            {credits.filter((credit) => balanceOf(credit) > 0).length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {balances.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">
                            <Wallet className="mr-2 inline h-5 w-5" />
                            Who is owed
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Credits</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {balances.map((entry) => (
                                    <TableRow key={entry.customerKey}>
                                        <TableCell>{entry.label}</TableCell>
                                        <TableCell>{entry.credits}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {money(entry.balance)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <div className="max-w-xs">
                <Label htmlFor="creditStatus">Status</Label>
                <Select
                    name="creditStatus"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    options={[
                        { value: "", label: "All credits" },
                        { value: "OPEN", label: "Available" },
                        { value: "PARTIALLY_APPLIED", label: "Partly used" },
                        { value: "APPLIED", label: "Fully used" },
                        { value: "VOID", label: "Void" },
                    ]}
                />
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading credits...</div>
            ) : credits.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No credits yet. They appear automatically when someone pays more than they owe.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead className="text-right">Granted</TableHead>
                                    <TableHead className="text-right">Used</TableHead>
                                    <TableHead className="text-right">Available</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {credits.map((credit) => (
                                    <TableRow key={credit.id}>
                                        <TableCell className="font-medium">
                                            {customerName(credit)}
                                        </TableCell>
                                        <TableCell>{SOURCE_LABELS[credit.source]}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {credit.reason || "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(credit.amount)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {Number(credit.appliedAmount)
                                                ? money(credit.appliedAmount)
                                                : ""}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {money(balanceOf(credit))}
                                        </TableCell>
                                        <TableCell>{STATUS_LABELS[credit.status]}</TableCell>
                                        <TableCell className="text-right">
                                            {balanceOf(credit) > 0 && credit.status !== "VOID" && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busyId === credit.id}
                                                    onClick={() => handleApply(credit)}
                                                >
                                                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                                                    Apply to invoices
                                                </Button>
                                            )}
                                            {balanceOf(credit) > 0 &&
                                                Number(credit.appliedAmount) === 0 &&
                                                credit.status !== "VOID" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={busyId === credit.id}
                                                        onClick={() => handleVoid(credit)}
                                                    >
                                                        Void
                                                    </Button>
                                                )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank className="h-4 w-4" />
                A credit is not cash — the money was already received. Applying it moves an invoice
                from outstanding to settled without touching the bank.
            </p>
        </div>
    );
}
