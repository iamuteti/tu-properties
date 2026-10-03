"use client";

import { useCallback, useEffect, useState } from "react";
import { portalApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import type { PortalReceipt } from "@/types";

export default function PortalReceiptsPage() {
    const [receipts, setReceipts] = useState<PortalReceipt[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await portalApi.receipts();
            setReceipts(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load your receipts.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading receipts…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
                    <p className="text-sm text-muted-foreground">
                        Payments your manager has recorded against your account
                    </p>
                </div>
                <Button variant="outline" onClick={load}>
                    Refresh
                </Button>
            </div>

            {receipts.length === 0 ? (
                <EmptyState
                    title="No receipts yet"
                    description="Once a payment is recorded against your lease, the receipt appears here."
                />
            ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-white">
                    {receipts.map((receipt) => (
                        <li
                            key={receipt.id}
                            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
                        >
                            <div className="min-w-0">
                                <p className="font-medium">{receipt.receiptId}</p>
                                <p className="text-xs text-muted-foreground">
                                    {new Date(receipt.recordingDate).toLocaleDateString()}
                                    {" · "}
                                    {receipt.paymentMethod.replace(/_/g, " ")}
                                    {receipt.refNo ? ` · ${receipt.refNo}` : ""}
                                </p>
                                {(receipt.receiptLines ?? []).length > 0 && (
                                    <ul className="mt-1 text-xs text-muted-foreground">
                                        {(receipt.receiptLines ?? []).map((line) => (
                                            <li key={line.id}>
                                                {line.particular}
                                                {line.invNo ? ` (${line.invNo})` : ""}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {receipt.memo && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {receipt.memo}
                                    </p>
                                )}
                            </div>
                            <p className="font-medium">
                                {receipt.currency ?? "KES"}{" "}
                                {Number(receipt.amountReceived).toLocaleString()}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}