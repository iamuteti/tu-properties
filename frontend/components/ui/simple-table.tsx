"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export interface SimpleTableColumn<T> {
    key: string;
    header: React.ReactNode;
    cell?: (row: T) => React.ReactNode;
    className?: string;
    headerClassName?: string;
}

export interface SimpleTableProps<T> {
    data: T[];
    columns: SimpleTableColumn<T>[];
    emptyMessage?: string;
    className?: string;
    rowKey?: (row: T, index: number) => string | number;
    onRowClick?: (row: T) => void;
}

/**
 * SimpleTable — a lightweight table for small, fully-loaded datasets.
 *
 * Use this when the data is known to be small and you don't need the
 * pagination, sorting and search machinery of `DataTable` / `ExpandableTable`.
 * Pass `columns` + `data` and it renders plain <thead>/<tbody> rows, so a page
 * never has to hand-write <table> markup again.
 */
export function SimpleTable<T>({
    data,
    columns,
    emptyMessage = "No data available",
    className,
    rowKey,
    onRowClick,
}: SimpleTableProps<T>) {
    const hasData = data.length > 0;

    return (
        <Table className={cn("min-w-full", className)}>
            <TableHeader>
                <TableRow>
                    {columns.map((column) => (
                        <TableHead
                            key={column.key}
                            className={cn(
                                "text-xs font-medium text-muted-foreground uppercase",
                                column.headerClassName,
                            )}
                        >
                            {column.header}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody className="bg-card divide-y divide-border">
                {hasData ? (
                    data.map((row, index) => (
                        <TableRow
                            key={rowKey ? rowKey(row, index) : index}
                            className={onRowClick ? "cursor-pointer" : undefined}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                        >
                            {columns.map((column) => (
                                <TableCell
                                    key={column.key}
                                    className={cn(
                                        "py-4 align-middle text-sm text-foreground",
                                        column.className,
                                    )}
                                >
                                    {column.cell
                                        ? column.cell(row)
                                        : (row[column.key as keyof T] as React.ReactNode)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell
                            colSpan={columns.length}
                            className="h-24 text-center"
                        >
                            {emptyMessage}
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

export default SimpleTable;
