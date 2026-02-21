"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PERIODS } from "@/lib/constants";

// Helper function to get date range for a period
export function getDateRangeForPeriod(period: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (period) {
    case 'today':
      return { start: today, end: tomorrow };
    case 'yesterday':
      return { start: yesterday, end: today };
    case 'todayYesterday':
      return { start: yesterday, end: tomorrow };
    case 'thisWeek': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    case 'lastWeek': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    case 'lastWeekToDate': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 7);
      return { start, end: today };
    }
    case 'lastWeekButOne': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 14);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    case 'lastTwoWeeks': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay() - 14);
      const end = new Date(today);
      end.setDate(end.getDate() - end.getDay());
      return { start, end };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start, end };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end };
    }
    case 'lastMonthToDate': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { start, end: today };
    }
    case 'lastMonthButOne': {
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { start, end };
    }
    case 'lastTwoMonths': {
      const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end };
    }
    case 'thisQuarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), quarter * 3, 1);
      const end = new Date(today.getFullYear(), (quarter + 1) * 3, 1);
      return { start, end };
    }
    case 'lastQuarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), (quarter - 1) * 3, 1);
      const end = new Date(today.getFullYear(), quarter * 3, 1);
      return { start, end };
    }
    case 'thisYear': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear() + 1, 0, 1);
      return { start, end };
    }
    case 'financialYearToLastMonth': {
      // Assuming financial year starts in July
      const start = new Date(today.getFullYear(), today.getMonth() >= 6 ? 6 : -6, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end };
    }
    case 'lastYear': {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear(), 0, 1);
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
}

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
  periodLabel = 'Period',
  fromLabel = 'From',
  toLabel = 'To',
  startLabel = 'Start Date',
  endLabel = 'End Date',
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {showPeriod && (
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-sm font-medium leading-none">
            {periodLabel}
          </label>
          <Select
            value={period || 'all'}
            onChange={(e) => onPeriodChange(e.target.value)}
            options={[{ value: 'all', label: 'All' }, ...PERIODS.map(p => ({ value: p.value, label: p.label }))]}
          />
        </div>
      )}

      {showCustomRange && period === 'custom' && onFromDateChange && (
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-sm font-medium leading-none">
            {fromLabel}
          </label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
          />
        </div>
      )}

      {showCustomRange && period === 'custom' && onToDateChange && (
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-sm font-medium leading-none">
            {toLabel}
          </label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
          />
        </div>
      )}

      {showStartDate && onStartDateChange && (
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-sm font-medium leading-none">
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
        <div className="space-y-2 flex-1 min-w-[150px]">
          <label className="text-sm font-medium leading-none">
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
