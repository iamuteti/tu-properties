'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Building2, CalendarRange, Gauge, Landmark, Wrench } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import { landlordsApi, reportsApi } from '@/lib/api';
import type {
    FinancialReport,
    Landlord,
    LandlordRoiReport,
    MaintenanceReport,
    OccupancyReport,
    OccupancyTrendReport,
    SalesReport,
} from '@/types';
import {
    ClampedNotice,
    ExclusionNote,
    ExportButton,
    MetricTile,
    Money,
    Percent,
    PeriodCaption,
} from './_components';

/**
 * Module 16 — reports.
 *
 * Six read endpoints behind five tabs, plus a landlord lookup. There is nothing to
 * create, edit or delete here, so the CRUD half of `00-UX-CROSS-CUTTING-STANDARDS.md`
 * does not apply; what does apply is the other half — real loading/empty/error
 * states, exports on every report, a date control that is honest about what it did,
 * and a layout that survives a phone.
 *
 * **Each tab owns its own request and its own error.** A tab that shares one
 * `isLoading` with its neighbours makes the whole screen look broken when one
 * endpoint fails, and the user cannot tell which figure is missing.
 */

type TabKey = 'occupancy' | 'financial' | 'sales' | 'maintenance' | 'owners';

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * A chosen `YYYY-MM-DD` becomes an **inclusive** instant range.
 *
 * The server compares against `timestamp` columns, so a bare `2026-10-07` is midnight at
 * the *start* of that day — and every record written later the same day falls outside a
 * window that reads, on screen, as "up to 7 October". With the default window that made
 * the sales tab render six empty figures: the demo sales are stamped at seed time, and
 * seed time was later that morning.
 *
 * So the range is closed at both ends. `to` becomes the last millisecond of the chosen
 * day, which is what a person means by "To: 7 October".
 *
 * UTC on purpose, for the reason `period.ts` and `occupancy.ts` are UTC on the server:
 * every `DateTime` in this schema holds a UTC instant, and a local end-of-day would drift
 * by the browser's offset.
 */
function dayStart(day: string): string {
    return `${day}T00:00:00.000Z`;
}
function dayEnd(day: string): string {
    return `${day}T23:59:59.999Z`;
}

/** The shape the API takes. The pickers keep the plain `YYYY-MM-DD`. */
function toApiPeriod(p: { from: string; to: string }) {
    return { from: dayStart(p.from), to: dayEnd(p.to) };
}

/** Twelve months back, as a `YYYY-MM-DD` — the server's own default, stated here. */
function defaultFrom(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    d.setDate(1);
    return isoDay(d);
}

/**
 * Shared loading/error wrapper.
 *
 * Extracted because writing it five times is how one of them ends up swallowing its
 * error, and because `key`-ing on the tab means switching away and back re-runs the
 * request rather than showing a stale figure under a new heading.
 */
function useReport<T>(load: () => Promise<T>, deps: unknown[]) {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            setData(await load());
        } catch (err: any) {
            setError(
                err?.response?.data?.message ||
                    'Could not load this report. Check your connection and try again.',
            );
        } finally {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        run();
    }, [run]);

    return { data, isLoading, error, reload: run };
}

function ReportFrame({
    isLoading,
    error,
    onRetry,
    children,
}: {
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    children: React.ReactNode;
}) {
    if (isLoading) return <LoadingState label="Building the report…" />;
    if (error) return <ErrorState message={error} onRetry={onRetry} />;
    return <>{children}</>;
}

