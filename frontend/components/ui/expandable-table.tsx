"use client";

import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type ExpandedState,
} from '@tanstack/react-table';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';
import { Checkbox } from './checkbox';
import { 
  ChevronDown, 
  ChevronRight,
  ChevronLeft,
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2,
  Info,
  MoreHorizontal
} from 'lucide-react';

// Generic table data interface
export interface TableData {
  id: string;
  [key: string]: any;
}

interface ExpandableTableProps<TData extends TableData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  onRowSelect?: (selectedRows: TData[]) => void;
  onRowClick?: (row: TData) => void;
  serverSidePagination?: boolean;
  paginationMeta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  onPaginationChange?: (pagination: { page: number; limit: number }) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onSearchChange?: (search: string) => void;
  expandedRowComponent?: React.ComponentType<{ row: TData }>;
  pagination?: { pageIndex: number; pageSize: number };
}



// Format date helper
const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Calculate days until expiry
const calculateDaysToExpire = (endDate?: string): number => {
  if (!endDate) return 0;
  const end = new Date(endDate);
  const today = new Date();
  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Determine status based on days to expire and balance
// const determineStatus = (daysToExpire: number, balance: number): TenantTableData['status'] => {
//   if (balance > 0) return 'overdue';
//   if (daysToExpire <= 0) return 'expired';
//   if (daysToExpire <= 30) return 'expiring';
//   return 'active';
// };

export function ExpandableTable<TData extends TableData>({
  data,
  onRowSelect,
  onRowClick,
  serverSidePagination = false,
  paginationMeta,
  onPaginationChange,
  onSortChange,
  onSearchChange,
  columns: customColumns,
  expandedRowComponent: ExpandedRowDetailsComponent,
  pagination: controlledPagination,
}: ExpandableTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [pagination, setPagination] = useState(controlledPagination || {
    pageIndex: 0,
    pageSize: 10,
  });

  React.useEffect(() => {
    if (controlledPagination) {
      setPagination(controlledPagination);
    }
  }, [controlledPagination]);

  // Debounce global filter
  const [debouncedGlobalFilter, setDebouncedGlobalFilter] = useState(globalFilter);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGlobalFilter(globalFilter);
      if (serverSidePagination && onSearchChange) {
        onSearchChange(globalFilter);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter, serverSidePagination, onSearchChange]);

  // Track previous pagination to avoid initial notify
  const prevPaginationRef = React.useRef<{ pageIndex: number; pageSize: number } | null>(null);

  // Notify parent of pagination changes in server-side mode
  React.useEffect(() => {
    if (!serverSidePagination) return;
    const prev = prevPaginationRef.current;
    const current = { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize };
    if (prev && (prev.pageIndex !== current.pageIndex || prev.pageSize !== current.pageSize)) {
      onPaginationChange?.({
        page: current.pageIndex + 1,
        limit: current.pageSize,
      });
    }
    prevPaginationRef.current = current;
  }, [pagination.pageIndex, pagination.pageSize, serverSidePagination, onPaginationChange]);

  // Notify parent of sort changes in server-side mode
  const prevSortingRef = React.useRef<SortingState | null>(null);

  React.useEffect(() => {
    if (!serverSidePagination) return;
    const prev = prevSortingRef.current;
    if (sorting.length > 0) {
      const currentSort = { id: sorting[0].id, desc: sorting[0].desc };
      const prevSort = prev && prev.length > 0 ? { id: prev[0].id, desc: prev[0].desc } : null;
      if (!prevSort || prevSort.id !== currentSort.id || prevSort.desc !== currentSort.desc) {
        onSortChange?.(currentSort.id, currentSort.desc ? 'desc' : 'asc');
      }
    }
    prevSortingRef.current = sorting;
  }, [sorting, serverSidePagination, onSortChange]);

  // Process data to add computed fields if needed
  const processedData = useMemo(() => {
    return data; // For generic table, no specific processing
  }, [data]);

  // Use provided columns
  const columns = customColumns;

  const table = useReactTable({
    data: processedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: serverSidePagination ? undefined : getFilteredRowModel(),
    getPaginationRowModel: serverSidePagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: serverSidePagination ? undefined : getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(newSelection);
      if (onRowSelect) {
        const selectedRows = table.getSelectedRowModel().rows.map(row => row.original);
        onRowSelect(selectedRows);
      }
    },
    onExpandedChange: setExpanded,
    getRowId: (row) => row.id,
    manualPagination: serverSidePagination,
    manualSorting: serverSidePagination,
    pageCount: serverSidePagination ? (paginationMeta?.totalPages ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      globalFilter: serverSidePagination ? debouncedGlobalFilter : globalFilter,
      rowSelection,
      expanded,
      pagination,
    },
    initialState: {
      rowSelection: {},
      expanded: {},
    },
  });

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex + 1;

  // Visible page numbers: current page ±2, bounded to [1, pageCount], with ellipsis
  const visiblePages = React.useMemo(() => {
    const pages: (number | '...')[] = [];
    if (!pageCount || pageCount <= 1) return pages;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(pageCount, currentPage + 2);
    if (start > 1) pages.push(1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < pageCount - 1) pages.push('...');
    if (end < pageCount) pages.push(pageCount);
    return pages;
  }, [currentPage, pageCount]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 max-w-sm">
          <Input
            type="text"
            placeholder="Search..."
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(String(event.target.value))}
            className="w-full"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {serverSidePagination
            ? (paginationMeta?.total ?? table.getFilteredRowModel().rows.length)
            : table.getFilteredRowModel().rows.length} total records
        </div>
      </div>

      {/* Table */}
      <div className="bg-card/50 backdrop-blur-sm shadow-lg shadow-slate-900/10 rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${
                        header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-muted' : ''
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ width: header.getSize() }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {header.column.getCanSort() && (
                          <div className="flex flex-col">
                            <span className={`text-xs ${header.column.getIsSorted() === 'asc' ? 'text-cyan-600' : 'text-slate-300'}`}>
                              ▲
                            </span>
                            <span className={`text-xs -mt-0.5 ${header.column.getIsSorted() === 'desc' ? 'text-cyan-600' : 'text-slate-300'}`}>
                              ▼
                            </span>
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-card/50 divide-y divide-border">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    <tr 
                      className={`hover:bg-muted transition-colors duration-150 cursor-pointer ${
                        index % 2 === 0 ? 'bg-card' : 'bg-muted/50'
                      }`}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td 
                          key={cell.id} 
                          className="px-4 py-3 text-sm text-foreground"
                          onClick={(e) => {
                            if (cell.column.id === 'actions') {
                              e.stopPropagation();
                            }
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {/* Expanded row details */}
                    {row.getIsExpanded() && (
                      <tr key={`${row.id}-expanded`}>
                        <td colSpan={columns.length} className="p-0">
                          {ExpandedRowDetailsComponent && (
                            <ExpandedRowDetailsComponent row={row.original} />
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <Info className="h-12 w-12 text-slate-400" />
                      <h3 className="mt-2 text-sm font-light text-foreground">No data found</h3>
                      <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {table.getPageCount() >= 1 && (
        <div className="flex items-center justify-between px-2 sm:px-4">
          {/* Left: page size selector */}
          <div className="flex items-center space-x-2">
            <p className="text-sm text-foreground whitespace-nowrap">Show</p>
            <Select
              options={[10, 20, 30, 50].map(size => ({ value: size.toString(), label: size.toString() }))}
              value={table.getState().pagination.pageSize.toString()}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="w-20"
            />
            <p className="text-sm text-foreground whitespace-nowrap">per page</p>
          </div>

          {/* Center: page numbers */}
          <div className="hidden sm:flex items-center space-x-1">
            {visiblePages.map((page, idx) => {
              const isEllipsis = typeof page === 'string';
              const isCurrent = !isEllipsis && page === currentPage;
              return (
                <button
                  key={idx}
                  onClick={isEllipsis ? undefined : () => table.setPageIndex(page - 1)}
                  disabled={isEllipsis}
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {isEllipsis ? '···' : page}
                </button>
              );
            })}
          </div>

          {/* Right: prev / next icon buttons */}
          <div className="flex items-center space-x-1">
            <Button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              variant="outline"
              size="icon"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              variant="outline"
              size="icon"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpandableTable;
