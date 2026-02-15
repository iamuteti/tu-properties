"use client";

import React, { useState } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProperties } from "@/hooks/use-properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { unitsApi } from "@/lib/api";

// Zod schema for unit validation
const unitSchema = z.object({
    unitNumber: z.string().min(1, "Unit number is required"),
    type: z.enum(["APARTMENT", "HOUSE", "COMMERCIAL_SPACE"]),
    status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE"]),
    rentAmount: z.coerce.number().min(0, "Rent amount must be positive"),
    propertyId: z.string().min(1, "Property is required"),
});

type UnitFormValues = z.infer<typeof unitSchema>;

export default function NewUnitPage() {
    const { token } = useAuth();
    const { properties } = useProperties(); // Fetch properties for the dropdown
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    const form = useForm<UnitFormValues>({
        resolver: zodResolver(unitSchema) as Resolver<UnitFormValues>,
        defaultValues: {
            type: "APARTMENT",
            status: "VACANT",
            rentAmount: 0,
            unitNumber: "",
            propertyId: "",
        },
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = form;

    const onSubmit = async (data: UnitFormValues) => {
        setError(null);
        try {
            await unitsApi.create(data);
            router.push("/dashboard/units");
            router.refresh();
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to create unit. Please try again."
            );
        }
    };

    return (
        <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Add New Unit</h1>
                    <p className="text-muted-foreground">
                        Enter the details of the new unit
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <label
                            htmlFor="propertyId"
                            className="text-sm font-medium leading-none"
                        >
                            Property
                        </label>
                        <Select id="propertyId" {...register("propertyId")} disabled={isSubmitting}>
                            <option value="">Select a property</option>
                            {properties.map((property) => (
                                <option key={property.id} value={property.id}>
                                    {property.name}
                                </option>
                            ))}
                        </Select>
                        {errors.propertyId && (
                            <p className="text-xs text-destructive">{errors.propertyId.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="unitNumber"
                            className="text-sm font-medium leading-none"
                        >
                            Unit Number
                        </label>
                        <Input
                            id="unitNumber"
                            placeholder="e.g. 101, Apt 4B"
                            {...register("unitNumber")}
                            disabled={isSubmitting}
                        />
                        {errors.unitNumber && (
                            <p className="text-xs text-destructive">{errors.unitNumber.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="type"
                            className="text-sm font-medium leading-none"
                        >
                            Unit Type
                        </label>
                        <Select id="type" {...register("type")} disabled={isSubmitting}>
                            <option value="APARTMENT">Apartment</option>
                            <option value="HOUSE">House</option>
                            <option value="COMMERCIAL_SPACE">Commercial Space</option>
                        </Select>
                        {errors.type && (
                            <p className="text-xs text-destructive">{errors.type.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="rentAmount"
                            className="text-sm font-medium leading-none"
                        >
                            Rent Amount ($)
                        </label>
                        <Input
                            id="rentAmount"
                            type="number"
                            placeholder="0.00"
                            {...register("rentAmount")}
                            disabled={isSubmitting}
                        />
                        {errors.rentAmount && (
                            <p className="text-xs text-destructive">{errors.rentAmount.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="status"
                            className="text-sm font-medium leading-none"
                        >
                            Status
                        </label>
                        <Select id="status" {...register("status")} disabled={isSubmitting}>
                            <option value="VACANT">Vacant</option>
                            <option value="OCCUPIED">Occupied</option>
                            <option value="MAINTENANCE">Maintenance</option>
                        </Select>
                        {errors.status && (
                            <p className="text-xs text-destructive">{errors.status.message}</p>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Creating..." : "Create Unit"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
