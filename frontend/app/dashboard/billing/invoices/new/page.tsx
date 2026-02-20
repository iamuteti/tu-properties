"use client";

import React, { useState } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import {
  TRANSACTION_CLASSES,
  CURRENCIES,
  ACCOUNTS_RECEIVABLE,
  INCOME_ACCOUNTS,
} from "@/lib/constants";

// Zod schema for invoice validation
const invoiceSchema = z.object({
  transactionClass: z.string().min(1, "Transaction class is required"),
  customerId: z.string().min(1, "Customer is required"),
  acReceivable: z.string().min(1, "A/C Receivable is required"),
  billTo: z.string().optional(),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  currency: z.string().min(1, "Currency is required"),
  spotRate: z.coerce.number().min(0, "Spot rate must be positive"),
  invoiceNumber: z.string().optional(),
  lpoNumber: z.string().optional(),
  signOnEfims: z.boolean().optional(),
  paymentInfo: z.string().optional(),
  termsConditions: z.string().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

interface InvoiceLine {
  id: number;
  revenueExpenseItem: string;
  particular: string;
  incomeAccount: string;
  unitCost: number;
  qty: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  className: string;
}

export default function NewInvoicePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([
    { id: 1, revenueExpenseItem: "", particular: "", incomeAccount: "", unitCost: 0, qty: 0, taxRate: 0, taxAmount: 0, lineTotal: 0, className: "" },
    { id: 2, revenueExpenseItem: "", particular: "", incomeAccount: "", unitCost: 0, qty: 0, taxRate: 0, taxAmount: 0, lineTotal: 0, className: "" },
    { id: 3, revenueExpenseItem: "", particular: "", incomeAccount: "", unitCost: 0, qty: 0, taxRate: 0, taxAmount: 0, lineTotal: 0, className: "" },
    { id: 4, revenueExpenseItem: "", particular: "", incomeAccount: "", unitCost: 0, qty: 0, taxRate: 0, taxAmount: 0, lineTotal: 0, className: "" },
    { id: 5, revenueExpenseItem: "", particular: "", incomeAccount: "", unitCost: 0, qty: 0, taxRate: 0, taxAmount: 0, lineTotal: 0, className: "" },
  ]);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema) as Resolver<InvoiceFormValues>,
    defaultValues: {
      transactionClass: "",
      customerId: "",
      acReceivable: "",
      billTo: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      currency: "KES",
      spotRate: 1,
      invoiceNumber: "",
      lpoNumber: "",
      signOnEfims: false,
      paymentInfo: "PAYMENT SHOULD BE MADE BY BANK TRANSFER OR CHEQUE.",
      termsConditions: "PLEASE MAKE PAYMENT AS SOON AS POSSIBLE",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = form;

  const handleAddLine = () => {
    const newId = Math.max(...invoiceLines.map(line => line.id), 0) + 1;
    setInvoiceLines([...invoiceLines, {
      id: newId,
      revenueExpenseItem: "",
      particular: "",
      incomeAccount: "",
      unitCost: 0,
      qty: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 0,
      className: ""
    }]);
  };

  const handleRemoveLine = (id: number) => {
    if (invoiceLines.length > 1) {
      setInvoiceLines(invoiceLines.filter(line => line.id !== id));
    }
  };

  const updateLine = (id: number, field: keyof InvoiceLine, value: string | number) => {
    setInvoiceLines(invoiceLines.map(line => {
      if (line.id === id) {
        const updatedLine = { ...line, [field]: value };
        // Calculate line total
        if (field === 'unitCost' || field === 'qty') {
          updatedLine.lineTotal = updatedLine.unitCost * updatedLine.qty;
        }
        // Calculate tax amount
        if (field === 'taxRate' || field === 'lineTotal') {
          updatedLine.taxAmount = (updatedLine.lineTotal * updatedLine.taxRate) / 100;
        }
        return updatedLine;
      }
      return line;
    }));
  };

  const calculateTotals = () => {
    const subTotal = invoiceLines.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
    const taxes = invoiceLines.reduce((sum, line) => sum + (line.taxAmount || 0), 0);
    const total = subTotal + taxes;
    return { subTotal, taxes, total };
  };

  const { subTotal, taxes, total } = calculateTotals();

  const onSubmit = async (data: InvoiceFormValues) => {
    setError(null);
    try {
      // For now, just log the data since we're focusing on UI
      console.log("Invoice data:", { ...data, invoiceLines, subTotal, taxes, total });
      // TODO: Implement actual API call when backend is ready
      router.push("/dashboard/billing");
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to create invoice. Please try again."
      );
    }
  };

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Invoice</h1>
          <p className="text-muted-foreground">
            Generate an invoice for a customer
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Row 1: Transaction Class and Customer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="transactionClass" className="text-sm font-medium leading-none">
                Transaction Class
              </label>
              <Select
                id="transactionClass"
                options={TRANSACTION_CLASSES}
                value={watch("transactionClass")}
                onChange={(e) => setValue("transactionClass", e.target.value)}
                disabled={isSubmitting}
              />
              {errors.transactionClass && (
                <p className="text-xs text-destructive">{errors.transactionClass.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="customerId" className="text-sm font-medium leading-none">
                Customer <span className="text-red-500">*</span>
              </label>
              <Select
                id="customerId"
                options={[
                  { value: "1", label: "John Doe" },
                  { value: "2", label: "Jane Smith" },
                  { value: "3", label: "ABC Company Ltd" },
                ]}
                value={watch("customerId")}
                onChange={(e) => setValue("customerId", e.target.value)}
                disabled={isSubmitting}
                search
              />
              {errors.customerId && (
                <p className="text-xs text-destructive">{errors.customerId.message}</p>
              )}
            </div>
          </div>

          {/* Row 2: A/C Receivable and Bill To */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="acReceivable" className="text-sm font-medium leading-none">
                A/C Receivable
              </label>
              <Select
                id="acReceivable"
                options={ACCOUNTS_RECEIVABLE}
                value={watch("acReceivable")}
                onChange={(e) => setValue("acReceivable", e.target.value)}
                disabled={isSubmitting}
              />
              {errors.acReceivable && (
                <p className="text-xs text-destructive">{errors.acReceivable.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="billTo" className="text-sm font-medium leading-none">
                Bill To
              </label>
              <Textarea
                id="billTo"
                {...register("billTo")}
                disabled={isSubmitting}
                placeholder="Enter billing address"
                rows={3}
              />
            </div>
          </div>

          {/* Row 3: Invoice Date, Due Date, Currency */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="invoiceDate" className="text-sm font-medium leading-none">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="invoiceDate"
                type="date"
                {...register("invoiceDate")}
                disabled={isSubmitting}
              />
              {errors.invoiceDate && (
                <p className="text-xs text-destructive">{errors.invoiceDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="dueDate" className="text-sm font-medium leading-none">
                Due Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="dueDate"
                type="date"
                {...register("dueDate")}
                disabled={isSubmitting}
              />
              {errors.dueDate && (
                <p className="text-xs text-destructive">{errors.dueDate.message}</p>
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
          </div>

          {/* Row 4: Spot Rate, Invoice #, LPO # */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="spotRate" className="text-sm font-medium leading-none">
                Spot Rate
              </label>
              <Input
                id="spotRate"
                type="number"
                step="0.01"
                {...register("spotRate")}
                disabled={isSubmitting}
              />
              {errors.spotRate && (
                <p className="text-xs text-destructive">{errors.spotRate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="invoiceNumber" className="text-sm font-medium leading-none">
                Invoice #
              </label>
              <Input
                id="invoiceNumber"
                {...register("invoiceNumber")}
                disabled={isSubmitting}
                placeholder="Auto-generated"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lpoNumber" className="text-sm font-medium leading-none">
                LPO #
              </label>
              <Input
                id="lpoNumber"
                {...register("lpoNumber")}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Row 5: Sign On eFims */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Sign On eFims <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="signOnEfimsNo"
                  checked={!watch("signOnEfims")}
                  onCheckedChange={(checked) => setValue("signOnEfims", !checked)}
                  disabled={isSubmitting}
                />
                <label htmlFor="signOnEfimsNo" className="text-sm cursor-pointer">No</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="signOnEfimsYes"
                  checked={watch("signOnEfims")}
                  onCheckedChange={(checked) => setValue("signOnEfims", checked)}
                  disabled={isSubmitting}
                />
                <label htmlFor="signOnEfimsYes" className="text-sm cursor-pointer">Yes</label>
              </div>
            </div>
          </div>

          {/* Invoice Lines Table */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Invoice Lines
            </label>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10 text-center">✓</TableHead>
                    <TableHead>Revenue/Expense Item</TableHead>
                    <TableHead>Particular</TableHead>
                    <TableHead>Income Account</TableHead>
                    <TableHead className="w-24">Unit Cost</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="w-20">Tax Rate</TableHead>
                    <TableHead className="w-24">Tax Amount</TableHead>
                    <TableHead className="w-24">Line Total</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-center">
                        <Checkbox disabled={isSubmitting} />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.revenueExpenseItem}
                          onChange={(e) => updateLine(line.id, 'revenueExpenseItem', e.target.value)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.particular}
                          onChange={(e) => updateLine(line.id, 'particular', e.target.value)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.incomeAccount}
                          onChange={(e) => updateLine(line.id, 'incomeAccount', e.target.value)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unitCost || ""}
                          onChange={(e) => updateLine(line.id, 'unitCost', parseFloat(e.target.value) || 0)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.qty || ""}
                          onChange={(e) => updateLine(line.id, 'qty', parseFloat(e.target.value) || 0)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.taxRate || ""}
                          onChange={(e) => updateLine(line.id, 'taxRate', parseFloat(e.target.value) || 0)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.taxAmount.toFixed(2)}
                          disabled
                          className="border-0 bg-transparent h-8 bg-muted/30"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.lineTotal.toFixed(2)}
                          disabled
                          className="border-0 bg-transparent h-8 bg-muted/30"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.className}
                          onChange={(e) => updateLine(line.id, 'className', e.target.value)}
                          disabled={isSubmitting}
                          className="border-0 bg-transparent h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLine(line.id)}
                          disabled={isSubmitting || invoiceLines.length <= 1}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              disabled={isSubmitting}
              className="flex items-center gap-2 mt-2"
            >
              <Plus className="h-4 w-4" /> Add Line
            </Button>
          </div>

          {/* Row 6: Payment Info, Terms & Conditions, Totals */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="paymentInfo" className="text-sm font-medium leading-none">
                Payment Info
              </label>
              <Textarea
                id="paymentInfo"
                {...register("paymentInfo")}
                disabled={isSubmitting}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="termsConditions" className="text-sm font-medium leading-none">
                Terms & Conditions
              </label>
              <Textarea
                id="termsConditions"
                {...register("termsConditions")}
                disabled={isSubmitting}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium text-muted-foreground">SUB TOTAL:</span>
                  <span className="font-medium">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium text-muted-foreground">TAXES:</span>
                  <span className="font-medium">{taxes.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 font-bold text-lg">
                  <span>TOTAL:</span>
                  <span>{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
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
              {isSubmitting ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
