"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Save, Plus, Trash2, Calendar, Search, AlertCircle, FileText, User } from "lucide-react";
import { useFinance } from "@/hooks/use-finance";
import { financeApi } from "@/lib/api";
import { Invoice } from "@/types";

interface ReceiptLine {
  id?: string;
  date: string;
  invNo: string;
  particular: string;
  invoiceTotal: number;
  prevReceipts: number;
  amtDue: number;
  payment: number;
  newBalance: number;
  whtTax?: number;
}

// No columns needed for simple table

export default function NewReceiptPage() {
  const { invoices: allInvoices } = useFinance({ invoices: true });
  
  const [formData, setFormData] = useState({
    receivedFrom: "",
    paymentMethod: "",
    receiptType: "ApplyToInvoice",
    depositIntoAc: "",
    refNo: "",
    chequeNo: "",
    chequeDate: "",
    recordingDate: new Date().toISOString().split("T")[0],
    amountReceived: "",
    notes: "",
  });

  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemoveLine = (id: string) => {
    setReceiptLines(prev => prev.filter(line => line.id !== id));
  };

  const handleInputChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleReceiptTypeChange = (type: "ApplyToInvoice" | "CashReceipt") => {
    setFormData(prev => ({ ...prev, receiptType: type }));
  };

  const handleAddInvoice = (invoice: Invoice) => {
    const newLine: ReceiptLine = {
      id: `temp-${Date.now()}`,
      date: formData.recordingDate,
      invNo: invoice.invoiceNumber,
      particular: invoice.memo || "Invoice Payment",
      invoiceTotal: invoice.totalAmount,
      prevReceipts: invoice.paidAmount,
      amtDue: invoice.balanceAmount,
      payment: invoice.balanceAmount,
      newBalance: 0,
      whtTax: 0,
    };
    setReceiptLines(prev => [...prev, newLine]);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validation
      if (!formData.receivedFrom) throw new Error("Received From is required");
      if (!formData.paymentMethod) throw new Error("Payment Method is required");
      if (!formData.depositIntoAc) throw new Error("Deposit Into Account is required");
      if (!formData.recordingDate) throw new Error("Recording Date is required");
      if (!formData.amountReceived) throw new Error("Amount Received is required");
      if (receiptLines.length === 0) throw new Error("At least one invoice must be added to the receipt");

      // Calculate total payment
      const totalPayment = receiptLines.reduce((sum, line) => sum + line.payment, 0);
      const enteredAmount = parseFloat(formData.amountReceived);

      if (Math.abs(totalPayment - enteredAmount) > 0.01) {
        throw new Error(`Total payment ($${totalPayment.toFixed(2)}) must match amount received ($${enteredAmount.toFixed(2)})`);
      }

      // Prepare and send data to API
      const receiptData = {
        ...formData,
        amountReceived: parseFloat(formData.amountReceived),
        receiptLines,
      };

      const newReceipt = await financeApi.createReceipt(receiptData);

      // Reset form and redirect or show success
      console.log("Receipt created successfully:", newReceipt);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while creating the receipt");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Receipt</h1>
          <p className="text-muted-foreground">
            Create a new receipt and record payment
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/receipts">
            <Button variant="outline">
              Cancel
            </Button>
          </Link>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            Save Receipt
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Receipt Form */}
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Received From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Received From: <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  name="receivedFrom"
                  value={formData.receivedFrom}
                  onChange={handleInputChange}
                  placeholder="Enter name"
                  className="flex-1"
                />
                <Button variant="outline" size="sm">
                  <Search className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method: <span className="text-red-500">*</span>
              </label>
              <Select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleInputChange}
                options={[
                  { value: "", label: "Select method" },
                  { value: "CASH", label: "Cash" },
                  { value: "BANK_TRANSFER", label: "Bank Transfer" },
                  { value: "CHEQUE", label: "Cheque" },
                  { value: "MPESA", label: "M-Pesa" },
                  { value: "CARD", label: "Card" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
            </div>

            {/* Receipt Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receipt Type:
              </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="receiptType"
                    value="ApplyToInvoice"
                    checked={formData.receiptType === "ApplyToInvoice"}
                    onChange={() => handleReceiptTypeChange("ApplyToInvoice")}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Apply to invoice</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="receiptType"
                    value="CashReceipt"
                    checked={formData.receiptType === "CashReceipt"}
                    onChange={() => handleReceiptTypeChange("CashReceipt")}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Cash Receipt</span>
                </label>
              </div>
            </div>

            {/* Deposit Into Account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Deposit Into A/c: <span className="text-red-500">*</span>
              </label>
              <Select
                name="depositIntoAc"
                value={formData.depositIntoAc}
                onChange={handleInputChange}
                options={[
                  { value: "", label: "Select account" },
                  { value: "CASH_COLLECTION_ACCOUNT", label: "Cash Collection Account" },
                  { value: "BANK_ACCOUNT_1", label: "Main Bank Account" },
                  { value: "BANK_ACCOUNT_2", label: "Savings Account" },
                ]}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Reference Number */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ref No.: <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  name="refNo"
                  value={formData.refNo}
                  onChange={handleInputChange}
                  placeholder="Cheque No., etc..."
                />
              </div>

              {/* Cheque Date */}
              {formData.paymentMethod === "CHEQUE" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cheque Date: <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="date"
                    name="chequeDate"
                    value={formData.chequeDate}
                    onChange={handleInputChange}
                  />
                </div>
              )}
            </div>

            {/* Recording Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recording Date: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    name="recordingDate"
                    value={formData.recordingDate}
                    onChange={handleInputChange}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Amount Received */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Received: <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  name="amountReceived"
                  value={formData.amountReceived}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes:
          </label>
          <Textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            placeholder="Enter any additional information"
            rows={3}
          />
        </div>
      </div>

      {/* Receipt Lines */}
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Receipt Lines</h2>
          <Button onClick={() => {/* Implement invoice search/selection */}}>
            <Plus className="mr-2 h-4 w-4" />
            Add Invoice
          </Button>
        </div>

        {receiptLines.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Inv No.</TableHead>
                <TableHead>Particular</TableHead>
                <TableHead className="text-right">Invoice Total</TableHead>
                <TableHead className="text-right">Prev. Receipts</TableHead>
                <TableHead className="text-right">Amt Due</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">New Balance</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receiptLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{new Date(line.date).toLocaleDateString()}</TableCell>
                  <TableCell>{line.invNo}</TableCell>
                  <TableCell>{line.particular}</TableCell>
                  <TableCell className="text-right">{line.invoiceTotal.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{line.prevReceipts.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{line.amtDue.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">{line.payment.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{line.newBalance.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveLine(line.id || '')}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No invoices added to this receipt
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2">
        <Link href="/dashboard/receipts">
          <Button variant="outline">
            Cancel
          </Button>
        </Link>
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" />
          Save Receipt
        </Button>
      </div>
    </div>
  );
}
