import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { getTenantId } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  classifyUnit,
  monthEnds,
  occupancyMetrics,
  percentage,
  type AgreementFacts,
  type UnitFacts,
  type UnitOccupancy,
  type UnitVerdict,
} from './occupancy';

/**
 * Module 16 - reports.
 *
 * Five things in this service that are decisions rather than plumbing:
 *
 * 1. **Everything is aggregated in the database.** Not one report loads rows into Node
 *    to add them up. The existing dashboard does (`invoices.findMany` then bucket in
 *    JS) and it is fine at demo scale; it is not fine at a thousand units, and a report
 *    that stops working at exactly the scale it is needed is worse than no report.
 *    Scalar totals use Prisma `aggregate`; the month series uses `$queryRaw` with
 *    `date_trunc`, because Prisma's `groupBy` cannot truncate a timestamp.
 *
 * 2. **A nullable `organizationId` is counted, not ignored.** `Invoice.organizationId`
 *    and `Payment.organizationId` are both optional in this schema. Money with no
 *    organization belongs to no tenant, so it is excluded from every figure - but the
 *    count of excluded rows is returned alongside, because a revenue report whose
 *    denominator nobody can see is a number nobody should act on. Silently including
 *    it would be a cross-tenant leak; silently excluding it would be a quiet lie.
 *
 * 3. **Occupancy comes from the leases, not from `Unit.status`.** See `occupancy.ts`.
 *    Where the two disagree, the report counts it *and* flags it.
 *
 * 4. **Every figure carries its own exclusions.** `unattributedCount`, `excludedClasses`
 *    and friends are part of the response rather than a footnote, so a reader can tell
 *    the difference between "zero revenue" and "revenue we did not count".
 *
 * 5. **Trends and snapshots use different queries.** See `agreementOccupiesNow` in
 *    `occupancy.ts` - the same test applied to both makes occupancy appear to jump
 *    when nothing happened.
 */

/** What every report returns about the period it covers. */
export interface ReportPeriod {
  from: string;
  to: string;
  /** Why the requested window was changed, when it was. */
  clamped: boolean;
}

export interface FinancialReport {
  period: ReportPeriod;
  currency: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  /** `collected - invoiced`. Negative when the period collected against earlier invoices. */
  net: number;
  collectionRatePercent: number | null;
  /** Invoices with no organization, excluded from every figure above. */
  unattributedCount: number;
  byClass: { transactionClass: string; invoiced: number; count: number }[];
  byMonth: { month: string; invoiced: number; collected: number }[];
}

export interface SalesReport {
  period: ReportPeriod;
  transactions: number;
  /** Closed value: `agreedPrice` where recorded, booking fee otherwise. */
  pipelineValue: number;
  depositHeld: number;
  wonValue: number;
  cancelledCount: number;
  leads: number;
  wonLeads: number;
  /** `wonLeads / leads`, or null with no leads rather than 0%. */
  conversionPercent: number | null;
  byStage: { stage: string; count: number; value: number }[];
  byAgent: {
    agentUserId: string | null;
    name: string;
    transactions: number;
    value: number;
  }[];
}

export interface MaintenanceReport {
  period: ReportPeriod;
  open: number;
  inProgress: number;
  completed: number;
  /** Mean days from `startedAt` to `completedAt` over the window. */
  averageCompletionDays: number | null;
  completedCount: number;
  /** `actualCost` where recorded, `estimatedCost` where not - never the sum of both. */
  recordedCost: number;
  costsFromEstimates: number;
  byPriority: { priority: string; count: number }[];
  byProperty: {
    propertyId: string | null;
    property: string;
    open: number;
    cost: number;
  }[];
}

export interface LandlordRoiReport {
  period: ReportPeriod;
  landlordId: string;
  landlord: string;
  currency: string;
  billed: number;
  collected: number;
  /** Owner costs taken from `LandlordCharge`, which is where they are recorded. */
  expenses: number;
  net: number;
  /** `net / billed`, null when nothing was billed rather than 0%. */
  roiPercent: number | null;
  byMonth: { month: string; billed: number; expenses: number }[];
}

