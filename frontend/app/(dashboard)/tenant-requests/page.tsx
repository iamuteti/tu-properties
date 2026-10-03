"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { tenantRequestsApi } from "@/lib/api";
import {
    REQUEST_STATUS_STYLES,
    TENANT_REQUEST_STATUS_OPTIONS,
    TENANT_REQUEST_TYPES,
} from "@/lib/constants";
import type { TenantRequest } from "@/types";

/**
 * Staff queue for resident-submitted requests.
 *
 * Approving does not perform a bespoke change here — the API delegates to the
 * leasing / move-out services, so the row ends up saying *what it did*
 * ("created lease RA-001871") and a refusal from those services (renewal
 * outside its window, a lease already terminated) surfaces as the reason with
 * the request left PENDING.
 */
export default function TenantRequestsPage() {
    const [requests, setRequests] = useState<TenantRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await tenantRequestsApi.findAll({
                status: status || undefined,
            });
            setRequests(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load requests.");
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);

    const decide = useCallback(
        async (request: TenantRequest, decision: "APPROVE" | "REJECT") => {
            let note: string | undefined;
            if (decision === "REJECT") {
                // Required by the API — and it is what the resident reads.
                note =
                    window.prompt(
                        "Why is this being rejected? (the resident sees this)",
                    ) ?? undefined;
                if (!note?.trim()) {
                    toast.error("A rejection needs a reason.");
                    return;
                }
            } else if (
                !window.confirm(
                    `Approve this ${TENANT_REQUEST_TYPES.find((t) => t.value === request.type)?.label ?? request.type}? The change will be applied to the lease.`,
                )
            ) {
                return;
            }

            setBusyId(request.id);
            try {
                await tenantRequestsApi.decide(
                    request.id,
                    decision,
                    note?.trim() || undefined,
                );
                toast.success(
                    decision === "APPROVE" ? "Request approved" : "Request rejected",
                );
                await load();
            } catch (err: any) {
                toast.error(err.response?.data?.message || "The decision was refused.");
            } finally {
                setBusyId(null);
            }
        },
        [load],
    );

    const pending = useMemo(
        () => requests.filter((r) => r.status === "PENDING").length,
        [requests],
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tenant requests</h1>
                    <p className="text-muted-foreground">
                        {pending > 0
                            ? `${pending} waiting on a decision`
                            : "Submitted from the tenant portal"}
                    </p>
                </div>
                <div className="w-48">
                    <Select
                        options={TENANT_REQUEST_STATUS_OPTIONS}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        placeholder="All statuses"
                        aria-label="Filter by status"
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading requests…" />
            ) : error ? (
                <ErrorState message={error} onRetry={load} />
            ) : requests.length === 0 ? (
                <EmptyState
                    title="No requests"
                    description="Requests submitted by residents in the portal land here for a decision."
                    icon={<Inbox className="h-10 w-10" aria-hidden="true" />}
                />
            ) : (
                <ul className="space-y-3">
                    {requests.map((request) => (
                        <li key={request.id}>
                            <Card>
                                <CardContent className="space-y-3 p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium">
                                                    {TENANT_REQUEST_TYPES.find(
                                                        (t) => t.value === request.type,
                                                    )?.label ?? request.type}
                                                </p>
                                                <span
                                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                        REQUEST_STATUS_STYLES[request.status] ??
                                                        "bg-slate-100"
                                                    }`}
                                                >
                                                    {request.status.charAt(0) +
                                                        request.status.slice(1).toLowerCase()}
                                                </span>
                                                {request.earlyNotice && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                                        <AlertTriangle
                                                            className="h-3 w-3"
                                                            aria-hidden="true"
                                                        />
                                                        Inside notice period
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {request.tenant
                                                    ? `${request.tenant.surname} ${request.tenant.otherNames ?? ""}`.trim()
                                                    : "Unknown tenant"}{" "}
                                                ·{" "}
                                                {request.tenant?.accountNumber}
                                                {request.rentalAgreement && (
                                                    <>
                                                        {" · "}
                                                        <Link
                                                            href={`/rental-agreements/${request.rentalAgreement.id}`}
                                                            className="hover:underline"
                                                        >
                                                            {request.rentalAgreement.code}
                                                        </Link>
                                                        {request.rentalAgreement.unit && (
                                                            <> ({request.rentalAgreement.unit.name})</>
                                                        )}
                                                    </>
                                                )}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Sent {new Date(request.createdAt).toLocaleString()}
                                                {request.preferredDate
                                                    ? ` · wants out on ${new Date(request.preferredDate).toLocaleDateString()}`
                                                    : ""}
                                            </p>
                                        </div>

                                        {request.status === "PENDING" && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={busyId === request.id}
                                                    onClick={() => decide(request, "APPROVE")}
                                                >
                                                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busyId === request.id}
                                                    onClick={() => decide(request, "REJECT")}
                                                >
                                                    <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                                    Reject
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {request.note && (
                                        <p className="rounded bg-slate-50 px-3 py-2 text-sm">
                                            {request.note}
                                        </p>
                                    )}

                                    {request.result && (
                                        <p className="text-xs text-muted-foreground">
                                            Applied:{" "}
                                            {String(
                                                (request.result as Record<string, unknown>)
                                                    .action ?? "",
                                            )}
                                            {(request.result as Record<string, unknown>)
                                                .newLeaseCode
                                                ? ` → ${String(
                                                      (request.result as Record<string, unknown>)
                                                          .newLeaseCode,
                                                  )}`
                                                : ""}
                                        </p>
                                    )}

                                    {request.decisionNote && (
                                        <p className="text-xs text-muted-foreground">
                                            Decision note sent to the resident:{" "}
                                            {request.decisionNote}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}