import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UnitStatus } from '@prisma/client';

interface MonthlyBucket {
  month: string;
  label: string;
  charged: number;
  collected: number;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    // Unit has no organizationId column of its own; it is tenant-scoped
    // through its parent Property, so unit queries must filter by relation.
    const unitWhere = tenantId
      ? { property: { organizationId: tenantId } }
      : {};

    const [
      propertyCount,
      landlordCount,
      unitCount,
      activeTenantCount,
      unitsByStatus,
      units,
      invoices,
      payments,
    ] = await Promise.all([
      this.prisma.property.count({ where: { ...where, deletedAt: null } }),
      this.prisma.landlord.count({ where: { ...where, deletedAt: null } }),
      this.prisma.unit.count({ where: { ...unitWhere, deletedAt: null } }),
      this.prisma.tenant.count({
        where: { ...where, status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { ...unitWhere, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.unit.findMany({
        where: { ...unitWhere, deletedAt: null },
        select: { propertyId: true, property: { select: { name: true } } },
      }),
      this.prisma.invoice.findMany({
        where: { ...where, status: { not: 'DRAFT' } },
        select: { issueDate: true, totalAmount: true },
      }),
      this.prisma.payment.findMany({
        where,
        select: { paymentDate: true, amount: true },
      }),
    ]);

    const statusCounts = new Map<string, number>(
      unitsByStatus.map((row) => [row.status, row._count._all]),
    );
    const unitsByStatusAll = (Object.values(UnitStatus) as string[]).map(
      (status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      }),
    );

    const perProperty = new Map<string, { property: string; units: number }>();
    for (const unit of units) {
      const name = unit.property?.name ?? 'Unknown';
      const entry = perProperty.get(name) ?? { property: name, units: 0 };
      entry.units += 1;
      perProperty.set(name, entry);
    }
    const unitsByProperty = [...perProperty.values()]
      .sort((a, b) => b.units - a.units)
      .slice(0, 7);

    const now = new Date();
    const monthly: MonthlyBucket[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.push({
        month: this.monthKey(d),
        label: d.toLocaleString('en', { month: 'short' }),
        charged: 0,
        collected: 0,
      });
    }
    const byMonth = new Map(monthly.map((m) => [m.month, m]));

    for (const invoice of invoices) {
      const bucket = byMonth.get(this.monthKey(invoice.issueDate));
      if (bucket) bucket.charged += Number(invoice.totalAmount);
    }
    for (const payment of payments) {
      const bucket = byMonth.get(this.monthKey(payment.paymentDate));
      if (bucket) bucket.collected += Number(payment.amount);
    }

    return {
      totals: {
        properties: propertyCount,
        landlords: landlordCount,
        units: unitCount,
        activeTenants: activeTenantCount,
      },
      unitsByStatus: unitsByStatusAll,
      monthlyCharges: monthly.map(({ month, ...rest }) => rest),
      unitsByProperty,
    };
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}
