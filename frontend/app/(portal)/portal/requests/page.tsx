"use client";

import { TenantRequestsPanel } from "@/components/portal/tenant-requests-panel";

export default function PortalRequestsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
                <p className="text-sm text-muted-foreground">
                    Ask for a renewal, give notice to move, or discuss a payment plan
                </p>
            </div>
            <TenantRequestsPanel />
        </div>
    );
}