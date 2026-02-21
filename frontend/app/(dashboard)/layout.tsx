"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, isLoading, router]);

    // Show nothing while checking authentication or if not logged in
    if (isLoading || !user) {
        return null;
    }

    return <DashboardLayout>{children}</DashboardLayout>;
}
