"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PERIODS } from "@/lib/constants";

export interface PeriodSelectorProps {
  period: string;
  onPeriodChange: (period: string) => void;
  fromDate?: string;
  onFromDateChange?: (date: string) => void;
  toDate?: string;
  onToDateChange?: (date: string) => void;
  startDate?: string;
  onStartDateChange?: (date: string) => void;
  endDate?: string;
  onEndDateChange?: (date: string) => void;
  showPeriod?: boolean;
  showCustomRange?: boolean;
  showStartDate?: boolean;
  showEndDate?: boolean;
  periodLabel?: string;
  fromLabel?: string;
  toLabel?: string;
  startLabel?: string;
  endLabel?: string;
}

export function PeriodSelector({
  period,
  onPeriodChange,
  fromDate = '',
  onFromDateChange,
  toDate = '',
  onToDateChange,
  startDate = '',
  onStartDateChange,
  endDate = '',
  onEndDateChange,
  showPeriod = true,
  showCustomRange = true,
  showStartDate = false,
  showEndDate = false,
  periodLabel = 'Defined Period',
  fromLabel = 'From',
  toLabel = 'To',
  startLabel = 'Start Date',
  endLabel = 'End Date',
}: PeriodSelectorProps) {
  const handlePeriodChange = (e: { target: { value: string } }) => {
    const newPeriod = e.target.value;
    onPeriodChange(newPeriod);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      {showPeriod && (
        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {periodLabel}
          </label>
          <Select 
            value={period} 
            onChange={handlePeriodChange}
            options={[{ value: 'all', label: 'All' }, ...PERIODS.map(p => ({ value: p.value, label: p.label }))]}
            placeholder="Select period"
          />
        </div>
      )}

      {showCustomRange && period === 'custom' && (
        <>
          {onFromDateChange && (
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {fromLabel}
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => onFromDateChange(e.target.value)}
              />
            </div>
          )}

          {onToDateChange && (
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {toLabel}
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => onToDateChange(e.target.value)}
              />
            </div>
          )}
        </>
      )}

      {showStartDate && onStartDateChange && (
        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {startLabel}
          </label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
      )}

      {showEndDate && onEndDateChange && (
        <div className="min-w-[150px]">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {endLabel}
          </label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
