"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ROUTE_TO_MODULE } from "@/lib/route-modules";

/**
 * ModuleGuard — defense in depth for direct URL access to disabled modules.
 *
 * The sidebar already hides disabled modules (see `sidebar.tsx`), but a user
 * could still type a URL directly (e.g. /hr/payroll). The backend `@Permissions`
 * guard returns 403 for those routes; this component adds a frontend redirect
 * so the user never sees a raw 403 page — they are sent back to the dashboard
 * instead.
 *
 * Rules:
 * - SUPER_ADMIN bypasses all module checks (sees everything).
 * - Routes with no module key (Dashboard, Settings, Support, Platform) are
 *   always-on for their allowed roles — not module-gated here.
 * - If the current route's module is not in `enabledModules`, redirect to
 *   `/dashboard`.
 *
 * Place this once in `DashboardLayout` so every dashboard page is covered.
 */
export function ModuleGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLoading } = useAuth();

    // Module keys enabled for this user's organization.
    const enabledModules: string[] =
        user?.organization?.subscription?.enabledModules ?? [];
    const isSuperAdmin = user?.role === "SUPER_ADMIN";

    useEffect(() => {
        if (isLoading || !user) return;

        // SUPER_ADMIN sees everything.
        if (isSuperAdmin) return;

        const moduleKey = ROUTE_TO_MODULE[pathname];

        // No module key → always-on (Dashboard, Settings, Support, Platform).
        // Not module-gated here; role-based visibility is handled by the sidebar
        // and backend guards.
        if (!moduleKey) return;

        // Module disabled for this org → redirect to dashboard.
        if (!enabledModules.includes(moduleKey)) {
            router.push("/dashboard");
        }
    }, [pathname, user, isLoading, isSuperAdmin, enabledModules, router]);

    return <>{children}</>;
}
