"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi, setImpersonation } from "@/lib/api";
import { PlatformOrganization, PlatformOrgUser, OrganizationUsage } from "@/types";

/** Module keys organized by sidebar group, for the per-org toggle UI.
 *  Keys match `NavItem.module` in `components/layout/sidebar.tsx` and
 *  `Subscription.enabledModules` on the backend. Always-on items
 *  (Dashboard, Settings, Support) and Platform (SUPER_ADMIN only) are
 *  intentionally absent — they are not togglable.
 */
const MODULE_GROUPS = [
    {
        label: 'Maintenance',
        key: 'maintenance',
        children: [
            { key: 'maintenance/work-orders', label: 'Work orders' },
            { key: 'maintenance/work-orders/board', label: 'Board' },
            { key: 'maintenance/assets', label: 'Plant register' },
            { key: 'maintenance/schedules', label: 'Service schedule' },
        ],
    },
    {
        label: 'Procurement',
        key: 'procurement',
        children: [
            { key: 'procurement/purchase-requests', label: 'Purchase requests' },
            { key: 'procurement/rfqs', label: 'Quotations' },
            { key: 'procurement/purchase-orders', label: 'Purchase orders' },
            { key: 'procurement/suppliers', label: 'Suppliers' },
        ],
    },
    {
        label: 'Inventory',
        key: 'inventory',
        children: [
            { key: 'inventory/items', label: 'Items' },
            { key: 'inventory/warehouses', label: 'Stores' },
            { key: 'inventory/stock-movements', label: 'Stock ledger' },
        ],
    },
    {
        label: 'Landlords',
        key: 'landlords',
        children: [
            { key: 'landlords', label: 'Owners' },
            { key: 'landlords/statements', label: 'Owner statements' },
            { key: 'landlords/payouts', label: 'Owner payouts' },
        ],
    },
    {
        label: 'Properties',
        key: 'properties',
        children: [
            { key: 'properties', label: 'All Properties' },
            { key: 'properties/units', label: 'All Units' },
        ],
    },
    {
        label: 'CRM',
        key: 'crm',
        children: [
            { key: 'crm/leads', label: 'Leads & pipeline' },
            { key: 'crm/contacts', label: 'Contacts' },
        ],
    },
    {
        label: 'Sales',
        key: 'sales',
        children: [
            { key: 'sales', label: 'Sales pipeline' },
            { key: 'sales/commissions', label: 'Commissions' },
        ],
    },
    {
        label: 'Tenants & Leases',
        key: 'tenants',
        children: [
            { key: 'tenants', label: 'Tenants' },
            { key: 'leases', label: 'Leases' },
            { key: 'tenant-requests', label: 'Tenant requests' },
            { key: 'moving-out', label: 'Moving Out' },
            { key: 'security-deposits', label: 'Security deposits' },
        ],
    },
    {
        label: 'Billing & Finance',
        key: 'billing',
        children: [
            { key: 'invoices', label: 'Invoices' },
            { key: 'payments', label: 'Payments' },
            { key: 'arrears', label: 'Arrears' },
            { key: 'payables', label: 'Payables' },
            { key: 'finance/suppliers', label: 'Suppliers' },
            { key: 'refunds', label: 'Refunds' },
            { key: 'credits', label: 'Customer Credits' },
            { key: 'receipts', label: 'Receipts' },
            { key: 'rent-receipts', label: 'Rent Receipts' },
            { key: 'chart-of-accounts', label: 'Chart of Accounts' },
            { key: 'journal-entries', label: 'Journal Entries' },
            { key: 'trial-balance', label: 'Trial Balance' },
        ],
    },
    {
        label: 'HR & Payroll',
        key: 'hr',
        children: [
            { key: 'hr/employees', label: 'Employees' },
            { key: 'hr/leave', label: 'Leave' },
            { key: 'hr/payroll', label: 'Payroll runs' },
            { key: 'hr/settings/payroll-rules', label: 'Statutory rules' },
            { key: 'hr/me', label: 'My account' },
        ],
    },
    {
        label: 'Facilities',
        key: 'facilities',
        children: [
            { key: 'facilities', label: 'Facility register' },
            { key: 'facilities/bookings', label: 'Bookings' },
            { key: 'facilities/visits', label: 'The gate book' },
            { key: 'facilities/visitors', label: 'Visitors' },
            { key: 'facilities/access-cards', label: 'Access cards' },
        ],
    },
    {
        label: 'Utilities',
        key: 'utilities',
        children: [
            { key: 'utilities', label: 'Meter register' },
            { key: 'utilities/readings', label: 'Readings' },
            { key: 'utilities/tariffs', label: 'Tariffs' },
            { key: 'utilities/billing', label: 'Billing' },
        ],
    },
    {
        label: 'Contracts',
        key: 'contracts',
        children: [
            { key: 'contracts', label: 'Contract register' },
            { key: 'contracts/expiry-report', label: 'Expiry report' },
            { key: 'contracts/new', label: 'File a contract' },
        ],
    },
    {
        label: 'Reports',
        key: 'reports',
        children: [],
    },
    {
        label: 'Users',
        key: 'users',
        children: [],
    },
    {
        label: 'Branches',
        key: 'branches',
        children: [],
    },
    {
        label: 'Documents',
        key: 'documents',
        children: [],
    },
    {
        label: 'Notifications',
        key: 'notifications',
        children: [],
    },
    {
        label: 'Approvals',
        key: 'approvals',
        children: [],
    },
] as const;

