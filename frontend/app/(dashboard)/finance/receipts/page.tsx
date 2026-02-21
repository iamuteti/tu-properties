"use client";

import Link from "next/link";
import { Plus, Search, Trash2, FileText } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/hooks/use-finance";
import { financeApi } from "@/lib/api";
import { Receipt } from "@/types";
import { useState, useMemo } from "react";
import { ReceiptFilters, type ReceiptFiltersState } from "@/components/filters/receipts-filter";
import { getDateRangeForPeriod } from "@/components/filters/period-selector";

// Define columns for the DataTable
const columns: ColumnDef<Receipt>[] = [
  {
    accessorKey: "receiptId",
    header: "Rcpt #",
    cell: ({ row }) => row.original.receiptId,
  },
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
          {method}
        </span>
      );
    },
  },
  {
    accessorKey: "refNo",
    header: "Ref. No.",
    cell: ({ row }) => row.original.refNo || row.original.paymentRefNo || "-",
  },
  {
    accessorKey: "recordingDate",
    header: "Date",
    cell: ({ row }) => new Date(row.original.recordingDate).toLocaleDateString(),
  },
  {
    accessorKey: "particulars",
    header: "Particulars",
    cell: ({ row }) => row.original.notes || "Receipt",
  },
  {
    accessorKey: "depositIntoAc",
    header: "Deposit Account",
    cell: ({ row }) => row.original.depositIntoAc || "-",
  },
  {
    accessorKey: "customer",
    header: "Customer",
    cell: ({ row }) => row.original.tenant?.surname || row.original.receivedFrom || "Unknown",
  },
  {
    accessorKey: "amountReceived",
    header: "Amount",
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {row.original.currency} {Number(row.original.amountReceived).toFixed(2)}
      </div>
    ),
  },
  {
    accessorKey: "recordedBy",
    header: "Recorded By",
    cell: ({ row }) => row.original.recordedBy || "-",
  },
];

export default function ReceiptsPage() {
  const { receipts: allReceipts, isLoading, error, refetch } = useFinance({ receipts: true });
  const [selectedReceipts, setSelectedReceipts] = useState<Receipt[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState<ReceiptFiltersState>({
    search: '',
    period: 'all',
    fromDate: '',
    toDate: '',
    paymentMethod: '',
    receiptNumber: '',
    refNumber: '',
    customer: '',
    cashbook: '',
    minAmount: '',
    maxAmount: '',
    reversedOnly: false,
    excludeReversed: false,
    nonCurrentPeriodReversalOnly: false,
    banked: '',
  });

  // Apply filters to receipts
  const receipts = useMemo(() => {
    return allReceipts.filter(receipt => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          receipt.receiptId?.toLowerCase().includes(searchLower) ||
          receipt.receivedFrom?.toLowerCase().includes(searchLower) ||
          receipt.refNo?.toLowerCase().includes(searchLower) ||
          receipt.paymentRefNo?.toLowerCase().includes(searchLower) ||
          receipt.tenant?.surname?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Receipt # filter
      if (filters.receiptNumber) {
        if (!receipt.receiptId.toLowerCase().includes(filters.receiptNumber.toLowerCase())) return false;
      }

      // Ref # filter
      if (filters.refNumber) {
        const refNumberLower = filters.refNumber.toLowerCase();
        const matchesRef = 
          receipt.refNo?.toLowerCase().includes(refNumberLower) ||
          receipt.paymentRefNo?.toLowerCase().includes(refNumberLower);
        if (!matchesRef) return false;
      }

      // Customer filter
      if (filters.customer) {
        const customerLower = filters.customer.toLowerCase();
        const matchesCustomer = 
          receipt.receivedFrom?.toLowerCase().includes(customerLower) ||
          receipt.tenant?.surname?.toLowerCase().includes(customerLower);
        if (!matchesCustomer) return false;
      }

      // Cashbook filter
      if (filters.cashbook) {
        const cashbookLower = filters.cashbook.toLowerCase();
        const matchesCashbook = 
          receipt.depositIntoAc?.toLowerCase().includes(cashbookLower);
        if (!matchesCashbook) return false;
      }

      // Min Amount filter
      if (filters.minAmount) {
        const minAmount = parseFloat(filters.minAmount);
        if (receipt.amountReceived < minAmount) return false;
      }

      // Max Amount filter
      if (filters.maxAmount) {
        const maxAmount = parseFloat(filters.maxAmount);
        if (receipt.amountReceived > maxAmount) return false;
      }

      // Reversed filters
      if (filters.reversedOnly) {
        // Assuming receipt has an isReversed or reversed property
        if (!receipt.isReversed) return false;
      }

      if (filters.excludeReversed) {
        if (receipt.isReversed) return false;
      }

      if (filters.nonCurrentPeriodReversalOnly) {
        // Logic to check for non-current period reversals
        if (!receipt.isReversed || receipt.reversalPeriod === 'current') return false;
      }

      // Banked filter
      if (filters.banked === 'banked') {
        if (!receipt.bankingDate) return false;
      } else if (filters.banked === 'unbanked') {
        if (receipt.bankingDate) return false;
      }

      // Date filters based on period
      const receiptDate = new Date(receipt.recordingDate);
      
      if (filters.period && filters.period !== 'all') {
        const { start, end } = getDateRangeForPeriod(filters.period);
        
        if (start && end) {
          if (receiptDate < start || receiptDate >= end) return false;
        } else if (filters.period === 'custom') {
          if (filters.fromDate && receiptDate < new Date(filters.fromDate)) return false;
          if (filters.toDate && receiptDate > new Date(filters.toDate)) return false;
        }
      }

      // Payment method filter
      if (filters.paymentMethod) {
        if (receipt.paymentMethod !== filters.paymentMethod) return false;
      }

      return true;
    });
  }, [allReceipts, filters]);

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedReceipts.length} receipt(s)?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const ids = selectedReceipts.map((receipt) => receipt.id);
      await financeApi.deleteReceipts(ids);
      setSelectedReceipts([]);
      refetch();
    } catch (err) {
      console.error("Failed to delete receipts:", err);
      alert("Failed to delete receipts. Please try again.");
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
      receiptNumber: '',
      refNumber: '',
      customer: '',
      cashbook: '',
      minAmount: '',
      maxAmount: '',
      reversedOnly: false,
      excludeReversed: false,
      nonCurrentPeriodReversalOnly: false,
      banked: '',
    });
  };

  if (isLoading) {
    return <div>Loading receipts...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
          <p className="text-muted-foreground">
            Manage receipts and track transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedReceipts.length > 0 && (
            <>
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedReceipts.length})
              </Button>
              <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Print ({selectedReceipts.length})
              </Button>
            </>
          )}
          <Link href="/dashboard/receipts/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Receipt
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <ReceiptFilters
        filters={filters}
        onFiltersChange={setFilters}
        onReset={handleResetFilters}
      />

      {/* Data Table */}
      <DataTable
        data={receipts}
        columns={columns}
        searchPlaceholder="Search receipts..."
        searchColumns={[
          { id: "receiptId", label: "Receipt Number" },
          { id: "receivedFrom", label: "Received From" },
          { id: "refNo", label: "Reference" },
        ]}
        emptyMessage="No receipts found. Create your first receipt to get started."
        emptyIcon={<Search className="mx-auto h-12 w-12 text-slate-400" />}
        defaultPageSize={10}
        pageSizeOptions={[10, 20, 30, 40, 50]}
        enableRowSelection
        enableSearch={false}
        onRowSelectionChange={setSelectedReceipts}
      />
    </div>
  );
}