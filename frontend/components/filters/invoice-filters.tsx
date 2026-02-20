"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PeriodSelector } from "./period-selector";
import { TRANSACTION_CLASSES } from "@/lib/constants";

export interface InvoiceFiltersState {
  invoiceNumber: string;
  period: string;
  fromDate: string;
  toDate: string;
  startDate: string;
  endDate: string;
  status: string;
  customer: string;
  transactionClass: string;
}

interface InvoiceFiltersProps {
  filters: InvoiceFiltersState;
  onFiltersChange: (filters: InvoiceFiltersState) => void;
  onReset: () => void;
  uniqueCustomers: string[];
}

export function InvoiceFilters({
  filters,
  onFiltersChange,
  onReset,
  uniqueCustomers,
}: InvoiceFiltersProps) {
  const handleFilterChange = (key: keyof InvoiceFiltersState, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const hasActiveFilters = Boolean(
    filters.invoiceNumber ||
    filters.period !== 'all' ||
    filters.fromDate ||
    filters.toDate ||
    filters.startDate ||
    filters.endDate ||
    filters.status ||
    filters.customer ||
    filters.transactionClass
  );

  return (
    <div className="relative z-20 bg-white/50 backdrop-blur-sm shadow-lg shadow-slate-900/10 rounded-xl border border-slate-200 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">Invoice #</label>
          <Input
            type="text"
            placeholder="Search invoice number..."
            value={filters.invoiceNumber || ''}
            onChange={(e) => handleFilterChange('invoiceNumber', e.target.value)}
          />
        </div>

        <PeriodSelector
          period={filters.period}
          onPeriodChange={(period) => handleFilterChange('period', period)}
          fromDate={filters.fromDate}
          onFromDateChange={(date) => handleFilterChange('fromDate', date)}
          toDate={filters.toDate}
          onToDateChange={(date) => handleFilterChange('toDate', date)}
          showCustomRange
        />

        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>

        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>

        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
          <Select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">Customer</label>
          <Select
            value={filters.customer}
            onChange={(e) => handleFilterChange('customer', e.target.value)}
          >
            <option value="">All</option>
            {uniqueCustomers.map((customer) => (
              <option key={customer} value={customer}>
                {customer}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">Transaction Class</label>
          <Select
            value={filters.transactionClass}
            onChange={(e) => handleFilterChange('transactionClass', e.target.value)}
          >
            <option value="">All</option>
            {TRANSACTION_CLASSES.map((cls) => (
              <option key={cls.value} value={cls.value}>
                {cls.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <Button onClick={onReset} variant="outline" size="icon" title="Reset filters">
            <RotateCcw className="h-4 w-4" />
          </Button>
          {hasActiveFilters && (
            <Button onClick={onReset} variant="ghost" size="icon" title="Clear all filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
