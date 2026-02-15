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
import { ChevronLeft } from "lucide-react";
import { tenantsApi } from "@/lib/api";

// Zod schema for tenant validation
const tenantSchema = z.object({
    firstName: z.string().min(2, "First name is required"),
    lastName: z.string().min(2, "Last name is required"),
    email: z.string().email("Invalid email address"),
    phoneNumber: z.string().min(10, "Phone number is required"),
    status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

export default function NewTenantPage() {
    const { token } = useAuth();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<TenantFormValues>({
        resolver: zodResolver(tenantSchema),
        defaultValues: {
            status: "ACTIVE",
        },
    });

    const onSubmit = async (data: TenantFormValues) => {
        setError(null);
        try {
            await tenantsApi.create(data);
            router.push("/dashboard/tenants");
            router.refresh();
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to create tenant. Please try again."
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
                    <h1 className="text-2xl font-bold tracking-tight">Add New Tenant</h1>
                    <p className="text-muted-foreground">
                        Enter the details of the new tenant
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="firstName"
                                className="text-sm font-medium leading-none"
                            >
                                First Name
                            </label>
                            <Input
                                id="firstName"
                                placeholder="e.g. John"
                                {...register("firstName")}
                                disabled={isSubmitting}
                            />
                            {errors.firstName && (
                                <p className="text-xs text-destructive">
                                    {errors.firstName.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="lastName"
                                className="text-sm font-medium leading-none"
                            >
                                Last Name
                            </label>
                            <Input
                                id="lastName"
                                placeholder="e.g. Doe"
                                {...register("lastName")}
                                disabled={isSubmitting}
                            />
                            {errors.lastName && (
                                <p className="text-xs text-destructive">
                                    {errors.lastName.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="email"
                            className="text-sm font-medium leading-none"
                        >
                            Email
                        </label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="e.g. john.doe@example.com"
                            {...register("email")}
                            disabled={isSubmitting}
                        />
                        {errors.email && (
                            <p className="text-xs text-destructive">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="phoneNumber"
                            className="text-sm font-medium leading-none"
                        >
                            Phone Number
                        </label>
                        <Input
                            id="phoneNumber"
                            placeholder="e.g. +1 234 567 8900"
                            {...register("phoneNumber")}
                            disabled={isSubmitting}
                        />
                        {errors.phoneNumber && (
                            <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>
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
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="PROSPECT">Prospect</option>
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
                            {isSubmitting ? "Creating..." : "Create Tenant"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
