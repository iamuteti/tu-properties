"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Home, LogOut, MessageSquare, Receipt } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { LoadingState } from "@/components/ui/entity-states";

/**
 * Tenant portal shell.
 *
 * Deliberately its own layout with no staff navigation: a resident should not
 * be able to see, or even be one click away from, screens they have no access
 * to. Staff sessions are redirected back to the dashboard rather than shown an
 * empty portal.
 */
const NAV = [
    { href: "/portal", label: "Overview", icon: Home },
    { href: "/portal/invoices", label: "Invoices", icon: FileText },
    { href: "/portal/receipts", label: "Receipts", icon: Receipt },
    { href: "/portal/documents", label: "Documents", icon: FileText },
    { href: "/portal/requests", label: "Requests", icon: MessageSquare },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    const { user, organization, logout, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.push("/auth/login");
            return;
        }
        // Staff belong in the dashboard, not a resident's portal.
        if (!user.portalTenantId) {
            router.push("/dashboard");
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || !user.portalTenantId) {
        return <LoadingState label="Loading your account…" />;
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {organization?.name ?? "Tenant portal"}
                        </p>
                        <p className="text-lg font-semibold">
                            {user.firstName} {user.lastName}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out
                    </button>
                </div>
                <nav className="mx-auto flex max-w-4xl gap-1 px-4 pb-3" aria-label="Portal sections">
                    {NAV.map((item) => {
                        const active =
                            item.href === "/portal"
                                ? pathname === "/portal"
                                : pathname.startsWith(item.href);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-slate-900 text-white"
                                        : "text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        </div>
    );
}