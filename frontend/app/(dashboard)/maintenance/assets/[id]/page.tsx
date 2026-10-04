'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    CalendarClock,
    History,
    MapPin,
    Pencil,
    Play,
    Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { ASSET_STATUSES, ASSET_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { useAsset } from '@/hooks/use-maintenance';

/**
 * One asset (Module 9).
 *
 * The service history at the bottom is the point of the register: "what happened
 * to the generator last quarter" is answerable here, and so is "what has this cost
 * us", which is the argument an owner eventually asks about.
 */
export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { asset, isLoading, error, refetch } = useAsset(id);
    const [isRunning, setIsRunning] = useState(false);

    if (isLoading) return <LoadingState label="Loading the asset…" />;
    if (error || !asset) {
        return <ErrorState message={error ?? 'Asset not found'} onRetry={refetch} />;
    }

    const statusMeta = ASSET_STATUSES.find((entry) => entry.value === asset.status);
    const typeLabel = ASSET_TYPES.find((entry) => entry.value === asset.type)?.label;

    const raiseServiceNow = async (scheduleId: string) => {
        setIsRunning(true);
        try {
            const response = await maintenanceApi.runPmSchedule(scheduleId);
            if (response.data.created) {
                toast.success(`${response.data.reference} raised`);
            } else {
                toast.info('Already raised for this period');
            }
            refetch();
        } catch (err) {
            toast.error(apiMessage(err, 'Could not raise the service'));
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href="/maintenance/assets"
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to the register
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {asset.assetTag ? `${asset.assetTag} — ` : ''}
                        {asset.name}
                    </h1>
                    <p className="text-muted-foreground">
                        {typeLabel ?? asset.type} · {statusMeta?.label ?? asset.status} ·{' '}
                        {statusMeta?.hint}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => router.push(`/maintenance/assets/${asset.id}/edit`)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button onClick={() => router.push('/maintenance/work-orders/new')}>
                        <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
                        Report a fault
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Service schedule</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(asset.pmSchedules?.length ?? 0) === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing scheduled for this asset. That means it is looked
                                    at only when somebody reports it broken — add an
                                    interval on the maintenance schedule page.
                                </p>
                            ) : (
                                asset.pmSchedules?.map((schedule) => {
                                    const due = new Date(schedule.nextDueAt);
                                    const overdue = due < new Date();
                                    return (
                                        <div
                                            key={schedule.id}
                                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"
                                        >
                                            <div>
                                                <p className="font-medium">{schedule.title}</p>
                                                <p
                                                    className={`text-sm ${
                                                        overdue ? 'font-medium text-amber-700' : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    Next due{' '}
                                                    {due.toLocaleDateString(undefined, {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                    {overdue && ' · overdue'}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isRunning}
                                                onClick={() => raiseServiceNow(schedule.id)}
                                            >
                                                <Play className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                                                Raise now
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-4 w-4" aria-hidden="true" />
                                Service history
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {asset.serviceHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No preventive service recorded yet.
                                </p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {asset.serviceHistory.map((service) => (
                                        <li
                                            key={service.id}
                                            className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
                                        >
                                            <span>
                                                <Link
                                                    href={`/maintenance/work-orders/${service.id}`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {service.reference}
                                                </Link>
                                                {service.pmSchedule && (
                                                    <span className="ml-2 text-muted-foreground">
                                                        {service.pmSchedule.title}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(service.reportedAt).toLocaleDateString()}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <p className="pt-1 text-sm text-muted-foreground">
                                {asset.openWorkOrders} open · {asset.totalWorkOrders} in total
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Work orders against this asset</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {asset.workOrders.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No faults have been filed against it.
                                </p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {asset.workOrders.map((workOrder) => (
                                        <li
                                            key={workOrder.id}
                                            className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
                                        >
                                            <span>
                                                <Link
                                                    href={`/maintenance/work-orders/${workOrder.id}`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {workOrder.reference}
                                                </Link>{' '}
                                                {workOrder.title}
                                            </span>
                                            <span className="flex items-center gap-2">
                                                {workOrder.actualCost && (
                                                    <span className="tabular-nums text-muted-foreground">
                                                        {Number(workOrder.actualCost).toLocaleString()}
                                                    </span>
                                                )}
                                                <StatusBadge status={workOrder.status} />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <Row label="Asset tag" value={asset.assetTag ?? '—'} />
                            <Row label="Type" value={typeLabel ?? asset.type} />
                            <Row
                                label="Property"
                                value={
                                    asset.property ? (
                                        <Link
                                            href={`/properties/${asset.property.id}`}
                                            className="hover:underline"
                                        >
                                            {asset.property.name}
                                        </Link>
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                            <Row label="Unit" value={asset.unit?.name ?? 'Shared plant'} />
                            <Row
                                label="Location"
                                value={
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                        {asset.location ?? '—'}
                                    </span>
                                }
                            />
                            <Row label="Capacity" value={asset.capacity ?? '—'} />
                            <Row label="Manufacturer" value={asset.manufacturer ?? '—'} />
                            <Row label="Model" value={asset.model ?? '—'} />
                            <Row label="Serial number" value={asset.serialNumber ?? '—'} />
                            <Row
                                label="Installed"
                                value={
                                    asset.installedAt
                                        ? new Date(asset.installedAt).toLocaleDateString()
                                        : '—'
                                }
                            />
                            <Row
                                label="Warranty"
                                value={
                                    asset.warrantyExpiresAt
                                        ? new Date(asset.warrantyExpiresAt).toLocaleDateString()
                                        : '—'
                                }
                            />
                            <p className="pt-2">
                                <StatusBadge status={asset.status} />
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                                Next service
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                            {asset.nextServiceDue ? (
                                <p>
                                    {new Date(asset.nextServiceDue).toLocaleDateString(undefined, {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                    })}
                                </p>
                            ) : (
                                <p className="text-muted-foreground">
                                    Nothing scheduled — this asset is only looked at when it
                                    fails.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {asset.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="whitespace-pre-line text-sm">{asset.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="text-right">{value}</span>
        </div>
    );
}

function apiMessage(error: unknown, fallback: string): string {
    const payload = (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data;
    if (Array.isArray(payload?.message)) return payload.message.join(' ');
    if (typeof payload?.message === 'string') return payload.message;
    if (error instanceof Error) return error.message;
    return fallback;
}
