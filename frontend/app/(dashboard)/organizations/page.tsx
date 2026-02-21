"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { organizationsApi } from "@/lib/api";
import { Organization } from "@/types";

export default function OrganizationsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        subdomain: "",
    });

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user && user.role !== "SUPER_ADMIN") {
            router.push("/dashboard");
        } else if (user && user.role === "SUPER_ADMIN") {
            loadOrganizations();
        }
    }, [user, isLoading, router]);

    const loadOrganizations = async () => {
        try {
            const response = await organizationsApi.findAll();
            setOrganizations(response.data);
        } catch (err: any) {
            setError(err.message || "Failed to load organizations");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await organizationsApi.create(formData);
            setShowForm(false);
            setFormData({ name: "", slug: "", subdomain: "" });
            loadOrganizations();
        } catch (err: any) {
            setError(err.message || "Failed to create organization");
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
                <h1 className="text-2xl font-bold">Organizations</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    {showForm ? "Cancel" : "Add Organization"}
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            {showForm && (
                <div className="mb-6 p-6 bg-white rounded-lg shadow">
                    <h2 className="text-lg font-semibold mb-4">Create New Organization</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Organization Name
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                className="w-full px-3 py-2 border rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Slug (URL identifier)
                            </label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) =>
                                    setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })
                                }
                                className="w-full px-3 py-2 border rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Subdomain (optional)
                            </label>
                            <input
                                type="text"
                                value={formData.subdomain}
                                onChange={(e) =>
                                    setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/\s+/g, '') })
                                }
                                className="w-full px-3 py-2 border rounded-lg"
                                placeholder="e.g., company1"
                            />
                        </div>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Create Organization
                        </button>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Slug
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Subdomain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                Plan
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {organizations.map((org) => (
                            <tr key={org.id}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {org.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {org.slug}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {org.subdomain || "-"}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            org.isActive
                                                ? "bg-green-100 text-green-800"
                                                : "bg-red-100 text-red-800"
                                        }`}
                                    >
                                        {org.isActive ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {org.plan}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
