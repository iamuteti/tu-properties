'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ClipboardCheck, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { AgreementStatusBadge } from "@/components/leases/agreement-status-badge";
import { LeaseLifecycleActions, MoveOutPrompt } from "@/components/leases/lease-lifecycle-actions";
import { leasesApi } from "@/lib/api";
import type { Lease } from "@/types";

export default function LeaseDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [lease, setLease] = useState<Lease | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const loadLease = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await leasesApi.findLease(id);
            setLease(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Lease not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the lease.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadLease();
    }, [loadLease]);

    const handleDelete = async () => {
        if (!lease) return;
        if (!confirm(`Delete lease ${lease.code ?? ""}? This cannot be undone.`)) return;
        setIsBusy(true);
        try {
            await leasesApi.removeLease(lease.id);
            toast.success("Lease deleted");
            router.push("/rental-agreements");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete the lease.");
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading lease…" />;
    if (error || !lease) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/rental-agreements")}
                    aria-label="Back to leases"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Lease not found."} onRetry={loadLease} />
            </div>
        );
    }

    const money = lease.money ?? { invoiced: 0, paid: 0, outstanding: 0, arrears: 0 };
    const currency = lease.currency ?? "KES";
    const inspections = lease.inspections ?? [];
    const moveOuts = lease.moveOutRequests ?? [];
    const days = lease.timeline?.daysRemaining;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/rental-agreements")}
                        aria-label="Back to leases"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {lease.code ?? "Draft lease"}
                            </h1>
                            <AgreementStatusBadge status={lease.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {lease.tenant && (
                                <Link href={`/tenants/${lease.tenant.id}`} className="hover:underline">
                                    {`${lease.tenant.surname} ${lease.tenant.otherNames ?? ""}`.trim()}
                                </Link>
                            )}
                            {lease.unit && (
                                <>
                                    {" · "}
                                    <Link href={`/units/${lease.unit.id}`} className="hover:underline">
                                        {lease.unit.name}
                                    </Link>
                                    {lease.unit.property && (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            ({lease.unit.property.name})
                                        </span>
                                    )}
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        onClick={() => router.push(`/rental-agreements/${lease.id}/edit`)}
                        disabled={isBusy}
                    >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isBusy || lease.status === "ACTIVE"}
                        title={
                            lease.status === "ACTIVE"
                                ? "Terminate an active lease instead of deleting it"
                                : undefined
                        }
                    >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            {(lease.timeline?.notices ?? []).length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {(lease.timeline?.notices ?? []).map((notice) => (
                        <p key={notice}>{notice}</p>
                    ))}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Monthly rent
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                            {currency} {Number(lease.rentAmount).toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Outstanding
                        </p>
                        <p
                            className={`mt-1 text-2xl font-bold ${
                                money.outstanding > 0 ? "text-red-600" : "text-green-700"
                            }`}
                        >
                            {currency} {money.outstanding.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Arrears</p>
                        <p
                            className={`mt-1 text-2xl font-bold ${
                                money.arrears > 0 ? "text-amber-700" : "text-green-700"
                            }`}
                        >
                            {currency} {money.arrears.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="py-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {days === null ? "Term" : "Days left"}
                        </p>
                        <p className="mt-1 text-2xl font-bold">
                            {days === null ? "Open" : days}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Lifecycle</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Each action is checked against the unit&apos;s tenancies — a lease can
                        only be renewed inside its window, and terminating vacates the unit unless a
                        successor tenancy took over.
                    </p>
                    <LeaseLifecycleActions lease={lease} onChanged={loadLease} />
                    {moveOuts.length > 0 && (
                        <div className="space-y-2 border-t pt-4">
                            <h3 className="text-sm font-semibold">Move-out</h3>
                            {moveOuts.map((moveOut) => (
                                <div
                                    key={moveOut.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                                >
                                    <span>
                                        Leaving {new Date(moveOut.moveoutDate).toLocaleDateString()}
                                        {moveOut.depositRefunded
                                            ? ` · deposit refunded ${currency} ${Number(
                                                  moveOut.depositRefundAmount ?? 0,
                                              ).toLocaleString()}`
                                            : ""}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                            {moveOut.status}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                router.push(`/moving-out/${moveOut.id}`)
                                            }
                                        >
                                            Open
                                        </Button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <MoveOutPrompt lease={lease} onCreated={loadLease} />
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Terms</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Type" value={lease.agreementType === "LEASE" ? "Fixed term" : "Monthly"} />
                        <Detail label="Term" value={lease.termMonths ? `${lease.termMonths} months` : undefined} />
                        <Detail label="Start" value={new Date(lease.startDate).toLocaleDateString()} />
                        <Detail
                            label="End"
                            value={lease.endDate ? new Date(lease.endDate).toLocaleDateString() : "Open-ended"}
                        />
                        <Detail
                            label="Security deposit"
                            value={
                                lease.securityDeposit != null
                                    ? `${currency} ${Number(lease.securityDeposit).toLocaleString()}`
                                    : undefined
                            }
                        />
                        <Detail label="Payment day" value={lease.paymentDay?.toString()} />
                        <Detail
                            label="Notice period"
                            value={lease.noticePeriodDays != null ? `${lease.noticePeriodDays} days` : undefined}
                        />
                        <Detail label="Deposit refunded" value={lease.depositRefunded ? "Yes" : "No"} />
                        {lease.terminatedReason && (
                            <div className="col-span-2 rounded-md bg-red-50 px-3 py-2 text-red-700">
                                <p className="text-xs font-medium">Terminated</p>
                                <p className="text-sm">{lease.terminatedReason}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Renewal chain</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {lease.renewedFrom ? (
                            <p>
                                Renewed from{' '}
                                <Link
                                    href={`/rental-agreements/${lease.renewedFrom.id}`}
                                    className="font-medium hover:underline"
                                >
                                    {lease.renewedFrom.code}
                                </Link>{" "}
                                —{' '}
                                <AgreementStatusBadge status={lease.renewedFrom.status} />
                            </p>
                        ) : (
                            <p className="text-muted-foreground">This is the original lease.</p>
                        )}
                        {lease.renewedTo ? (
                            <p>
                                Renewed into{' '}
                                <Link
                                    href={`/rental-agreements/${lease.renewedTo.id}`}
                                    className="font-medium hover:underline"
                                >
                                    {lease.renewedTo.code}
                                </Link>{" "}
                                —{' '}
                                <AgreementStatusBadge status={lease.renewedTo.status} />
                            </p>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Ledger</CardTitle>
                </CardHeader>
                <CardContent>
                    {(lease.invoices ?? []).length === 0 ? (
                        <EmptyState
                            title="Nothing billed yet"
                            description="Invoices raised against this lease will appear here with what has been paid."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Paid</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(lease.invoices ?? []).map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell>
                                            <Link
                                                href={`/finance/invoices/${invoice.id}`}
                                                className="hover:underline"
                                            >
                                                {invoice.invoiceNumber}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                                {invoice.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {Number(invoice.amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {Number(invoice.paidAmount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {Number(invoice.balanceAmount).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        Inspections
                    </CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            router.push(`/inspections/new?unitId=${lease.unitId}&leaseId=${lease.id}`)
                        }
                    >
                        Start an inspection
                    </Button>
                </CardHeader>
                <CardContent>
                    {inspections.length === 0 ? (
                        <EmptyState
                            title="No condition reports"
                            description="A move-in report is the record of what the tenant received the unit in — the thing that settles a damage dispute later."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Scheduled</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Items</TableHead>
                                    <TableHead className="text-right">Completed by</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inspections.map((inspection) => (
                                    <TableRow key={inspection.id}>
                                        <TableCell>{inspection.type.replace("_", " ")}</TableCell>
                                        <TableCell>
                                            {new Date(inspection.scheduledDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                                {inspection.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {inspection.items?.length ?? 0}
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground">
                                            {inspection.completedBy
                                                ? `${inspection.completedBy.firstName} ${inspection.completedBy.lastName}`
                                                : "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium break-words">{value || "—"}</p>
        </div>
    );
}