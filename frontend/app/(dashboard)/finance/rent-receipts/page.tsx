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
import { RentReceiptFilters, type RentReceiptFiltersState } from "@/components/filters/rent-receipts-filter";
import { getDateRangeForPeriod } from "@/components/filters/period-selector";

// Define columns for the DataTable
const columns: ColumnDef<Receipt>[] = [
  {
    accessorKey: "receiptId",
    header: "Rcpt #",
    cell: ({ row }) => row.original.receiptId,
  },
  {
    accessorKey: "recordingDate",
    header: "Received Date",
    cell: ({ row }) => new Date(row.original.recordingDate).toLocaleDateString(),
  },
  {
    accessorKey: "recordDate",
    header: "Record Date",
    cell: ({ row }) => row.original.recordDate ? new Date(row.original.recordDate).toLocaleDateString() : "-",
  },
  {
    accessorKey: "paymentMethod",
    header: "Pmt Method",
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
    accessorKey: "paymentRefNo",
    header: "Ref. No.",
    cell: ({ row }) => row.original.paymentRefNo || row.original.refNo || "-",
  },
  {
    accessorKey: "unitSpace",
    header: "Unit/Space",
    cell: ({ row }) => row.original.tenant?.accountNumber || "-",
  },
  {
    accessorKey: "tenantResident",
    header: "Tenant/Resident",
    cell: ({ row }) => row.original.tenant?.surname || row.original.receivedFrom || "Unknown",
  },
  {
    accessorKey: "phoneNo",
    header: "Phone No.",
    cell: ({ row }) => row.original.tenant?.phone || "-",
  },
  {
    accessorKey: "amountReceived",
    header: "Amount",
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {row.original.currency || "KSH"} {Number(row.original.amountReceived).toFixed(2)}
      </div>
    ),
  },
  {
    accessorKey: "receivedBy",
    header: "Received By",
    cell: ({ row }) => row.original.recordedBy || "-",
  },
];

export default function RentReceiptsPage() {
  const { receipts: allReceipts, isLoading, error, refetch } = useFinance({ receipts: true });
  const [selectedReceipts, setSelectedReceipts] = useState<Receipt[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState<RentReceiptFiltersState>({
    search: '',
    period: 'all',
    fromDate: '',
    toDate: '',
    paymentMethod: '',
    receiptNumber: '',
    refNumber: '',
    tenantResident: '',
    property: '',
    unitSpace: '',
    minAmount: '',
    maxAmount: '',
    reversedOnly: false,
    excludeReversed: false,
    nonCurrentPeriodReversalOnly: false,
    banked: '',
  });

  // Apply filters to receipts (only show rent receipts)
  const rentReceipts = useMemo(() => {
    return allReceipts.filter(receipt => {
      // Only show rent receipts
      if (receipt.receiptCategory !== 'Rent') return false;

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

      // Tenant/Resident filter
      if (filters.tenantResident) {
        const tenantLower = filters.tenantResident.toLowerCase();
        const matchesTenant = 
          receipt.receivedFrom?.toLowerCase().includes(tenantLower) ||
          receipt.tenant?.surname?.toLowerCase().includes(tenantLower);
        if (!matchesTenant) return false;
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
        if (!receipt.isReversed) return false;
      }

      if (filters.excludeReversed) {
        if (receipt.isReversed) return false;
      }

      if (filters.nonCurrentPeriodReversalOnly) {
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
      tenantResident: '',
      property: '',
      unitSpace: '',
      minAmount: '',
      maxAmount: '',
      reversedOnly: false,
      excludeReversed: false,
      nonCurrentPeriodReversalOnly: false,
      banked: '',
    });
  };

  if (isLoading) {
    return <div>Loading rent receipts...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rent Receipts</h1>
          <p className="text-muted-foreground">
            Manage your rent receipts and track payments
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
          <Link href="/dashboard/finance/rent-receipts/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Rent Receipt
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <RentReceiptFilters
        filters={filters}
        onFiltersChange={setFilters}
        onReset={handleResetFilters}
      />

      {/* Data Table */}
      <DataTable
        data={rentReceipts}
        columns={columns}
        searchPlaceholder="Search rent receipts..."
        searchColumns={[
          { id: "receiptId", label: "Receipt Number" },
          { id: "receivedFrom", label: "Received From" },
          { id: "paymentRefNo", label: "Reference" },
        ]}
        emptyMessage="No rent receipts found. Create your first rent receipt to get started."
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
