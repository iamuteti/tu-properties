"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { ChevronLeft, DoorOpen } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { unitsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/entity-states";
import { UnitForm, type UnitFormValues } from "@/components/units/unit-form";

function NewUnitContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const propertyId = searchParams?.get("propertyId") ?? undefined;
    const { properties, isLoading } = useProperties({ limit: 500, includeArchived: true });

    async function handleSubmit(
        values: UnitFormValues,
        features: Array<{ name: string; featureType?: string }>,
    ) {
        await unitsApi.create({ ...values, features } as never);
        toast.success("Unit created");
        router.push(values.propertyId ? `/properties/${values.propertyId}` : "/units");
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <DoorOpen className="h-5 w-5" aria-hidden="true" />
                        Add unit
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Units always start vacant — occupancy follows the rental agreements.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                {isLoading ? (
                    <LoadingState label="Loading properties…" />
                ) : (
                    <UnitForm
                        mode="create"
                        properties={properties}
                        defaultPropertyId={propertyId}
                        onSubmit={handleSubmit}
                        onCancel={() => router.push("/units")}
                    />
                )}
            </div>
        </div>
    );
}

export default function NewUnitPage() {
    return (
        <Suspense fallback={<LoadingState label="Loading form…" />}>
            <NewUnitContent />
        </Suspense>
    );
}