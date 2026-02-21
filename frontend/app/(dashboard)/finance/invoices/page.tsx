"use client";

import Link from "next/link";
import { Plus, Search, Trash2, FileText } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { useFinance } from "@/hooks/use-finance";
import { financeApi } from "@/lib/api";
import { Invoice } from "@/types";
import { useState, useMemo } from "react";
import { InvoiceFilters, InvoiceFiltersState } from "@/components/filters/invoice-filters";
import { getDateRangeForPeriod } from "@/components/filters/period-selector";

// Define columns for the DataTable
const columns: ColumnDef<Invoice>[] = [
  {
    accessorKey: "invoiceNumber",
    header: "Invoice #",
    cell: ({ row }) => (
      <Link href={`/dashboard/invoices/${row.original.id}`} className="font-medium text-blue-600 hover:text-blue-800">
        {row.original.invoiceNumber}
      </Link>
    ),
  },
  {
    accessorKey: "issueDate",
    header: "Invoice Date",
    cell: ({ row }) => new Date(row.original.issueDate).toLocaleDateString(),
  },
  {
    accessorKey: "dueDate",
    header: "Due Date",
    cell: ({ row }) => new Date(row.original.dueDate).toLocaleDateString(),
  },
  {
    accessorKey: "customer",
    header: "Customer",
    cell: ({ row }) => row.original.lease?.tenant?.surname || "Unknown",
  },
  {
    accessorKey: "memo",
    header: "Memo",
    cell: ({ row }) => (
      <div className="max-w-xs truncate" title={row.original.memo || "No memo"}>
        {row.original.memo || "No memo"}
      </div>
    ),
  },
  {
    accessorKey: "totalAmount",
    header: "Total Amount",
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {row.original.currency} {row.original.totalAmount}
      </div>
    ),
  },
  {
    accessorKey: "paidAmount",
    header: "Total Paid",
    cell: ({ row }) => (
      <div className="text-right">
        {row.original.currency} {row.original.paidAmount}
      </div>
    ),
  },
  {
    accessorKey: "balanceAmount",
    header: "Amount Due",
    cell: ({ row }) => (
      <div className="text-right font-medium text-red-600">
        {row.original.currency} {row.original.balanceAmount}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      let statusColor = "";
      
      switch (status) {
        case "PAID":
          statusColor = "bg-green-100 text-green-800";
          break;
        case "OVERDUE":
          statusColor = "bg-red-100 text-red-800";
          break;
        case "PARTIALLY_PAID":
          statusColor = "bg-yellow-100 text-yellow-800";
          break;
        case "PENDING":
          statusColor = "bg-blue-100 text-blue-800";
          break;
        case "DRAFT":
          statusColor = "bg-gray-100 text-gray-800";
          break;
        case "CANCELLED":
          statusColor = "bg-gray-100 text-gray-800";
          break;
      }
      
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
          {status}
        </span>
      );
    },
  },
];

export default function InvoicesPage() {
  const { invoices: allInvoices, isLoading, error, refetch } = useFinance({ invoices: true });
  const [selectedInvoices, setSelectedInvoices] = useState<Invoice[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filter states
  const [filters, setFilters] = useState<InvoiceFiltersState>({
    invoiceNumber: '',
    period: 'all',
    fromDate: '',
    toDate: '',
    status: '',
    customer: '',
    transactionClass: '',
  });

  // Apply filters to invoices
  const invoices = useMemo(() => {
    return allInvoices.filter(invoice => {
      // Invoice number filter
      if (filters.invoiceNumber) {
        if (!invoice.invoiceNumber.toLowerCase().includes(filters.invoiceNumber.toLowerCase())) return false;
      }

      // Date filters based on period
      const invoiceDate = new Date(invoice.issueDate);
      
      if (filters.period && filters.period !== 'all') {
        const { start, end } = getDateRangeForPeriod(filters.period);
        
        if (start && end) {
          if (invoiceDate < start || invoiceDate >= end) return false;
        } else if (filters.period === 'custom') {
          if (filters.fromDate && invoiceDate < new Date(filters.fromDate)) return false;
          if (filters.toDate && invoiceDate > new Date(filters.toDate)) return false;
        }
      }

      // Status filter
      if (filters.status) {
        if (invoice.status !== filters.status) return false;
      }

      // Customer filter
      if (filters.customer) {
        const customerName = (invoice.lease?.tenant?.surname || '') + ' ' + (invoice.lease?.tenant?.otherNames || '');
        if (!customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      }

      // Transaction class filter
      if (filters.transactionClass) {
        if (!invoice.transactionClass?.toLowerCase().includes(filters.transactionClass.toLowerCase())) return false;
      }

      return true;
    });
  }, [allInvoices, filters]);

  // Get unique customers and transaction classes for filters
  const uniqueCustomers = Array.from(new Set(
    allInvoices
      .map(inv => inv.lease?.tenant?.surname && inv.lease?.tenant?.otherNames 
        ? `${inv.lease.tenant.surname} ${inv.lease.tenant.otherNames}` 
        : inv.lease?.tenant?.surname || '')
      .filter(Boolean)
  )).sort()

  const handleDeleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedInvoices.length} invoice(s)?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const ids = selectedInvoices.map((inv) => inv.id);
      await financeApi.deleteInvoices(ids);
      setSelectedInvoices([]);
      refetch();
    } catch (err) {
      console.error("Failed to delete invoices:", err);
      alert("Failed to delete invoices. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      invoiceNumber: '',
      period: 'all',
      fromDate: '',
      toDate: '',
      status: '',
      customer: '',
      transactionClass: '',
    });
  };

  if (isLoading) {
    return <div>Loading invoices...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage your invoices and track payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedInvoices.length > 0 && (
            <>
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedInvoices.length})
              </Button>
              <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Generate Receipts ({selectedInvoices.length})
              </Button>
            </>
          )}
          <Link href="/dashboard/invoices/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <InvoiceFilters
        filters={filters}
        onFiltersChange={setFilters}
        onReset={handleResetFilters}
        uniqueCustomers={uniqueCustomers}
      />

      {/* Data Table */}
      <DataTable
        data={invoices}
        columns={columns}
        searchPlaceholder="Search invoices..."
        searchColumns={[
          { id: "invoiceNumber", label: "Invoice Number" },
          { id: "customer", label: "Customer", accessor: (row) => row.lease?.tenant?.surname || "" },
          { id: "status", label: "Status" },
        ]}
        emptyMessage="No invoices found. Create your first invoice to get started."
        emptyIcon={<Search className="mx-auto h-12 w-12 text-slate-400" />}
        defaultPageSize={10}
        pageSizeOptions={[10, 20, 30, 40, 50]}
        enableRowSelection
        enableSearch={false}
        onRowSelectionChange={setSelectedInvoices}
      />
    </div>
  );
}
