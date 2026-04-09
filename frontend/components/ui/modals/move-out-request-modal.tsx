"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { useTenants } from "@/hooks/use-tenants";
import { useProperties } from "@/hooks/use-properties";
import { useAuth } from "@/hooks/use-auth";
import { moveoutsApi } from "@/lib/api";
import { toast } from "sonner";

const moveOutRequestSchema = z.object({
  propertyId: z.string().min(1, "Please select a property"),
  tenantId: z.string().min(1, "Please select a tenant"),
  rentalAgreementId: z.string().min(1, "Please select a rental agreement"),
  moveoutDate: z.string().min(1, "Please select a move-out date"),
  notes: z.string().optional(),
});

type MoveOutRequestFormData = z.infer<typeof moveOutRequestSchema>;

interface MoveOutRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Component to handle tenant fetching only when property is selected
function TenantFetcher({ propertyId, onTenantsChange }: { propertyId: string; onTenantsChange: (tenants: any[], loading: boolean) => void }) {
  const { tenants: propertyTenants, isLoading: tenantsLoading } = useTenants({ propertyId, limit: 1000 });

  useEffect(() => {
    onTenantsChange(propertyTenants, tenantsLoading);
  }, [propertyTenants, tenantsLoading, onTenantsChange]);

  return null; // This component only manages data fetching
}

export function MoveOutRequestModal({ isOpen, onClose, onSuccess }: MoveOutRequestModalProps) {
  const { user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<MoveOutRequestFormData>({
    resolver: zodResolver(moveOutRequestSchema),
    defaultValues: {
      propertyId: "",
      tenantId: "",
      rentalAgreementId: "",
      moveoutDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      notes: "",
    },
  });

  const watchedPropertyId = watch("propertyId");
  const watchedTenantId = watch("tenantId");

  const { properties } = useProperties({ limit: 1000 }); // Get all properties for selection

  const [allTenants, setAllTenants] = useState<any[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [filteredTenants, setFilteredTenants] = useState<any[]>([]);
  const [rentalAgreements, setRentalAgreements] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle tenant data changes from the fetcher component
  const handleTenantsChange = useCallback((tenants: any[], loading: boolean) => {
    setAllTenants(tenants);
    setTenantsLoading(loading);
  }, []);

  // Set tenants when data changes
  useEffect(() => {
    setFilteredTenants(allTenants);
    setValue("tenantId", "");
    setRentalAgreements([]);
  }, [allTenants, setValue]);

  // Update rental agreements when tenant changes
  useEffect(() => {
    if (watchedTenantId) {
      const tenant = filteredTenants.find(t => t.id === watchedTenantId);
      if (tenant?.rentalAgreement) {
        setRentalAgreements([tenant.rentalAgreement]);
        setValue("rentalAgreementId", tenant.rentalAgreement.id);
      } else {
        setRentalAgreements([]);
        setValue("rentalAgreementId", "");
      }
    } else {
      setRentalAgreements([]);
      setValue("rentalAgreementId", "");
    }
  }, [watchedTenantId, filteredTenants, setValue]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      reset({
        propertyId: "",
        tenantId: "",
        rentalAgreementId: "",
        moveoutDate: new Date().toISOString().split('T')[0],
        notes: "",
      });
      setFilteredTenants([]);
      setRentalAgreements([]);
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: MoveOutRequestFormData) => {
    setIsSubmitting(true);
    try {
      const { propertyId, ...payload } = data;
      payload.moveoutDate = new Date(payload.moveoutDate).toISOString();
      await moveoutsApi.create(payload);
      toast.success("Move-out request created successfully!");
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to create move-out request:", error);
      toast.error("Failed to create move-out request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const propertyOptions = properties.map(property => ({
    value: property.id,
    label: `${property.name} (${property.code})`,
  }));

  const tenantOptions = filteredTenants.map(tenant => ({
    value: tenant.id,
    label: `${tenant.surname} ${tenant.otherNames || ''} (${tenant.code})`.trim(),
  }));

  const rentalAgreementOptions = rentalAgreements.map(agreement => ({
    value: agreement.id,
    label: `${agreement.unit?.name || 'Unknown Unit'} - ${agreement.agreementType} (${new Date(agreement.startDate).toLocaleDateString()})`,
  }));

  return (
    <>
      {/* Only fetch tenants when a property is selected */}
      {watchedPropertyId && (
        <TenantFetcher propertyId={watchedPropertyId} onTenantsChange={handleTenantsChange} />
      )}

      <Modal isOpen={isOpen} onClose={onClose} title="Create Move-Out Request" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Property Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Property *
          </label>
          <Select
            {...register("propertyId")}
            value={watch("propertyId")}
            options={propertyOptions}
            placeholder="Select a property"
            onChange={(e) => setValue("propertyId", e.target.value)}
          />
          {errors.propertyId && (
            <p className="mt-1 text-sm text-red-600">{errors.propertyId.message}</p>
          )}
        </div>

        {/* Tenant Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Tenant *
          </label>
          <Select
            {...register("tenantId")}
            value={watch("tenantId")}
            options={tenantOptions}
            placeholder={tenantsLoading ? "Loading tenants..." : "Select a tenant"}
            disabled={tenantsLoading}
            onChange={(e) => setValue("tenantId", e.target.value)}
          />
          {errors.tenantId && (
            <p className="mt-1 text-sm text-red-600">{errors.tenantId.message}</p>
          )}
        </div>

        {/* Rental Agreement Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Rental Agreement *
          </label>
          <Select
            {...register("rentalAgreementId")}
            value={watch("rentalAgreementId")}
            options={rentalAgreementOptions}
            placeholder="Select a rental agreement"
            disabled={!watchedTenantId}
            onChange={(e) => setValue("rentalAgreementId", e.target.value)}
          />
          {errors.rentalAgreementId && (
            <p className="mt-1 text-sm text-red-600">{errors.rentalAgreementId.message}</p>
          )}
        </div>

        {/* Move-out Date */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Move-out Date *
          </label>
          <Input
            {...register("moveoutDate")}
            type="date"
            className="w-full"
          />
          {errors.moveoutDate && (
            <p className="mt-1 text-sm text-red-600">{errors.moveoutDate.message}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Notes
          </label>
          <Textarea
            {...register("notes")}
            placeholder="Additional notes about the move-out request..."
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Request"}
          </Button>
        </div>
      </form>
    </Modal>
    </>
  );
}