"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { supportTicketsApi } from "@/lib/api";
import { SupportTicket } from "@/types";

export default function SupportPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user) {
            load();
        }
    }, [user, isLoading, router]);

    const load = async () => {
        try {
            const res = await supportTicketsApi.list();
            setTickets(res.data.data);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    };

    const raise = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await supportTicketsApi.create({ subject, description });
            setSubject("");
            setDescription("");
            load();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to raise ticket");
        }
    };

    const close = async (id: string) => {
        try {
            await supportTicketsApi.close(id);
            load();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to close ticket");
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
            <h1 className="text-2xl font-bold mb-1">Support</h1>
            <p className="text-sm text-muted-foreground mb-6">Ask the platform team. They answer as a resolution note on the ticket.</p>

            {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            <div className="mb-6 p-6 bg-card rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-4">Raise a ticket</h2>
                <form onSubmit={raise} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Subject</label>
                        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required maxLength={200} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">What happened (min 10 characters)</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border rounded-lg" rows={4} required minLength={10} />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        Raise ticket
                    </button>
                </form>
            </div>

            <div className="bg-card rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Subject</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Resolution</th>
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {tickets.map((t) => (
                            <tr key={t.id}>
                                <td className="px-4 py-2 text-sm">
                                    <div className="font-medium">{t.subject}</div>
                                    <div className="text-muted-foreground text-xs">{t.description}</div>
                                </td>
                                <td className="px-4 py-2 text-sm">{t.status}</td>
                                <td className="px-4 py-2 text-sm">{t.resolution ?? "—"}</td>
                                <td className="px-4 py-2 text-right">
                                    {(t.status === "OPEN" || t.status === "IN_PROGRESS") && (
                                        <button onClick={() => close(t.id)} className="text-sm text-blue-600 hover:underline">
                                            Close
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {tickets.length === 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No tickets yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
