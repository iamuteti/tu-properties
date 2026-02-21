"use client";

import { useState } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useFinance } from "@/hooks/use-finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { CURRENCIES, PAYMENT_METHODS } from "@/lib/constants";
import { financeApi } from "@/lib/api";
import { CreatePaymentData, Invoice } from "@/types";

// Zod schema for payment validation
const paymentSchema = z.object({
  invoiceId: z.string().optional(),
  paymentDate: z.string().min(1, "Payment date is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().min(1, "Currency is required"),
  spotRate: z.coerce.number().min(0, "Spot rate must be positive").default(1),
  paymentMethod: z.string().min(1, "Payment method is required"),
  paymentReference: z.string().optional(),
  payee: z.string().optional(),
  paidFrom: z.string().optional(),
  paidTo: z.string().optional(),
  paymentType: z.string().default("ApplyToBill"),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  mpesaReceiptNumber: z.string().optional(),
  mpesaPhoneNumber: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function NewPaymentPage() {
  const { token } = useAuth();
  const router = useRouter();
  const { invoices: allInvoices, isLoading: isLoadingInvoices, refetch } = useFinance({ invoices: true });
  const [error, setError] = useState<string | null>(null);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormValues>,
    defaultValues: {
      paymentDate: new Date().toISOString().split("T")[0],
      amount: 0,
      currency: "KES",
      spotRate: 1,
      paymentMethod: "",
      paymentReference: "",
      payee: "",
      paidFrom: "",
      paidTo: "",
      paymentType: "ApplyToBill",
      chequeNumber: "",
      chequeDate: "",
      mpesaReceiptNumber: "",
      mpesaPhoneNumber: "",
      notes: "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    reset,
  } = form;

  // Get selected invoice to auto-fill payee
  const selectedInvoiceId = watch("invoiceId");
  const selectedInvoice = allInvoices.find(inv => inv.id === selectedInvoiceId);

  // Filter invoices that have balance (can receive payment)
  const unpaidInvoices = allInvoices.filter(
    inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED' && Number(inv.balanceAmount) > 0
  );

  const onSubmit = async (data: PaymentFormValues) => {
    setError(null);
    try {
      const paymentData: CreatePaymentData = {
        invoiceId: data.invoiceId || undefined,
        paymentDate: data.paymentDate,
        amount: data.amount,
        currency: data.currency,
        spotRate: data.spotRate,
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference || undefined,
        payee: data.payee || undefined,
        paidFrom: data.paidFrom || undefined,
        paidTo: data.paidTo || undefined,
        paymentType: data.paymentType || "ApplyToBill",
        chequeNumber: data.chequeNumber || undefined,
        chequeDate: data.chequeDate || undefined,
        mpesaReceiptNumber: data.mpesaReceiptNumber || undefined,
        mpesaPhoneNumber: data.mpesaPhoneNumber || undefined,
        notes: data.notes || undefined,
      };

      await financeApi.createPayment(paymentData);
      refetch();
      router.push("/dashboard/payments");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to record payment. Please try again."
      );
    }
  };

  // Handle invoice selection to auto-fill amount and payee
  const handleInvoiceChange = (e: { target: { value: string } }) => {
    const invoiceId = e.target.value;
    setValue("invoiceId", invoiceId);
    
    if (invoiceId) {
      const invoice = allInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        // Auto-fill amount with balance due
        setValue("amount", Number(invoice.balanceAmount));
        // Auto-fill payee from lease tenant
        if (invoice.lease?.tenant) {
          const tenant = invoice.lease.tenant;
          setValue("payee", `${tenant.surname} ${tenant.otherNames || ''}`.trim());
        }
      }
    }
  };

  // Show additional fields based on payment method
  const paymentMethod = watch("paymentMethod");

  if (isLoadingInvoices) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Record New Payment</h1>
          <p className="text-muted-foreground">
            Record a payment received from a customer
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Row 1: Invoice and Payment Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="invoiceId" className="text-sm font-medium leading-none">
                Invoice (Optional)
              </label>
              <Select
                id="invoiceId"
                options={[
                  { value: "", label: "-- Select Invoice --" },
                  ...unpaidInvoices.map((inv) => ({
                    value: inv.id,
                    label: `${inv.invoiceNumber} - KES ${Number(inv.balanceAmount).toFixed(2)} (${inv.status})`,
                  })),
                ]}
                value={selectedInvoiceId || ""}
                onChange={handleInvoiceChange}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Select an invoice to apply this payment to
              </p>
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

          {/* Row 2: Amount, Currency, and Spot Rate */}
          <div className="grid grid-cols-3 gap-4">
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
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="currency" className="text-sm font-medium leading-none">
                Currency
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
            <div className="space-y-2">
              <label htmlFor="spotRate" className="text-sm font-medium leading-none">
                Spot Rate
              </label>
              <Input
                id="spotRate"
                type="number"
                step="0.0001"
                {...register("spotRate")}
                disabled={isSubmitting}
                defaultValue={1}
              />
              {errors.spotRate && (
                <p className="text-xs text-destructive">{errors.spotRate.message}</p>
              )}
            </div>
          </div>

          {/* Row 3: Payment Method and Reference */}
          <div className="grid grid-cols-2 gap-4">
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
                placeholder="Bank ref, M-Pesa code, cheque number, etc."
              />
            </div>
          </div>

          {/* Row 4: Payment Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Payment Type
            </label>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="paymentTypeApply"
                  value="ApplyToBill"
                  checked={watch("paymentType") === "ApplyToBill"}
                  onChange={() => setValue("paymentType", "ApplyToBill")}
                  disabled={isSubmitting}
                />
                <label htmlFor="paymentTypeApply" className="text-sm cursor-pointer">Apply to Invoice</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="paymentTypeCash"
                  value="CashPayment"
                  checked={watch("paymentType") === "CashPayment"}
                  onChange={() => setValue("paymentType", "CashPayment")}
                  disabled={isSubmitting}
                />
                <label htmlFor="paymentTypeCash" className="text-sm cursor-pointer">Cash Payment</label>
              </div>
            </div>
          </div>

          {/* Payment Method Specific Fields */}
          {paymentMethod === "CHEQUE" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="chequeNumber" className="text-sm font-medium leading-none">
                  Cheque Number
                </label>
                <Input
                  id="chequeNumber"
                  {...register("chequeNumber")}
                  disabled={isSubmitting}
                  placeholder="Enter cheque number"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="chequeDate" className="text-sm font-medium leading-none">
                  Cheque Date
                </label>
                <Input
                  id="chequeDate"
                  type="date"
                  {...register("chequeDate")}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          {paymentMethod === "MPESA" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="mpesaReceiptNumber" className="text-sm font-medium leading-none">
                  M-Pesa Receipt Number
                </label>
                <Input
                  id="mpesaReceiptNumber"
                  {...register("mpesaReceiptNumber")}
                  disabled={isSubmitting}
                  placeholder="Enter M-Pesa receipt number"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="mpesaPhoneNumber" className="text-sm font-medium leading-none">
                  M-Pesa Phone Number
                </label>
                <Input
                  id="mpesaPhoneNumber"
                  {...register("mpesaPhoneNumber")}
                  disabled={isSubmitting}
                  placeholder="Enter phone number"
                />
              </div>
            </div>
          )}

          {/* Row 5: Payee, Paid From, Paid To */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="payee" className="text-sm font-medium leading-none">
                Payee
              </label>
              <Input
                id="payee"
                {...register("payee")}
                disabled={isSubmitting}
                placeholder="Name of person/company paying"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="paidFrom" className="text-sm font-medium leading-none">
                Paid From
              </label>
              <Input
                id="paidFrom"
                {...register("paidFrom")}
                disabled={isSubmitting}
                placeholder="Source of payment"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="paidTo" className="text-sm font-medium leading-none">
                Paid To
              </label>
              <Input
                id="paidTo"
                {...register("paidTo")}
                disabled={isSubmitting}
                placeholder="Destination account"
              />
            </div>
          </div>

          {/* Row 6: Notes */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium leading-none">
              Notes
            </label>
            <Textarea
              id="notes"
              {...register("notes")}
              disabled={isSubmitting}
              placeholder="Additional notes about this payment"
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
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
