"use client";

import { useCallback, useEffect, useState } from "react";
import { portalApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import type { PortalInvoice } from "@/types";

export default function PortalInvoicesPage() {
    const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await portalApi.invoices();
            setInvoices(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load your invoices.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading invoices…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
                    <p className="text-sm text-muted-foreground">
                        Everything billed to your account
                    </p>
                </div>
                <Button variant="outline" onClick={load}>
                    Refresh
                </Button>
            </div>

            {invoices.length === 0 ? (
                <EmptyState
                    title="No invoices yet"
                    description="When your manager raises rent, the invoice appears here."
                />
            ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-white">
                    {invoices.map((invoice) => {
                        const balance = Number(invoice.balanceAmount ?? 0);
                        const overdue =
                            invoice.status !== 'PAID' &&
                            new Date(invoice.dueDate) < new Date();
                        return (
                            <li
                                key={invoice.id}
                                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                            >
                                <div>
                                    <p className="font-medium">{invoice.invoiceNumber}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Due {new Date(invoice.dueDate).toLocaleDateString()}
                                        {overdue && (
                                            <span className="ml-2 font-medium text-red-600">
                                                overdue
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-medium">
                                        {invoice.currency ?? "KES"}{" "}
                                        {Number(invoice.amount).toLocaleString()}
                                    </p>
                                    <p
                                        className={`text-xs ${
                                            balance > 0
                                                ? "text-red-600"
                                                : "text-green-700"
                                        }`}
                                    >
                                        {balance > 0
                                            ? `${balance.toLocaleString()} due`
                                            : "Paid in full"}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}