function UsageBar({ used, max }: { used: number; max: number }) {
    const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
    const over = used > max;
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span>{used} / {max}</span>
                {over && <span className="text-red-600 font-medium">over limit</span>}
            </div>
            <div className="h-2 bg-gray-200 rounded">
                <div className={`h-2 rounded ${over ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function PlatformOrganizationDetailPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const [org, setOrg] = useState<PlatformOrganization | null>(null);
    const [usage, setUsage] = useState<OrganizationUsage | null>(null);
    const [users, setUsers] = useState<PlatformOrgUser[]>([]);
    const [enabledModules, setEnabledModules] = useState<string[]>([]);
    const [modulesSaving, setModulesSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [impersonating, setImpersonating] = useState<string | null>(null);
    const [impReason, setImpReason] = useState("");
    const [showImpDialog, setShowImpDialog] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [orgRes, usageRes, usersRes, modulesRes] = await Promise.all([
                platformApi.get(id),
                platformApi.usage(id),
                platformApi.users(id),
                platformApi.getEnabledModules(id),
            ]);
            setOrg(orgRes.data);
            setUsage(usageRes.data);
            setUsers(usersRes.data);
            setEnabledModules(modulesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to load tenant");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user && user.role !== "SUPER_ADMIN") {
            router.push("/dashboard");
        } else if (user && user.role === "SUPER_ADMIN") {
            load();
        }
    }, [user, isLoading, router, load]);

    const act = async (kind: "suspend" | "activate") => {
        if (!reason.trim()) {
            setError("A reason is required — suspension is a decision with a record, not a bare click.");
            return;
        }
        setError("");
        try {
            if (kind === "suspend") await platformApi.suspend(id, reason);
            else await platformApi.activate(id, reason);
            setReason("");
            load();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Action failed");
        }
    };

    const startImpersonation = async (target: PlatformOrgUser) => {
        if (impReason.trim().length < 10) {
            setError("Impersonation needs a reason of at least 10 characters — it lands in the audit trail verbatim.");
            return;
        }
        setError("");
        try {
            const res = await platformApi.impersonate(id, { userId: target.id, reason: impReason });
            setImpersonation(res.data, id);
            setImpersonating(target.email);
            setShowImpDialog(null);
            setImpReason("");
            // Reload as the tenant user: the bearer token now scopes every call.
            router.push("/dashboard");
            router.refresh();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Impersonation failed");
        }
    };

    /** Toggle one module key on/off in the local set. */
    const toggleModule = (key: string) => {
        setEnabledModules(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    /** Persist the enabled modules for this organization. */
    const saveModules = async () => {
        setModulesSaving(true);
        setError("");
        try {
            await platformApi.setEnabledModules(id, enabledModules);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || "Failed to save modules");
        } finally {
            setModulesSaving(false);
        }
    };

    if (isLoading || loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!org) {
        return <div className="p-6 text-red-600">{error || "Tenant not found."}</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <button onClick={() => router.push("/platform/organizations")} className="text-sm text-blue-600 hover:underline mb-2">
                    ← All tenants
                </button>
                <h1 className="text-2xl font-bold">{org.name}</h1>
                <p className="text-sm text-muted-foreground">{org.slug} · plan {org.plan} · subscription {org.subscription?.status ?? "—"}</p>
            </div>

            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
            {impersonating && (
                <div className="p-4 bg-amber-100 text-amber-800 rounded-lg">
                    Impersonating {impersonating} — every request now runs as that user for 15 minutes. The banner at the top ends it.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-card rounded-lg shadow">
                    <h2 className="text-lg font-semibold mb-4">Usage vs plan</h2>
                    {usage ? (
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm font-medium mb-1">Users ({usage.users.active} active)</div>
                                <UsageBar used={usage.users.total} max={usage.users.max} />
                            </div>
                            <div>
                                <div className="text-sm font-medium mb-1">Properties</div>
                                <UsageBar used={usage.properties.total} max={usage.properties.max} />
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center pt-2">
                                <div><div className="text-xl font-bold">{usage.tenants}</div><div className="text-xs text-muted-foreground">Tenants</div></div>
                                <div><div className="text-xl font-bold">{usage.units}</div><div className="text-xs text-muted-foreground">Units</div></div>
                                <div><div className="text-xl font-bold">{(usage.storage.bytes / 1024 / 1024).toFixed(1)} MB</div><div className="text-xs text-muted-foreground">{usage.storage.documents} files</div></div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-muted-foreground">Usage unavailable.</div>
                    )}
                </div>

                <div className="p-6 bg-card rounded-lg shadow">
                    <h2 className="text-lg font-semibold mb-4">{org.isActive ? "Suspend tenant" : "Reactivate tenant"}</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                        {org.isActive
                            ? "Blocks every login and revokes every session immediately. The subscription moves to SUSPENDED with it."
                            : "Restores access and returns the subscription to TRIALING (trial still open) or ACTIVE."}
                    </p>
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (recorded in the audit trail)"
                        className="w-full px-3 py-2 border rounded-lg mb-3"
                    />
                    {org.isActive ? (
                        <button onClick={() => act("suspend")} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                            Suspend
                        </button>
                    ) : (
                        <button onClick={() => act("activate")} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                            Reactivate
                        </button>
                    )}
                </div>
            </div>

            {/* Module enablement */}
            <div className="p-6 bg-card rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-4">Manage modules</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Toggle which modules are enabled for {org.name}. Disabled modules are
                    hidden from that organization's sidebar. Changes are saved immediately.
                </p>
                {modulesSaving ? (
                    <div className="text-sm text-muted-foreground">Saving...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MODULE_GROUPS.map((group) => (
                            <div key={group.label} className="border rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <input
                                        type="checkbox"
                                        checked={enabledModules.includes(group.key)}
                                        onChange={() => toggleModule(group.key)}
                                        className="rounded bg:text-blue-600"
                                    />
                                    <span className="font-semibold">{group.label}</span>
                                    {group.key && enabledModules.includes(group.key) && (
                                        <span className="ml-auto text-xs text-green-600">enabled</span>
                                    )}
                                </div>
                                <div className="space-y-1 ml-4">
                                    {group.children.map((child) => (
                                        <label key={child.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={enabledModules.includes(child.key)}
                                                onChange={() => toggleModule(child.key)}
                                                className="rounded bg:text-blue-600"
                                            />
                                            <span>{child.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <button
                    onClick={saveModules}
                    disabled={modulesSaving}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    Save module changes
                </button>
            </div>

            <div className="p-6 bg-card rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-1">Users</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Impersonate to see the product exactly as this tenant sees it. The token lasts 15 minutes, carries the user&apos;s own role, and the start is audited with your reason.
                </p>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Role</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {users.map((u) => (
                            <tr key={u.id}>
                                <td className="px-4 py-2 text-sm">{u.firstName} {u.lastName} <span className="text-muted-foreground">({u.email})</span></td>
                                <td className="px-4 py-2 text-sm">{u.role}</td>
                                <td className="px-4 py-2 text-sm">{u.isActive ? "Active" : "Inactive"}</td>
                                <td className="px-4 py-2 text-right">
                                    {u.isActive && (
                                        <button onClick={() => setShowImpDialog(u.id)} className="text-sm text-blue-600 hover:underline">
                                            Impersonate
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {showImpDialog && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted">
                        <div className="text-sm font-medium mb-2">Why are you signing in as this user?</div>
                        <input
                            type="text"
                            value={impReason}
                            onChange={(e) => setImpReason(e.target.value)}
                            placeholder="e.g. reproduce the missing January receipt (min 10 characters)"
                            className="w-full px-3 py-2 border rounded-lg mb-3"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { const t = users.find((x) => x.id === showImpDialog); if (t) startImpersonation(t); }}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                            >
                                Start impersonation
                            </button>
                            <button onClick={() => { setShowImpDialog(null); setImpReason(""); }} className="px-4 py-2 border rounded-lg">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
