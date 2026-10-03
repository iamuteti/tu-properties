"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Undo2 } from "lucide-react";
import { tenantRequestsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/simple-select";
import {
    REQUEST_STATUS_STYLES,
    TENANT_REQUEST_TYPES,
} from "@/lib/constants";
import type { TenantRequest, TenantRequestType } from "@/types";

/**
 * The resident's request desk: ask for something, and see what happened to it.
 *
 * The decision note is shown verbatim on each row — that is the feedback
 * channel until Module 18 delivers real notifications, so it is treated as part
 * of the record rather than an afterthought.
 */
export function TenantRequestsPanel({ className }: { className?: string }) {
    const [requests, setRequests] = useState<TenantRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [type, setType] = useState<TenantRequestType>("RENEWAL");
    const [preferredDate, setPreferredDate] = useState("");
    const [note, setNote] = useState("");
    const [termMonths, setTermMonths] = useState("12");
    const [rentAmount, setRentAmount] = useState("");
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await tenantRequestsApi.myRequests();
            setRequests(response.data);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not load your requests.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const submit = async () => {
        setIsBusy(true);
        try {
            await tenantRequestsApi.createRequest({
                type,
                ...(preferredDate ? { preferredDate } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
                ...(type === "RENEWAL"
                    ? {
                          payload: {
                              ...(termMonths ? { termMonths: Number(termMonths) } : {}),
                              ...(rentAmount ? { rentAmount: Number(rentAmount) } : {}),
                          },
                      }
                    : {}),
            });
            toast.success("Request sent — your property manager will review it");
            setPreferredDate("");
            setNote("");
            setRentAmount("");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not send that request.");
        } finally {
            setIsBusy(false);
        }
    };

    const withdraw = async (request: TenantRequest) => {
        if (!confirm("Withdraw this request?")) return;
        try {
            await tenantRequestsApi.withdrawRequest(request.id);
            toast.success("Request withdrawn");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not withdraw it.");
        }
    };

    const openTypes = new Set(
        requests.filter((r) => r.status === "PENDING").map((r) => r.type),
    );

    return (
        <div className={`space-y-6 ${className ?? ""}`}>
            <div className="rounded-lg border bg-white p-5">
                <h2 className="text-sm font-semibold">Ask for something</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every request is reviewed by your property manager before anything
                    changes — nothing here alters your lease on its own.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label htmlFor="request-type" className="text-sm font-medium">
                            What do you need?
                        </label>
                        <Select
                            id="request-type"
                            value={type}
                            onChange={(e) => setType(e.target.value as TenantRequestType)}
                        >
                            {TENANT_REQUEST_TYPES.filter(
                                (option) => !openTypes.has(option.value as TenantRequestType),
                            ).map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </Select>
                    </div>

                    {type === "MOVE_OUT" && (
                        <div className="space-y-1.5">
                            <label htmlFor="request-date" className="text-sm font-medium">
                                Preferred move-out date
                            </label>
                            <Input
                                id="request-date"
                                type="date"
                                value={preferredDate}
                                onChange={(e) => setPreferredDate(e.target.value)}
                            />
                        </div>
                    )}

                    {type === "RENEWAL" && (
                        <>
                            <div className="space-y-1.5">
                                <label htmlFor="request-term" className="text-sm font-medium">
                                    Term you are asking for (months)
                                </label>
                                <Input
                                    id="request-term"
                                    type="number"
                                    min={1}
                                    value={termMonths}
                                    onChange={(e) => setTermMonths(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="request-rent" className="text-sm font-medium">
                                    Proposed monthly rent (optional)
                                </label>
                                <Input
                                    id="request-rent"
                                    type="number"
                                    min={0}
                                    value={rentAmount}
                                    onChange={(e) => setRentAmount(e.target.value)}
                                    placeholder="Leave blank to keep the current rent"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-3 space-y-1.5">
                    <label htmlFor="request-note" className="text-sm font-medium">
                        Anything that helps (optional)
                    </label>
                    <Textarea
                        id="request-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="min-h-[70px]"
                        placeholder="e.g. my employer is relocating us in February"
                    />
                </div>

                <div className="mt-3">
                    <Button onClick={submit} disabled={isBusy || !type}>
                        <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isBusy ? "Sending…" : "Send request"}
                    </Button>
                </div>
            </div>

            <div>
                <h2 className="text-sm font-semibold">Your requests</h2>
                {isLoading ? (
                    <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                ) : requests.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        You have not asked for anything yet.
                    </p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {requests.map((request) => (
                            <li key={request.id} className="rounded-lg border bg-white p-4 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium">
                                        {TENANT_REQUEST_TYPES.find(
                                            (t) => t.value === request.type,
                                        )?.label ?? request.type}
                                    </p>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                            REQUEST_STATUS_STYLES[request.status] ?? "bg-slate-100"
                                        }`}
                                    >
                                        {request.status.charAt(0) +
                                            request.status.slice(1).toLowerCase()}
                                    </span>
                                </div>

                                <p className="mt-1 text-xs text-muted-foreground">
                                    Sent {new Date(request.createdAt).toLocaleDateString()}
                                    {request.preferredDate
                                        ? ` · preferred ${new Date(request.preferredDate).toLocaleDateString()}`
                                        : ""}
                                    {request.earlyNotice
                                        ? " · inside your notice period"
                                        : ""}
                                </p>

                                {request.note && (
                                    <p className="mt-2 text-muted-foreground">{request.note}</p>
                                )}

                                {request.decisionNote && (
                                    <p className="mt-2 rounded bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-medium">
                                            {request.decidedBy
                                                ? `${request.decidedBy.firstName}: `
                                                : "Property manager: "}
                                        </span>
                                        {request.decisionNote}
                                    </p>
                                )}

                                {request.status === "PENDING" && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="mt-2"
                                        onClick={() => withdraw(request)}
                                    >
                                        <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Withdraw
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}