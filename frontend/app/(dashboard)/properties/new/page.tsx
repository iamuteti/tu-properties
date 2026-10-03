"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePropertyFormOptions } from "@/hooks/use-property-form-options";
import { propertiesApi } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import {
    PropertyForm,
    PropertyFormHeader,
    type PropertyFormValues,
} from "@/components/properties/property-form";

type AmenityDraft = { name: string; category?: string };

export default function NewPropertyPage() {
    const router = useRouter();
    const { landlords, branches, isLoading, error, reload } = usePropertyFormOptions();

    async function handleSubmit(values: PropertyFormValues, amenities: AmenityDraft[]) {
        await propertiesApi.create({
            ...values,
            amenities,
        } as never);
        toast.success("Property created");
        router.push("/properties");
        router.refresh();
    }

    if (isLoading) return <LoadingState label="Loading form options…" />;
    if (error) return <ErrorState message={error} onRetry={reload} />;

    return (
        <div className="space-y-6">
            <PropertyFormHeader mode="create" onBack={() => router.back()} />

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <PropertyForm
                    mode="create"
                    landlords={landlords}
                    branches={branches}
                    onSubmit={handleSubmit}
                    onCancel={() => router.push("/properties")}
                />
            </div>
        </div>
    );
}