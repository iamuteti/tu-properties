"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { unitsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { UnitForm, type UnitFormValues } from "@/components/units/unit-form";
import type { Unit } from "@/types";

export default function EditUnitPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [unit, setUnit] = useState<Unit | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { properties, isLoading: propertiesLoading } = useProperties({
        limit: 500,
        includeArchived: true,
    });

    const loadUnit = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await unitsApi.findOne(id);
            setUnit(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Unit not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the unit.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadUnit();
    }, [loadUnit]);

    async function handleSubmit(
        values: UnitFormValues,
        features: Array<{ name: string; featureType?: string }>,
    ) {
        if (!id) return;
        await unitsApi.update(id, { ...values, features } as never);
        toast.success("Unit updated");
        router.push(`/units/${id}`);
        router.refresh();
    }

    if (isLoading || propertiesLoading) return <LoadingState label="Loading unit…" />;
    if (error) return <ErrorState message={error} onRetry={loadUnit} />;
    if (!unit || !id) return <ErrorState message="Unit not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/units/${id}`)}
                    aria-label="Back to unit"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Edit {unit.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        Occupancy is not edited here — use the status actions on the unit page so the change is
                        checked against the lease.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <UnitForm
                    mode="edit"
                    initial={unit}
                    properties={properties}
                    submitLabel="Save changes"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push(`/units/${id}`)}
                />
            </div>
        </div>
    );
}