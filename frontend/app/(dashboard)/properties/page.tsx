"use client";

import Link from "next/link";
import { useProperties } from "@/hooks/use-properties";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, Building2, MoreHorizontal } from "lucide-react";

export default function PropertiesPage() {
    const { properties, isLoading, error } = useProperties();

    if (isLoading) {
        return <div>Loading properties...</div>;
    }

    if (error) {
        return <div className="text-destructive">Error: {error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
                    <p className="text-muted-foreground">
                        Manage your real estate assets
                    </p>
                </div>
                <Link href="/dashboard/properties/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Property
                    </Button>
                </Link>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Floors</TableHead>
                            <TableHead>Units</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {properties.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="h-24 text-center text-muted-foreground"
                                >
                                    No properties found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        ) : (
                            properties.map((property) => (
                                <TableRow key={property.id}>
                                    <TableCell className="font-medium">{property.code}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                            {property.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {[property.estateArea, property.areaRegion, property.country]
                                            .filter(Boolean)
                                            .join(', ')}
                                    </TableCell>
                                    <TableCell>{property.numberOfFloors || '-'}</TableCell>
                                    <TableCell>{property._count?.units || 0}</TableCell>
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
