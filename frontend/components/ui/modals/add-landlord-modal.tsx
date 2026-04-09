"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { landlordsApi } from "@/lib/api";
import { toast } from "sonner";

const landlordSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  alternativePhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountName: z.string().optional(),
  accountNumber: z.string().optional(),
  taxPin: z.string().optional(),
  vatRegistered: z.boolean(),
});

type LandlordFormData = z.infer<typeof landlordSchema>;

interface AddLandlordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  landlord?: any; // For editing
}

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
];

export function AddLandlordModal({ isOpen, onClose, onSuccess, landlord }: AddLandlordModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<LandlordFormData>({
    resolver: zodResolver(landlordSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      alternativePhone: "",
      address: "",
      city: "",
      country: "",
      postalCode: "",
      bankName: "",
      bankBranch: "",
      accountName: "",
      accountNumber: "",
      taxPin: "",
      vatRegistered: false,
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (data: LandlordFormData) => {
    setIsSubmitting(true);
    try {
      // Clean up empty strings to undefined
      const cleanedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          value === "" ? undefined : value,
        ])
      );
      if (isEditing && landlord) {
        await landlordsApi.update(landlord.id, cleanedData);
        toast.success("Landlord updated successfully!");
      } else {
        await landlordsApi.create(cleanedData);
        toast.success("Landlord created successfully!");
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} landlord:`, error);
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} landlord. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (landlord) {
        reset({
          name: landlord.name || "",
          email: landlord.email || "",
          phone: landlord.phone || "",
          alternativePhone: landlord.alternativePhone || "",
          address: landlord.address || "",
          city: landlord.city || "",
          country: landlord.country || "",
          postalCode: landlord.postalCode || "",
          bankName: landlord.bankName || "",
          bankBranch: landlord.bankBranch || "",
          accountName: landlord.accountName || "",
          accountNumber: landlord.accountNumber || "",
          taxPin: landlord.taxPin || "",
          vatRegistered: landlord.vatRegistered || false,
        });
      } else {
        reset({
          name: "",
          email: "",
          phone: "",
          alternativePhone: "",
          address: "",
          city: "",
          country: "",
          postalCode: "",
          bankName: "",
          bankBranch: "",
          accountName: "",
          accountNumber: "",
          taxPin: "",
          vatRegistered: false,
        });
      }
    }
  }, [isOpen, reset, landlord]);

  const isEditing = !!landlord;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Landlord" : "Add New Landlord"} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* General Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-900 border-b border-slate-200 pb-2">
            General Information
          </h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name *
            </label>
            <Input
              {...register("name")}
              placeholder="Enter landlord name"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <Input
                {...register("email")}
                type="email"
                placeholder="Enter email address"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <Input
                {...register("phone")}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Alternative Phone
              </label>
              <Input
                {...register("alternativePhone")}
                placeholder="Enter alternative phone"
              />
            </div>
          </div>
        </div>

        {/* Address Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-900 border-b border-slate-200 pb-2">
            Address Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address
              </label>
              <Textarea
                {...register("address")}
                placeholder="Enter full address"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City
                </label>
                <Input
                  {...register("city")}
                  placeholder="Enter city"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Country
                </label>
                <Input
                  {...register("country")}
                  placeholder="Enter country"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Postal Code
                </label>
                <Input
                  {...register("postalCode")}
                  placeholder="Enter postal code"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Banking Details Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-900 border-b border-slate-200 pb-2">
            Banking Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Bank Name
              </label>
              <Input
                {...register("bankName")}
                placeholder="Enter bank name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Bank Branch
              </label>
              <Input
                {...register("bankBranch")}
                placeholder="Enter bank branch"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Account Name
              </label>
              <Input
                {...register("accountName")}
                placeholder="Enter account name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Account Number
              </label>
              <Input
                {...register("accountNumber")}
                placeholder="Enter account number"
              />
            </div>
          </div>
        </div>

        {/* Tax Information Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-900 border-b border-slate-200 pb-2">
            Tax Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tax PIN
              </label>
              <Input
                {...register("taxPin")}
                placeholder="Enter tax PIN"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={watch("vatRegistered")}
                onCheckedChange={(checked) => setValue("vatRegistered", checked)}
              />
              <label className="text-sm font-medium text-slate-700">
                VAT Registered
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update Landlord" : "Create Landlord")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}