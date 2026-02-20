"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft } from "lucide-react";
import { tenantsApi } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Zod schema for tenant validation
const tenantSchema = z.object({
    // Tenant Type & Personal Info
    tenantType: z.string().optional(),
    surname: z.string().min(2, "Surname is required"),
    otherNames: z.string().optional(),
    gender: z.string().optional(),

    // Contact Information
    email: z.string().email("Invalid email address").optional(),
    phone: z.string().min(10, "Phone number is required"),
    town: z.string().optional(),
    sendMobileNumber: z.boolean().optional().default(false),

    // Identification & Tax
    idNoRegNo: z.string().optional(),
    taxPin: z.string().optional(),

    // Address
    postalAddress: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),

    // Photo
    photoUrl: z.string().optional(),

    // Emergency Contacts
    emergencyContacts: z.array(z.object({
        contactName: z.string(),
        relationship: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email("Invalid email address").optional(),
        priority: z.number().int().optional().default(1),
    })).optional(),
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
        resolver: zodResolver(tenantSchema) as any,
        defaultValues: {
            sendMobileNumber: false,
            emergencyContacts: [],
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
        <div className="w-full space-y-6">
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
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    <Tabs defaultValue="personal-info">
                        <TabsList className="grid grid-cols-3 mb-8">
                            <TabsTrigger value="personal-info">Personal Info</TabsTrigger>
                            <TabsTrigger value="contact">Contact Details</TabsTrigger>
                            <TabsTrigger value="emergency">Emergency Contacts</TabsTrigger>
                        </TabsList>

                        {/* Personal Information */}
                        <TabsContent value="personal-info" className="space-y-4">
                            <h2 className="text-lg font-semibold">Tenant/Resident Information</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="tenantType"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Tenant Type
                                    </label>
                                    <Select id="tenantType" {...register("tenantType")} disabled={isSubmitting}>
                                        <option value="">Select tenant type</option>
                                        <option value="INDIVIDUAL">Individual</option>
                                        <option value="CORPORATE">Corporate</option>
                                        <option value="GOVERNMENT">Government</option>
                                    </Select>
                                    {errors.tenantType && (
                                        <p className="text-xs text-destructive">{errors.tenantType.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="surname"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Surname *
                                    </label>
                                    <Input
                                        id="surname"
                                        placeholder="e.g. Doe"
                                        {...register("surname")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.surname && (
                                        <p className="text-xs text-destructive">{errors.surname.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="otherNames"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Other Name(s)
                                    </label>
                                    <Input
                                        id="otherNames"
                                        placeholder="e.g. John"
                                        {...register("otherNames")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.otherNames && (
                                        <p className="text-xs text-destructive">{errors.otherNames.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="gender"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Gender
                                    </label>
                                    <Select id="gender" {...register("gender")} disabled={isSubmitting}>
                                        <option value="">Select gender</option>
                                        <option value="MALE">Male</option>
                                        <option value="FEMALE">Female</option>
                                        <option value="OTHER">Other</option>
                                    </Select>
                                    {errors.gender && (
                                        <p className="text-xs text-destructive">{errors.gender.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="idNoRegNo"
                                        className="text-sm font-medium leading-none"
                                    >
                                        ID No./Reg No.
                                    </label>
                                    <Input
                                        id="idNoRegNo"
                                        placeholder="e.g. 12345678"
                                        {...register("idNoRegNo")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.idNoRegNo && (
                                        <p className="text-xs text-destructive">{errors.idNoRegNo.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="taxPin"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Tax PIN
                                    </label>
                                    <Input
                                        id="taxPin"
                                        placeholder="e.g. A123456789"
                                        {...register("taxPin")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.taxPin && (
                                        <p className="text-xs text-destructive">{errors.taxPin.message}</p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Contact Details */}
                        <TabsContent value="contact" className="space-y-4">
                            <h2 className="text-lg font-semibold">Contact Information</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                        htmlFor="phone"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Phone Number *
                                    </label>
                                    <Input
                                        id="phone"
                                        placeholder="e.g. +1 234 567 8900"
                                        {...register("phone")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.phone && (
                                        <p className="text-xs text-destructive">{errors.phone.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="town"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Town
                                    </label>
                                    <Input
                                        id="town"
                                        placeholder="e.g. Nairobi"
                                        {...register("town")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.town && (
                                        <p className="text-xs text-destructive">{errors.town.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="postalAddress"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Postal Address
                                    </label>
                                    <Textarea
                                        id="postalAddress"
                                        placeholder="Enter postal address..."
                                        {...register("postalAddress")}
                                        disabled={isSubmitting}
                                        rows={2}
                                    />
                                    {errors.postalAddress && (
                                        <p className="text-xs text-destructive">{errors.postalAddress.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="postalCode"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Postal Code
                                    </label>
                                    <Input
                                        id="postalCode"
                                        placeholder="e.g. 00100"
                                        {...register("postalCode")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.postalCode && (
                                        <p className="text-xs text-destructive">{errors.postalCode.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="country"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Country
                                    </label>
                                    <Select id="country" {...register("country")} disabled={isSubmitting}>
                                        <option value="">Select country</option>
                                        <option value="KENYA">Kenya</option>
                                        <option value="UGANDA">Uganda</option>
                                        <option value="TANZANIA">Tanzania</option>
                                        <option value="RWANDA">Rwanda</option>
                                        <option value="BURUNDI">Burundi</option>
                                    </Select>
                                    {errors.country && (
                                        <p className="text-xs text-destructive">{errors.country.message}</p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Emergency Contacts */}
                        <TabsContent value="emergency" className="space-y-4">
                            <h2 className="text-lg font-semibold">Emergency Contacts</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="emergencyContactName"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Contact Name
                                    </label>
                                    <Input
                                        id="emergencyContactName"
                                        placeholder="e.g. Jane Doe"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="emergencyContactRelationship"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Relationship
                                    </label>
                                    <Input
                                        id="emergencyContactRelationship"
                                        placeholder="e.g. Spouse"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="emergencyContactPhone"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Phone
                                    </label>
                                    <Input
                                        id="emergencyContactPhone"
                                        placeholder="e.g. +1 234 567 8901"
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="emergencyContactEmail"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Email
                                    </label>
                                    <Input
                                        id="emergencyContactEmail"
                                        type="email"
                                        placeholder="e.g. jane.doe@example.com"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

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
