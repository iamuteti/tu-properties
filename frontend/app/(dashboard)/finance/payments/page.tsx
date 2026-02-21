"use client";

import Link from "next/link";
import { Plus, Search, Trash2, CreditCard } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/hooks/use-finance";
import { financeApi } from "@/lib/api";
import { Payment } from "@/types";
import { useState, useMemo } from "react";
import { PaymentFilters, type PaymentFiltersState } from "@/components/filters/payments-filter";
import { getDateRangeForPeriod } from "@/components/filters/period-selector";

// Define columns for the DataTable
const columns: ColumnDef<Payment>[] = [
  {
    accessorKey: "paymentMethod",
    header: "Method",
    cell: ({ row }) => {
      const method = row.original.paymentMethod;
      let methodColor = "";
      
      switch (method) {
        case "CASH":
          methodColor = "bg-green-100 text-green-800";
          break;
        case "BANK_TRANSFER":
          methodColor = "bg-blue-100 text-blue-800";
          break;
        case "CHEQUE":
          methodColor = "bg-yellow-100 text-yellow-800";
          break;
        case "MPESA":
          methodColor = "bg-purple-100 text-purple-800";
          break;
        case "CARD":
          methodColor = "bg-indigo-100 text-indigo-800";
          break;
        default:
          methodColor = "bg-gray-100 text-gray-800";
      }
      
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${methodColor}`}>
          {method.replace('_', ' ')}
        </span>
      );
    },
  },
  {
    accessorKey: "paymentReference",
    header: "Ref. No.",
    cell: ({ row }) => (
      <div className="max-w-xs truncate" title={row.original.paymentReference || "No reference"}>
        {row.original.paymentReference || "-"}
      </div>
    ),
  },
  {
    accessorKey: "paymentDate",
    header: "Date",
    cell: ({ row }) => new Date(row.original.paymentDate).toLocaleDateString(),
  },
  {
    accessorKey: "particulars",
    header: "Particulars",
    cell: ({ row }) => {
      const payment = row.original;
      // Try to get meaningful particulars from invoice or lease
      if (payment.invoice) {
        return (
          <Link href={`/dashboard/invoices/${payment.invoice.id}`} className="font-medium text-blue-600 hover:text-blue-800">
            {payment.invoice.invoiceNumber}
          </Link>
        );
      } else if (payment.lease?.tenant) {
        return `${payment.lease.tenant.surname}, ${payment.lease.tenant.otherNames}`;
      } else if (payment.payee) {
        return payment.payee;
      }
      return "-";
    },
  },
  {
    accessorKey: "paidFrom",
    header: "Paid From",
    cell: ({ row }) => row.original.paidFrom || "-",
  },
  {
    accessorKey: "paidTo",
    header: "Paid To",
    cell: ({ row }) => row.original.paidTo || "-",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {row.original.currency} {Number(row.original.amount).toFixed(2)}
      </div>
    ),
  },
  {
    accessorKey: "recordedBy",
    header: "Recorded By",
    cell: ({ row }) => row.original.recordedBy || "-",
  },
];

export default function PaymentsPage() {
  const { payments: allPayments, isLoading, error, refetch } = useFinance({ payments: true });
  const [selectedPayments, setSelectedPayments] = useState<Payment[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState<PaymentFiltersState>({
    search: '',
    period: 'all',
    fromDate: '',
    toDate: '',
    paymentMethod: '',
    pvNumber: '',
    refNumber: '',
    payee: '',
    cashbook: '',
    minAmount: '',
    maxAmount: '',
  });

  // Apply filters to payments
  const payments = useMemo(() => {
    return allPayments.filter(payment => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          payment.invoice?.invoiceNumber?.toLowerCase().includes(searchLower) ||
          payment.payee?.toLowerCase().includes(searchLower) ||
          payment.paymentReference?.toLowerCase().includes(searchLower) ||
          payment.receipt?.receiptId?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // PV # filter
      if (filters.pvNumber) {
        // PV number might be in payment reference or receipt fields
        const pvNumberLower = filters.pvNumber.toLowerCase();
        const matchesPv = 
          payment.paymentReference?.toLowerCase().includes(pvNumberLower) ||
          payment.receipt?.receiptId?.toLowerCase().includes(pvNumberLower) ||
          payment.chequeNumber?.toLowerCase().includes(pvNumberLower);
        if (!matchesPv) return false;
      }

      // Ref # filter
      if (filters.refNumber) {
        const refNumberLower = filters.refNumber.toLowerCase();
        const matchesRef = 
          payment.paymentReference?.toLowerCase().includes(refNumberLower) ||
          payment.receipt?.receiptId?.toLowerCase().includes(refNumberLower);
        if (!matchesRef) return false;
      }

      // Payee filter
      if (filters.payee) {
        const payeeLower = filters.payee.toLowerCase();
        const matchesPayee = 
          payment.payee?.toLowerCase().includes(payeeLower) ||
          payment.lease?.tenant?.surname?.toLowerCase().includes(payeeLower);
        if (!matchesPayee) return false;
      }

      // Cashbook filter
      if (filters.cashbook) {
        // Cashbook might be in paidFrom or paidTo fields
        const cashbookLower = filters.cashbook.toLowerCase();
        const matchesCashbook = 
          payment.paidFrom?.toLowerCase().includes(cashbookLower) ||
          payment.paidTo?.toLowerCase().includes(cashbookLower);
        if (!matchesCashbook) return false;
      }

      // Min Amount filter
      if (filters.minAmount) {
        const minAmount = parseFloat(filters.minAmount);
        if (payment.amount < minAmount) return false;
      }

      // Max Amount filter
      if (filters.maxAmount) {
        const maxAmount = parseFloat(filters.maxAmount);
        if (payment.amount > maxAmount) return false;
      }

      // Date filters based on period
      const paymentDate = new Date(payment.paymentDate);
      
      if (filters.period && filters.period !== 'all') {
        const { start, end } = getDateRangeForPeriod(filters.period);
        
        if (start && end) {
          if (paymentDate < start || paymentDate >= end) return false;
        } else if (filters.period === 'custom') {
          if (filters.fromDate && paymentDate < new Date(filters.fromDate)) return false;
          if (filters.toDate && paymentDate > new Date(filters.toDate)) return false;
        }
      }

      // Payment method filter
      if (filters.paymentMethod) {
        if (payment.paymentMethod !== filters.paymentMethod) return false;
      }

      return true;
    });
  }, [allPayments, filters]);

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedPayments.length} payment(s)?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const ids = selectedPayments.map((payment) => payment.id);
      await financeApi.deletePayments(ids);
      setSelectedPayments([]);
      refetch();
    } catch (err) {
      console.error("Failed to delete payments:", err);
      alert("Failed to delete payments. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      period: 'all',
      fromDate: '',
      toDate: '',
      paymentMethod: '',
      pvNumber: '',
      refNumber: '',
      payee: '',
      cashbook: '',
      minAmount: '',
      maxAmount: '',
    });
  };

  if (isLoading) {
    return <div>Loading payments...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Manage payments and track transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPayments.length > 0 && (
            <>
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedPayments.length})
              </Button>
            </>
          )}
          <Link href="/dashboard/payments/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <PaymentFilters
        filters={filters}
        onFiltersChange={setFilters}
        onReset={handleResetFilters}
      />

      {/* Data Table */}
      <DataTable
        data={payments}
        columns={columns}
        searchPlaceholder="Search payments..."
        searchColumns={[
          { id: "invoice", label: "Invoice Number", accessor: (row) => row.invoice?.invoiceNumber || "" },
          { id: "payee", label: "Payee" },
          { id: "paymentReference", label: "Reference" },
        ]}
        emptyMessage="No payments found. Record your first payment to get started."
        emptyIcon={<Search className="mx-auto h-12 w-12 text-slate-400" />}
        defaultPageSize={10}
        pageSizeOptions={[10, 20, 30, 40, 50]}
        enableRowSelection
        enableSearch={false}
        onRowSelectionChange={setSelectedPayments}
      />
    </div>
  );
}
