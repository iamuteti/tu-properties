"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { PURCHASE_CATEGORY_OPTIONS } from "@/components/procurement/purchase-request-form";
import { procurementApi } from "@/lib/api";
import type { ProcurementSupplier, Rfq } from "@/types";

/**
 * Raise a purchase order (Module 10).
 *
 * There are two ways in and the form supports both explicitly rather than
 * guessing:
 *
 * - **From an awarded quotation.** Pick the round, and the lines, the prices and
 *   the category all come from the quotation that won — the order cannot
 *   disagree with the answer it was based on.
 * - **Standalone.** A supplier, a category and some lines. This is what
 *   re-ordering the same thing every quarter looks like.
 *
 * Mixing them would produce an order whose lines came from one quote and whose
 * category came from somewhere else, which is precisely the bookkeeping mistake
 * this module exists to prevent.
 */
interface DraftLine {
    description: string;
    quantity: string;
    unitPrice: string;
}

const emptyLine = (): DraftLine => ({ description: '', quantity: '1', unitPrice: '' });

export default function NewPurchaseOrderPage() {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<ProcurementSupplier[]>([]);
    const [awardedRfq, setAwardedRfq] = useState<Rfq | null>(null);
    const [mode, setMode] = useState<'standalone' | 'quote'>('standalone');
    const [rfqs, setRfqs] = useState<Rfq[]>([]);
    const [rfqId, setRfqId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [category, setCategory] = useState('MAINTENANCE_PARTS');
    const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
    const [taxAmount, setTaxAmount] = useState('');
    const [expectedDelivery, setExpectedDelivery] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [terms, setTerms] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [supplierList, awarded] = await Promise.all([
                    procurementApi.suppliers(),
                    procurementApi.rfqs({ status: 'AWARDED' }),
                ]);
                setSuppliers(supplierList.data);
                setRfqs(awarded.data);
            } catch (err) {
                setError(
                    err instanceof AxiosError
                        ? err.response?.data?.message || err.message
                        : 'Could not load suppliers',
                );
            }
        };
        void load();
    }, []);

    // Choosing an awarded round fills the supplier from the winning quotation,
    // and the quote's lines replace anything typed — a quote that only answered
    // half the request is still what was agreed to buy.
    const chooseRfq = async (id: string) => {
        setRfqId(id);
        if (!id) {
            setAwardedRfq(null);
            return;
        }
        try {
            const response = await procurementApi.rfq(id);
            const rfq = response.data;
            setAwardedRfq(rfq);
            if (rfq.awardedQuoteId) {
                const quote = rfq.quotes.find(
                    (candidate) => candidate.id === rfq.awardedQuoteId,
                );
                if (quote) {
                    setSupplierId(quote.supplierId);
                    setLines(
                        quote.lines.map((line) => ({
                            description: line.description,
                            quantity: String(line.quantity),
                            unitPrice: String(line.unitPrice),
                        })),
                    );
                    if (rfq.purchaseRequest) setCategory(rfq.purchaseRequest.category);
                }
            }
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not load that round',
            );
        }
    };

    const total = lines.reduce(
        (sum, line) =>
            sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
        0,
    );
    const tax = Number(taxAmount) || 0;

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const response =
                mode === 'quote' && rfqId && awardedRfq?.awardedQuoteId
                    ? await procurementApi.createPurchaseOrder({
                          supplierId,
                          quoteId: awardedRfq.awardedQuoteId,
                          rfqId,
                          ...(tax > 0 ? { taxAmount: tax } : {}),
                          expectedDelivery: expectedDelivery || undefined,
                          deliveryAddress: deliveryAddress || undefined,
                          terms: terms || undefined,
                      })
                    : await procurementApi.createPurchaseOrder({
                          supplierId,
                          category,
                          ...(tax > 0 ? { taxAmount: tax } : {}),
                          expectedDelivery: expectedDelivery || undefined,
                          deliveryAddress: deliveryAddress || undefined,
                          terms: terms || undefined,
                          lines: lines
                              .filter((line) => line.description.trim().length > 1)
                              .map((line) => ({
                                  description: line.description.trim(),
                                  quantity: Number(line.quantity) || 1,
                                  unitPrice: Number(line.unitPrice) || 0,
                              })),
                      });
            router.push(`/procurement/purchase-orders/${response.data.id}`);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not raise the order',
            );
        } finally {
            setBusy(false);
        }
    };

    const usableLines = lines.filter((line) => line.description.trim().length > 1);
    const canSubmit =
        supplierId !== '' && (mode === 'quote' ? Boolean(rfqId) : usableLines.length > 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Raise a purchase order</h1>
                <p className="text-muted-foreground">
                    The document that commits the company — sent to a supplier, then tracked to
                    arrival
                </p>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Where this comes from</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={mode === 'quote' ? 'default' : 'outline'}
                            onClick={() => setMode('quote')}
                        >
                            An awarded quotation
                        </Button>
                        <Button
                            variant={mode === 'standalone' ? 'default' : 'outline'}
                            onClick={() => setMode('standalone')}
                        >
                            Standalone order
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {mode === 'quote'
                            ? 'The lines, prices and category come from the quotation that won, so the order cannot disagree with the answer it was based on.'
                            : 'For re-ordering the same thing, or a purchase small enough not to be worth a round. You choose the category — it decides which expense account the bill lands in.'}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">The order</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {mode === 'quote' ? (
                        <div>
                            <Label htmlFor="rfqSelect">Awarded round</Label>
                            <Select
                                name="rfqSelect"
                                value={rfqId}
                                onChange={(event) => void chooseRfq(event.target.value)}
                                options={[
                                    { value: '', label: 'Choose an awarded round' },
                                    ...rfqs.map((rfq) => ({
                                        value: rfq.id,
                                        label: `${rfq.reference} — ${rfq.title}`,
                                    })),
                                ]}
                            />
                            {awardedRfq?.awardedQuote && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Awarded to{' '}
                                    {
                                        awardedRfq.quotes.find(
                                            (quote) =>
                                                quote.id === awardedRfq.awardedQuoteId,
                                        )?.supplier?.name
                                    }
                                    . Lead time{' '}
                                    {awardedRfq.awardedQuote.leadTimeDays ?? 'not stated'} days
                                    comes from what the supplier said, so the promised date is
                                    theirs rather than a guess.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div>
                            <Label htmlFor="orderCategory">Category</Label>
                            <Select
                                name="orderCategory"
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                options={PURCHASE_CATEGORY_OPTIONS}
                            />
                        </div>
                    )}

                    <div>
                        <Label htmlFor="orderSupplier">Supplier</Label>
                        <Select
                            name="orderSupplier"
                            value={supplierId}
                            onChange={(event) => setSupplierId(event.target.value)}
                            options={[
                                { value: '', label: 'Choose a supplier' },
                                ...suppliers.map((supplier) => ({
                                    value: supplier.id,
                                    label: `${supplier.code} — ${supplier.name}`,
                                })),
                            ]}
                        />
                    </div>
                </CardContent>
            </Card>

            {mode === 'standalone' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="w-28 text-right">Quantity</TableHead>
                                    <TableHead className="w-36 text-right">Unit price</TableHead>
                                    <TableHead className="w-32 text-right">Line total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lines.map((line, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            <Input
                                                value={line.description}
                                                onChange={(event) =>
                                                    setLines((current) =>
                                                        current.map((candidate, position) =>
                                                            position === index
                                                                ? {
                                                                      ...candidate,
                                                                      description:
                                                                          event.target
                                                                              .value,
                                                                  }
                                                                : candidate,
                                                        ),
                                                    )
                                                }
                                                placeholder="Gate lamp fittings"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                className="text-right"
                                                value={line.quantity}
                                                onChange={(event) =>
                                                    setLines((current) =>
                                                        current.map((candidate, position) =>
                                                            position === index
                                                                ? {
                                                                      ...candidate,
                                                                      quantity:
                                                                          event.target.value,
                                                                  }
                                                                : candidate,
                                                        ),
                                                    )
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="text-right"
                                                value={line.unitPrice}
                                                onChange={(event) =>
                                                    setLines((current) =>
                                                        current.map((candidate, position) =>
                                                            position === index
                                                                ? {
                                                                      ...candidate,
                                                                      unitPrice:
                                                                          event.target.value,
                                                                  }
                                                                : candidate,
                                                        ),
                                                    )
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(
                                                (Number(line.quantity) || 0) *
                                                (Number(line.unitPrice) || 0)
                                            ).toLocaleString('en-KE', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLines((current) => [...current, emptyLine()])}
                        >
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add an item
                        </Button>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Delivery</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="expectedDelivery">Promised by</Label>
                            <Input
                                id="expectedDelivery"
                                type="date"
                                value={expectedDelivery}
                                onChange={(event) =>
                                    setExpectedDelivery(event.target.value)
                                }
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Once the supplier has accepted, this cannot be changed — it is
                                part of what they agreed to.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="taxAmount">Tax on top</Label>
                            <Input
                                id="taxAmount"
                                type="number"
                                min="0"
                                step="0.01"
                                className="text-right"
                                value={taxAmount}
                                onChange={(event) => setTaxAmount(event.target.value)}
                                placeholder="0.00"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Leave at zero when the supplier&apos;s price already includes it.
                            </p>
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="deliveryAddress">Deliver to</Label>
                        <Input
                            id="deliveryAddress"
                            value={deliveryAddress}
                            onChange={(event) => setDeliveryAddress(event.target.value)}
                            placeholder="Tamarind Court store, Nairobi"
                        />
                    </div>
                    <div>
                        <Label htmlFor="terms">Terms</Label>
                        <Textarea
                            id="terms"
                            rows={2}
                            value={terms}
                            onChange={(event) => setTerms(event.target.value)}
                            placeholder="30 days from invoice."
                        />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Order total{' '}
                        <span className="font-semibold text-foreground">
                            {(total + tax).toLocaleString('en-KE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </span>{' '}
                        — {tax > 0 ? 'including tax' : 'tax inclusive or not applicable'}.
                    </p>
                </CardContent>
            </Card>

            <div className="flex gap-2">
                <Button disabled={!canSubmit || busy} onClick={() => void submit()}>
                    <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {busy ? 'Raising...' : 'Raise the order'}
                </Button>
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                The order opens as a draft. Nothing is committed until it is sent to the supplier.
            </p>
        </div>
    );
}