import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { UnitsService } from '@/modules/units/units.service';

@Injectable()
export class RentalAgreementsService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  async create(data: Prisma.RentalAgreementCreateInput, tenantId?: string) {
    if (tenantId) {
      applyTenant(data, tenantId);
    }

    const agreement = await this.prisma.rentalAgreement.create({
      data: coerceAgreementDates(data),
    });

    // An agreement is the source of truth for occupancy: keep the unit's
    // status in step as soon as one exists (Module 2).
    if (agreement.unitId) {
      await this.unitsService.syncOccupancyStatus(agreement.unitId, tenantId);
    }

    return agreement;
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.rentalAgreement.findMany({
      where,
      include: {
        unit: {
          include: {
            property: true,
          },
        },
        tenant: true,
        invoices: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.rentalAgreement.findFirst({
        where,
        include: {
          unit: true,
          tenant: true,
          invoices: true,
          payments: true,
        },
      }),
      'Rental agreement',
    );
  }

  async update(
    id: string,
    data: Prisma.RentalAgreementUpdateInput,
    tenantId?: string,
  ) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.rentalAgreement, {
        id,
        organizationId: tenantId,
      });
    }

    const before = await this.prisma.rentalAgreement.findUnique({
      where: { id },
      select: { unitId: true },
    });

    const agreement = await this.prisma.rentalAgreement.update({
      where: { id },
      data: coerceAgreementDates(data),
    });

    // Status/date changes (and moves to another unit) change occupancy.
    for (const unitId of new Set(
      [before?.unitId, agreement.unitId].filter(Boolean) as string[],
    )) {
      await this.unitsService.syncOccupancyStatus(unitId, tenantId);
    }

    return agreement;
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.rentalAgreement, {
        id,
        organizationId: tenantId,
      });
    }

    const agreement = await this.prisma.rentalAgreement.delete({
      where: { id },
    });

    // The unit is no longer let, so it cannot stay OCCUPIED.
    await this.unitsService.syncOccupancyStatus(agreement.unitId, tenantId);

    return agreement;
  }
}

/**
 * The leases controller still accepts a raw Prisma payload, so HTML date inputs
 * arrive as `"2026-01-01"` strings. Prisma rejects those for a `DateTime`
 * column, which turned every lease create into a 500.
 */
function coerceAgreementDates<
  T extends
    | Prisma.RentalAgreementCreateInput
    | Prisma.RentalAgreementUpdateInput,
>(data: T): T {
  const record = data as Record<string, unknown>;
  for (const field of ['startDate', 'endDate']) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') {
      record[field] = new Date(value);
    }
  }
  return data;
}

/**
 * Pin the agreement to the caller's organization.
 *
 * The browser sends scalar foreign keys (`unitId`, `tenantId`), which makes the
 * payload a Prisma *unchecked* create. Injecting a nested `organization: {
 * connect }` into an unchecked payload is rejected by Prisma, so the tenant is
 * written as the scalar `organizationId` unless the caller already supplied the
 * relation itself.
 */
function applyTenant(
  data: Prisma.RentalAgreementCreateInput,
  tenantId: string,
): void {
  if (data.organization) {
    data.organization = { connect: { id: tenantId } };
    return;
  }
  (data as Record<string, unknown>).organizationId = tenantId;
}
