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

// Types for tenant table data
export interface TenantTableData {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  unitName: string;
  unitId: string;
  propertyName: string;
  propertyId: string;
  idNoRegNo?: string;
  taxPin?: string;
  agreementType?: string;
  tenancyType?: string;
  phone?: string;
  email?: string;
  leaseId: string;
  agreementStartDate: string;
  agreementEndDate?: string;
  rentAmount: number;
  rentBalance: number;
  daysToExpire?: number;
  status: 'active' | 'inactive' | 'archived';
}

interface TenantsTableProps {
  data: TenantTableData[];
  onRowSelect?: (selectedRows: TenantTableData[]) => void;
  onRowClick?: (row: TenantTableData) => void;
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
  columns?: ColumnDef<TenantTableData>[];
  expandedRowComponent?: React.ComponentType<{ row: TenantTableData }>;
  pagination?: { pageIndex: number; pageSize: number };
}

// Status indicator component
const StatusIndicator = ({ status }: { status: TenantTableData['status'] }) => {
  const config = {
    active: { color: 'bg-green-500', label: 'Active', icon: CheckCircle2 },
    inactive: { color: 'bg-gray-500', label: 'Inactive', icon: AlertCircle },
    archived: { color: 'bg-blue-500', label: 'Archived', icon: Info },
  };

  const { color, label, icon: Icon } = config[status];

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );
};

// Rent balance progress bar
const RentProgressBar = ({ balance, rentAmount }: { balance: number; rentAmount: number }) => {
  const percentage = rentAmount > 0 ? Math.min((balance / rentAmount) * 100, 100) : 0;
  
  const getColor = () => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">KES {balance.toLocaleString()}</span>
        <span className="text-slate-400">/ KES {rentAmount.toLocaleString()}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Expanded row component showing tenant details
const ExpandedRowDetails = ({ row }: { row: TenantTableData }) => {
  return (
    <div className="bg-slate-50 p-4 border-l-4 border-cyan-500 ml-4">
      <div className="grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">ID/REG Number</p>
          <p className="text-sm font-medium text-slate-900">{row.idNoRegNo || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Tax PIN</p>
          <p className="text-sm font-medium text-slate-900">{row.taxPin || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Agreement Type</p>
          <p className="text-sm font-medium text-slate-900">{row.agreementType || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Tenancy Type</p>
          <p className="text-sm font-medium text-slate-900">{row.tenancyType || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
          <p className="text-sm font-medium text-slate-900">{row.phone || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Email</p>
          <p className="text-sm font-medium text-slate-900">{row.email || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Property ID</p>
          <p className="text-sm font-medium text-slate-900">{row.propertyId}</p>
        </div>
      </div>
    </div>
  );
};

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

export function TenantsTable({
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
}: TenantsTableProps) {
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

  // Process data to add computed fields
  const processedData = useMemo(() => {
    return data.map(row => ({
      ...row,
      leaseDaysToExpire: row.agreementEndDate ? calculateDaysToExpire(row.agreementEndDate) : 99999,
      leaseStatus: (() => {
        const hasEndDate = !!row.agreementEndDate;
        const days = hasEndDate ? calculateDaysToExpire(row.agreementEndDate) : 99999;
        const balance = row.rentBalance;
        if (balance > 0) return 'overdue';
        if (days <= 0) {
          if (!hasEndDate) return 'active';
          return 'expired';
        }
        if (days <= 30 && hasEndDate) return 'expiring';
        return 'active';
      })(),
    }));
  }, [data]);

  // Default column definitions
  const defaultColumns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'expander',
      header: () => null,
      cell: ({ row }) => {
        // Always show expander for all rows (manual expansion, not hierarchical)
        return (
          <button
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            onClick={() => row.toggleExpanded()}
            aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
          </button>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      id: 'serial',
      header: '#',
      cell: ({ row }) => {
        return row.index + 1;
      },
      size: 40,
    },
    {
      accessorKey: 'tenantName',
      header: 'Tenant Name',
      cell: ({ row }) => (
        <div className="font-medium text-slate-900">
          {row.original.tenantName}
        </div>
      ),
      size: 180,
    },
    {
      accessorKey: 'tenantCode',
      header: 'Code',
      cell: ({ row }) => (
        <span className="text-slate-500 font-mono text-sm">
          {row.original.tenantCode}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'unitName',
      header: 'Unit',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-900">{row.original.unitName}</div>
          <div className="text-xs text-slate-500">{row.original.propertyName}</div>
        </div>
      ),
      size: 150,
    },
    {
      accessorKey: 'agreementStartDate',
      header: 'Agreement Period',
      cell: ({ row }) => (
        <div className="text-sm">
          <span className="text-slate-600">{formatDate(row.original.agreementStartDate)}</span>
          <span className="text-slate-400 mx-1">-</span>
          <span className="text-slate-600">{formatDate(row.original.agreementEndDate)}</span>
        </div>
      ),
      size: 180,
    },
    {
      accessorKey: 'daysToExpire',
      header: 'Days to Expire',
      cell: ({ row }) => {
        const days = row.original.daysToExpire ?? 0;
        const getDaysColor = () => {
          if (days <= 0) return 'text-red-600 font-semibold';
          if (days <= 30) return 'text-yellow-600 font-medium';
          return 'text-green-600';
        };
        return (
          <span className={`text-sm ${getDaysColor()}`}>
            {days > 0 ? `${days} days` : 'Expired'}
          </span>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'rentBalance',
      header: 'Rent Balance',
      cell: ({ row }) => (
        <RentProgressBar 
          balance={row.original.rentBalance} 
          rentAmount={row.original.rentAmount} 
        />
      ),
      size: 160,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusIndicator status={row.original.status} />
      ),
      size: 100,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
      size: 50,
    },
  ], []);

  // Use custom columns or default
  const columns = customColumns || defaultColumns;

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
            placeholder="Search tenants..."
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
                          {ExpandedRowDetailsComponent ? (
                            <ExpandedRowDetailsComponent row={row.original} />
                          ) : (
                            <ExpandedRowDetails row={row.original} />
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
                      <h3 className="mt-2 text-sm font-light text-slate-900">No tenants found</h3>
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

export default TenantsTable;
