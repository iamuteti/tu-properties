"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/simple-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { moveOutsApi } from "@/lib/api";
import { DEDUCTION_CATEGORIES, MOVE_OUT_STATUSES } from "@/lib/constants";
import type { DepositBreakdown, MoveOutRequest } from "@/types";

/**
 * Move-out settlement screen.
 *
 * The refund is derived from the itemised deductions — the panel shows the
 * arithmetic and lets the user record *why* each amount is being taken, not
 * type a total. Paying the refund is a separate, deliberate action that needs a
 * reference, because it is money leaving the business.
 */
export default function MoveOutDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [request, setRequest] = useState<MoveOutRequest | null>(null);
    const [deposit, setDeposit] = useState<DepositBreakdown | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const [category, setCategory] = useState("DAMAGE");
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const [moveOut, breakdown] = await Promise.all([
                moveOutsApi.findOne(id),
                moveOutsApi.deposit(id),
            ]);
            setRequest(moveOut.data);
            setDeposit(breakdown.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Move-out request not found."
                    : err.response?.data?.message || "Failed to load the move-out.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const addDeduction = async () => {
        if (!id) return;
        setIsBusy(true);
        try {
            await moveOutsApi.addDeduction(id, {
                category: category as never,
                description,
                amount: Number(amount),
            });
            setDescription("");
            setAmount("");
            toast.success("Deduction recorded");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not record that deduction.");
        } finally {
            setIsBusy(false);
        }
    };

    const removeDeduction = async (deductionId: string) => {
        if (!id) return;
        if (!confirm("Remove this deduction?")) return;
        try {
            await moveOutsApi.removeDeduction(id, deductionId);
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not remove that deduction.");
        }
    };

    const refund = async () => {
        if (!id || !deposit) return;
        const reference = window.prompt("Refund reference (bank / M-Pesa code):");
        if (!reference?.trim()) {
            toast.error("A payment reference is required to refund a deposit.");
            return;
        }
        setIsBusy(true);
        try {
            await moveOutsApi.refund(id, reference.trim());
            toast.success("Deposit refunded");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "The refund was refused.");
        } finally {
            setIsBusy(false);
        }
    };

    const approve = async () => {
        if (!id) return;
        setIsBusy(true);
        try {
            const response = await moveOutsApi.approve(id);
            toast.success(
                response.data.unitVacated
                    ? "Move-out approved — the unit is vacant"
                    : "Move-out approved — a successor tenancy keeps the unit",
            );
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "The move-out was refused.");
        } finally {
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading move-out…" />;
    if (error || !request || !deposit) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/moving-out")}
                    aria-label="Back to move-outs"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Move-out not found."} onRetry={load} />
            </div>
        );
    }

    const currency = deposit.currency || "KES";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/moving-out")}
                        aria-label="Back to move-outs"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">Move-out</h1>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium">
                                {request.status}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {request.tenant &&
                                `${request.tenant.surname} ${request.tenant.otherNames ?? ""}`.trim()}
                            {request.rentalAgreement?.unit && (
                                <>
                                    {" · "}
                                    <Link
                                        href={`/units/${request.rentalAgreement.unit.id}`}
                                        className="hover:underline"
                                    >
                                        {request.rentalAgreement.unit.name}
                                    </Link>
                                </>
                            )}
                            {" · leaving "}
                            {new Date(request.moveoutDate).toLocaleDateString()}
                        </p>
                    </div>
                </div>
                {request.status === "PENDING" && (
                    <Button onClick={approve} disabled={isBusy}>
                        Approve move-out
                    </Button>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Deposit held
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                            {currency} {deposit.depositHeld.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Deductions
                        </p>
                        <p className="mt-1 text-2xl font-bold text-red-600">
                            −{currency} {deposit.deductionsTotal.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Refund to tenant
                        </p>
                        <p
                            className={`mt-1 text-2xl font-bold ${
                                deposit.refund > 0 ? "text-green-700" : "text-slate-700"
                            }`}
                        >
                            {currency} {deposit.refund.toLocaleString()}
                        </p>
                        {deposit.carriedForward > 0 && (
                            <p className="text-xs text-red-600">
                                {currency} {deposit.carriedForward.toLocaleString()} carried
                                forward as a debt
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Deductions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {deposit.deductions.length === 0 ? (
                        <EmptyState
                            title="No deductions recorded"
                            description="Record what is being taken and why — the refund is calculated from these rows, never typed in."
                        />
                    ) : (
                        <ul className="divide-y rounded-md border">
                            {deposit.deductions.map((deduction, index) => {
                                const record = request.deductions?.[index];
                                return (
                                    <li
                                        key={`${deduction.description}-${deduction.createdAt}`}
                                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
                                    >
                                        <div>
                                            <p className="font-medium">{deduction.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {DEDUCTION_CATEGORIES.find(
                                                    (c) => c.value === deduction.category,
                                                )?.label ?? deduction.category}
                                                {deduction.approvedBy
                                                    ? ` · approved by ${deduction.approvedBy}`
                                                    : ""}
                                            </p>
                                        </div>
                                        <span className="flex items-center gap-3">
                                            <span className="font-medium">
                                                {currency}{" "}
                                                {deduction.amount.toLocaleString()}
                                            </span>
                                            {!deposit.refundPaid && (
                                                <button
                                                    type="button"
                                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                    aria-label="Remove deduction"
                                                    onClick={() =>
                                                        removeDeduction(record?.id ?? "")
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {!deposit.refundPaid && (
                        <div className="grid grid-cols-1 items-end gap-3 border-t pt-4 md:grid-cols-4">
                            <Field label="Category" id="deduction-category">
                                <Select
                                    id="deduction-category"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                >
                                    {DEDUCTION_CATEGORIES.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="What for" id="deduction-description">
                                <Input
                                    id="deduction-description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Broken window pane"
                                />
                            </Field>
                            <Field label={`Amount (${currency})`} id="deduction-amount">
                                <Input
                                    id="deduction-amount"
                                    type="number"
                                    min={0}
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </Field>
                            <Button
                                onClick={addDeduction}
                                disabled={isBusy || !description.trim() || !amount}
                            >
                                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                                Add
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Settlement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                        <Detail label="Deposit held" value={`${currency} ${deposit.depositHeld.toLocaleString()}`} />
                        <Detail label="Deductions" value={`−${currency} ${deposit.deductionsTotal.toLocaleString()}`} />
                        <Detail label="Unpaid rent" value={`−${currency} ${deposit.unpaidRent.toLocaleString()}`} />
                        <Detail
                            label="Refund"
                            value={`${currency} ${deposit.refund.toLocaleString()}`}
                        />
                    </dl>

                    {deposit.deductionsByCategory.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                            {deposit.deductionsByCategory.map((entry) => (
                                <li
                                    key={entry.category}
                                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                                >
                                    {DEDUCTION_CATEGORIES.find((c) => c.value === entry.category)
                                        ?.label ?? entry.category}
                                    : {currency} {entry.total.toLocaleString()}
                                </li>
                            ))}
                        </ul>
                    )}

                    {deposit.refundPaid ? (
                        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                            Refunded {currency}{" "}
                            {Number(deposit.refundRecordedAmount ?? 0).toLocaleString()}{" "}
                            {deposit.refundPaidAt
                                ? `on ${new Date(deposit.refundPaidAt).toLocaleDateString()}`
                                : ""}
                            .
                        </p>
                    ) : (
                        <Button onClick={refund} disabled={isBusy || deposit.refund <= 0}>
                            Refund {currency} {deposit.refund.toLocaleString()}
                        </Button>
                    )}
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

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    );
}