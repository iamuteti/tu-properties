"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePropertyFormOptions } from "@/hooks/use-property-form-options";
import { propertiesApi } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import {
    PropertyForm,
    PropertyFormHeader,
    type PropertyFormValues,
} from "@/components/properties/property-form";
import type { Property } from "@/types";

type AmenityDraft = { name: string; category?: string };

export default function EditPropertyPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const {
        landlords,
        branches,
        isLoading: optionsLoading,
        error: optionsError,
        reload,
    } = usePropertyFormOptions();

    const loadProperty = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setLoadError(null);
        try {
            const response = await propertiesApi.findOne(id);
            setProperty(response.data);
        } catch (err: any) {
            setLoadError(
                err.response?.status === 404
                    ? "Property not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the property.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadProperty();
    }, [loadProperty]);

    async function handleSubmit(values: PropertyFormValues, amenities: AmenityDraft[]) {
        if (!id) return;
        await propertiesApi.update(id, {
            ...values,
            amenities,
        } as never);
        toast.success("Property updated");
        router.push(`/properties/${id}`);
        router.refresh();
    }

    if (isLoading || optionsLoading) return <LoadingState label="Loading property…" />;
    if (loadError) return <ErrorState message={loadError} onRetry={loadProperty} />;
    if (optionsError) return <ErrorState message={optionsError} onRetry={reload} />;
    if (!property || !id) return <ErrorState message="Property not found." />;

    return (
        <div className="space-y-6">
            <PropertyFormHeader
                mode="edit"
                property={property}
                onBack={() => router.push(`/properties/${id}`)}
            />

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <PropertyForm
                    mode="edit"
                    initial={property}
                    landlords={landlords}
                    branches={branches}
                    submitLabel="Save changes"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push(`/properties/${id}`)}
                />
            </div>
        </div>
    );
}