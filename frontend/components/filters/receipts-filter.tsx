"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PeriodSelector } from "./period-selector";
import { PAYMENT_METHODS } from "@/lib/constants";

export interface ReceiptFiltersState {
  search: string;
  period: string;
  fromDate: string;
  toDate: string;
  paymentMethod: string;
  receiptNumber: string;
  refNumber: string;
  customer: string;
  cashbook: string;
  minAmount: string;
  maxAmount: string;
  reversedOnly: boolean;
  excludeReversed: boolean;
  nonCurrentPeriodReversalOnly: boolean;
  banked: string;
}

interface ReceiptFiltersProps {
  filters: ReceiptFiltersState;
  onFiltersChange: (filters: ReceiptFiltersState) => void;
  onReset: () => void;
}

export function ReceiptFilters({
  filters,
  onFiltersChange,
  onReset,
}: ReceiptFiltersProps) {
  const handleFilterChange = (key: keyof ReceiptFiltersState, value: string | boolean) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const hasActiveFilters = Boolean(
    filters.search ||
    filters.period !== 'all' ||
    filters.fromDate ||
    filters.toDate ||
    filters.paymentMethod ||
    filters.receiptNumber ||
    filters.refNumber ||
    filters.customer ||
    filters.cashbook ||
    filters.minAmount ||
    filters.maxAmount ||
    filters.reversedOnly ||
    filters.excludeReversed ||
    filters.nonCurrentPeriodReversalOnly ||
    filters.banked
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Receipt # */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Receipt #
          </label>
          <Input
            placeholder="Receipt #"
            value={filters.receiptNumber}
            onChange={(e) => handleFilterChange('receiptNumber', e.target.value)}
          />
        </div>

        {/* Ref # */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Ref #
          </label>
          <Input
            placeholder="Ref #"
            value={filters.refNumber}
            onChange={(e) => handleFilterChange('refNumber', e.target.value)}
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

        {/* Customer */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Customer
          </label>
          <Select
            options={[{ value: '', label: 'All Customers' }]}
            value={filters.customer}
            onChange={(e) => handleFilterChange('customer', e.target.value)}
          />
        </div>

        {/* Cashbook */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Cashbook
          </label>
          <Select
            options={[{ value: '', label: 'All Cashbooks' }]}
            value={filters.cashbook}
            onChange={(e) => handleFilterChange('cashbook', e.target.value)}
          />
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Payment Method
          </label>
          <Select
            options={[{ value: '', label: 'All Methods' }, ...PAYMENT_METHODS]}
            value={filters.paymentMethod}
            onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
          />
        </div>

        {/* Min Amount */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Min Amount
          </label>
          <Input
            type="number"
            placeholder="Min Amount"
            value={filters.minAmount}
            onChange={(e) => handleFilterChange('minAmount', e.target.value)}
          />
        </div>

        {/* Max Amount */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Max Amount
          </label>
          <Input
            type="number"
            placeholder="Max Amount"
            value={filters.maxAmount}
            onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
          />
        </div>

        {/* Reversed Only */}
        <div className="space-y-2 flex items-end">
          <label className="text-sm font-medium leading-none">
            Reversed Only
          </label>
          <input
            type="checkbox"
            checked={filters.reversedOnly}
            onChange={(e) => handleFilterChange('reversedOnly', e.target.checked)}
            className="ml-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        {/* Exclude Reversed */}
        <div className="space-y-2 flex items-end">
          <label className="text-sm font-medium leading-none">
            Excl. Reversed
          </label>
          <input
            type="checkbox"
            checked={filters.excludeReversed}
            onChange={(e) => handleFilterChange('excludeReversed', e.target.checked)}
            className="ml-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        {/* Non Current Period Reversal Only */}
        <div className="space-y-2 flex items-end">
          <label className="text-sm font-medium leading-none">
            Non Current Period Receipt Reversal Only
          </label>
          <input
            type="checkbox"
            checked={filters.nonCurrentPeriodReversalOnly}
            onChange={(e) => handleFilterChange('nonCurrentPeriodReversalOnly', e.target.checked)}
            className="ml-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        {/* Banked */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Banked
          </label>
          <Select
            options={[
              { value: '', label: 'All' },
              { value: 'banked', label: 'Banked' },
              { value: 'unbanked', label: 'Unbanked' }
            ]}
            value={filters.banked}
            onChange={(e) => handleFilterChange('banked', e.target.value)}
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
