'use client';

import { MaintenancePanel } from '@/components/portal/maintenance-panel';

export default function PortalMaintenancePage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
                <p className="text-sm text-muted-foreground">
                    Report something broken and follow it through
                </p>
            </div>
            <MaintenancePanel />
        </div>
    );
}
