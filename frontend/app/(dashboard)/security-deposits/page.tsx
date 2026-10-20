"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, ShieldCheck } from "lucide-react";
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
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

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await securityDepositsApi.findAll({
                page,
                limit: 20,
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
    }, [page, appliedSearch, status]);

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

            {isLoading ? (
                <LoadingState label="Loading the deposit register…" />
            ) : rows.length === 0 ? (
                <EmptyState
                    title={hasFilters ? "Nothing matches" : "No deposits recorded"}
                    description={
                        hasFilters
                            ? "No deposit in the register matches what you have narrowed it to."
                            : "A deposit appears here once a lease records one. Tenancies without a deposit are not shown."
                    }
                    icon={<ShieldCheck className="h-10 w-10" aria-hidden="true" />}
                    action={
                        hasFilters ? (
                            <Button onClick={clearFilters}>Clear the filters</Button>
                        ) : undefined
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tenant</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">Required</TableHead>
                                    <TableHead className="text-right">Agreed</TableHead>
                                    <TableHead className="text-right">Received</TableHead>
                                    <TableHead className="text-right">Deductions</TableHead>
                                    <TableHead className="text-right">Refund due</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Move-out</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.agreementId}>
                                        <TableCell>
                                            <Link
                                                href={`/agreements/${row.agreementId}`}
                                                className="font-medium hover:underline"
                                            >
                                                {row.tenant.name || row.tenant.code}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {row.tenant.accountNumber} ·{" "}
                                                {row.agreementCode}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            {row.unit?.name ?? "—"}
                                            <p className="text-xs text-muted-foreground">
                                                {row.property?.name ?? "—"}
                                                {row.unitType
                                                    ? ` · ${row.unitType.code}`
                                                    : ""}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                            {row.requiredAmount === null
                                                ? "—"
                                                : formatMoney(
                                                      row.requiredAmount,
                                                      row.currency,
                                                      locale,
                                                  )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {formatMoney(
                                                row.depositAmount,
                                                row.currency,
                                                locale,
                                            )}
                                            {row.waived && (
                                                <p className="text-xs text-muted-foreground">
                                                    waived
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {formatMoney(
                                                row.receivedAmount,
                                                row.currency,
                                                locale,
                                            )}
                                            {row.invoiceNumber && (
                                                <p className="text-xs text-muted-foreground">
                                                    {row.invoiceNumber}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.deductionsTotal > 0
                                                ? formatMoney(
                                                      row.deductionsTotal,
                                                      row.currency,
                                                      locale,
                                                  )
                                                : "—"}
                                            {row.unpaidRent > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    plus {formatMoney(row.unpaidRent, row.currency, locale)}{" "}
                                                    unpaid rent
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.disposition === "REFUNDED"
                                                ? formatMoney(
                                                      row.refundedAmount,
                                                      row.currency,
                                                      locale,
                                                  )
                                                : formatMoney(
                                                      row.refundDue,
                                                      row.currency,
                                                      locale,
                                                  )}
                                            {row.carriedForward > 0 && (
                                                <p className="text-xs text-amber-700">
                                                    {formatMoney(
                                                        row.carriedForward,
                                                        row.currency,
                                                        locale,
                                                    )}{" "}
                                                    carried forward
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    DEPOSIT_DISPOSITION_STYLES[
                                                        row.disposition
                                                    ] ?? "bg-muted"
                                                }`}
                                            >
                                                {DEPOSIT_DISPOSITION_LABELS[
                                                    row.disposition
                                                ] ?? row.disposition}
                                            </span>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Lease {row.agreementStatus.toLowerCase()} · from{" "}
                                                {formatDate(row.startDate, locale)}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            {row.moveOut ? (
                                                <Link
                                                    href={`/moving-out/${row.moveOut.id}`}
                                                    className="text-sm hover:underline"
                                                >
                                                    {row.moveOut.status.toLowerCase()}
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                            {row.moveOut && (
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(
                                                        row.moveOut.moveoutDate,
                                                        locale,
                                                    )}
                                                </p>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {!isLoading && rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <p>
                        Showing {from}–{to} of {total}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.page <= 1}
                            onClick={() => setPage((previous) => previous - 1)}
                        >
                            Previous
                        </Button>
                        <span>
                            Page {meta.page} of {Math.max(1, meta.totalPages)}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.page >= meta.totalPages}
                            onClick={() => setPage((previous) => previous + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {policies.length > 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <h2 className="font-semibold">Deposit rules by property</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            What each property asks for each kind of unit, against what
                            the register above says was actually taken.
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
