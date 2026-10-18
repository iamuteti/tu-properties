import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type Column,
  type Table as TableType,
  type PaginationState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';

type SearchTargetObject<T> = {
  id: string;
  label: string;
  placeholder?: string;
  columns?: (keyof T)[];
  accessor?: (row: T) => string;
};

type SearchTarget<T> = SearchTargetObject<T> | keyof T;

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchColumns?: SearchTarget<T>[];
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  enableMultiSearch?: boolean;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  enableRowSelection?: boolean;
  enableSearch?: boolean;
  onRowSelectionChange?: (selectedRows: T[]) => void;
  // Server-side pagination props
  serverSidePagination?: boolean;
  paginationMeta?: PaginationMeta;
  onPaginationChange?: (pagination: { page: number; limit: number }) => void;
  onSearchChange?: (search: string) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchColumns,
  emptyMessage = 'No data available',
  emptyIcon,
  pageSizeOptions = [10, 20, 30, 40, 50],
  defaultPageSize = 10,
  enableMultiSearch = false,
  enableRowSelection = false,
  onRowSelectionChange,
  enableSearch = true,
  serverSidePagination = false,
  paginationMeta,
  onPaginationChange,
  onSearchChange,
  onSortChange,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [multiSearchValues, setMultiSearchValues] = React.useState<Record<string, string>>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // Use refs for callbacks to avoid stale closures and infinite loops
  const onSearchChangeRef = React.useRef(onSearchChange);
  const onPaginationChangeRef = React.useRef(onPaginationChange);
  const onSortChangeRef = React.useRef(onSortChange);

  React.useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);
  React.useEffect(() => {
    onPaginationChangeRef.current = onPaginationChange;
  }, [onPaginationChange]);
  React.useEffect(() => {
    onSortChangeRef.current = onSortChange;
  }, [onSortChange]);

  // Track previous values to avoid notifying on initial render
  const prevPaginationRef = React.useRef<{ pageIndex: number; pageSize: number } | null>(null);

  // Debounce global filter
  const [debouncedGlobalFilter, setDebouncedGlobalFilter] = React.useState(globalFilter);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGlobalFilter(globalFilter);
      if (serverSidePagination && onSearchChangeRef.current) {
        onSearchChangeRef.current(globalFilter);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter, serverSidePagination]);

  // Notify parent of pagination changes in server-side mode
  React.useEffect(() => {
    if (!serverSidePagination) return;
    const prev = prevPaginationRef.current;
    const current = { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize };
    // Skip initial render
    if (prev && (prev.pageIndex !== current.pageIndex || prev.pageSize !== current.pageSize)) {
      onPaginationChangeRef.current?.({
        page: current.pageIndex + 1,
        limit: current.pageSize,
      });
    }
    prevPaginationRef.current = current;
  }, [pagination.pageIndex, pagination.pageSize, serverSidePagination]);

  // Notify parent of sort changes in server-side mode
  const prevSortingRef = React.useRef<SortingState | null>(null);

  React.useEffect(() => {
    if (!serverSidePagination) return;
    const prev = prevSortingRef.current;
    if (sorting.length > 0) {
      const currentSort = { id: sorting[0].id, desc: sorting[0].desc };
      const prevSort = prev && prev.length > 0 ? { id: prev[0].id, desc: prev[0].desc } : null;
      if (!prevSort || prevSort.id !== currentSort.id || prevSort.desc !== currentSort.desc) {
        onSortChangeRef.current?.(currentSort.id, currentSort.desc ? 'desc' : 'asc');
      }
    }
    prevSortingRef.current = sorting;
  }, [sorting, serverSidePagination]);

  // Debounce multi-search values
  const [debouncedMultiSearch, setDebouncedMultiSearch] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMultiSearch(multiSearchValues);
    }, 300);
    return () => clearTimeout(timer);
  }, [multiSearchValues]);

  const searchTargets = React.useMemo(() => {
    if (searchColumns?.length) return searchColumns;
    return [] as SearchTarget<T>[];
  }, [searchColumns]);

  const hasSearch = Boolean(searchColumns?.length && enableSearch);

  const globalSearchFn = React.useCallback<FilterFn<T>>(
    (row, _columnId, filterValue) => {
      const search = String(filterValue ?? '').trim().toLowerCase();
      if (!search) return true;

      return searchTargets.some((target) => {
        if (typeof target === 'string' || typeof target === 'number' || typeof target === 'symbol') {
          const value = row.original[target];
          return value !== undefined && value !== null && String(value).toLowerCase().includes(search);
        }

        const valueFromAccessor = target.accessor?.(row.original);
        if (valueFromAccessor !== undefined && valueFromAccessor !== null) {
          return String(valueFromAccessor).toLowerCase().includes(search);
        }

        if (target.columns?.length) {
          const joined = target.columns
            .map((col: keyof T) => row.original[col])
            .filter((val) => val !== undefined && val !== null)
            .map((val) => String(val))
            .join(' ')
            .trim();

          if (!joined) return false;
          return joined.toLowerCase().includes(search);
        }

        return false;
      });
    },
    [searchTargets]
  );

  // Multi-search function for individual column searches
  const multiSearchFn = React.useCallback<FilterFn<T>>(
    (row, columnId, filterValue) => {
      const search = String(filterValue ?? '').trim().toLowerCase();
      if (!search) return true;

      const value = row.original[columnId];
      if (value === undefined || value === null) return false;
      return String(value).toLowerCase().includes(search);
    },
    []
  );

  // Build column filters for multi-search
  const columnFiltersForTable = React.useMemo(() => {
    const filters: ColumnFiltersState = [];
    
    if (enableMultiSearch && searchColumns?.length) {
      searchColumns.forEach((target) => {
        if (typeof target === 'string' || typeof target === 'number' || typeof target === 'symbol') {
          const value = debouncedMultiSearch[String(target)];
          if (value) {
            filters.push({ id: String(target), value });
          }
        } else if (target.id && typeof target === 'object') {
          const value = debouncedMultiSearch[target.id];
          if (value) {
            filters.push({ id: target.id, value });
          }
        }
      });
    }
    
    return filters;
  }, [debouncedMultiSearch, enableMultiSearch, searchColumns]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: serverSidePagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: serverSidePagination ? undefined : getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: hasSearch ? globalSearchFn : 'includesString',
    // @ts-ignore - columnFilters is valid in TanStack Table v8 but types may not be fully recognized
    columnFilters: [...columnFilters, ...columnFiltersForTable],
    onPaginationChange: setPagination,
    getRowId: (row, index) => (row.id as string) || String(index),
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      setRowSelection((prevRowSelection) => {
        const newSelection = typeof updater === 'function' 
          ? updater(prevRowSelection) 
          : updater;
        return newSelection;
      });
    },
    manualPagination: serverSidePagination,
    manualSorting: serverSidePagination,
    pageCount: serverSidePagination ? (paginationMeta?.totalPages ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      globalFilter: debouncedGlobalFilter,
      pagination,
      rowSelection,
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

  // Callback for row selection changes (moved after table declaration)
  React.useEffect(() => {
    if (onRowSelectionChange && table) {
      const selectedRows = Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((key) => table.getRow(key)?.original)
        .filter(Boolean);
      onRowSelectionChange(selectedRows as T[]);
    }
  }, [rowSelection, onRowSelectionChange, table]);

  return (
    <div className="space-y-4">
      {/* Search */}
      {hasSearch && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Global Search */}
          {!enableMultiSearch && (
            <div className="flex-1 max-w-sm">
              <Input
                type="text"
                placeholder={searchPlaceholder}
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(String(event.target.value))}
              />
            </div>
          )}

          {/* Multi-Search */}
          {enableMultiSearch && searchColumns && (
            <div className="flex flex-wrap gap-2">
              {searchColumns.map((target) => {
                const targetId = typeof target === 'string' || typeof target === 'number' || typeof target === 'symbol'
                  ? String(target)
                  : target.id;
                const targetLabel = typeof target === 'object' && 'label' in target 
                  ? target.label 
                  : String(targetId);
                const targetPlaceholder = typeof target === 'object' && 'placeholder' in target
                  ? target.placeholder
                  : `Search ${targetLabel}...`;

                return (
                  <div key={targetId} className="flex-1 min-w-[150px] max-w-xs">
                    <Input
                      type="text"
                      placeholder={targetPlaceholder}
                      value={multiSearchValues[targetId] || ''}
                      onChange={(event) => 
                        setMultiSearchValues(prev => ({
                          ...prev,
                          [targetId]: String(event.target.value)
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card/50 backdrop-blur-sm shadow-lg rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {enableRowSelection && (
                    <th className="px-6 py-3 text-left text-xs font-light text-muted-foreground uppercase tracking-wider">
                      <input
                        type="checkbox"
                        className="rounded border-border text-cyan-600 focus:ring-cyan-500"
                        checked={table.getIsAllPageRowsSelected()}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                      />
                    </th>
                  )}
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-6 py-3 text-left text-xs font-light text-muted-foreground uppercase tracking-wider ${header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-muted' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {header.column.getCanSort() && (
                          <div className="flex flex-col ml-1">
                            <span className={`text-xs ${header.column.getIsSorted() === 'asc' ? 'text-foreground' : 'text-muted-foreground'}`}>
                              ▲
                            </span>
                            <span className={`text-xs -mt-1 ${header.column.getIsSorted() === 'desc' ? 'text-foreground' : 'text-muted-foreground'}`}>
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
                table.getRowModel().rows.map((row) => (
                  <tr 
                    key={row.id} 
                    className="hover:bg-muted transition-colors duration-150"
                    onClick={enableRowSelection ? () => row.toggleSelected() : undefined}
                    style={{ cursor: enableRowSelection ? 'pointer' : 'default' }}
                  >
                    {enableRowSelection && (
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                        className="rounded border-border text-primary focus:ring-ring"
                          checked={row.getIsSelected()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + (enableRowSelection ? 1 : 0)} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      {emptyIcon || (
                        <svg className="mx-auto h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      )}
                      <h3 className="mt-2 text-sm font-light text-foreground">{emptyMessage}</h3>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {(table.getPageCount() >= 1 || (serverSidePagination && paginationMeta && paginationMeta.totalPages > 0)) && (
        <div className="flex items-center justify-between px-2 sm:px-4">
          {/* Left: page size selector */}
          <div className="flex items-center space-x-2">
            <p className="text-sm text-foreground whitespace-nowrap">Show</p>
            <Select
              options={pageSizeOptions.map((size) => ({ value: size.toString(), label: size.toString() }))}
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