/** From/to inputs, shared by the four period-bound reports. */
function PeriodPicker({
    from,
    to,
    onChange,
}: {
    from: string;
    to: string;
    onChange: (next: { from: string; to: string }) => void;
}) {
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
                <Label htmlFor="report-from" className="text-xs">
                    From
                </Label>
                <Input
                    id="report-from"
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => onChange({ from: e.target.value, to })}
                    className="w-40"
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="report-to" className="text-xs">
                    To
                </Label>
                <Input
                    id="report-to"
                    type="date"
                    value={to}
                    min={from}
                    onChange={(e) => onChange({ from, to: e.target.value })}
                    className="w-40"
                />
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const [tab, setTab] = useState<TabKey>('occupancy');

    // One period, shared by the four reports that take one, because a reader
    // comparing sales to maintenance over different windows is comparing two
    // different things. The occupancy trend has its own length control instead.
    const [period, setPeriod] = useState({ from: defaultFrom(), to: isoDay(new Date()) });
    const apiPeriod = useMemo(() => toApiPeriod(period), [period.from, period.to]);
    const [months, setMonths] = useState(12);

    const [occupancy, setOccupancy] = useState<{ on: string } | null>(null);

    // ── Occupancy ────────────────────────────────────────────────────────────
    const occupancyReport = useReport<OccupancyReport>(
        () => reportsApi.occupancy().then((r) => r.data),
        [],
    );
    const trend = useReport<OccupancyTrendReport>(
        () => reportsApi.occupancyTrend({ months }).then((r) => r.data),
        [months],
    );

    // ── The three period-bound reports ───────────────────────────────────────
    const financial = useReport<FinancialReport>(
        () => reportsApi.financial(apiPeriod).then((r) => r.data),
        [apiPeriod.from, apiPeriod.to],
    );
    const sales = useReport<SalesReport>(
        () => reportsApi.sales(apiPeriod).then((r) => r.data),
        [apiPeriod.from, apiPeriod.to],
    );
    const maintenance = useReport<MaintenanceReport>(
        () => reportsApi.maintenance(apiPeriod).then((r) => r.data),
        [apiPeriod.from, apiPeriod.to],
    );

    const today = isoDay(new Date());
    useEffect(() => setOccupancy({ on: today }), [today]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Reports</h1>
                <p className="text-sm text-muted-foreground">
                    Every figure is computed from the records that already exist, in the
                    database. Nothing on this page can be edited, and a report covering a
                    different period says so.
                </p>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
                    <TabsTrigger value="financial">Financial</TabsTrigger>
                    <TabsTrigger value="sales">Sales</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                    <TabsTrigger value="owners">Owners</TabsTrigger>
                </TabsList>

                {/* ── Occupancy ─────────────────────────────────────────────── */}
                <TabsContent value="occupancy" className="space-y-6">
                    <ReportFrame
                        isLoading={occupancyReport.isLoading}
                        error={occupancyReport.error}
                        onRetry={occupancyReport.reload}
                    >
                        {occupancyReport.data && (
                            <OccupancyView
                                report={occupancyReport.data}
                                exportHref={reportsApi.exportUrl('occupancy')}
                            />
                        )}
                    </ReportFrame>

                    <Card>
                        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <CalendarRange className="h-4 w-4" aria-hidden="true" />
                                    Month-end occupancy
                                </CardTitle>
                                <CardDescription>
                                    How full the estate was at each month end. This is a
                                    different question from the snapshot above — a lease that
                                    has since been renewed or ended was still in force on the
                                    date it is counted.
                                </CardDescription>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="trend-months" className="text-xs">
                                    Months
                                </Label>
                                <Input
                                    id="trend-months"
                                    type="number"
                                    min={1}
                                    max={24}
                                    value={months}
                                    onChange={(e) =>
                                        setMonths(
                                            Math.min(
                                                Math.max(Number(e.target.value) || 1, 1),
                                                24,
                                            ),
                                        )
                                    }
                                    className="w-24"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ReportFrame
                                isLoading={trend.isLoading}
                                error={trend.error}
                                onRetry={trend.reload}
                            >
                                {trend.data &&
                                    (trend.data.points.length === 0 ? (
                                        <EmptyState
                                            title="No units to measure"
                                            description="Add a property with units and the trend appears here."
                                            icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
                                        />
                                    ) : (
                                        <div className="h-72 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={trend.data.points}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="month" fontSize={12} />
                                                    <YAxis domain={[0, 100]} fontSize={12} />
                                                    <Tooltip
                                                        formatter={(v: any) =>
                                                            v === null || v === undefined
                                                                ? '—'
                                                                : `${v}%`
                                                        }
                                                    />
                                                    <Legend />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="occupancyPercent"
                                                        name="Occupied %"
                                                        stroke="#8884d8"
                                                        strokeWidth={2}
                                                        dot={{ r: 2 }}
                                                        connectNulls
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ))}
                            </ReportFrame>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Financial ─────────────────────────────────────────────── */}
                <TabsContent value="financial" className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
                        <ExportButton
                            href={reportsApi.exportUrl('financial', apiPeriod)}
                            title="Download the month-by-month rows as CSV"
                        />
                    </div>

                    <ReportFrame
                        isLoading={financial.isLoading}
                        error={financial.error}
                        onRetry={financial.reload}
                    >
                        {financial.data && <FinancialView report={financial.data} />}
                    </ReportFrame>
                </TabsContent>

                {/* ── Sales ─────────────────────────────────────────────────── */}
                <TabsContent value="sales" className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
                        <ExportButton
                            href={reportsApi.exportUrl('sales', apiPeriod)}
                            title="Download the pipeline rows as CSV"
                        />
                    </div>

                    <ReportFrame
                        isLoading={sales.isLoading}
                        error={sales.error}
                        onRetry={sales.reload}
                    >
                        {sales.data && <SalesView report={sales.data} />}
                    </ReportFrame>
                </TabsContent>

                {/* ── Maintenance ───────────────────────────────────────────── */}
                <TabsContent value="maintenance" className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
                        <ExportButton
                            href={reportsApi.exportUrl('maintenance', apiPeriod)}
                            title="Download the per-property rows as CSV"
                        />
                    </div>

                    <ReportFrame
                        isLoading={maintenance.isLoading}
                        error={maintenance.error}
                        onRetry={maintenance.reload}
                    >
                        {maintenance.data && <MaintenanceView report={maintenance.data} />}
                    </ReportFrame>
                </TabsContent>

                {/* ── Owners ────────────────────────────────────────────────── */}
                <TabsContent value="owners">
                    <OwnersView period={apiPeriod} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

