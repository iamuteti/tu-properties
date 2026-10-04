"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { payablesApi, Supplier } from "@/lib/api";

const CATEGORIES = [
    { value: "MAINTENANCE", label: "Maintenance & repairs" },
    { value: "UTILITIES", label: "Utilities" },
    { value: "INSURANCE", label: "Insurance" },
    { value: "PROFESSIONAL", label: "Professional fees" },
    { value: "MARKETING", label: "Marketing" },
    { value: "OFFICE", label: "Office & admin" },
    { value: "SALARIES", label: "Salaries" },
    { value: "TAX", label: "Tax" },
    { value: "OTHER", label: "Other" },
];

const money = (value: number) =>
    value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface DraftLine {
    description: string;
    quantity: string;
    unitPrice: string;
}

/**
 * Record a supplier bill. The category decides which expense account the ledger
 * posts to, which is why it is asked for up front rather than per line: the
 * person recording a bill knows what the charge *is*, not what account code it
 * lands in.
 */
export default function NewBillPage() {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierId, setSupplierId] = useState("");
    const [category, setCategory] = useState("MAINTENANCE");
    const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [supplierReference, setSupplierReference] = useState("");
    const [lines, setLines] = useState<DraftLine[]>([
        { description: "", quantity: "1", unitPrice: "" },
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        payablesApi
            .findSuppliers()
            .then((response) => setSuppliers(response.data))
            .catch(() => setSuppliers([]));
    }, []);

    const subtotal = lines.reduce(
        (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
        0,
    );

    const updateLine = (index: number, patch: Partial<DraftLine>) => {
        setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const response = await payablesApi.createBill({
                supplierId,
                category,
                billDate,
                supplierReference: supplierReference || undefined,
                lines: lines
                    .filter((line) => line.description.trim() && Number(line.unitPrice) > 0)
                    .map((line) => ({
                        description: line.description.trim(),
                        quantity: Number(line.quantity) || 1,
                        unitPrice: Number(line.unitPrice),
                        amount: (Number(line.quantity) || 1) * Number(line.unitPrice),
                    })),
            });
            router.push(`/finance/bills/${response.data.id}`);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to record the bill",
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/finance/payables")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Payables
            </Button>

            <div>
                <h1 className="text-3xl font-bold tracking-tight">Record a bill</h1>
                <p className="text-muted-foreground">
                    Tax is applied from this organization&rsquo;s configured rules
                </p>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Bill</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                                <Label>Supplier</Label>
                                <Select
                                    name="supplier"
                                    value={supplierId}
                                    placeholder="Select a supplier"
                                    search
                                    onChange={(event) => setSupplierId(event.target.value)}
                                    options={suppliers.map((supplier) => ({
                                        value: supplier.id,
                                        label: `${supplier.name} (${supplier.code})`,
                                    }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select
                                    name="category"
                                    value={category}
                                    onChange={(event) => setCategory(event.target.value)}
                                    options={CATEGORIES}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billDate">Bill date</Label>
                                <Input
                                    id="billDate"
                                    type="date"
                                    value={billDate}
                                    onChange={(event) => setBillDate(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="supplierReference">Their reference</Label>
                                <Input
                                    id="supplierReference"
                                    value={supplierReference}
                                    onChange={(event) => setSupplierReference(event.target.value)}
                                />
                            </div>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-28 text-right">Qty</TableHead>
                                    <TableHead className="w-40 text-right">Unit price</TableHead>
                                    <TableHead className="w-40 text-right">Amount</TableHead>
                                    <TableHead className="w-16" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lines.map((line, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Input
                                                value={line.description}
                                                placeholder="What was supplied"
                                                onChange={(event) =>
                                                    updateLine(index, { description: event.target.value })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                className="text-right"
                                                inputMode="decimal"
                                                value={line.quantity}
                                                onChange={(event) =>
                                                    updateLine(index, { quantity: event.target.value })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                className="text-right"
                                                inputMode="decimal"
                                                value={line.unitPrice}
                                                onChange={(event) =>
                                                    updateLine(index, { unitPrice: event.target.value })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(
                                                (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {lines.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        setLines((current) =>
                                                            current.filter((_, i) => i !== index),
                                                        )
                                                    }
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
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    setLines((current) => [
                                        ...current,
                                        { description: "", quantity: "1", unitPrice: "" },
                                    ])
                                }
                            >
                                <Plus className="mr-2 h-4 w-4" /> Add line
                            </Button>
                            <div className="text-sm text-muted-foreground">
                                Subtotal {money(subtotal)} (tax added on save)
                            </div>
                        </div>

                        <Button type="submit" disabled={isSaving || !supplierId}>
                            {isSaving ? "Saving..." : "Record bill"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}