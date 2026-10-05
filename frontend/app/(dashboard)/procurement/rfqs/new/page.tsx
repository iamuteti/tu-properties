"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AxiosError } from "axios";
import { FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { procurementApi } from "@/lib/api";
import type { ProcurementSupplier, PurchaseRequest } from "@/types";

/**
 * Open a quotation round (Module 10).
 *
 * Inviting two suppliers is the default expectation, not a rule: an RFQ to one
 * supplier is legitimate — sometimes there is only one who does the work — and
 * the comparison view says so out loud rather than pretending otherwise.
 *
 * An approved request can be attached, in which case its items come along and
 * the comparison can measure every quotation against the request's estimate.
 */
export default function NewRfqPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselected = searchParams.get('purchaseRequestId') ?? '';

    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [suppliers, setSuppliers] = useState<ProcurementSupplier[]>([]);
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [requestId, setRequestId] = useState(preselected);
    const [quotesDueAt, setQuotesDueAt] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [approved, supplierList] = await Promise.all([
                    procurementApi.purchaseRequests({ status: 'APPROVED' }),
                    procurementApi.suppliers(),
                ]);
                setRequests(approved.data);
                setSuppliers(supplierList.data);
            } catch (err) {
                setError(
                    err instanceof AxiosError
                        ? err.response?.data?.message || err.message
                        : 'Could not load the pickers',
                );
            }
        };
        void load();
    }, []);

    const selectedRequest = useMemo(
        () => requests.find((request) => request.id === requestId),
        [requests, requestId],
    );

    // Adopting a request's title is a convenience, not an override: a buyer may
    // well be quoting for something narrower than the whole request.
    useEffect(() => {
        if (selectedRequest && !title.trim()) setTitle(selectedRequest.title);
    }, [selectedRequest, title]);

    const toggle = (supplierId: string) => {
        setSelected((current) =>
            current.includes(supplierId)
                ? current.filter((id) => id !== supplierId)
                : [...current, supplierId],
        );
    };

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await procurementApi.createRfq({
                title: title.trim(),
                notes: notes.trim() || undefined,
                purchaseRequestId: requestId || undefined,
                quotesDueAt: quotesDueAt || undefined,
                supplierIds: selected,
            });
            router.push(`/procurement/rfqs/${response.data.id}`);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not open the round',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Ask suppliers to quote</h1>
                <p className="text-muted-foreground">
                    One round per purchase — several suppliers asked, their answers compared side
                    by side
                </p>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">The round</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="rfqTitle">Title</Label>
                        <Input
                            id="rfqTitle"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Lift ropes, 6m, delivered"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="rfqRequest">Purchase request</Label>
                            <select
                                id="rfqRequest"
                                value={requestId}
                                onChange={(event) => setRequestId(event.target.value)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Standalone — not tied to a request</option>
                                {requests.map((request) => (
                                    <option key={request.id} value={request.id}>
                                        {request.reference} — {request.title}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Only approved requests can be quoted for. Attaching one brings its
                                items and its estimate into the comparison.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="quotesDue">Quotes wanted by</Label>
                            <Input
                                id="quotesDue"
                                type="date"
                                value={quotesDueAt}
                                onChange={(event) => setQuotesDueAt(event.target.value)}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Advisory: a late answer is still accepted while the round is open.
                            </p>
                        </div>
                    </div>

                    {selectedRequest && selectedRequest.lines.length > 0 && (
                        <div className="rounded-md border px-4 py-3">
                            <p className="text-sm font-medium">Items being quoted for</p>
                            <ul className="mt-1 text-sm text-muted-foreground">
                                {selectedRequest.lines.map((line) => (
                                    <li key={line.id}>
                                        {Number(line.quantity)} × {line.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div>
                        <Label htmlFor="rfqNotes">Notes for suppliers</Label>
                        <Textarea
                            id="rfqNotes"
                            rows={3}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Delivery to site; installation quoted separately."
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        Who to ask
                        {selected.length < 2 && (
                            <span className="ml-2 text-sm font-normal text-amber-700">
                                {selected.length === 0
                                    ? 'Nobody yet'
                                    : 'One supplier — this will be flagged single-source'}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {suppliers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No suppliers available yet. They are created in accounts payable.
                        </p>
                    ) : (
                        <ul className="grid gap-2 md:grid-cols-2">
                            {suppliers.map((supplier) => (
                                <li key={supplier.id}>
                                    <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            checked={selected.includes(supplier.id)}
                                            onChange={() => toggle(supplier.id)}
                                        />
                                        <span>
                                            <span className="block text-sm font-medium">
                                                {supplier.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {supplier.code}
                                                {supplier.category
                                                    ? ` · ${supplier.category}`
                                                    : ''}
                                                {supplier.performance.onTimeRate !== null &&
                                                    ` · ${supplier.performance.onTimeRate}% on time`}
                                            </span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-sm text-muted-foreground">
                        Asking one supplier is allowed — it is flagged rather than blocked, because
                        refusing would push the purchase into an email thread where nothing is
                        recorded.
                    </p>
                </CardContent>
            </Card>

            <div className="flex gap-2">
                <Button
                    disabled={busy || title.trim().length < 3 || selected.length === 0}
                    onClick={() => void submit()}
                >
                    <FileStack className="mr-2 h-4 w-4" aria-hidden="true" />
                    {busy ? 'Opening...' : 'Open the round'}
                </Button>
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                The round opens as a draft. Nothing has been sent until somebody issues it.
            </p>
        </div>
    );
}