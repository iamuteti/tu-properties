"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { MODULE_GROUPS } from "@/lib/module-groups";

export default function NewPlanPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [form, setForm] = useState({
        name: "", slug: "", description: "", priceUsd: "", priceKes: "",
        enabledModules: [] as string[], interval: "month", maxUsers: "3",
        maxProperties: "10", features: "", isActive: true, isPopular: false, sortOrder: "0",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isLoading && !user) router.push("/auth/login");
        else if (user && user.role !== "SUPER_ADMIN") router.push("/dashboard");
    }, [user, isLoading, router]);

    const toggleModule = (key: string) => {
        setForm((prev) => ({
            ...prev,
            enabledModules: prev.enabledModules.includes(key)
                ? prev.enabledModules.filter((k) => k !== key)
                : [...prev.enabledModules, key],
        }));
    };

    const save = async () => {
        setError("");
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                slug: form.slug.trim() || undefined,
                description: form.description.trim() || null,
                prices: {
                    ...(form.priceUsd.trim() !== "" ? { USD: Number(form.priceUsd) } : {}),
                    ...(form.priceKes.trim() !== "" ? { KES: Number(form.priceKes) } : {}),
                },
                enabledModules: form.enabledModules,
                interval: form.interval,
                maxUsers: Number(form.maxUsers) || 3,
                maxProperties: Number(form.maxProperties) || 10,
                features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
                isActive: form.isActive,
                isPopular: form.isPopular,
                sortOrder: Number(form.sortOrder) || 0,
            };
            await platformApi.createPlan(payload);
            toast.success(`Plan "${payload.name}" created`);
            router.push("/platform/plans");
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } }; message?: string };
            setError(e.response?.data?.message || e.message || "Failed to save plan");
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-lg">Loading...</div></div>;
    }
    if (!user || user.role !== "SUPER_ADMIN") return null;

    return (
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
            <div>
                <button onClick={() => router.push("/platform/plans")} className="text-sm text-blue-600 hover:underline mb-2">← Back to plans</button>
                <h1 className="text-2xl font-bold">New plan</h1>
            </div>
            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
            <div className="p-6 bg-card rounded-lg shadow space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Name</label>
                        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Slug</label>
                        <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="auto from name" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Price (USD)</label>
                        <input type="number" step="0.01" min="0" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Price (KES)</label>
                        <input type="number" step="0.01" min="0" value={form.priceKes} onChange={(e) => setForm({ ...form, priceKes: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Interval</label>
                        <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Seats (max users)</label>
                        <input type="number" min="1" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Properties</label>
                        <input type="number" min="1" value={form.maxProperties} onChange={(e) => setForm({ ...form, maxProperties: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">Features (comma-separated)</label>
                        <input type="text" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
                        <label className="text-sm font-medium">Active</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.isPopular} onChange={(e) => setForm({ ...form, isPopular: e.target.checked })} className="rounded" />
                        <label className="text-sm font-medium">Popular</label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Sort order</label>
                        <input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                </div>
                <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold mb-2">Enabled modules</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MODULE_GROUPS.map((group) => (
                            <div key={group.label} className="border rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" checked={form.enabledModules.includes(group.key)} onChange={() => toggleModule(group.key)} className="rounded" />
                                    <span className="font-semibold text-sm">{group.label}</span>
                                </div>
                                <div className="space-y-1 ml-6">
                                    {group.children.map((child) => (
                                        <label key={child.key} className="flex items-center gap-2 text-xs cursor-pointer">
                                            <input type="checkbox" checked={form.enabledModules.includes(child.key)} onChange={() => toggleModule(child.key)} className="rounded" />
                                            <span>{child.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-4">
                    <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {saving ? "Saving…" : "Create plan"}
                    </button>
                </div>
            </div>
        </div>
    );
}
