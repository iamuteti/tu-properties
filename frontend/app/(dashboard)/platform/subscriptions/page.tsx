"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { platformApi } from "@/lib/api";
import { PlatformOrganization, SubscriptionStatus } from "@/types";

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
    TRIALING: "bg-blue-100 text-blue-800",
    ACTIVE: "bg-green-100 text-green-800",
    SUSPENDED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-200 text-gray-700",
};

/**
 * The platform's subscriptions, in one table.
 *
 * Every other surface for a subscription is per-organization: the terms live
 * on the organization's own page, and the module toggles with them. That is the
 * right place to *edit* a subscription, and the wrong place to *see* them —
 * a platform owner asking "which tenants are still in trial?" had to open
 * every organization one at a time to find out.
 *
 * This table is the answer to that question: one row per tenant, the plan and
 * the state and the dates, with a link to the page that edits it.
 */
export default function PlatformSubscriptionsPage() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        try {
            const response = await platformApi.list();
            setOrgs(response.data);
        } catch (err) {
            setError(errorMessage(err, "Failed to load subscriptions"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        } else if (user && user.role !== "SUPER_ADMIN") {
            router.push("/dashboard");
        } else if (user && user.role === "SUPER_ADMIN") {
            load();
        }
    }, [user, isLoading, router, load]);

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return orgs.filter((org) => {
            if (statusFilter && org.subscription?.status !== statusFilter) return false;
            if (!needle) return true;
            return (
                org.name.toLowerCase().includes(needle) ||
                org.slug.toLowerCase().includes(needle)
            );
        });
    }, [orgs, statusFilter, search]);

    const counts = useMemo(() => {
        const tally: Record<string, number> = {};
        for (const org of orgs) {
            const status = org.subscription?.status ?? "NONE";
            tally[status] = (tally[status] ?? 0) + 1;
        }
        return tally;
    }, [orgs]);

    if (isLoading || loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Subscriptions</h1>
                <p className="text-sm text-muted-foreground">
                    Every tenant&apos;s plan, state and dates. Editing a subscription happens
                    on the tenant&apos;s own page.
                </p>
            </div>

            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="sub-filter-status">
                        Status
                    </label>
                    <select
                        id="sub-filter-status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border rounded-lg bg-background"
                    >
                        <option value="">All statuses</option>
                        <option value="TRIALING">TRIALING</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                        <option value="CANCELLED">CANCELLED</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="sub-filter-search">
                        Search
                    </label>
                    <input
                        id="sub-filter-search"
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tenant name or slug"
                        className="px-3 py-2 border rounded-lg"
                    />
                </div>
                <div className="text-sm text-muted-foreground pb-2">
                    {rows.length} of {orgs.length} tenant{orgs.length === 1 ? "" : "s"}
                    {Object.entries(counts).map(([status, count]) => (
                        <span key={status} className="ml-3">
                            {status}: {count}
                        </span>
                    ))}
                </div>
            </div>

            <div className="bg-card rounded-lg shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Tenant</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Plan</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Trial ends</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Renews</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Modules</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Limits</th>
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {rows.map((org) => {
                            const sub = org.subscription;
                            return (
                                <tr key={org.id}>
                                    <td className="px-4 py-2 text-sm">
                                        <Link
                                            href={`/platform/organizations/${org.id}`}
                                            className="text-blue-600 hover:underline font-medium"
                                        >
                                            {org.name}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">{org.slug}</div>
                                    </td>
                                    <td className="px-4 py-2 text-sm">{sub?.plan ?? org.plan}</td>
                                    <td className="px-4 py-2 text-sm">
                                        {sub ? (
                                            <span
                                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_STYLES[sub.status]}`}
                                            >
                                                {sub.status}
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                                                NONE
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-sm">
                                        {sub?.trialEndsAt ? formatDay(sub.trialEndsAt) : "—"}
                                    </td>
                                    <td className="px-4 py-2 text-sm">
                                        {sub?.renewsAt ? formatDay(sub.renewsAt) : "—"}
                                    </td>
                                    <td className="px-4 py-2 text-sm">
                                        {sub?.enabledModules?.length ?? 0}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-muted-foreground">
                                        {org.maxUsers} seats · {org.maxProperties} properties
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <Link
                                            href={`/platform/organizations/${org.id}`}
                                            className="text-sm text-blue-600 hover:underline"
                                        >
                                            Manage
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {rows.length === 0 && (
                    <div className="p-6 text-sm text-muted-foreground">
                        No subscription matches that filter.
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * A calendar date read in UTC, so the day shown is the day stored — a tenant
 * in Nairobi should not see a trial that ends tomorrow as ending today.
 */
function formatDay(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}

/**
 * The message the API failed with, if there is one. Nest sends `{ message }`
 * in the body and axios nests that under `response`.
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
