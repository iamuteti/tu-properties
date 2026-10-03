"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, FileText, Wallet } from "lucide-react";
import { portalApi } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import type { PortalSummary } from "@/types";

/**
 * Resident overview: what is owed, what is overdue, and how long is left on the
 * lease. This is the screen that has to answer "can I pay my rent today".
 */
export default function PortalOverviewPage() {
    const [summary, setSummary] = useState<PortalSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await portalApi.summary();
            setSummary(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load your account.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading your account…" />;
    if (error || !summary) {
        return <ErrorState message={error || "Could not load your account."} onRetry={load} />;
    }

    const currency = summary.lease?.currency ?? "KES";
    const overdue = summary.nextDue?.isOverdue;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">
                    Hello {summary.tenant.surname}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Account {summary.tenant.accountNumber} · {summary.tenant.code}
                </p>
            </div>

            {overdue && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <span>
                        {summary.nextDue?.invoiceNumber} is overdue — it was due on{" "}
                        {summary.nextDue && new Date(summary.nextDue.dueDate).toLocaleDateString()}.
                    </span>
                    <Link
                        href="/portal/invoices"
                        className="ml-auto font-medium underline"
                    >
                        View invoices
                    </Link>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card
                    label="Monthly rent"
                    value={`${currency} ${Number(summary.lease?.rentAmount ?? 0).toLocaleString()}`}
                />
                <Card
                    label="Outstanding"
                    value={`${currency} ${summary.money.outstanding.toLocaleString()}`}
                    tone={summary.money.outstanding > 0 ? "text-red-600" : "text-green-700"}
                />
                <Card
                    label="Arrears"
                    value={`${currency} ${summary.money.arrears.toLocaleString()}`}
                    tone={summary.money.arrears > 0 ? "text-amber-700" : "text-green-700"}
                    hint="Overdue only"
                />
                <Card
                    label="Lease ends in"
                    value={summary.daysRemaining === null ? "Rolling" : `${summary.daysRemaining} days`}
                    icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
                />
            </div>

            {summary.hasLease ? (
                <div className="rounded-lg border bg-white p-5">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                        Your home
                    </h2>
                    <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                        <Detail
                            label="Property"
                            value={summary.lease?.unit?.property?.name}
                        />
                        <Detail label="Unit" value={summary.lease?.unit?.name} />
                        <Detail label="Lease" value={summary.lease?.code} />
                        <Detail
                            label="Term"
                            value={
                                summary.lease?.endDate
                                    ? `${new Date(summary.lease.startDate).toLocaleDateString()} → ${new Date(summary.lease.endDate).toLocaleDateString()}`
                                    : "Rolling monthly"
                            }
                        />
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    You do not have an active lease on file. If that looks wrong, contact your
                    property manager.
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <Link
                    href="/portal/invoices"
                    className="flex items-center gap-3 rounded-lg border bg-white p-5 transition-colors hover:bg-slate-50"
                >
                    <FileText className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-medium">Invoices</p>
                        <p className="text-xs text-muted-foreground">
                            What has been billed and what is still due
                        </p>
                    </div>
                </Link>
                <Link
                    href="/portal/receipts"
                    className="flex items-center gap-3 rounded-lg border bg-white p-5 transition-colors hover:bg-slate-50"
                >
                    <Wallet className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-medium">Receipts</p>
                        <p className="text-xs text-muted-foreground">
                            Payments your manager has recorded
                        </p>
                    </div>
                </Link>
            </div>
        </div>
    );
}

function Card({
    label,
    value,
    tone,
    hint,
    icon,
}: {
    label: string;
    value: string;
    tone?: string;
    hint?: string;
    icon?: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {icon}
                {label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${tone ?? ""}`}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium break-words">{value || "—"}</p>
        </div>
    );
}