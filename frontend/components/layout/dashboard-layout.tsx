import React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { ModuleGuard } from "./module-guard";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <ImpersonationBanner />
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                    <ModuleGuard>{children}</ModuleGuard>
                </main>
            </div>
        </div>
    );
}
