"use client";

import React from "react";
import Link from "next/link";
import { useLeases } from "@/hooks/use-leases";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, FileText, MoreHorizontal } from "lucide-react";

export default function LeasesPage() {
    const { leases, isLoading, error } = useLeases();

    if (isLoading) {
        return <div>Loading leases...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Leases</h1>
                    <p className="text-muted-foreground">
                        Manage lease agreements
                    </p>
                </div>
                <Link href="/dashboard/leases/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Lease
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tenant</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Start Date</TableHead>
                            <TableHead>End Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {leases.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    No leases found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            leases.map((lease) => (
                                <TableRow key={lease.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            {lease.tenant?.firstName} {lease.tenant?.lastName}
                                        </div>
                                    </TableCell>
                                    <TableCell>{lease.unit?.unitNumber}</TableCell>
                                    <TableCell>{new Date(lease.startDate).toLocaleDateString()}</TableCell>
                                    <TableCell>{new Date(lease.endDate).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${lease.status === "ACTIVE"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-yellow-100 text-yellow-800"
                                                }`}
                                        >
                                            {lease.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