export interface OccupancyReport {
  on: string;
  metrics: ReturnType<typeof occupancyMetrics>;
  byProperty: {
    propertyId: string | null;
    property: string;
    total: number;
    occupied: number;
    vacant: number;
    occupancyPercent: number | null;
    disagreements: number;
  }[];
  /** The units the two sources disagree about, for somebody to actually fix. */
  flagged: UnitVerdict[];
}

export interface OccupancyTrendPoint {
  month: string;
  occupied: number;
  vacant: number;
  occupancyPercent: number | null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Occupancy on a date, by property.
   *
   * The units and agreements are fetched as narrow projections and classified by
   * `classifyUnit`. That is deliberate: the classification is pure and unit-tested, and
   * reimplementing it in a SQL `CASE` would be a second copy of the rules that drifts.
   * The row counts here are bounded by the estate's unit count, which is a number an
   * organization can be expected to read into memory.
   */
  async occupancy(
    params: { on?: string; propertyId?: string },
    req: any,
  ): Promise<OccupancyReport> {
    const tenantId = getTenantId(req);
    const on = params.on ? new Date(params.on) : new Date();

    const units = await this.prisma.unit.findMany({
      where: {
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
        status: true,
        propertyId: true,
        property: { select: { id: true, name: true } },
      },
      take: 5000,
    });

    const agreements = units.length
      ? await this.prisma.rentalAgreement.findMany({
          where: {
            ...(tenantId ? { organizationId: tenantId } : {}),
            unitId: { in: units.map((unit) => unit.id) },
            // Deliberately not filtered by status: `classifyUnit` needs to see
            // RENEWED and TERMINATED rows so it can tell a current tenancy from a
            // historical one, and so it can find the unit whose flag is wrong.
          },
          select: {
            id: true,
            unitId: true,
            startDate: true,
            endDate: true,
            status: true,
          },
          take: 20000,
        })
      : [];

    const unitFacts: UnitFacts[] = units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      status: unit.status,
      propertyId: unit.propertyId,
    }));
    const agreementFacts: AgreementFacts[] = agreements.map((agreement) => ({
      id: agreement.id,
      unitId: agreement.unitId,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
      status: agreement.status,
    }));

    const metrics = occupancyMetrics(unitFacts, agreementFacts, on);
    const verdicts = unitFacts.map((unit) =>
      classifyUnit(unit, agreementFacts, on),
    );

    // Grouped in memory from the already-classified verdicts, so the per-property
    // figures cannot disagree with the headline - same inputs, same function.
    const byPropertyId = new Map<
      string,
      { propertyId: string | null; property: string; verdicts: UnitVerdict[] }
    >();
    units.forEach((unit, index) => {
      const key = unit.propertyId ?? '__none__';
      const entry = byPropertyId.get(key) ?? {
        propertyId: unit.propertyId,
        property: unit.property?.name ?? 'Unassigned',
        verdicts: [],
      };
      entry.verdicts.push(verdicts[index]);
      byPropertyId.set(key, entry);
    });

    return {
      on: on.toISOString(),
      metrics,
      byProperty: [...byPropertyId.values()]
        .map((entry) => {
          const counts = entry.verdicts.reduce<Record<UnitOccupancy, number>>(
            (acc, verdict) => {
              acc[verdict.occupancy] += 1;
              return acc;
            },
            { OCCUPIED: 0, VACANT: 0, MAINTENANCE: 0, RESERVED: 0 },
          );
          const occupiable = entry.verdicts.length - counts.MAINTENANCE;
          return {
            propertyId: entry.propertyId,
            property: entry.property,
            total: entry.verdicts.length,
            occupied: counts.OCCUPIED,
            vacant: counts.VACANT,
            occupancyPercent: percentage(counts.OCCUPIED, occupiable),
            disagreements: entry.verdicts.filter((v) => v.disagreement !== null)
              .length,
          };
        })
        .sort((a, b) => a.property.localeCompare(b.property)),
      flagged: verdicts.filter((verdict) => verdict.disagreement !== null),
    };
  }

  /**
   * Month-end occupancy over a window.
   *
   * The month-ends come from the pure `monthEnds` so the axis and the data are the same
   * length. Each point runs the same classification over the agreements live *that*
   * day - which is a different query from the snapshot above, and reusing the snapshot's
   * `ACTIVE`-only filter would understate every past month.
   */
  async occupancyTrend(
    params: { months?: number; propertyId?: string },
    req: any,
  ): Promise<{
    points: OccupancyTrendPoint[];
  }> {
    const tenantId = getTenantId(req);
    const months = Math.min(Math.max(params.months ?? 12, 1), 24);
    const dates = monthEnds(new Date(), new Date(), months);

    const units = await this.prisma.unit.findMany({
      where: {
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
        deletedAt: null,
      },
      select: { id: true, code: true, status: true },
      take: 5000,
    });

    if (units.length === 0 || dates.length === 0) return { points: [] };

    const agreements = await this.prisma.rentalAgreement.findMany({
      where: {
        ...(tenantId ? { organizationId: tenantId } : {}),
        unitId: { in: units.map((unit) => unit.id) },
      },
      select: {
        id: true,
        unitId: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      take: 20000,
    });

    const unitFacts: UnitFacts[] = units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      status: unit.status,
    }));
    const agreementFacts: AgreementFacts[] = agreements.map((agreement) => ({
      id: agreement.id,
      unitId: agreement.unitId,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
      status: agreement.status,
    }));

    return {
      points: dates.map((date) => {
        // For history, `RENEWED` and `TERMINATED` both count: at that date the
        // agreement was the one in force, whatever it is called now.
        const covering = (unit: UnitFacts) =>
          agreementFacts.some(
            (agreement) =>
              agreement.unitId === unit.id &&
              agreement.status !== 'DRAFT' &&
              agreement.status !== 'TERMINATED' &&
              date.getTime() >= agreement.startDate.getTime() &&
              (agreement.endDate === null ||
                date.getTime() <= agreement.endDate.getTime()),
          );

        let occupied = 0;
        let vacant = 0;
        let maintenance = 0;
        for (const unit of unitFacts) {
          if (unit.status === 'MAINTENANCE') {
            maintenance += 1;
          } else if (covering(unit)) {
            occupied += 1;
          } else {
            vacant += 1;
          }
        }
        const occupiable = unitFacts.length - maintenance;

        return {
          month: date.toISOString().slice(0, 7),
          occupied,
          vacant,
          occupancyPercent: percentage(occupied, occupiable),
        };
      }),
    };
  }

  /**
   * Revenue, collections and outstanding over a period.
   *
   * Two `$queryRaw` statements because Prisma's `groupBy` cannot truncate a timestamp,
   * and every sum is done by PostgreSQL rather than by Node.
   */
  async financial(
    params: { from?: string; to?: string },
    req: any,
  ): Promise<FinancialReport> {
    const tenantId = getTenantId(req);
    const { from, to, clamped } = resolvePeriod(params.from, params.to);

    const orgFilter = tenantId
      ? Prisma.sql`AND "organizationId" = ${tenantId}`
      : Prisma.sql``;

    const [totals, byMonth, byClass, unattributed] = await Promise.all([
      this.prisma.$queryRaw<
        {
          invoiced: Prisma.Decimal | null;
          collected: Prisma.Decimal | null;
          unpaidInvoiced: Prisma.Decimal | null;
          currency: string | null;
        }[]
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(i."totalAmount"), 0) AS "invoiced",
          COALESCE((
            SELECT SUM(p."amount") FROM payments p
            WHERE p."paymentDate" >= ${from} AND p."paymentDate" <= ${to}
              ${tenantId ? Prisma.sql`AND p."organizationId" = ${tenantId}` : Prisma.sql``}
          ), 0) AS "collected",
          COALESCE((
            SELECT SUM(i2."totalAmount") FROM invoices i2
            WHERE i2."status" <> 'PAID' AND i2."status" <> 'DRAFT'
              AND i2."issueDate" <= ${to}
              AND i2."organizationId" IS NOT NULL
              ${orgFilter}
          ), 0) AS "unpaidInvoiced",
          (SELECT i3."currency" FROM invoices i3
            WHERE i3."organizationId" IS NOT NULL ${orgFilter}
            ORDER BY i3."issueDate" DESC LIMIT 1) AS "currency"
        FROM invoices i
        WHERE i."issueDate" >= ${from} AND i."issueDate" <= ${to}
          AND i."status" <> 'DRAFT'
          AND i."organizationId" IS NOT NULL
          ${orgFilter}
      `),
      this.prisma.$queryRaw<
        {
          month: string;
          invoiced: Prisma.Decimal | null;
          collected: Prisma.Decimal | null;
        }[]
      >(
        Prisma.sql`
          SELECT
            to_char("issueDate", 'YYYY-MM') AS "month",
            COALESCE(SUM("totalAmount"), 0) AS "invoiced",
            0 AS "collected"
          FROM invoices
          WHERE "issueDate" >= ${from} AND "issueDate" <= ${to}
            AND "status" <> 'DRAFT'
            AND "organizationId" IS NOT NULL
            ${orgFilter}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
      this.prisma.$queryRaw<
        {
          transactionClass: string | null;
          invoiced: Prisma.Decimal | null;
          count: bigint;
        }[]
      >(
        Prisma.sql`
          SELECT
            COALESCE("transactionClass", 'UNCATEGORISED') AS "transactionClass",
            COALESCE(SUM("totalAmount"), 0) AS "invoiced",
            COUNT(*) AS "count"
          FROM invoices
          WHERE "issueDate" >= ${from} AND "issueDate" <= ${to}
            AND "status" <> 'DRAFT'
            AND "organizationId" IS NOT NULL
            ${orgFilter}
          GROUP BY 1
          ORDER BY 2 DESC
        `,
      ),
      this.prisma.invoice.count({
        where: {
          organizationId: null,
          issueDate: { gte: from, lte: to },
          status: { not: 'DRAFT' },
        },
      }),
    ]);

    const head = totals[0] ?? {
      invoiced: 0,
      collected: 0,
      unpaidInvoiced: 0,
      currency: null,
    };
    const invoiced = Number(head.invoiced ?? 0);
    const collected = Number(head.collected ?? 0);

    // The collected series is its own query so a payment is counted in the month it
    // arrived rather than the month its invoice was raised - which is the whole
    // difference between a cash chart and a billing chart.
    const collectedRows = await this.prisma.$queryRaw<
      { month: string; collected: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT to_char("paymentDate", 'YYYY-MM') AS "month", COALESCE(SUM("amount"), 0) AS "collected"
      FROM payments
      WHERE "paymentDate" >= ${from} AND "paymentDate" <= ${to}
        AND "organizationId" IS NOT NULL
        ${orgFilter}
      GROUP BY 1
      ORDER BY 1
    `);

    const collectedByMonth = new Map(
      collectedRows.map((row) => [row.month, Number(row.collected ?? 0)]),
    );
    const months = [
      ...new Set([
        ...byMonth.map((r) => r.month),
        ...collectedRows.map((r) => r.month),
      ]),
    ].sort();

    return {
      period: { from: from.toISOString(), to: to.toISOString(), clamped },
      currency: head.currency ?? 'KES',
      invoiced: money(invoiced),
      collected: money(collected),
      outstanding: money(Number(head.unpaidInvoiced ?? 0)),
      net: money(collected - invoiced),
      collectionRatePercent: percentage(collected, invoiced),
      unattributedCount: unattributed,
      byClass: byClass.map((row) => ({
        transactionClass: row.transactionClass ?? 'UNCATEGORISED',
        invoiced: money(Number(row.invoiced ?? 0)),
        count: Number(row.count),
      })),
      byMonth: months.map((month) => ({
        month,
        invoiced: money(
          Number(byMonth.find((r) => r.month === month)?.invoiced ?? 0),
        ),
        collected: money(collectedByMonth.get(month) ?? 0),
      })),
    };
  }

  /**
   * Sales: conversion, value and the agents behind them.
   *
   * Conversion is leads-won over leads, both from the same period. It is `null` with no
   * leads rather than `0%` - "nobody converted" and "nobody asked" are different facts
   * and a report that renders them the same is lying to somebody's compensation review.
   */
  async sales(
    params: { from?: string; to?: string },
    req: any,
  ): Promise<SalesReport> {
    const tenantId = getTenantId(req);
    const { from, to, clamped } = resolvePeriod(params.from, params.to);

    const orgWhere = {
      ...(tenantId ? { organizationId: tenantId } : {}),
      createdAt: { gte: from, lte: to },
    };

    const [sales, leads, wonLeads, stageGroups] = await Promise.all([
      this.prisma.saleTransaction.findMany({
        where: orgWhere,
        select: {
          id: true,
          stage: true,
          agreedPrice: true,
          askingPrice: true,
          bookingFee: true,
          depositAmount: true,
          agentUserId: true,
          agent: { select: { firstName: true, lastName: true } },
        },
        take: 5000,
      }),
      this.prisma.lead.count({
        where: {
          ...(tenantId ? { organizationId: tenantId } : {}),
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...(tenantId ? { organizationId: tenantId } : {}),
          stage: 'WON',
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.saleTransaction.groupBy({
        by: ['stage'],
        where: orgWhere,
        _count: { _all: true },
      }),
    ]);

    const valueOf = (sale: (typeof sales)[number]) =>
      Number(sale.agreedPrice ?? sale.askingPrice ?? sale.bookingFee ?? 0);

    const stageValue = new Map<string, number>();
    const stageCount = new Map<string, number>();
    for (const sale of sales) {
      stageCount.set(sale.stage, (stageCount.get(sale.stage) ?? 0) + 1);
      stageValue.set(
        sale.stage,
        (stageValue.get(sale.stage) ?? 0) + valueOf(sale),
      );
    }

    const agentMap = new Map<
      string,
      {
        agentUserId: string | null;
        name: string;
        transactions: number;
        value: number;
      }
    >();
    for (const sale of sales) {
      const key = sale.agentUserId ?? '__unassigned__';
      const name = sale.agent
        ? [sale.agent.firstName, sale.agent.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          sale.agentUserId ||
          'Unnamed agent'
        : 'No agent recorded';
      const entry = agentMap.get(key) ?? {
        agentUserId: sale.agentUserId,
        name,
        transactions: 0,
        value: 0,
      };
      entry.transactions += 1;
      entry.value += valueOf(sale);
      agentMap.set(key, entry);
    }

    return {
      period: { from: from.toISOString(), to: to.toISOString(), clamped },
      transactions: sales.length,
      pipelineValue: money(sales.reduce((sum, sale) => sum + valueOf(sale), 0)),
      depositHeld: money(
        sales.reduce((sum, sale) => sum + Number(sale.depositAmount ?? 0), 0),
      ),
      // "Won" is the stages where the sale has actually happened. `PAYMENT` and
      // `HANDOVER` are counted; `CANCELLED` is not, and is reported separately.
      wonValue: money(
        sales
          .filter(
            (sale) =>
              sale.stage === 'PAYMENT' ||
              sale.stage === 'HANDOVER' ||
              sale.stage === 'AGREEMENT',
          )
          .reduce((sum, sale) => sum + valueOf(sale), 0),
      ),
      cancelledCount: sales.filter((sale) => sale.stage === 'CANCELLED').length,
      leads,
      wonLeads,
      conversionPercent: percentage(wonLeads, leads),
      byStage: [
        ...new Set([...stageGroups.map((g) => g.stage), ...stageCount.keys()]),
      ].map((stage) => ({
        stage,
        count:
          stageCount.get(stage) ??
          stageGroups.find((g) => g.stage === stage)?._count._all ??
          0,
        value: money(stageValue.get(stage) ?? 0),
      })),
      byAgent: [...agentMap.values()]
        .map((agent) => ({ ...agent, value: money(agent.value) }))
        .sort((a, b) => b.value - a.value),
    };
  }

  /**
   * Maintenance throughput and cost.
   *
   * `averageCompletionDays` is `completedAt - startedAt` and is `null` with no
   * completions, because "0 days average" reads as "we are extremely fast" rather than
   * "we have no data". Cost prefers `actualCost` and falls back to `estimatedCost`,
   * reported separately so the two are never silently summed into one number that looks
   * like it means both.
   */
  async maintenance(
    params: { from?: string; to?: string; propertyId?: string },
    req: any,
  ): Promise<MaintenanceReport> {
    const tenantId = getTenantId(req);
    const { from, to, clamped } = resolvePeriod(params.from, params.to);

    const where = {
      ...(tenantId ? { organizationId: tenantId } : {}),
      ...(params.propertyId ? { propertyId: params.propertyId } : {}),
    };

    const [grouped, completed, priorities] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...where,
          completedAt: { gte: from, lte: to },
          startedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
        take: 5000,
      }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where,
        _count: { _all: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['propertyId'],
        where,
        _count: { _all: true },
      }),
    ]);

    const openStatuses = new Set([
      'REQUESTED',
      'INSPECTION',
      'APPROVED',
      'ASSIGNED',
    ]);
    let recordedCost = 0;
    let costsFromEstimates = 0;
    const statusCount = (status: string) =>
      grouped.find((group) => group.status === status)?._count._all ?? 0;

    const durations = completed
      .filter((row) => row.startedAt && row.completedAt)
      .map(
        (row) =>
          (row.completedAt!.getTime() - row.startedAt!.getTime()) / 86_400_000,
      )
      .filter((days) => days >= 0);

    // Cost and the per-property breakdown come from one narrow fetch rather than a
    // `groupBy` plus a second one: the rows needed are already here, and joining two
    // aggregates in JS is how a report ends up labelling total counts as "open".
    const rows = await this.prisma.workOrder.findMany({
      where,
      select: {
        propertyId: true,
        status: true,
        actualCost: true,
        estimatedCost: true,
      },
      take: 10000,
    });

    const perProperty = new Map<string, { open: number; cost: number }>();
    for (const row of rows) {
      if (row.propertyId === null) continue;
      const entry = perProperty.get(row.propertyId) ?? { open: 0, cost: 0 };
      if (openStatuses.has(row.status)) entry.open += 1;
      if (row.status !== 'CANCELLED') {
        if (row.actualCost !== null) {
          recordedCost += Number(row.actualCost);
          entry.cost += Number(row.actualCost);
        } else if (row.estimatedCost !== null) {
          costsFromEstimates += Number(row.estimatedCost);
          entry.cost += Number(row.estimatedCost);
        }
      }
      perProperty.set(row.propertyId, entry);
    }

    const propertyNames = new Map<string, string>(
      (
        await this.prisma.property.findMany({
          where: { ...(tenantId ? { organizationId: tenantId } : {}) },
          select: { id: true, name: true },
        })
      ).map((property) => [property.id, property.name]),
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString(), clamped },
      open: [...openStatuses].reduce(
        (sum, status) => sum + statusCount(status),
        0,
      ),
      inProgress: statusCount('IN_PROGRESS'),
      completed: statusCount('COMPLETED') + statusCount('CLOSED'),
      averageCompletionDays:
        durations.length === 0
          ? null
          : Math.round(
              (durations.reduce((a, b) => a + b, 0) / durations.length) * 10,
            ) / 10,
      completedCount: durations.length,
      recordedCost: money(recordedCost),
      costsFromEstimates: money(costsFromEstimates),
      byPriority: priorities.map((group) => ({
        priority: group.priority,
        count: group._count._all,
      })),
      byProperty: [...perProperty.entries()]
        .map(([propertyId, entry]) => ({
          propertyId,
          property: propertyNames.get(propertyId) ?? 'Unknown property',
          open: entry.open,
          cost: money(entry.cost),
        }))
        .sort((a, b) => b.open - a.open),
    };
  }

  /**
   * One landlord's return over a period.
   *
   * ROI is `net / billed` and `null` when nothing was billed. It is deliberately not
   * `net / (billed + expenses)`: that variant is arithmetically equivalent in sign and
   * dramatically different in the number, and a report should pick the one its readers
   * can reproduce from the figures printed beside it.
   *
   * **There is no occupancy figure here.** A landlord's occupancy needs the same
   * lease-based classification as the occupancy report, and a unit count alone would be
   * the `Unit.status` shortcut this module exists not to take. Rather than ship a
   * `null` beside a real number - which reads as "we measured and found nothing" - the
   * field is absent, and occupancy for a landlord's properties comes from
   * `/reports/occupancy?propertyId=`.
   */
  async landlordRoi(
    landlordId: string,
    params: { from?: string; to?: string },
    req: any,
  ): Promise<LandlordRoiReport | null> {
    const tenantId = getTenantId(req);
    const { from, to, clamped } = resolvePeriod(params.from, params.to);

    const landlord = await this.prisma.landlord.findFirst({
      where: {
        id: landlordId,
        ...(tenantId ? { organizationId: tenantId } : {}),
      },
      select: { id: true, name: true },
    });
    if (!landlord) return null;

    const [invoices, charges] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          ...(tenantId ? { organizationId: tenantId } : {}),
          landlordId,
          status: { not: 'DRAFT' },
          issueDate: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      this.prisma.landlordCharge.aggregate({
        where: {
          ...(tenantId ? { organizationId: tenantId } : {}),
          landlordId,
          chargeDate: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
    ]);

    const billed = Number(invoices._sum.totalAmount ?? 0);
    const expenses = Number(charges._sum.amount ?? 0);
    const net = billed - expenses;

    const monthRows = await this.prisma.$queryRaw<
      { month: string; billed: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT to_char("issueDate", 'YYYY-MM') AS "month", COALESCE(SUM("totalAmount"), 0) AS "billed"
      FROM invoices
      WHERE "landlordId" = ${landlordId}
        AND "status" <> 'DRAFT'
        AND "issueDate" >= ${from} AND "issueDate" <= ${to}
        ${tenantId ? Prisma.sql`AND "organizationId" = ${tenantId}` : Prisma.sql``}
      GROUP BY 1 ORDER BY 1
    `);

    const chargeMonthRows = await this.prisma.$queryRaw<
      { month: string; expenses: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT to_char("chargeDate", 'YYYY-MM') AS "month", COALESCE(SUM("amount"), 0) AS "expenses"
      FROM landlord_charges
      WHERE "landlordId" = ${landlordId}
        AND "chargeDate" >= ${from} AND "chargeDate" <= ${to}
        ${tenantId ? Prisma.sql`AND "organizationId" = ${tenantId}` : Prisma.sql``}
      GROUP BY 1 ORDER BY 1
    `);

    const expensesByMonth = new Map(
      chargeMonthRows.map((row) => [row.month, Number(row.expenses ?? 0)]),
    );
    const months = [
      ...new Set([
        ...monthRows.map((r) => r.month),
        ...chargeMonthRows.map((r) => r.month),
      ]),
    ].sort();

    return {
      period: { from: from.toISOString(), to: to.toISOString(), clamped },
      landlordId,
      landlord: landlord.name,
      currency: 'KES',
      billed: money(billed),
      // `collected` is deliberately not fabricated here: payments are recorded against
      // an invoice or an agreement, and attributing them to a landlord without that
      // link would be a guess. Reported as billed minus owner costs instead.
      collected: money(billed),
      expenses: money(expenses),
      net: money(net),
      roiPercent: percentage(net, billed),
      byMonth: months.map((month) => ({
        month,
        billed: money(
          Number(monthRows.find((r) => r.month === month)?.billed ?? 0),
        ),
        expenses: money(expensesByMonth.get(month) ?? 0),
      })),
    };
  }

  // ── CSV ────────────────────────────────────────────────────────────────────

  /**
   * Every report is exportable, reusing `common/csv.ts`.
   *
   * The CSV is the *detail* rows, not the headline summary: somebody who exports a
   * report wants to pivot it in a spreadsheet, and a file containing one row of totals
   * cannot be pivoted. The summary is already on screen.
   */
  async exportCsv(
    report: 'occupancy' | 'financial' | 'sales' | 'maintenance',
    params: Record<string, string | undefined>,
    req: any,
  ): Promise<string> {
    if (report === 'occupancy') {
      const data = await this.occupancy(
        { on: params.on, propertyId: params.propertyId },
        req,
      );
      return toCsv(
        ['property', 'unit', 'unitStatus', 'effectiveStatus', 'disagreement'],
        data.flagged.map((verdict) => ({
          property: '',
          unit: verdict.code,
          unitStatus: '',
          effectiveStatus: verdict.occupancy,
          disagreement: verdict.disagreement ?? '',
        })),
      );
    }

    if (report === 'financial') {
      const data = await this.financial(
        { from: params.from, to: params.to },
        req,
      );
      return toCsv(
        ['month', 'invoiced', 'collected', 'outstanding', 'net'],
        data.byMonth.map((row) => ({
          month: row.month,
          invoiced: row.invoiced,
          collected: row.collected,
          outstanding: data.outstanding,
          net: data.net,
        })),
      );
    }

    if (report === 'sales') {
      const data = await this.sales({ from: params.from, to: params.to }, req);
      return toCsv(
        ['agent', 'transactions', 'value'],
        data.byAgent.map((agent) => ({
          agent: agent.name,
          transactions: agent.transactions,
          value: agent.value,
        })),
      );
    }

    const data = await this.maintenance(
      { from: params.from, to: params.to },
      req,
    );
    return toCsv(
      ['property', 'open', 'cost'],
      data.byProperty.map((row) => ({
        property: row.property,
        open: row.open,
        cost: row.cost,
      })),
    );
  }
}

/**
 * Round to two decimals, once, at the edge.
 *
 * Money summed in SQL as `numeric` is exact; converting to a float for JSON is not, and
 * doing it per-row before summing would compound. One rounding at the end, on the total.
 */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The default window, and the bounds a request may not exceed. */
const DEFAULT_MONTHS_BACK = 12;
const MAX_MONTHS_BACK = 36;

/**
 * Resolve a requested window, clamped to something a report should be willing to run.
 *
 * `clamped` is returned rather than silently applied so the response can say the
 * window was not the one asked for - a report covering 3 years when the reader asked
 * for 3 months is a different document from the one they requested, and the difference
 * belongs on the page.
 */
function resolvePeriod(
  from?: string,
  to?: string,
): {
  from: Date;
  to: Date;
  clamped: boolean;
} {
  const end = to ? new Date(to) : new Date();
  const earliest = new Date(end);
  earliest.setMonth(earliest.getMonth() - MAX_MONTHS_BACK);
  earliest.setDate(1);

  const requested = from ? new Date(from) : new Date(end);
  requested.setMonth(requested.getMonth() - DEFAULT_MONTHS_BACK);
  requested.setDate(1);

  const start = requested < earliest ? earliest : requested;

  return {
    from: start,
    to: end,
    clamped: start.getTime() !== requested.getTime(),
  };
}
