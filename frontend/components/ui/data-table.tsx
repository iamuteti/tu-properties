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
} from '@tanstack/react-table';
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

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  /**
   * @deprecated Use searchColumns for multiple or virtual search fields.
   */
  searchColumn?: keyof T;
  searchColumns?: SearchTarget<T>[];
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  enableMultiSearch?: boolean;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /** Enable row selection */
  enableRowSelection?: boolean;
  /** Callback when rows are selected */
  onRowSelectionChange?: (selectedRows: T[]) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchColumn,
  searchColumns,
  emptyMessage = 'No data available',
  emptyIcon,
  pageSizeOptions = [10, 20, 30, 40, 50],
  defaultPageSize = 10,
  enableMultiSearch = false,
  enableRowSelection = false,
  onRowSelectionChange,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [multiSearchValues, setMultiSearchValues] = React.useState<Record<string, string>>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // Debounce global filter
  const [debouncedGlobalFilter, setDebouncedGlobalFilter] = React.useState(globalFilter);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedGlobalFilter(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

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
    if (searchColumn) return [searchColumn] as SearchTarget<T>[];
    return [] as SearchTarget<T>[];
  }, [searchColumn, searchColumns]);

  const hasSearch = Boolean(searchColumn || searchColumns?.length);

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
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
        if (onRowSelectionChange) {
          const selectedRows = Object.keys(newSelection)
            .filter((key) => newSelection[key]) // Only get selected rows
            .map((key) => table.getRow(key)?.original)
            .filter(Boolean);
          onRowSelectionChange(selectedRows as T[]);
        }
        return newSelection;
      });
    },
    state: {
      sorting,
      columnFilters,
      globalFilter: debouncedGlobalFilter,
      pagination,
      rowSelection,
    },
  });

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
      <div className="bg-white/50 backdrop-blur-sm shadow-lg shadow-slate-900/10 rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {enableRowSelection && (
                    <th className="px-6 py-3 text-left text-xs font-light text-slate-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                        checked={table.getIsAllPageRowsSelected()}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                      />
                    </th>
                  )}
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-6 py-3 text-left text-xs font-light text-slate-500 uppercase tracking-wider ${header.column.getCanSort() ? 'cursor-pointer select-none hover:bg-slate-100' : ''}`}
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
                            <span className={`text-xs ${header.column.getIsSorted() === 'asc' ? 'text-black' : 'text-gray-400'}`}>
                              ▲
                            </span>
                            <span className={`text-xs -mt-1 ${header.column.getIsSorted() === 'desc' ? 'text-black' : 'text-gray-400'}`}>
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
                table.getRowModel().rows.map((row) => (
                  <tr 
                    key={row.id} 
                    className="hover:bg-slate-50 transition-colors duration-150"
                    onClick={enableRowSelection ? () => row.toggleSelected() : undefined}
                    style={{ cursor: enableRowSelection ? 'pointer' : 'default' }}
                  >
                    {enableRowSelection && (
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          checked={row.getIsSelected()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
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
                        <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      )}
                      <h3 className="mt-2 text-sm font-light text-slate-900">{emptyMessage}</h3>
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
          <div className="flex-1 flex justify-between sm:hidden">
            <Button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              variant="secondary"
            >
              Previous
            </Button>
            <Button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              variant="secondary"
            >
              Next
            </Button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <p className="text-sm text-slate-700 whitespace-nowrap">Show</p>
                <Select
                  options={pageSizeOptions.map(size => ({ value: size.toString(), label: size.toString() }))}
                  value={table.getState().pagination.pageSize.toString()}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                  className="w-20"
                />
                <p className="text-sm text-slate-700 whitespace-nowrap">per page</p>
              </div>
              <div className="h-5 w-px bg-slate-300"></div>
              <p className="text-sm text-slate-700">
                Page{' '}
                <span className="font-medium">{table.getState().pagination.pageIndex + 1}</span>
                {' '}of{' '}
                <span className="font-medium">{table.getPageCount()}</span>
                {' '}({' '}
                <span className="font-medium">{table.getFilteredRowModel().rows.length}</span>
                {' '}total items)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-xl -space-x-px gap-2" aria-label="Pagination">
                <Button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  variant="secondary"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  variant="secondary"
                >
                  Next
                </Button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
