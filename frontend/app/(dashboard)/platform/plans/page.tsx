"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { SubscriptionPlanRecord } from "@/types";
import { SimpleTable } from "@/components/ui/simple-table";
import { Trash2, Pencil, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

export default function PlatformPlansPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [plans, setPlans] = useState<SubscriptionPlanRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<SubscriptionPlanRecord | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await platformApi.plans();
            setPlans(response.data);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } }; message?: string };
            setError(e.response?.data?.message || e.message || "Failed to load plans");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isLoading && !user) router.push("/auth/login");
        else if (user && user.role !== "SUPER_ADMIN") router.push("/dashboard");
        else if (user && user.role === "SUPER_ADMIN") load();
    }, [user, isLoading, router, load]);

    const archive = async (id: string) => {
        setDeletingId(id);
        try {
            await platformApi.deletePlan(id);
            toast.success("Plan archived");
            await load();
        } catch (err: unknown) {
          const e = err as { response?: { data?: { message?: string } }; message?: string };
            setError(e.response?.data?.message || e.message || "Cannot archive: subscriptions still reference this plan");
        } finally {
            setDeletingId(null);
        }
    };

    if (isLoading || loading) {
        return <div className="flex items-center justify-center h-screen"><div className="text-lg">Loading...</div></div>;
    }
    if (!user) return null;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Plans</h1>
                    <p className="text-sm text-muted-foreground">The catalog the platform sells. Edit a plan to manage its modules.</p>
                </div>
                <Link href="/platform/plans/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New plan
                </Link>
            </div>
            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
            <div className="bg-card rounded-lg shadow overflow-x-auto">
                <SimpleTable
                    data={plans}
                    rowKey={(row) => row.id}
                    emptyMessage="No plans yet. Create one above."
                    columns={[
                        { key: "plan", header: "Plan", cell: (plan: SubscriptionPlanRecord) => (
                            <div>
                                <div className="font-medium">{plan.name}</div>
                                <div className="text-xs text-muted-foreground">{plan.slug} · {plan.interval}</div>
                                {plan.isPopular && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">Popular</span>}
                            </div>
                        )},
                        { key: "price", header: "Price", cell: (plan: SubscriptionPlanRecord) => {
                            const entries = Object.entries(plan.prices ?? {});
                            if (entries.length === 0) return "Free";
                            return entries.map(([cur, amt]) => `${cur === "USD" ? "$" : cur}${amt}`).join(" · ");
                        }},
                        { key: "limits", header: "Limits", cell: (plan: SubscriptionPlanRecord) => `${plan.maxUsers} seats · ${plan.maxProperties} properties` },
                        { key: "modules", header: "Modules", cell: (plan: SubscriptionPlanRecord) => plan.enabledModules?.length ?? 0 },
                        { key: "status", header: "Status", cell: (plan: SubscriptionPlanRecord) => plan.isActive
                            ? <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                            : <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700">Archived</span> },
                        { key: "actions", header: "", headerClassName: "text-right", className: "text-right", cell: (plan: SubscriptionPlanRecord) => (
                            <div className="flex items-center justify-end gap-2">
                                <Link href={`/platform/plans/${plan.id}`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                                    <Pencil className="w-4 h-4" />
                                </Link>
                                <button onClick={() => setConfirmDelete(plan)} disabled={deletingId === plan.id} className={`p-1.5 rounded ${plan.isActive ? "text-red-600 hover:bg-red-50" : "text-gray-400"} disabled:opacity-50`} title={plan.isActive ? "Archive" : "Restore"}>
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )},
                    ]}
                />
                <p className="px-4 py-3 text-xs text-muted-foreground border-t">Archiving a plan is refused while any subscription still references it.</p>
            </div>
            <ConfirmDialog
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => { if (confirmDelete) archive(confirmDelete.id); setConfirmDelete(null); }}
                title={confirmDelete?.isActive ? "Archive plan" : "Restore plan"}
                message={confirmDelete?.isActive ? `Archive "${confirmDelete?.name}"?` : `Restore "${confirmDelete?.name}"?`}
                confirmText={confirmDelete?.isActive ? "Archive" : "Restore"}
                tone={confirmDelete?.isActive ? "danger" : "default"}
            />
        </div>
    );
}
