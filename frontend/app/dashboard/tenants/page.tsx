"use client";

import React from "react";
import Link from "next/link";
import { useTenantTableData } from "@/hooks/use-tenant-table-data";
import { TenantsTable } from "@/components/ui/tenants-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function TenantsPage() {
    const { data: tenants, isLoading, error, refetch } = useTenantTableData();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-muted-foreground">Loading tenants...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-destructive p-4">
                Error: {error}
            </div>
        );
    }

    const handleRowClick = (tenant: any) => {
        console.log("Tenant clicked:", tenant);
        // Could navigate to detail page or open a modal
    };

    const handleRowSelect = (selectedRows: any[]) => {
        console.log("Selected rows:", selectedRows);
        // Handle bulk actions on selected rows
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
                    <p className="text-muted-foreground">
                        Manage your tenants directory
                    </p>
                </div>
                <Link href="/dashboard/tenants/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Tenant
                    </Button>
                </Link>
            </div>

            <TenantsTable 
                data={tenants} 
                onRowClick={handleRowClick}
                onRowSelect={handleRowSelect}
            />
        </div>
    );
}
