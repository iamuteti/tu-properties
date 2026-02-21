"use client";

import React from "react";
import { useLandlords } from "@/hooks/use-landlords";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, Landmark, MoreHorizontal, Mail, Phone, Building2 } from "lucide-react";

export default function LandlordsPage() {
    const { landlords, isLoading, error } = useLandlords();

    if (isLoading) {
        return <div>Loading landlords...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Landlords</h1>
                    <p className="text-muted-foreground">
                        Manage your landlords directory
                    </p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> Add Landlord
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {landlords.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    No landlords found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            landlords.map((landlord) => (
                                <TableRow key={landlord.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <Landmark className="h-4 w-4 text-muted-foreground" />
                                            {landlord.code}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-3 w-3 text-muted-foreground" />
                                            {landlord.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Mail className="h-3 w-3 text-muted-foreground" />
                                            {landlord.email || "-"}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-3 w-3 text-muted-foreground" />
                                            {landlord.phone || "-"}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {landlord.city || "-"}
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
