"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/simple-select";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { leasesApi } from "@/lib/api";
import { AGREEMENT_TYPES } from "@/lib/constants";
import type { Lease } from "@/types";

/**
 * Edit the commercial terms of a lease.
 *
 * The status is not editable here — it moves through the lifecycle actions on
 * the detail page so the server's rules (and the occupancy side-effects) apply.
 */
export default function EditLeasePage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [lease, setLease] = useState<Lease | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const [form, setForm] = useState({
        rentAmount: '',
        currency: 'KES',
        agreementType: 'RENTAL',
        startDate: '',
        endDate: '',
        termMonths: '',
        securityDeposit: '',
        noticePeriodDays: '',
        escalationRate: '',
        paymentDay: '',
    });

    const loadLease = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await leasesApi.findLease(id);
            const lease = response.data;
            setLease(lease);
            setForm({
                rentAmount: String(lease.rentAmount ?? ''),
                currency: lease.currency ?? 'KES',
                agreementType: lease.agreementType ?? 'RENTAL',
                startDate: lease.startDate ? lease.startDate.slice(0, 10) : '',
                endDate: lease.endDate ? lease.endDate.slice(0, 10) : '',
                termMonths: lease.termMonths != null ? String(lease.termMonths) : '',
                securityDeposit:
                    lease.securityDeposit != null ? String(lease.securityDeposit) : '',
                noticePeriodDays:
                    lease.noticePeriodDays != null ? String(lease.noticePeriodDays) : '',
                escalationRate:
                    lease.escalationRate != null ? String(lease.escalationRate) : '',
                paymentDay: lease.paymentDay != null ? String(lease.paymentDay) : '',
            });
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Lease not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the lease.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLease();
    }, [loadLease]);

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!id) return;
        setIsBusy(true);
        try {
            await leasesApi.updateLease(id, {
                rentAmount: Number(form.rentAmount),
                currency: form.currency,
                agreementType: form.agreementType as Lease['agreementType'],
                startDate: form.startDate || undefined,
                endDate: form.endDate || undefined,
                termMonths: form.termMonths ? Number(form.termMonths) : undefined,
                securityDeposit: form.securityDeposit
                    ? Number(form.securityDeposit)
                    : undefined,
                noticePeriodDays: form.noticePeriodDays
                    ? Number(form.noticePeriodDays)
                    : undefined,
                escalationRate: form.escalationRate
                    ? Number(form.escalationRate)
                    : undefined,
                paymentDay: form.paymentDay ? Number(form.paymentDay) : undefined,
            });
            toast.success("Lease updated");
            router.push(`/rental-agreements/${id}`);
            router.refresh();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to save the lease.");
        } finally {
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading lease…" />;
    if (error) return <ErrorState message={error} onRetry={loadLease} />;
    if (!lease || !id) return <ErrorState message="Lease not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/rental-agreements/${id}`)}
                    aria-label="Back to lease"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Edit {lease.code}</h1>
                    <p className="text-sm text-muted-foreground">
                        Renewals and terminations are done from the lease screen so the rules apply.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Terms</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-6">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <Field label="Monthly rent" id="edit-rent">
                                <Input
                                    id="edit-rent"
                                    type="number"
                                    min={0}
                                    value={form.rentAmount}
                                    onChange={(e) => set("rentAmount")(e.target.value)}
                                    required
                                />
                            </Field>
                            <Field label="Currency" id="edit-currency">
                                <Select
                                    id="edit-currency"
                                    value={form.currency}
                                    onChange={(e) => set("currency")(e.target.value)}
                                >
                                    <option value="KES">KES</option>
                                    <option value="USD">USD</option>
                                    <option value="UGX">UGX</option>
                                    <option value="TZS">TZS</option>
                                </Select>
                            </Field>
                            <Field label="Agreement type" id="edit-type">
                                <Select
                                    id="edit-type"
                                    value={form.agreementType}
                                    onChange={(e) => set("agreementType")(e.target.value)}
                                >
                                    {AGREEMENT_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Start date" id="edit-start">
                                <Input
                                    id="edit-start"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) => set("startDate")(e.target.value)}
                                />
                            </Field>
                            <Field label="End date" id="edit-end">
                                <Input
                                    id="edit-end"
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) => set("endDate")(e.target.value)}
                                />
                            </Field>
                            <Field label="Term (months)" id="edit-term">
                                <Input
                                    id="edit-term"
                                    type="number"
                                    min={1}
                                    value={form.termMonths}
                                    onChange={(e) => set("termMonths")(e.target.value)}
                                />
                            </Field>
                            <Field label="Security deposit" id="edit-deposit">
                                <Input
                                    id="edit-deposit"
                                    type="number"
                                    min={0}
                                    value={form.securityDeposit}
                                    onChange={(e) => set("securityDeposit")(e.target.value)}
                                />
                            </Field>
                            <Field label="Payment day" id="edit-payment-day">
                                <Input
                                    id="edit-payment-day"
                                    type="number"
                                    min={1}
                                    max={28}
                                    value={form.paymentDay}
                                    onChange={(e) => set("paymentDay")(e.target.value)}
                                />
                            </Field>
                            <Field label="Notice period (days)" id="edit-notice">
                                <Input
                                    id="edit-notice"
                                    type="number"
                                    min={0}
                                    value={form.noticePeriodDays}
                                    onChange={(e) => set("noticePeriodDays")(e.target.value)}
                                />
                            </Field>
                            <Field label="Escalation rate (%)" id="edit-escalation">
                                <Input
                                    id="edit-escalation"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.5"
                                    value={form.escalationRate}
                                    onChange={(e) => set("escalationRate")(e.target.value)}
                                />
                            </Field>
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => router.push(`/rental-agreements/${id}`)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isBusy}>
                                {isBusy ? "Saving…" : "Save changes"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
            </label>
            {children}
        </div>
    );
}