/* ── Occupancy ─────────────────────────────────────────────────────────────── */

function OccupancyView({
    report,
    exportHref,
}: {
    report: OccupancyReport;
    exportHref: string;
}) {
    const { metrics } = report;
    const nothingToMeasure = metrics.totalUnits === 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <PeriodCaption period={{ from: report.on, to: report.on, clamped: false }} />
                <ExportButton
                    href={exportHref}
                    label="Export by property"
                    title="One row per property. There is no unit-level export yet."
                />
            </div>

            {nothingToMeasure ? (
                <EmptyState
                    title="No units to measure"
                    description="This organization has no units, so occupancy is undefined rather than zero. Add a property with units and this report fills in."
                    icon={<Gauge className="h-6 w-6" aria-hidden="true" />}
                />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <MetricTile
                            label="Occupied"
                            value={`${metrics.occupied} / ${metrics.totalUnits}`}
                            hint={<Percent value={metrics.occupancyPercent} />}
                        />
                        <MetricTile
                            label="Vacant"
                            value={metrics.vacant}
                            hint={<Percent value={metrics.vacancyPercent} after="of units" />}
                        />
                        <MetricTile label="In maintenance" value={metrics.maintenance} />
                        <MetricTile label="Reserved" value={metrics.reserved} />
                    </div>

                    {metrics.disagreements > 0 && (
                        <div
                            role="status"
                            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        >
                            <strong>{metrics.disagreements}</strong> unit
                            {metrics.disagreements === 1 ? '' : 's'} carry a status that
                            contradicts {metrics.disagreements === 1 ? 'its' : 'their'} lease.
                            This report counts the lease, because the lease is the evidence
                            and the status column is a note somebody wrote.
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>By property</CardTitle>
                            <CardDescription>
                                {report.byProperty.length} propert
                                {report.byProperty.length === 1 ? 'y' : 'ies'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="py-2 pr-4 font-medium">Property</th>
                                        <th className="py-2 pr-4 text-right font-medium">Units</th>
                                        <th className="py-2 pr-4 text-right font-medium">Occupied</th>
                                        <th className="py-2 pr-4 text-right font-medium">Vacant</th>
                                        <th className="py-2 text-right font-medium">Occupancy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.byProperty.map((row) => (
                                        <tr key={row.propertyId} className="border-b last:border-0">
                                            <td className="py-2 pr-4">{row.property}</td>
                                            <td className="py-2 pr-4 text-right tabular-nums">{row.total}</td>
                                            <td className="py-2 pr-4 text-right tabular-nums">{row.occupied}</td>
                                            <td className="py-2 pr-4 text-right tabular-nums">{row.vacant}</td>
                                            <td className="py-2 text-right tabular-nums">
                                                <Percent value={row.occupancyPercent} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    {report.flagged.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Units whose status disagrees with their lease</CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs text-muted-foreground">
                                            <th className="py-2 pr-4 font-medium">Unit</th>
                                            <th className="py-2 pr-4 font-medium">Lease says</th>
                                            <th className="py-2 font-medium">Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.flagged.map((f) => (
                                            <tr key={f.code} className="border-b last:border-0">
                                                <td className="py-2 pr-4 font-medium">{f.code}</td>
                                                <td className="py-2 pr-4">{f.occupancy}</td>
                                                <td className="py-2 text-muted-foreground">
                                                    {f.disagreement}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

/* ── Financial ─────────────────────────────────────────────────────────────── */

function FinancialView({ report }: { report: FinancialReport }) {
    return (
        <div className="space-y-4">
            <ClampedNotice period={report.period} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <MetricTile
                    label="Invoiced"
                    value={<Money value={report.invoiced} currency={report.currency} />}
                />
                <MetricTile
                    label="Collected"
                    value={<Money value={report.collected} currency={report.currency} />}
                    hint={
                        <Percent
                            value={report.collectionRatePercent}
                            after="of what was invoiced"
                        />
                    }
                />
                <MetricTile
                    label="Outstanding"
                    value={<Money value={report.outstanding} currency={report.currency} />}
                    hint="Unpaid invoices up to the end date, including earlier periods"
                    tone={report.outstanding > 0 ? 'warn' : 'default'}
                />
                {/*
                  `report.net` is collected minus invoiced, so it arrives negative
                  whenever the period is under-collected. Labelling that "Uncollected"
                  printed a large negative number under a word that implies a
                  shortfall, which reads as a catastrophic loss rather than as timing.
                  The shortfall is the other way round, and it is shown as a positive
                  figure — deliberately distinct from "Outstanding" above, because this
                  one is about *this period* and that one carries every earlier unpaid
                  invoice with it.
                */}
                <MetricTile
                    label="Not collected in period"
                    value={
                        <Money
                            value={Math.max(report.invoiced - report.collected, 0)}
                            currency={report.currency}
                        />
                    }
                    hint="Invoiced in this period, not yet collected"
                    tone={report.invoiced > report.collected ? 'warn' : 'default'}
                />
                <MetricTile
                    label="Excluded rows"
                    value={report.unattributedCount}
                    hint="Invoices with no organization"
                />
            </div>

            <ExclusionNote count={report.unattributedCount} noun="invoice/payment" />

            <Card>
                <CardHeader>
                    <CardTitle>Invoiced against collected, by month</CardTitle>
                    <CardDescription>
                        <PeriodCaption period={report.period} />
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {report.byMonth.length === 0 ? (
                        <EmptyState
                            title="Nothing in this period"
                            description="No invoices were raised between these dates. Widen the window or raise some."
                        />
                    ) : (
                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={report.byMonth}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" fontSize={12} />
                                    <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="invoiced" name="Invoiced" fill="#8884d8" />
                                    <Bar dataKey="collected" name="Collected" fill="#82ca9d" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>By invoice class</CardTitle>
                    <CardDescription>
                        Rent invoices carry no class of their own, so they appear as
                        &ldquo;uncategorised&rdquo; rather than being lumped in with sales.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className="py-2 pr-4 font-medium">Class</th>
                                <th className="py-2 pr-4 text-right font-medium">Invoices</th>
                                <th className="py-2 text-right font-medium">Invoiced</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.byClass.map((row) => (
                                <tr key={row.transactionClass} className="border-b last:border-0">
                                    <td className="py-2 pr-4">
                                        {row.transactionClass === 'UNCATEGORISED'
                                            ? 'Rent / unclassified'
                                            : row.transactionClass}
                                    </td>
                                    <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                                    <td className="py-2 text-right tabular-nums">
                                        <Money value={row.invoiced} currency={report.currency} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}

/* ── Sales ─────────────────────────────────────────────────────────────────── */

function SalesView({ report }: { report: SalesReport }) {
    return (
        <div className="space-y-4">
            <ClampedNotice period={report.period} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricTile
                    label="Pipeline value"
                    value={<Money value={report.pipelineValue} />}
                    hint={`${report.transactions} live transaction${report.transactions === 1 ? '' : 's'}`}
                />
                <MetricTile label="Won value" value={<Money value={report.wonValue} />} />
                <MetricTile label="Deposits held" value={<Money value={report.depositHeld} />} />
                <MetricTile
                    label="Lead conversion"
                    value={<Percent value={report.conversionPercent} />}
                    hint={`${report.wonLeads} won of ${report.leads}`}
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>By stage</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className="py-2 pr-4 font-medium">Stage</th>
                                <th className="py-2 pr-4 text-right font-medium">Count</th>
                                <th className="py-2 text-right font-medium">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.byStage.map((row) => (
                                <tr key={row.stage} className="border-b last:border-0">
                                    <td className="py-2 pr-4">{row.stage}</td>
                                    <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                                    <td className="py-2 text-right tabular-nums">
                                        <Money value={row.value} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>By agent</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    {report.byAgent.length === 0 ? (
                        <EmptyState
                            title="No agent has a live sale"
                            description="Agent performance appears once a transaction names an agent."
                        />
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="py-2 pr-4 font-medium">Agent</th>
                                    <th className="py-2 pr-4 text-right font-medium">Sales</th>
                                    <th className="py-2 text-right font-medium">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.byAgent.map((row) => (
                                    <tr key={row.name} className="border-b last:border-0">
                                        <td className="py-2 pr-4">{row.name}</td>
                                        <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                                        <td className="py-2 text-right tabular-nums">
                                            <Money value={row.value} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/* ── Maintenance ───────────────────────────────────────────────────────────── */

function MaintenanceView({ report }: { report: MaintenanceReport }) {
    return (
        <div className="space-y-4">
            <ClampedNotice period={report.period} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricTile label="Open" value={report.open} tone={report.open > 0 ? 'warn' : 'default'} />
                <MetricTile label="In progress" value={report.inProgress} />
                <MetricTile
                    label="Average completion"
                    value={
                        report.averageCompletionDays === null ? (
                            '—'
                        ) : (
                            <>
                                {report.averageCompletionDays}
                                <span className="text-sm font-normal text-muted-foreground"> days</span>
                            </>
                        )
                    }
                    hint={`from ${report.completedCount} completed`}
                />
                <MetricTile
                    label="Recorded cost"
                    value={<Money value={report.recordedCost} />}
                    hint={
                        report.costsFromEstimates > report.recordedCost
                            ? `${report.costsFromEstimates.toLocaleString()} still estimated`
                            : undefined
                    }
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>By priority</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={report.byPriority}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="priority" fontSize={12} />
                                    <YAxis fontSize={12} allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" name="Work orders" fill="#f59e0b" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="h-4 w-4" aria-hidden="true" />
                            By property
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {report.byProperty.length === 0 ? (
                            <EmptyState
                                title="No work orders in this period"
                                description="Try a wider window."
                                icon={<Wrench className="h-6 w-6" aria-hidden="true" />}
                            />
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="py-2 pr-4 font-medium">Property</th>
                                        <th className="py-2 pr-4 text-right font-medium">Open</th>
                                        <th className="py-2 text-right font-medium">Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.byProperty.map((row) => (
                                        <tr key={row.propertyId} className="border-b last:border-0">
                                            <td className="py-2 pr-4">{row.property}</td>
                                            <td className="py-2 pr-4 text-right tabular-nums">{row.open}</td>
                                            <td className="py-2 text-right tabular-nums">
                                                <Money value={row.cost} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/* ── Owners ────────────────────────────────────────────────────────────────── */

function OwnersView({ period }: { period: { from: string; to: string } }) {
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [selected, setSelected] = useState('');
    const [listError, setListError] = useState<string | null>(null);
    const [listLoading, setListLoading] = useState(true);

    const roi = useReport<LandlordRoiReport | null>(
        async () => {
            if (!selected) return null;
            try {
                const res = await reportsApi.landlordRoi(selected, period);
                return res.data;
            } catch (err: any) {
                if (err?.response?.status === 404) {
                    setListError('That landlord is not in your organization.');
                    return null;
                }
                throw err;
            }
        },
        [selected, period.from, period.to],
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setListLoading(true);
            setListError(null);
            try {
                const res = await landlordsApi.findAll({ limit: 200 });
                if (cancelled) return;
                const rows = res.data.data ?? [];
                setLandlords(rows);
                if (rows.length > 0) setSelected((prev) => prev || rows[0].id);
            } catch {
                if (!cancelled) setListError('Could not load the landlord list.');
            } finally {
                if (!cancelled) setListLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="space-y-4">
            {/*
              A landlord is chosen from a list rather than typed as an id. There is
              deliberately no free-text id box: every id in this system is guessable,
              and a box that accepts one invites the 404 it is meant to prevent.
            */}
            <div className="space-y-1">
                <Label htmlFor="roi-landlord">Landlord</Label>
                {listLoading ? (
                    <p className="text-sm text-muted-foreground">Loading landlords…</p>
                ) : landlords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No landlords yet. Add one to see a return.
                    </p>
                ) : (
                    <select
                        id="roi-landlord"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                        {landlords.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {listError && <ErrorState message={listError} onRetry={roi.reload} />}

            {selected && !listError && (
                <>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <ExportButton
                            href={reportsApi.landlordRoiExportUrl(selected, period)}
                            label="Export by month"
                            title="One row per month: billed, expenses, net."
                        />
                    </div>
                    <ReportFrame isLoading={roi.isLoading} error={roi.error} onRetry={roi.reload}>
                        {roi.data && <RoiView report={roi.data} />}
                    </ReportFrame>
                </>
            )}
        </div>
    );
}

function RoiView({ report }: { report: LandlordRoiReport }) {
    return (
        <div className="space-y-4">
            <ClampedNotice period={report.period} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Landmark className="h-4 w-4" aria-hidden="true" />
                        {report.landlord}
                    </CardTitle>
                    <CardDescription>
                        <PeriodCaption period={report.period} />
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <MetricTile
                            label="Billed"
                            value={<Money value={report.billed} currency={report.currency} />}
                        />
                        <MetricTile
                            label="Owner costs"
                            value={<Money value={report.expenses} currency={report.currency} />}
                            tone={report.expenses > 0 ? 'warn' : 'default'}
                        />
                        <MetricTile
                            label="Net to owner"
                            value={<Money value={report.net} currency={report.currency} />}
                        />
                        <MetricTile
                            label="Return on billed"
                            value={<Percent value={report.roiPercent} />}
                            hint="Net as a share of what was billed"
                        />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        &ldquo;Collected&rdquo; is not shown: payments are recorded against an
                        invoice or an agreement, and attributing them to a landlord without
                        that link would be a guess.
                    </p>

                    {report.byMonth.length === 0 ? (
                        <EmptyState
                            title="No activity in this period"
                            description="Nothing was billed to this owner and no costs were charged between these dates."
                            icon={<Landmark className="h-6 w-6" aria-hidden="true" />}
                        />
                    ) : (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={report.byMonth}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" fontSize={12} />
                                    <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="billed" name="Billed" fill="#8884d8" />
                                    <Bar dataKey="expenses" name="Owner costs" fill="#f59e0b" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
