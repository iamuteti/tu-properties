"use client";

import React, { useState } from "react";
import { useForm, SubmitHandler, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useUnits } from "@/hooks/use-units";
import { useTenants } from "@/hooks/use-tenants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/simple-select";
import { ChevronLeft } from "lucide-react";
import { rentalAgreementsApi } from "@/lib/api";

const rentalAgreementSchema = z.object({
    unitId: z.string().min(1, "Unit is required"),
    tenantId: z.string().min(1, "Tenant is required"),
    agreementType: z.enum(["LEASE", "RENTAL"]).default("RENTAL"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    rentAmount: z.coerce.number().min(0, "Rent amount must be positive"),
    termMonths: z.coerce.number().optional(),
    securityDeposit: z.coerce.number().optional(),
    escalationRate: z.coerce.number().optional(),
    noticePeriodDays: z.coerce.number().optional(),
});

type RentalAgreementFormValues = z.infer<typeof rentalAgreementSchema>;

export default function NewRentalAgreementPage() {
    const { token } = useAuth();
    const { units } = useUnits();
    const { tenants } = useTenants();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    const form = useForm<RentalAgreementFormValues>({
        resolver: zodResolver(rentalAgreementSchema) as Resolver<RentalAgreementFormValues>,
        defaultValues: {
            rentAmount: 0,
            unitId: "",
            tenantId: "",
            agreementType: "RENTAL",
            startDate: "",
            endDate: "",
            termMonths: undefined,
            securityDeposit: undefined,
            escalationRate: undefined,
            noticePeriodDays: undefined,
        },
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setValue,
        watch,
    } = form;

    const agreementType = watch("agreementType");

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const unitId = e.target.value;
        const selectedUnit = units.find((u) => u.id === unitId);
        if (selectedUnit) {
            setValue("rentAmount", selectedUnit.baseRent || 0);
        }
    };

    const onSubmit: SubmitHandler<RentalAgreementFormValues> = async (data) => {
        setError(null);
        try {
            const payload = {
                ...data,
                status: "ACTIVE",
                startDate: new Date(data.startDate).toISOString(),
                endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
            };

            await rentalAgreementsApi.create(payload);
            router.push("/dashboard/rental-agreements");
            router.refresh();
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to create rental agreement. Please try again."
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
                    <h1 className="text-2xl font-bold tracking-tight">Create New Rental Agreement</h1>
                    <p className="text-muted-foreground">
                        Generate a rental agreement between a tenant and a unit
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="unitId"
                                className="text-sm font-medium leading-none"
                            >
                                Unit
                            </label>
                            <Select
                                id="unitId"
                                {...register("unitId")}
                                onChange={(e) => {
                                    register("unitId").onChange(e);
                                    handleUnitChange(e);
                                }}
                                disabled={isSubmitting}
                            >
                                <option value="">Select a unit</option>
                                {units
                                    .filter((u) => u.status === "VACANT")
                                    .map((unit) => (
                                        <option key={unit.id} value={unit.id}>
                                            {unit.name} ({unit.type}) - {unit.currency || 'KES'} {unit.baseRent?.toFixed(2) || '0.00'}
                                        </option>
                                    ))}
                            </Select>
                            {errors.unitId && (
                                <p className="text-xs text-destructive">{errors.unitId.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="tenantId"
                                className="text-sm font-medium leading-none"
                            >
                                Tenant
                            </label>
                            <Select id="tenantId" {...register("tenantId")} disabled={isSubmitting}>
                                <option value="">Select a tenant</option>
                                {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                        {tenant.surname} {tenant.otherNames}
                                    </option>
                                ))}
                            </Select>
                            {errors.tenantId && (
                                <p className="text-xs text-destructive">
                                    {errors.tenantId.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="agreementType"
                            className="text-sm font-medium leading-none"
                        >
                            Agreement Type
                        </label>
                        <Select id="agreementType" {...register("agreementType")} disabled={isSubmitting}>
                            <option value="RENTAL">Monthly Rental (Residential)</option>
                            <option value="LEASE">Long-term Lease (Commercial)</option>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {agreementType === "LEASE" 
                                ? "Long-term lease typically 1-5 years with escalation clauses"
                                : "Monthly rental agreement, rolls over automatically"}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="startDate"
                                className="text-sm font-medium leading-none"
                            >
                                Start Date
                            </label>
                            <Input
                                id="startDate"
                                type="date"
                                {...register("startDate")}
                                disabled={isSubmitting}
                            />
                            {errors.startDate && (
                                <p className="text-xs text-destructive">
                                    {errors.startDate.message}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="endDate"
                                className="text-sm font-medium leading-none"
                            >
                                End Date {agreementType === "RENTAL" && "(Optional)"}
                            </label>
                            <Input
                                id="endDate"
                                type="date"
                                {...register("endDate")}
                                disabled={isSubmitting}
                            />
                            {errors.endDate && (
                                <p className="text-xs text-destructive">
                                    {errors.endDate.message}
                                </p>
                            )}
                        </div>
                    </div>

                    {agreementType === "LEASE" && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="termMonths"
                                    className="text-sm font-medium leading-none"
                                >
                                    Term (Months)
                                </label>
                                <Input
                                    id="termMonths"
                                    type="number"
                                    placeholder="12"
                                    {...register("termMonths")}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <label
                                    htmlFor="securityDeposit"
                                    className="text-sm font-medium leading-none"
                                >
                                    Security Deposit
                                </label>
                                <Input
                                    id="securityDeposit"
                                    type="number"
                                    placeholder="0.00"
                                    {...register("securityDeposit")}
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>
                    )}

                    {agreementType === "LEASE" && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label
                                    htmlFor="escalationRate"
                                    className="text-sm font-medium leading-none"
                                >
                                    Annual Escalation Rate (%)
                                </label>
                                <Input
                                    id="escalationRate"
                                    type="number"
                                    placeholder="5"
                                    step="0.1"
                                    {...register("escalationRate")}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="space-y-2">
                                <label
                                    htmlFor="noticePeriodDays"
                                    className="text-sm font-medium leading-none"
                                >
                                    Notice Period (Days)
                                </label>
                                <Input
                                    id="noticePeriodDays"
                                    type="number"
                                    placeholder="30"
                                    {...register("noticePeriodDays")}
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label
                            htmlFor="rentAmount"
                            className="text-sm font-medium leading-none"
                        >
                            Rent Amount (KES)
                        </label>
                        <Input
                            id="rentAmount"
                            type="number"
                            placeholder="0.00"
                            {...register("rentAmount")}
                            disabled={isSubmitting}
                        />
                        {errors.rentAmount && (
                            <p className="text-xs text-destructive">
                                {errors.rentAmount.message}
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Auto-filled based on unit selection, but can be overridden.
                        </p>
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
                            {isSubmitting ? "Creating..." : "Create Rental Agreement"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
