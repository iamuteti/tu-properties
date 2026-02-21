"use client";

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
    filters.status ||
    filters.customer ||
    filters.transactionClass
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Invoice Number */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Invoice #
          </label>
          <Input
            type="text"
            placeholder="Search invoice number..."
            value={filters.invoiceNumber || ''}
            onChange={(e) => handleFilterChange('invoiceNumber', e.target.value)}
          />
        </div>

        {/* Period with custom date range */}
        <div className="md:col-span-2">
          <PeriodSelector
            period={filters.period}
            onPeriodChange={(period) => handleFilterChange('period', period)}
            fromDate={filters.fromDate}
            onFromDateChange={(date) => handleFilterChange('fromDate', date)}
            toDate={filters.toDate}
            onToDateChange={(date) => handleFilterChange('toDate', date)}
            showCustomRange
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Status
          </label>
          <Select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            options={[
              { value: '', label: 'All' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
              { value: 'PAID', label: 'Paid' },
              { value: 'OVERDUE', label: 'Overdue' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
        </div>

        {/* Customer */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Customer
          </label>
          <Select
            value={filters.customer || ''}
            onChange={(e) => handleFilterChange('customer', e.target.value)}
            options={[
              { value: '', label: 'All' },
              ...uniqueCustomers.map((customer) => ({
                value: customer,
                label: customer
              })),
            ]}
          />
        </div>

        {/* Transaction Class */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Transaction Class
          </label>
          <Select
            value={filters.transactionClass || ''}
            onChange={(e) => handleFilterChange('transactionClass', e.target.value)}
            options={[
              { value: '', label: 'All' },
              ...TRANSACTION_CLASSES.map((cls: any) => ({
                value: cls.value,
                label: cls.label
              })),
            ]}
          />
        </div>
      </div>

      {/* Reset Filters */}
      {hasActiveFilters && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onReset}>
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}
