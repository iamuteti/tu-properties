"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { PlatformOrganization } from "@/types";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tenant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Subscription</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Users</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Properties</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-gray-200">
                        {orgs.map((org) => (
                            <tr key={org.id} className="hover:bg-muted">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <Link href={`/platform/organizations/${org.id}`} className="text-blue-600 hover:underline font-medium">
                                        {org.name}
                                    </Link>
                                    <div className="text-xs text-muted-foreground">{org.slug} · {org.plan}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {org.subscription ? org.subscription.status : "—"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{org._count?.users ?? "—"}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{org._count?.properties ?? "—"}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                        {org.isActive ? "Active" : "Suspended"}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <Button
                                        onClick={() => setConfirmDeleteOrgId(org.id)}
                                        disabled={deletingOrgId === org.id}
                                        variant="destructive"
                                        size="sm"
                                        className="flex items-center gap-1"
                                    >
                                        {deletingOrgId === org.id ? (
                                            <span className="flex items-center gap-1">
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Deleting...
                                            </span>
                                        ) : (
                                            <>
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                            </>
                                        )}
                                    </Button>
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
                                </td>
                            </tr>
                        ))}
                        {orgs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No tenants yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
