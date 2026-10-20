"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, ShieldCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type PaginationMeta } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { securityDepositsApi } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/currency";
import {
    DEPOSIT_DISPOSITION_LABELS,
    DEPOSIT_DISPOSITION_OPTIONS,
    DEPOSIT_DISPOSITION_STYLES,
} from "@/lib/constants";
import { useAuth } from "@/context/auth-context";
import type {
    DepositSummaryLine,
    PropertyDepositPolicy,
    SecurityDepositRow,
} from "@/types";

/**
 * The security-deposit register.
 *
 * A deposit is not a row of its own: it is the `securityDeposit` on a lease,
 * and what has happened to the money is the move-out's deduction list and the
 * refund it carries. Everything on this screen is therefore **derived on read**
 * by the server, using the same arithmetic the move-out screen uses — so the
 * two can never quote different numbers for the same deposit.
 *
 * The screen is read-only on purpose. Taking a deposit is part of raising a
 * lease and settling one is part of a move-out; both already own their rules.
 */
export default function SecurityDepositsPage() {
    const { organization } = useAuth();
    const locale = organization?.defaultLocale ?? null;

    const [rows, setRows] = useState<SecurityDepositRow[]>([]);
    const [summary, setSummary] = useState<DepositSummaryLine[]>([]);
    const [policies, setPolicies] = useState<PropertyDepositPolicy[]>([]);
    const [meta, setMeta] = useState({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await securityDepositsApi.findAll({
                page,
                limit,
                search: appliedSearch || undefined,
                status: status || undefined,
            });
            setRows(response.data.data);
            setSummary(response.data.summary);
            setMeta(response.data.meta);
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    "Could not load the deposit register.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, appliedSearch, status]);

    useEffect(() => {
        load();
    }, [load]);

    // The per-property policy is a second, independent question: what each
    // property asks for, against what the register says was taken. It does not
    // change with the register's filters, so it is loaded once.
    useEffect(() => {
        let active = true;
        securityDepositsApi
            .policies()
            .then((response) => {
                if (active) setPolicies(response.data);
            })
            .catch(() => {
                // The register is the screen; a missing policy list is not worth
                // an error message over.
            });
        return () => {
            active = false;
        };
    }, []);

    const applySearch = useCallback(() => {
        setAppliedSearch(search.trim());
        setPage(1);
    }, [search]);

    const clearFilters = useCallback(() => {
        setSearch("");
        setAppliedSearch("");
        setStatus("");
        setPage(1);
    }, []);

    const handlePaginationChange = useCallback(
        (pagination: { page: number; limit: number }) => {
            setPage(pagination.page);
            setLimit(pagination.limit);
        },
        [],
    );

    const hasFilters = Boolean(appliedSearch || status);
    const total = meta.total;
    const from = total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, total);

    const statusOptions = useMemo(
        () => [
            { value: "", label: "Every deposit" },
            ...DEPOSIT_DISPOSITION_OPTIONS,
        ],
        [],
    );

    /**
     * The register's columns.
     *
     * The register is ordered by the lease's own start date and the server
     * cannot order it by anything else, so no column is sortable: a column
     * that offered an order the server would not honour is a lie about the
     * data. Every amount is the row's own currency.
     */
    const columns = useMemo<ColumnDef<SecurityDepositRow>[]>(
        () => [
            {
                id: "tenant",
                header: "Tenant",
                enableSorting: false,
                cell: ({ row }) => (
                    <div>
                        <Link
                            href={`/agreements/${row.original.agreementId}`}
                            className="font-medium hover:underline"
                        >
                            {row.original.tenant.name || row.original.tenant.code}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            {row.original.tenant.accountNumber} ·{" "}
                            {row.original.agreementCode}
                        </p>
                    </div>
                ),
            },
            {
                id: "unit",
                header: "Unit",
                enableSorting: false,
                cell: ({ row }) => (
                    <div>
                        {row.original.unit?.name ?? "—"}
                        <p className="text-xs text-muted-foreground">
                            {row.original.property?.name ?? "—"}
                            {row.original.unitType
                                ? ` · ${row.original.unitType.code}`
                                : ""}
                        </p>
                    </div>
                ),
            },
            {
                id: "agreed",
                header: "Agreed",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="text-right tabular-nums">
                        {formatMoney(
                            row.original.depositAmount,
                            row.original.currency,
                            locale,
                        )}
                        {row.original.waived && (
                            <p className="text-xs text-muted-foreground">
                                waived
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "received",
                header: "Received",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="text-right tabular-nums">
                        {row.original.invoiceNumber
                            ? formatMoney(
                                  row.original.receivedAmount,
                                  row.original.currency,
                                  locale,
                              )
                            : "—"}
                        {row.original.invoiceNumber ? (
                            <p className="text-xs text-muted-foreground">
                                {row.original.invoiceNumber}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                not billed
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "deductions",
                header: "Deductions",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="text-right tabular-nums">
                        {row.original.deductionsTotal > 0
                            ? formatMoney(
                                  row.original.deductionsTotal,
                                  row.original.currency,
                                  locale,
                              )
                            : "—"}
                        {row.original.unpaidRent > 0 && (
                            <p className="text-xs text-muted-foreground">
                                plus {formatMoney(row.original.unpaidRent, row.original.currency, locale)}{" "}
                                unpaid rent
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "refundDue",
                header: "Refund due",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="text-right tabular-nums">
                        {row.original.disposition === "REFUNDED"
                            ? formatMoney(
                                  row.original.refundedAmount,
                                  row.original.currency,
                                  locale,
                              )
                            : formatMoney(
                                  row.original.refundDue,
                                  row.original.currency,
                                  locale,
                              )}
                        {row.original.carriedForward > 0 && (
                            <p className="text-xs text-amber-700">
                                {formatMoney(
                                    row.original.carriedForward,
                                    row.original.currency,
                                    locale,
                                )}{" "}
                                carried forward
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "moveOut",
                header: "Move-out",
                enableSorting: false,
                cell: ({ row }) =>
                    row.original.moveOut ? (
                        <div>
                            <Link
                                href={`/moving-out/${row.original.moveOut.id}`}
                                className="text-sm hover:underline"
                            >
                                {row.original.moveOut.status.toLowerCase()}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(
                                    row.original.moveOut.moveoutDate,
                                    locale,
                                )}
                            </p>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "status",
                header: "Status",
                enableSorting: false,
                cell: ({ row }) => (
                    <div>
                        <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                DEPOSIT_DISPOSITION_STYLES[
                                    row.original.disposition
                                ] ?? "bg-muted"
                            }`}
                        >
                            {DEPOSIT_DISPOSITION_LABELS[
                                row.original.disposition
                            ] ?? row.original.disposition}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Lease {row.original.agreementStatus.toLowerCase()} · from{" "}
                            {formatDate(row.original.startDate, locale)}
                        </p>
                    </div>
                ),
            },
        ],
        [locale],
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Security deposits</h1>
                <p className="text-muted-foreground">
                    Money held on a resident&apos;s behalf — taken on the lease, less
                    what has been claimed against it.
                </p>
            </div>

            {summary.map((line) => (
                <div key={line.currency} className="grid gap-4 md:grid-cols-4">
                    <Stat
                        label={`Deposits agreed (${line.currency})`}
                        value={formatMoney(line.deposits, line.currency, locale)}
                        note={`${line.count} tenanc${line.count === 1 ? "y" : "ies"} carrying a deposit`}
                    />
                    <Stat
                        label="Received"
                        value={formatMoney(line.received, line.currency, locale)}
                        note="Actually paid in against the deposit invoices"
                    />
                    <Stat
                        label="Still held"
                        value={formatMoney(line.netHeld, line.currency, locale)}
                        note="What the company has not paid back"
                    />
                    <Stat
                        label="Deductions"
                        value={formatMoney(line.deductions, line.currency, locale)}
                        note="Itemised against the deposit"
                    />
                </div>
            ))}

            <Card>
                <CardContent className="flex flex-wrap items-end gap-4 pt-6">
                    <div className="min-w-64 flex-1">
                        <Label htmlFor="deposit-search">Search</Label>
                        <div className="flex gap-2">
                            <Input
                                id="deposit-search"
                                value={search}
                                placeholder="Tenant, lease, unit or property"
                                onChange={(event) => setSearch(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") applySearch();
                                }}
                            />
                            <Button onClick={applySearch}>Search</Button>
                        </div>
                    </div>
                    <div className="w-56">
                        <Label htmlFor="deposit-status">Status</Label>
                        <Select
                            id="deposit-status"
                            name="depositStatus"
                            value={status}
                            onChange={(event) => {
                                setStatus(event.target.value);
                                setPage(1);
                            }}
                            options={statusOptions}
                            placeholder="Every deposit"
                        />
                    </div>
                    {hasFilters && (
                        <Button variant="outline" onClick={clearFilters}>
                            Clear the filters
                        </Button>
                    )}
                </CardContent>
            </Card>

            {error && <ErrorState message={error} onRetry={load} />}

            {isLoading && rows.length === 0 ? (
                <LoadingState label="Loading the deposit register…" />
            ) : (
                <>
                    {rows.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            Showing {from}–{to} of {total}
                        </p>
                    )}
                    <DataTable
                        data={rows}
                        columns={columns}
                        enableSearch={false}
                        emptyMessage={
                            hasFilters
                                ? "No deposit in the register matches what you have narrowed it to."
                                : "A deposit appears here once a lease records one. Tenancies without a deposit are not shown."
                        }
                        emptyIcon={
                            <ShieldCheck
                                className="h-12 w-12 text-muted-foreground"
                                aria-hidden="true"
                            />
                        }
                        serverSidePagination
                        paginationMeta={meta as PaginationMeta}
                        page={page}
                        onPaginationChange={handlePaginationChange}
                        defaultPageSize={20}
                        pageSizeOptions={[10, 20, 30, 40, 50]}
                    />
                </>
            )}

            {policies.length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <h2 className="font-semibold">Deposit rules by property</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            What each property asks for each kind of unit — the rule
                            every tenancy of that kind in the register above was
                            agreed against.
                        </p>
                        <Table className="mt-4">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Property</TableHead>
                                    <TableHead>Kind of unit</TableHead>
                                    <TableHead className="text-right">Deposit</TableHead>
                                    <TableHead>Units</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {policies.map((policy) => (
                                    <TableRow key={policy.id}>
                                        <TableCell>{policy.propertyName}</TableCell>
                                        <TableCell>
                                            {policy.unitTypeCode} —{" "}
                                            {policy.unitTypeName}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {policy.basis === "RENT_MONTHS"
                                                ? `${policy.months} month${policy.months === 1 ? "" : "s"} of rent`
                                                : formatMoney(
                                                      policy.amount,
                                                      organization?.currency,
                                                      locale,
                                                  )}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {policy.unitCount}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    note,
}: {
    label: string;
    value: string;
    note?: string;
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
                {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </CardContent>
        </Card>
    );
}
