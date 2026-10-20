"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi, setImpersonation } from "@/lib/api";
import {
    PlatformOrganization,
    PlatformOrgUser,
    OrganizationUsage,
    SubscriptionPlan,
    SubscriptionStatus,
} from "@/types";
import { toast } from "sonner";

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
        label: 'Tenants & Agreements',
        key: 'tenants',
        children: [
            { key: 'tenants', label: 'Tenants' },
            { key: 'agreements', label: 'Agreements' },
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

/** The plan tiers the platform sells. `FREE` is the schema default, not a placeholder. */
const PLANS: SubscriptionPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
    'TRIALING',
    'ACTIVE',
    'SUSPENDED',
    'CANCELLED',
];

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
    TRIALING: 'bg-blue-100 text-blue-800',
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-200 text-gray-700',
};

/**
 * A calendar date, not an instant.
 *
 * The input gives `YYYY-MM-DD` and the server stores midnight UTC of that
 * day, so the day that comes back out is the day that went in — read in UTC
 * rather than the browser's zone, which would show the previous day to
 * everyone west of Greenwich.
 */
function calendarDay(iso?: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function displayDate(iso?: string | null): string {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}

/**
 * The message the API failed with, if there is one.
 *
 * Nest sends `{ message }` in the body and axios nests that under `response`,
 * so a refusal ("A reason is required...") arrives two hops away from a thrown
 * error. Typed rather than `any`, because the reason this error is surfaced
 * at all is that it says what went wrong.
 */
function errorMessage(err: unknown, fallback: string): string {
    if (typeof err === "object" && err !== null) {
        const candidate = err as {
            response?: { data?: { message?: unknown } };
            message?: unknown;
        };
        const fromBody = candidate.response?.data?.message;
        if (typeof fromBody === "string" && fromBody) return fromBody;
        if (typeof candidate.message === "string" && candidate.message) {
            return candidate.message;
        }
    }
    return fallback;
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
    const [subForm, setSubForm] = useState({
        plan: "STARTER" as SubscriptionPlan,
        status: "TRIALING" as SubscriptionStatus,
        trialEndsAt: "",
        renewsAt: "",
        statusReason: "",
        maxUsers: 3,
        maxProperties: 10,
    });
    const [subSaving, setSubSaving] = useState(false);

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
            // The subscription terms are edited in a form, so the form starts
            // from what is on the record — not from a blank that would quietly
            // propose wiping a trial date the operator never looked at.
            const sub = orgRes.data.subscription;
            setSubForm({
                plan: (sub?.plan ?? orgRes.data.plan) as SubscriptionPlan,
                status: sub?.status ?? "TRIALING",
                trialEndsAt: calendarDay(sub?.trialEndsAt),
                renewsAt: calendarDay(sub?.renewsAt),
                statusReason: sub?.statusReason ?? "",
                maxUsers: orgRes.data.maxUsers ?? 3,
                maxProperties: orgRes.data.maxProperties ?? 10,
            });
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

    /**
     * Save the subscription terms.
     *
     * The whole form is sent rather than the fields that changed: the server
     * treats a missing field as "keep it", and a form that only ever sends the
     * fields somebody touched is a form that cannot clear a date.
     */
    const saveSubscription = async () => {
        setSubSaving(true);
        setError("");
        try {
            await platformApi.updateSubscription(id, {
                plan: subForm.plan,
                status: subForm.status,
                trialEndsAt: subForm.trialEndsAt || null,
                renewsAt: subForm.renewsAt || null,
                statusReason: subForm.statusReason.trim() || null,
                maxUsers: Number(subForm.maxUsers),
                maxProperties: Number(subForm.maxProperties),
            });
            toast.success("Subscription updated");
            await load();
        } catch (err) {
            setError(errorMessage(err, "Failed to update the subscription"));
        } finally {
            setSubSaving(false);
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
                <p className="text-sm text-muted-foreground">
                    {org.slug} · plan {org.subscription?.plan ?? org.plan} ·{" "}
                    {org.subscription ? (
                        <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_STYLES[org.subscription.status]}`}
                        >
                            {org.subscription.status}
                        </span>
                    ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                            NO SUBSCRIPTION
                        </span>
                    )}
                </p>
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

            {/* Subscription terms */}
            <div className="p-6 bg-card rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-1">Subscription</h2>
                <p className="text-sm text-muted-foreground mb-4">
                    What {org.name} is on and what it pays for. The plan and the limits
                    decide what the tenant can do; the dates decide how long they
                    have it. Moving a tenant to SUSPENDED or CANCELLED here blocks
                    their access and revokes their sessions — a reason is required,
                    and the reason is kept on the record.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="sub-plan">
                            Plan
                        </label>
                        <select
                            id="sub-plan"
                            value={subForm.plan}
                            onChange={(e) =>
                                setSubForm({ ...subForm, plan: e.target.value as SubscriptionPlan })
                            }
                            className="w-full px-3 py-2 border rounded-lg bg-background"
                        >
                            {PLANS.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="sub-status">
                            Status
                        </label>
                        <select
                            id="sub-status"
                            value={subForm.status}
                            onChange={(e) =>
                                setSubForm({ ...subForm, status: e.target.value as SubscriptionStatus })
                            }
                            className="w-full px-3 py-2 border rounded-lg bg-background"
                        >
                            {SUBSCRIPTION_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="sub-reason">
                            Reason
                        </label>
                        <input
                            id="sub-reason"
                            type="text"
                            value={subForm.statusReason}
                            onChange={(e) => setSubForm({ ...subForm, statusReason: e.target.value })}
                            placeholder="Required to block or restore access"
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="sub-trial">
                            Trial ends
                        </label>
                        <input
                            id="sub-trial"
                            type="date"
                            value={subForm.trialEndsAt}
                            onChange={(e) => setSubForm({ ...subForm, trialEndsAt: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="sub-renews">
                            Renews
                        </label>
                        <input
                            id="sub-renews"
                            type="date"
                            value={subForm.renewsAt}
                            onChange={(e) => setSubForm({ ...subForm, renewsAt: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1" htmlFor="sub-users">
                                Seats
                            </label>
                            <input
                                id="sub-users"
                                type="number"
                                min={1}
                                value={subForm.maxUsers}
                                onChange={(e) =>
                                    setSubForm({ ...subForm, maxUsers: Number(e.target.value) })
                                }
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1" htmlFor="sub-properties">
                                Properties
                            </label>
                            <input
                                id="sub-properties"
                                type="number"
                                min={1}
                                value={subForm.maxProperties}
                                onChange={(e) =>
                                    setSubForm({ ...subForm, maxProperties: Number(e.target.value) })
                                }
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                        onClick={saveSubscription}
                        disabled={subSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {subSaving ? "Saving..." : "Save subscription"}
                    </button>
                    <span className="text-xs text-muted-foreground">
                        Trial ends {displayDate(org.subscription?.trialEndsAt)} · renews{" "}
                        {displayDate(org.subscription?.renewsAt)}
                    </span>
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
