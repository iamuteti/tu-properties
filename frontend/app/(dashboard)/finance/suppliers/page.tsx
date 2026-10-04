"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { payablesApi, Supplier } from "@/lib/api";

const money = (value: number | string) =>
    Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Suppliers. The outstanding figure is the useful part on this screen — it is
 * what a purchase order needs before committing to one.
 */
export default function SuppliersPage() {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        payablesApi
            .findSuppliers()
            .then((response) => setSuppliers(response.data))
            .catch((err) =>
                setError(
                    err instanceof AxiosError
                        ? err.response?.data?.message || err.message
                        : "Failed to load suppliers",
                ),
            )
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/finance/payables")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Payables
            </Button>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                    <p className="text-muted-foreground">
                        Who we buy from, and what we still owe them
                    </p>
                </div>
                <Button variant="outline" onClick={() => router.push("/finance/payables")}>
                    Back to payables
                </Button>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading suppliers...</div>
            ) : suppliers.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        No suppliers yet. Add one from the payables page.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{suppliers.length} suppliers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Terms</TableHead>
                                    <TableHead className="text-right">Outstanding</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliers.map((supplier) => (
                                    <TableRow key={supplier.id}>
                                        <TableCell className="font-mono">{supplier.code}</TableCell>
                                        <TableCell className="font-medium">{supplier.name}</TableCell>
                                        <TableCell>
                                            {supplier.email || supplier.phone || "—"}
                                        </TableCell>
                                        <TableCell>
                                            {supplier.paymentTermsDays
                                                ? `${supplier.paymentTermsDays} days`
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {money(
                                                (supplier.bills ?? []).reduce(
                                                    (sum, bill) => sum + Number(bill.balanceAmount),
                                                    0,
                                                ),
                                            )}
                                        </TableCell>
                                        <TableCell>{supplier.status}</TableCell>
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