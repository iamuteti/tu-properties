"use client";

import React from "react";
import Link from "next/link";
import { useRentalAgreements } from "@/hooks/use-rental-agreements";
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

export default function RentalAgreementsPage() {
    const { rentalAgreements, isLoading, error } = useRentalAgreements();

    if (isLoading) {
        return <div>Loading rental agreements...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Rental Agreements</h1>
                    <p className="text-muted-foreground">
                        Manage rental agreements and leases
                    </p>
                </div>
                <Link href="/dashboard/rental-agreements/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Rental Agreement
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tenant</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Start Date</TableHead>
                            <TableHead>End Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rentalAgreements.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    No rental agreements found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rentalAgreements.map((agreement) => (
                                <TableRow key={agreement.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            {agreement.tenant?.surname} {agreement.tenant?.otherNames}
                                        </div>
                                    </TableCell>
                                    <TableCell>{agreement.unit?.name}</TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                agreement.agreementType === "LEASE"
                                                    ? "bg-blue-100 text-blue-800"
                                                    : "bg-purple-100 text-purple-800"
                                            }`}
                                        >
                                            {agreement.agreementType || "RENTAL"}
                                        </span>
                                    </TableCell>
                                    <TableCell>{new Date(agreement.startDate).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        {agreement.endDate ? new Date(agreement.endDate).toLocaleDateString() : "Monthly"}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                agreement.status === "ACTIVE"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-yellow-100 text-yellow-800"
                                            }`}
                                        >
                                            {agreement.status}
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
