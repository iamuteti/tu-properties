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
import { Select } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft } from "lucide-react";
import { unitsApi } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UNIT_TYPES } from "@/lib/constants";

// Zod schema for unit validation
const unitSchema = z.object({
    // Unit Details & Specifications
    propertyId: z.string().min(1, "Property is required"),
    specifiedFloor: z.number().int().optional(),
    generalFloorNo: z.number().int().optional(),
    unitNumber: z.string().min(1, "Unit number is required"),
    unitSequence: z.number().int().optional(),
    ownerOccupied: z.boolean().optional().default(false),

    // Specifications
    bedrooms: z.number().int().optional(),
    bathrooms: z.number().int().optional(),
    furnished: z.boolean().optional().default(false),
    unitTypeId: z.string().optional(),
    carSpaceParking: z.string().optional(),

    // Area/Space Management
    rentPerSqFt: z.coerce.number().min(0).optional(),
    marketRent: z.coerce.number().min(0).optional(),
    areaSqFt: z.coerce.number().min(0).optional(),
    chargeFreq: z.string().optional(),

    // Letting Details
    takeOnLettingDate: z.string().optional(),

    // Tenant/Resident Counter
    tenantResidentCodeCounter: z.number().int().optional(),

    // Utility Account & Billing Numbers
    electricityAcno: z.string().optional(),
    waterAcno: z.string().optional(),
    electricityMeethno: z.string().optional(),
    waterMeethno: z.string().optional(),

    // Unit/ Space Features
    features: z.array(z.object({
        name: z.string(),
        featureType: z.string().optional(),
    })).optional(),

    // Unit/ Space Additional Notes
    apartmentNotes: z.string().optional(),

    // Status
    status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"]),
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
            ownerOccupied: false,
            furnished: false,
            status: "VACANT",
            tenantResidentCodeCounter: 0,
            features: [],
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
        <div className="w-full space-y-6">
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
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    <Tabs defaultValue="unit-details">
                        <TabsList className="grid grid-cols-4 mb-8">
                            <TabsTrigger value="unit-details">Unit Details</TabsTrigger>
                            <TabsTrigger value="specifications">Specifications</TabsTrigger>
                            <TabsTrigger value="area-management">Area Management</TabsTrigger>
                            <TabsTrigger value="utilities">Utilities & Features</TabsTrigger>
                        </TabsList>

                        {/* Unit Details & Specifications */}
                        <TabsContent value="unit-details" className="space-y-4">
                            <h2 className="text-lg font-semibold">Unit Details</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="propertyId"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Property *
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
                                        htmlFor="specifiedFloor"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Specified Floor
                                    </label>
                                    <Input
                                        id="specifiedFloor"
                                        type="number"
                                        placeholder="e.g. 2"
                                        {...register("specifiedFloor", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.specifiedFloor && (
                                        <p className="text-xs text-destructive">{errors.specifiedFloor.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="generalFloorNo"
                                        className="text-sm font-medium leading-none"
                                    >
                                        General Floor No.
                                    </label>
                                    <Input
                                        id="generalFloorNo"
                                        type="number"
                                        placeholder="e.g. 3"
                                        {...register("generalFloorNo", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.generalFloorNo && (
                                        <p className="text-xs text-destructive">{errors.generalFloorNo.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="unitNumber"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Unit/Space No. *
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
                                        htmlFor="unitSequence"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Unit Sequence
                                    </label>
                                    <Input
                                        id="unitSequence"
                                        type="number"
                                        placeholder="e.g. 1"
                                        {...register("unitSequence", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.unitSequence && (
                                        <p className="text-xs text-destructive">{errors.unitSequence.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="ownerOccupied"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Owner Occupied
                                    </label>
                                    <Select id="ownerOccupied" {...register("ownerOccupied")} disabled={isSubmitting}>
                                        <option value="false">No</option>
                                        <option value="true">Yes</option>
                                    </Select>
                                    {errors.ownerOccupied && (
                                        <p className="text-xs text-destructive">{errors.ownerOccupied.message}</p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Specifications */}
                        <TabsContent value="specifications" className="space-y-4">
                            <h2 className="text-lg font-semibold">Specifications</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="bedrooms"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Bedroom(s)
                                    </label>
                                    <Input
                                        id="bedrooms"
                                        type="number"
                                        placeholder="e.g. 2"
                                        {...register("bedrooms", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.bedrooms && (
                                        <p className="text-xs text-destructive">{errors.bedrooms.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="bathrooms"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Bathroom(s)
                                    </label>
                                    <Input
                                        id="bathrooms"
                                        type="number"
                                        placeholder="e.g. 1"
                                        {...register("bathrooms", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.bathrooms && (
                                        <p className="text-xs text-destructive">{errors.bathrooms.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="furnished"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Furnished
                                    </label>
                                    <Select id="furnished" {...register("furnished")} disabled={isSubmitting}>
                                        <option value="false">No</option>
                                        <option value="true">Yes</option>
                                    </Select>
                                    {errors.furnished && (
                                        <p className="text-xs text-destructive">{errors.furnished.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="unitTypeId"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Unit Type
                                    </label>
                                    <Select id="unitTypeId" {...register("unitTypeId")} disabled={isSubmitting}>
                                        <option value="">Select unit type</option>
                                        {UNIT_TYPES.map((unitType) => (
                                            <option key={unitType.id} value={unitType.id}>
                                                {unitType.name}
                                            </option>
                                        ))}
                                    </Select>
                                    {errors.unitTypeId && (
                                        <p className="text-xs text-destructive">{errors.unitTypeId.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="carSpaceParking"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Car Space/Parking
                                    </label>
                                    <Input
                                        id="carSpaceParking"
                                        placeholder="e.g. 1"
                                        {...register("carSpaceParking")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.carSpaceParking && (
                                        <p className="text-xs text-destructive">{errors.carSpaceParking.message}</p>
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
                                        <option value="RESERVED">Reserved</option>
                                    </Select>
                                    {errors.status && (
                                        <p className="text-xs text-destructive">{errors.status.message}</p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Area Management */}
                        <TabsContent value="area-management" className="space-y-4">
                            <h2 className="text-lg font-semibold">Area/Space Management & Costing</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="rentPerSqFt"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Rent Per Sq Ft
                                    </label>
                                    <Input
                                        id="rentPerSqFt"
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 50"
                                        {...register("rentPerSqFt", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.rentPerSqFt && (
                                        <p className="text-xs text-destructive">{errors.rentPerSqFt.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="marketRent"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Market Rent
                                    </label>
                                    <Input
                                        id="marketRent"
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 1000"
                                        {...register("marketRent", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.marketRent && (
                                        <p className="text-xs text-destructive">{errors.marketRent.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="areaSqFt"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Area Sq Ft
                                    </label>
                                    <Input
                                        id="areaSqFt"
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 500"
                                        {...register("areaSqFt", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.areaSqFt && (
                                        <p className="text-xs text-destructive">{errors.areaSqFt.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="chargeFreq"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Charge Freq.
                                    </label>
                                    <Select id="chargeFreq" {...register("chargeFreq")} disabled={isSubmitting}>
                                        <option value="">Select frequency</option>
                                        <option value="MONTHLY">Monthly</option>
                                        <option value="QUARTERLY">Quarterly</option>
                                        <option value="ANNUALLY">Annually</option>
                                    </Select>
                                    {errors.chargeFreq && (
                                        <p className="text-xs text-destructive">{errors.chargeFreq.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="takeOnLettingDate"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Take On Letting Date
                                    </label>
                                    <Input
                                        id="takeOnLettingDate"
                                        type="date"
                                        {...register("takeOnLettingDate")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.takeOnLettingDate && (
                                        <p className="text-xs text-destructive">{errors.takeOnLettingDate.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="tenantResidentCodeCounter"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Tenant/Resident Code Counter
                                    </label>
                                    <Input
                                        id="tenantResidentCodeCounter"
                                        type="number"
                                        placeholder="e.g. 0"
                                        {...register("tenantResidentCodeCounter", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                    {errors.tenantResidentCodeCounter && (
                                        <p className="text-xs text-destructive">{errors.tenantResidentCodeCounter.message}</p>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        {/* Utilities & Features */}
                        <TabsContent value="utilities" className="space-y-4">
                            <h2 className="text-lg font-semibold">Utility Account & Meter No.</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label
                                        htmlFor="electricityAcno"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Electricity Ac No.
                                    </label>
                                    <Input
                                        id="electricityAcno"
                                        placeholder="e.g. 123456"
                                        {...register("electricityAcno")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.electricityAcno && (
                                        <p className="text-xs text-destructive">{errors.electricityAcno.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="waterAcno"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Water Ac No.
                                    </label>
                                    <Input
                                        id="waterAcno"
                                        placeholder="e.g. 654321"
                                        {...register("waterAcno")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.waterAcno && (
                                        <p className="text-xs text-destructive">{errors.waterAcno.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="electricityMeethno"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Electricity Meter No.
                                    </label>
                                    <Input
                                        id="electricityMeethno"
                                        placeholder="e.g. E12345"
                                        {...register("electricityMeethno")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.electricityMeethno && (
                                        <p className="text-xs text-destructive">{errors.electricityMeethno.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="waterMeethno"
                                        className="text-sm font-medium leading-none"
                                    >
                                        Water Meter No.
                                    </label>
                                    <Input
                                        id="waterMeethno"
                                        placeholder="e.g. W67890"
                                        {...register("waterMeethno")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.waterMeethno && (
                                        <p className="text-xs text-destructive">{errors.waterMeethno.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 mt-6">
                                <label
                                    htmlFor="apartmentNotes"
                                    className="text-sm font-medium leading-none"
                                >
                                    Apartment Notes
                                </label>
                                <Textarea
                                    id="apartmentNotes"
                                    placeholder="Enter additional notes about the unit..."
                                    {...register("apartmentNotes")}
                                    disabled={isSubmitting}
                                    rows={3}
                                />
                                {errors.apartmentNotes && (
                                    <p className="text-xs text-destructive">{errors.apartmentNotes.message}</p>
                                )}
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
                            {isSubmitting ? "Creating..." : "Create Unit"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
