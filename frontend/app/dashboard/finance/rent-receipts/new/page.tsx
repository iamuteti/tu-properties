"use client";

import React, { useState } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTenants } from "@/hooks/use-tenants";
import { useLeases } from "@/hooks/use-leases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { PAYMENT_METHODS, CURRENCIES } from "@/lib/constants";

// Zod schema for rent receipt validation
const rentReceiptSchema = z.object({
  receiptNumber: z.string().min(1, "Receipt number is required"),
  tenantId: z.string().min(1, "Tenant is required"),
  leaseId: z.string().min(1, "Lease is required"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  paymentReference: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  invoiceIds: z.array(z.string()).optional(),
});

type RentReceiptFormValues = z.infer<typeof rentReceiptSchema>;

export default function NewRentReceiptPage() {
  const { token } = useAuth();
  const { tenants } = useTenants();
  const { leases } = useLeases();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [appliedInvoices, setAppliedInvoices] = useState<string[]>([]);

  const form = useForm<RentReceiptFormValues>({
    resolver: zodResolver(rentReceiptSchema) as Resolver<RentReceiptFormValues>,
    defaultValues: {
      receiptNumber: `RR-${Date.now()}`,
      tenantId: "",
      leaseId: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "CASH",
      paymentReference: "",
      amount: 0,
      currency: "KES",
      notes: "",
      invoiceIds: [],
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = form;

  const handleLeaseChange = (e: { target: { value: string } }) => {
    const leaseId = e.target.value;
    setValue("leaseId", leaseId);
    const selectedLease = leases.find((lease) => lease.id === leaseId);
    if (selectedLease && selectedLease.tenant) {
      setValue("tenantId", selectedLease.tenantId);
    }
  };

  const handleTenantChange = (e: { target: { value: string } }) => {
    const tenantId = e.target.value;
    setValue("tenantId", tenantId);
    // Filter leases to only those belonging to the selected tenant
    const tenantLeases = leases.filter((lease) => lease.tenantId === tenantId);
    if (tenantLeases.length > 0) {
      setValue("leaseId", tenantLeases[0].id);
    } else {
      setValue("leaseId", "");
    }
  };

  const toggleInvoice = (invoiceId: string) => {
    if (appliedInvoices.includes(invoiceId)) {
      setAppliedInvoices(appliedInvoices.filter(id => id !== invoiceId));
    } else {
      setAppliedInvoices([...appliedInvoices, invoiceId]);
    }
  };

  const onSubmit = async (data: RentReceiptFormValues) => {
    setError(null);
    try {
      const payload = {
        ...data,
        invoiceIds: appliedInvoices,
      };
      
      // For now, just log the data since we're focusing on UI
      console.log("Rent receipt data:", payload);
      
      router.push("/dashboard/finance/rent-receipts");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to create rent receipt. Please try again."
      );
    }
  };

  // Get invoices associated with the selected lease
  const selectedLease = leases.find((lease) => lease.id === watch("leaseId"));
  const associatedInvoices = selectedLease?.invoices || [];

  // Filter leases to match selected tenant
  const filteredLeases = watch("tenantId") 
    ? leases.filter((lease) => lease.tenantId === watch("tenantId"))
    : leases;

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Rent Receipt</h1>
          <p className="text-muted-foreground">
            Generate a rent receipt for a tenant
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="receiptNumber" className="text-sm font-medium leading-none">
                Receipt Number <span className="text-red-500">*</span>
              </label>
              <Input
                id="receiptNumber"
                {...register("receiptNumber")}
                disabled={isSubmitting}
              />
              {errors.receiptNumber && (
                <p className="text-xs text-destructive">{errors.receiptNumber.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="paymentDate" className="text-sm font-medium leading-none">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="paymentDate"
                type="date"
                {...register("paymentDate")}
                disabled={isSubmitting}
              />
              {errors.paymentDate && (
                <p className="text-xs text-destructive">{errors.paymentDate.message}</p>
              )}
            </div>
          </div>

          {/* Tenant and Lease Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="tenantId" className="text-sm font-medium leading-none">
                Tenant <span className="text-red-500">*</span>
              </label>
              <Select
                id="tenantId"
                options={tenants.map((tenant) => ({
                  value: tenant.id,
                  label: `${tenant.surname} ${tenant.otherNames || ''}`,
                }))}
                value={watch("tenantId")}
                onChange={handleTenantChange}
                disabled={isSubmitting}
                search
              />
              {errors.tenantId && (
                <p className="text-xs text-destructive">{errors.tenantId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="leaseId" className="text-sm font-medium leading-none">
                Lease <span className="text-red-500">*</span>
              </label>
              <Select
                id="leaseId"
                options={filteredLeases.map((lease) => ({
                  value: lease.id,
                  label: `Lease #${lease.id.slice(0, 8)}`,
                }))}
                value={watch("leaseId")}
                onChange={handleLeaseChange}
                disabled={isSubmitting || filteredLeases.length === 0}
              />
              {errors.leaseId && (
                <p className="text-xs text-destructive">{errors.leaseId.message}</p>
              )}
            </div>
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="paymentMethod" className="text-sm font-medium leading-none">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <Select
                id="paymentMethod"
                options={PAYMENT_METHODS}
                value={watch("paymentMethod")}
                onChange={(e) => setValue("paymentMethod", e.target.value)}
                disabled={isSubmitting}
              />
              {errors.paymentMethod && (
                <p className="text-xs text-destructive">{errors.paymentMethod.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="paymentReference" className="text-sm font-medium leading-none">
                Payment Reference
              </label>
              <Input
                id="paymentReference"
                {...register("paymentReference")}
                disabled={isSubmitting}
                placeholder="e.g., Bank transaction ID, M-Pesa code"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="currency" className="text-sm font-medium leading-none">
                Currency <span className="text-red-500">*</span>
              </label>
              <Select
                id="currency"
                options={CURRENCIES}
                value={watch("currency")}
                onChange={(e) => setValue("currency", e.target.value)}
                disabled={isSubmitting}
              />
              {errors.currency && (
                <p className="text-xs text-destructive">{errors.currency.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium leading-none">
              Amount <span className="text-red-500">*</span>
            </label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount")}
              disabled={isSubmitting}
              placeholder="0.00"
              className="text-lg font-semibold"
            />
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Applied Invoices */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Apply to Invoices
            </label>
            {associatedInvoices.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 text-center">✓</TableHead>
                      <TableHead>Invoice Number</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {associatedInvoices.map((invoice: any) => (
                      <TableRow
                        key={invoice.id}
                        className={appliedInvoices.includes(invoice.id) ? "bg-green-50" : ""}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={appliedInvoices.includes(invoice.id)}
                            onChange={() => toggleInvoice(invoice.id)}
                            disabled={isSubmitting}
                            className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{new Date(invoice.issueDate).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                        <TableCell>{invoice.currency} {invoice.totalAmount.toFixed(2)}</TableCell>
                        <TableCell>{invoice.currency} {invoice.balanceAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">
                No invoices found for the selected lease.
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium leading-none">
              Notes
            </label>
            <Textarea
              id="notes"
              {...register("notes")}
              disabled={isSubmitting}
              placeholder="Add any additional notes or comments..."
              rows={3}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Receipt"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
