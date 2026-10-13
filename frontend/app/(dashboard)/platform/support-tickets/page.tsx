"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { SupportTicket, TicketStatus } from "@/types";

const STATUSES: (TicketStatus | "ALL")[] = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default function PlatformSupportTicketsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<TicketStatus | "ALL">("ALL");
    const [selected, setSelected] = useState<SupportTicket | null>(null);
    const [resolution, setResolution] = useState("");
    const [targetStatus, setTargetStatus] = useState<TicketStatus>("IN_PROGRESS");

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user && user.role !== "SUPER_ADMIN") {
            router.push("/dashboard");
        } else if (user && user.role === "SUPER_ADMIN") {
            load();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isLoading, router, filter]);

    const load = async () => {
        try {
            const res = await platformApi.tickets(filter === "ALL" ? undefined : { status: filter });
            setTickets(res.data.data);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    };

    const openTicket = async (id: string) => {
        try {
            const res = await platformApi.ticket(id);
            setSelected(res.data);
            setResolution(res.data.resolution || "");
            setTargetStatus(res.data.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED");
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to open ticket");
        }
    };

    const setStatus = async () => {
        if (!selected) return;
        if (targetStatus === "RESOLVED" && !resolution.trim()) {
            setError("Resolving requires a resolution — it is the answer the tenant reads.");
            return;
        }
        setError("");
        try {
            await platformApi.setTicketStatus(selected.id, {
                status: targetStatus,
                ...(targetStatus === "RESOLVED" ? { resolution } : {}),
            });
            setSelected(null);
            setResolution("");
            load();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Status change failed");
        }
    };

    if (isLoading || loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-1">Support tickets</h1>
            <p className="text-sm text-muted-foreground mb-6">Every tenant&apos;s requests. Your answer is the resolution note on RESOLVED.</p>

            {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            <div className="flex gap-2 mb-4">
                {STATUSES.map((s) => (
                    <button
                        key={s}
                        onClick={() => { setFilter(s); setLoading(true); }}
                        className={`px-3 py-1 rounded-full text-sm ${filter === s ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            <div className="bg-card rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Subject</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Tenant</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Raised</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tickets.map((t) => (
                            <tr key={t.id} className="hover:bg-muted cursor-pointer" onClick={() => openTicket(t.id)}>
                                <td className="px-4 py-2 text-sm font-medium">{t.subject}</td>
                                <td className="px-4 py-2 text-sm">{t.organization?.name ?? t.organizationId}</td>
                                <td className="px-4 py-2 text-sm">{t.status}</td>
                                <td className="px-4 py-2 text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {tickets.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No tickets in this state.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selected && (
                <div className="mt-6 p-6 bg-card rounded-lg shadow">
                    <h2 className="text-lg font-semibold">{selected.subject}</h2>
                    <p className="text-sm text-muted-foreground mb-2">{selected.organization?.name} · raised by {selected.raisedBy?.email ?? "unknown"}</p>
                    <p className="whitespace-pre-wrap mb-4">{selected.description}</p>
                    {selected.resolution && (
                        <div className="p-3 bg-muted rounded mb-4 text-sm">
                            <span className="font-medium">Current resolution: </span>{selected.resolution}
                        </div>
                    )}
                    <div className="flex flex-col md:flex-row gap-3">
                        <select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as TicketStatus)} className="px-3 py-2 border rounded-lg">
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                        {targetStatus === "RESOLVED" && (
                            <input type="text" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What was done (the tenant reads this)" className="flex-1 px-3 py-2 border rounded-lg" />
                        )}
                        <button onClick={setStatus} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Apply</button>
                        <button onClick={() => setSelected(null)} className="px-4 py-2 border rounded-lg">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
