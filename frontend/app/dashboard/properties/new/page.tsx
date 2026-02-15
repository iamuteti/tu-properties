"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import axios from "axios";
import { ChevronLeft } from "lucide-react";

// Zod schema for property validation
const propertySchema = z.object({
    name: z.string().min(2, "Property name is required"),
    address: z.string().min(5, "Address is required"),
    type: z.enum(["RESIDENTIAL", "COMMERCIAL", "MIXED_USE"]),
});

type PropertyFormValues = z.infer<typeof propertySchema>;

export default function NewPropertyPage() {
    const { token } = useAuth();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<PropertyFormValues>({
        resolver: zodResolver(propertySchema),
        defaultValues: {
            type: "RESIDENTIAL",
        },
    });

    const onSubmit = async (data: PropertyFormValues) => {
        setError(null);
        try {
            await axios.post(
                "http://localhost:3000/properties",
                data,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            router.push("/dashboard/properties");
            router.refresh();
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to create property. Please try again."
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
                    <h1 className="text-2xl font-bold tracking-tight">Add New Property</h1>
                    <p className="text-muted-foreground">
                        Enter the details of the new property
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <label
                            htmlFor="name"
                            className="text-sm font-medium leading-none"
                        >
                            Property Name
                        </label>
                        <Input
                            id="name"
                            placeholder="e.g. Sunset Apartments"
                            {...register("name")}
                            disabled={isSubmitting}
                        />
                        {errors.name && (
                            <p className="text-xs text-destructive">{errors.name.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="address"
                            className="text-sm font-medium leading-none"
                        >
                            Address
                        </label>
                        <Input
                            id="address"
                            placeholder="e.g. 123 Main St, City"
                            {...register("address")}
                            disabled={isSubmitting}
                        />
                        {errors.address && (
                            <p className="text-xs text-destructive">{errors.address.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="type"
                            className="text-sm font-medium leading-none"
                        >
                            Property Type
                        </label>
                        <Select id="type" {...register("type")} disabled={isSubmitting}>
                            <option value="RESIDENTIAL">Residential</option>
                            <option value="COMMERCIAL">Commercial</option>
                            <option value="MIXED_USE">Mixed Use</option>
                        </Select>
                        {errors.type && (
                            <p className="text-xs text-destructive">{errors.type.message}</p>
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
                            {isSubmitting ? "Creating..." : "Create Property"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
