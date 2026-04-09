"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Search, X } from "lucide-react";

export interface TenantFiltersState {
  code: string;
  name: string;
  status: string;
  withDeposit: boolean;
}

interface TenantFiltersProps {
  filters: TenantFiltersState;
  onFiltersChange: (filters: TenantFiltersState) => void;
  onReset: () => void;
}

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" }
];

export function TenantFilters({
  filters,
  onFiltersChange,
  onReset,
}: TenantFiltersProps) {
  const handleFilterChange = (key: keyof TenantFiltersState, value: string | boolean) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const hasActiveFilters = Boolean(
    filters.code ||
    filters.name ||
    filters.status ||
    filters.withDeposit
  );

  const handleApplyFilters = () => {
    // This will be handled by the parent component
    // The onFiltersChange prop should trigger the parent to apply filters
    onFiltersChange(filters);
  };

  return (
    <div className="relative z-50 rounded-lg border border-slate-200 bg-white/50 backdrop-blur-sm p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Code</label>
          <Input
            placeholder="Filter by code..."
            value={filters.code}
            onChange={(e) => handleFilterChange('code', e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Name</label>
          <Input
            placeholder="Filter by name..."
            value={filters.name}
            onChange={(e) => handleFilterChange('name', e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Status</label>
          <Select
            options={statusOptions}
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            placeholder="All statuses"
          />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs">
          <Toggle
            label="Deposit Required"
            checked={filters.withDeposit}
            onChange={(checked) => handleFilterChange('withDeposit', checked)}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleApplyFilters}>
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={onReset}>
              <X className="mr-2 h-4 w-4" /> Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}