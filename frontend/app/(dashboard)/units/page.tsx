"use client";

import React from "react";
import Link from "next/link";
import { useUnits } from "@/hooks/use-units";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, DoorOpen, MoreHorizontal } from "lucide-react";

export default function UnitsPage() {
    const { units, isLoading, error } = useUnits();

    if (isLoading) {
        return <div>Loading units...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Units</h1>
                    <p className="text-muted-foreground">
                        Manage your rental units
                    </p>
                </div>
                <Link href="/dashboard/units/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Unit
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Unit Name</TableHead>
                            <TableHead>Property</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Rent Amount</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {units.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    No units found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            units.map((unit) => (
                                <TableRow key={unit.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <DoorOpen className="h-4 w-4 text-muted-foreground" />
                                            {unit.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>{unit.property?.name || "N/A"}</TableCell>
                                    <TableCell>{unit.unitType?.name || "N/A"}</TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${unit.status === "VACANT"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-blue-100 text-blue-800"
                                                }`}
                                        >
                                            {unit.status}
                                        </span>
                                    </TableCell>
                                    <TableCell>{unit.baseRent ? `$${unit.baseRent}` : "N/A"}</TableCell>
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
