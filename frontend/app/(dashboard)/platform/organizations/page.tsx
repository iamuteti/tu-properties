"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { PlatformOrganization } from "@/types";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleTable, SimpleTableColumn } from "@/components/ui/simple-table";

export default function PlatformOrganizationsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [confirmDeleteOrgId, setConfirmDeleteOrgId] = useState<string | null>(null);
    const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        plan: "STARTER",
        adminEmail: "",
        adminFirstName: "",
        adminLastName: "",
        adminPassword: "",
    });

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user && user.role !== "SUPER_ADMIN") {
            router.push("/dashboard");
        } else if (user && user.role === "SUPER_ADMIN") {
            load();
        }
    }, [user, isLoading, router]);

    const load = async () => {
        try {
            const response = await platformApi.list();
            setOrgs(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to load tenants");
        } finally {
            setLoading(false);
        }
    };

    const handleOnboard = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await platformApi.onboard(formData);
            setShowForm(false);
            setFormData({ name: "", slug: "", plan: "STARTER", adminEmail: "", adminFirstName: "", adminLastName: "", adminPassword: "" });
            load();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to onboard tenant");
        }
    };

    const handleDelete = async (orgId: string) => {
        if (!window.confirm("Delete this tenant? This cannot be undone.")) return;
        setDeletingOrgId(orgId);
        try {
            await platformApi.remove(orgId);
            toast.success("Tenant deleted");
            setConfirmDeleteOrgId(null);
            load();
        } catch (err: any) {
            toast.error(err.message || "Failed to delete tenant");
        } finally {
            setDeletingOrgId(null);
        }
    };

    if (isLoading || loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    const columns: SimpleTableColumn<PlatformOrganization>[] = [
        {
            key: 'tenant',
            header: 'Tenant',
            className: 'whitespace-nowrap',
            cell: (org) => (
                <div>
                    <Link href={`/platform/organizations/${org.id}`} className="text-blue-600 hover:underline font-medium">
                        {org.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{org.slug} · {org.plan}</div>
                </div>
            ),
        },
        {
            key: 'subscription',
            header: 'Subscription',
            cell: (org) => (
                <span className="text-sm">{org.subscription ? org.subscription.status : "—"}</span>
            ),
        },
        {
            key: 'users',
            header: 'Users',
            cell: (org) => <span className="text-sm">{org._count?.users ?? "—"}</span>,
        },
        {
            key: 'properties',
            header: 'Properties',
            cell: (org) => <span className="text-sm">{org._count?.properties ?? "—"}</span>,
        },
        {
            key: 'status',
            header: 'Status',
            className: 'whitespace-nowrap',
            cell: (org) => (
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {org.isActive ? "Active" : "Suspended"}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            className: 'whitespace-nowrap',
            cell: (org) => (
                <div>
                    {deletingOrgId === org.id ? (
                        <span className="flex items-center gap-1">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting...
                        </span>
                    ) : (
                        <Button
                            onClick={() => setConfirmDeleteOrgId(org.id)}
                            disabled={deletingOrgId === org.id}
                            variant="destructive"
                            size="sm"
                            className="flex items-center gap-1"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    )}
                    {confirmDeleteOrgId === org.id && (
                        <div className="mt-2 flex items-center gap-2">
                            <Button
                                onClick={() => handleDelete(org.id)}
                                variant="destructive"
                                size="sm"
                            >
                                Confirm delete
                            </Button>
                            <Button
                                onClick={() => setConfirmDeleteOrgId(null)}
                                variant="outline"
                                size="sm"
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Tenants</h1>
                    <p className="text-sm text-muted-foreground">Every organization on the platform, with its subscription state.</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    {showForm ? "Cancel" : "Onboard tenant"}
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            )}

            {showForm && (
                <div className="mb-6 p-6 bg-card rounded-lg shadow">
                    <h2 className="text-lg font-semibold mb-4">Onboard a new tenant</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                        Creates the organization, its first administrator and a 14-day trial subscription in one transaction.
                    </p>
                    <form onSubmit={handleOnboard} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Organization name</label>
                            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Slug</label>
                            <input type="text" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Plan</label>
                            <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                                <option value="STARTER">Starter</option>
                                <option value="PROFESSIONAL">Professional</option>
                                <option value="ENTERPRISE">Enterprise</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Admin email (login)</label>
                            <input type="email" value={formData.adminEmail} onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Admin first name</label>
                            <input type="text" value={formData.adminFirstName} onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Admin last name</label>
                            <input type="text" value={formData.adminLastName} onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Initial password (min 10 characters)</label>
                            <input type="password" value={formData.adminPassword} onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required minLength={10} />
                        </div>
                        <div className="md:col-span-2">
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                Onboard tenant
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-card rounded-lg shadow overflow-hidden">
                <SimpleTable
                    data={orgs}
                    rowKey={(org) => org.id}
                    columns={columns}
                    emptyMessage="No tenants yet."
                />
            </div>
        </div>
    );
}
