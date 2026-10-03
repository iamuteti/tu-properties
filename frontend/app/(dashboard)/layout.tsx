"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.push("/auth/login");
            return;
        }
        // A tenant portal login has no dashboard access — send them to the
        // portal rather than letting them land on a page that 403s.
        if (user.portalTenantId) {
            router.push("/portal");
        }
    }, [user, isLoading, router]);

    // Show nothing while checking authentication or if not logged in
    if (isLoading || !user) {
        return null;
    }

    // A resident must not see staff chrome, even for a frame.
    if (user.portalTenantId) {
        return null;
    }

    return <DashboardLayout>{children}</DashboardLayout>;
}