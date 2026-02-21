"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PeriodSelector } from "./period-selector";
import { PAYMENT_METHODS } from "@/lib/constants";

export interface PaymentFiltersState {
  search: string;
  period: string;
  fromDate: string;
  toDate: string;
  paymentMethod: string;
  pvNumber: string;
  refNumber: string;
  payee: string;
  cashbook: string;
  minAmount: string;
  maxAmount: string;
}

interface PaymentFiltersProps {
  filters: PaymentFiltersState;
  onFiltersChange: (filters: PaymentFiltersState) => void;
  onReset: () => void;
}

export function PaymentFilters({
  filters,
  onFiltersChange,
  onReset,
}: PaymentFiltersProps) {
  const handleFilterChange = (key: keyof PaymentFiltersState, value: string) => {
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
    filters.pvNumber ||
    filters.refNumber ||
    filters.payee ||
    filters.cashbook ||
    filters.minAmount ||
    filters.maxAmount
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* PV # */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            PV #
          </label>
          <Input
            placeholder="PV #"
            value={filters.pvNumber}
            onChange={(e) => handleFilterChange('pvNumber', e.target.value)}
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

        {/* Payee */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Payee
          </label>
          <Input
            placeholder="Payee"
            value={filters.payee}
            onChange={(e) => handleFilterChange('payee', e.target.value)}
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
