"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { Clock, Plus, Receipt, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { payablesApi, Supplier, SupplierBill } from "@/lib/api";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BILL_STATUS: Record<string, string> = {
    DRAFT: "Draft",
    OPEN: "Open",
    PARTIALLY_PAID: "Partly paid",
    PAID: "Paid",
    VOID: "Void",
};

/**
 * Accounts payable (Module 7). The aging summary is first because it is the
 * question this page exists to answer — who do we owe, and how late is it —
 * and the bill list below it is the work.
 */
export default function PayablesPage() {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [bills, setBills] = useState<SupplierBill[]>([]);
    const [aging, setAging] = useState<Awaited<ReturnType<typeof payablesApi.aging>>["data"] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [showSupplierForm, setShowSupplierForm] = useState(false);
    const [supplierName, setSupplierName] = useState("");
    const [supplierTerms, setSupplierTerms] = useState("30");
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [suppliersResponse, billsResponse, agingResponse] = await Promise.all([
                payablesApi.findSuppliers(),
                payablesApi.findBills(statusFilter ? { status: statusFilter } : undefined),
                payablesApi.aging(),
            ]);
            setSuppliers(suppliersResponse.data);
            setBills(billsResponse.data);
            setAging(agingResponse.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load payables",
            );
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        load();
    }, [load]);

    const totals = useMemo(
        () => ({
            outstanding: bills
                .filter((bill) => bill.status !== "PAID" && bill.status !== "VOID")
                .reduce((sum, bill) => sum + Number(bill.balanceAmount), 0),
            overdue: aging?.buckets
                ? aging.buckets.days1to30 +
                  aging.buckets.days31to60 +
                  aging.buckets.days61to90 +
                  aging.buckets.over90
                : 0,
        }),
        [bills, aging],
    );

    const handleCreateSupplier = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await payablesApi.createSupplier({
                name: supplierName.trim(),
                paymentTermsDays: Number(supplierTerms) || undefined,
            });
            setSupplierName("");
            setShowSupplierForm(false);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to create the supplier",
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payables</h1>
                    <p className="text-muted-foreground">
                        What we owe suppliers, and how late it is
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href="/finance/suppliers">
                            <Users className="mr-2 h-4 w-4" /> Suppliers
                        </a>
                    </Button>
                    <Button onClick={() => setShowSupplierForm((value) => !value)}>
                        <Plus className="mr-2 h-4 w-4" /> New Supplier
                    </Button>
                </div>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {showSupplierForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">New supplier</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateSupplier} className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="supplierName">Name</Label>
                                <Input
                                    id="supplierName"
                                    required
                                    value={supplierName}
                                    onChange={(event) => setSupplierName(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supplierTerms">Payment terms (days)</Label>
                                <Input
                                    id="supplierTerms"
                                    inputMode="numeric"
                                    value={supplierTerms}
                                    onChange={(event) => setSupplierTerms(event.target.value)}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Create supplier"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Outstanding</p>
                        <p className="text-2xl font-semibold">{money(totals.outstanding)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Past due</p>
                        <p className="text-2xl font-semibold text-destructive">
                            {money(totals.overdue)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Over 60 days</p>
                        <p className="text-2xl font-semibold">
                            {money((aging?.buckets.days61to90 ?? 0) + (aging?.buckets.over90 ?? 0))}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Suppliers</p>
                        <p className="text-2xl font-semibold">{suppliers.length}</p>
                    </CardContent>
                </Card>
            </div>

            {aging && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">
                            <Clock className="mr-2 inline h-5 w-5" />
                            Aging
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-5">
                            {[
                                { label: "Current", value: aging.buckets.current },
                                { label: "1–30 days", value: aging.buckets.days1to30 },
                                { label: "31–60 days", value: aging.buckets.days31to60 },
                                { label: "61–90 days", value: aging.buckets.days61to90 },
                                { label: "Over 90 days", value: aging.buckets.over90 },
                            ].map((bucket) => (
                                <div key={bucket.label}>
                                    <p className="text-sm text-muted-foreground">{bucket.label}</p>
                                    <p className="text-lg font-semibold">{money(bucket.value)}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center justify-between gap-4">
                <div className="w-56">
                    <Label htmlFor="billStatus">Status</Label>
                    <Select
                        name="billStatus"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        options={[
                            { value: "", label: "All bills" },
                            { value: "OPEN", label: "Open" },
                            { value: "PARTIALLY_PAID", label: "Partly paid" },
                            { value: "PAID", label: "Paid" },
                            { value: "VOID", label: "Void" },
                        ]}
                    />
                </div>
                <Button variant="outline" onClick={() => router.push("/finance/bills/new")}>
                    <Receipt className="mr-2 h-4 w-4" /> Record a bill
                </Button>
            </div>

            {isLoading ? (
                <div>Loading bills...</div>
            ) : bills.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No supplier bills recorded yet.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bill</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bills.map((bill) => (
                                    <TableRow key={bill.id}>
                                        <TableCell className="font-mono">
                                            <Link
                                                href={`/finance/bills/${bill.id}`}
                                                className="hover:underline"
                                            >
                                                {bill.billNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{bill.supplier?.name ?? "—"}</TableCell>
                                        <TableCell>{new Date(bill.billDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            {new Date(bill.dueDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">{money(bill.totalAmount)}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            {money(bill.balanceAmount)}
                                        </TableCell>
                                        <TableCell>{BILL_STATUS[bill.status] ?? bill.status}</TableCell>
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