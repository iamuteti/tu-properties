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
        <div className="text-sm text-slate-500">
          {serverSidePagination
            ? (paginationMeta?.total ?? table.getFilteredRowModel().rows.length)
            : table.getFilteredRowModel().rows.length} total records
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/50 backdrop-blur-sm shadow-lg shadow-slate-900/10 rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider ${
                        header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-slate-100' : ''
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
            <tbody className="bg-white/50 divide-y divide-slate-200">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    <tr 
                      className={`hover:bg-slate-50 transition-colors duration-150 cursor-pointer ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td 
                          key={cell.id} 
                          className="px-4 py-3 text-sm text-slate-900"
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
                      <h3 className="mt-2 text-sm font-light text-slate-900">No data found</h3>
                      <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
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
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-slate-700 whitespace-nowrap">Show</p>
              <Select
                options={[10, 20, 30, 50].map(size => ({ value: size.toString(), label: size.toString() }))}
                value={table.getState().pagination.pageSize.toString()}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="w-20"
              />
              <p className="text-sm text-slate-700 whitespace-nowrap">per page</p>
            </div>
            <div className="h-5 w-px bg-slate-300" />
              <p className="text-sm text-slate-700">
                Page{' '}
                <span className="font-medium">{table.getState().pagination.pageIndex + 1}</span>
                {' '}of{' '}
                <span className="font-medium">{table.getPageCount()}</span>
                {' '}({' '}
                <span className="font-medium">
                  {serverSidePagination
                    ? (paginationMeta?.total ?? table.getFilteredRowModel().rows.length)
                    : table.getFilteredRowModel().rows.length}
                </span>
                {' '}total records)
              </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-xl -space-x-px gap-2" aria-label="Pagination">
              <Button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                variant="secondary"
                size="sm"
              >
                Previous
              </Button>
              <Button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                variant="secondary"
                size="sm"
              >
                Next
              </Button>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpandableTable;
