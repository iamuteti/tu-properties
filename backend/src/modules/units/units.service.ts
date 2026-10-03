import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AgreementStatus, Prisma, UnitStatus } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { parseCsv, toCsv } from '@/common/csv';
import type {
  CreateUnitDto,
  ImportUnitsDto,
  UpdateUnitDto,
} from './dto/unit.dto';
import {
  buildOccupancyContext,
  checkTransition,
  deriveOccupancyStatus,
} from './occupancy';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UnitFilters {
  propertyId?: string;
  status?: string;
  type?: string;
  /** Units belonging to a branch (the property's owning branch). */
  branchId?: string;
  floor?: string;
  bedrooms?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const SORTABLE_FIELDS = new Set([
  'code',
  'name',
  'status',
  'type',
  'baseRent',
  'floor',
  'bedrooms',
  'createdAt',
  'updatedAt',
]);

const UNIT_EXPORT_HEADERS = [
  'code',
  'name',
  'status',
  'propertyCode',
  'propertyName',
  'type',
  'floor',
  'bedrooms',
  'bathrooms',
  'areaSqFt',
  'baseRent',
  'currency',
  'furnished',
  'currentTenant',
  'leaseEnd',
];

const UNIT_IMPORT_HEADERS = [
  'propertyCode',
  'name',
  'type',
  'floor',
  'bedrooms',
  'bathrooms',
  'areaSqFt',
  'baseRent',
  'currency',
  'furnished',
  'ownerOccupied',
];

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateUnitDto, tenantId?: string) {
    // The parent property must belong to the caller's organization. Without
    // this check a tenant could attach units to another tenant's property.
    await assertTenantRecord(this.prisma.property, {
      id: data.propertyId,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    const {
      features,
      serviceCharges,
      meterNumbers,
      takeOnLettingDate,
      status,
      propertyId,
      ...scalars
    } = data;

    if (status && status !== UnitStatus.VACANT) {
      throw new BadRequestException(
        'A new unit is always created VACANT. Change its occupancy status through the status actions once a rental agreement exists.',
      );
    }

    return this.createWithGeneratedCode(
      {
        ...scalars,
        property: { connect: { id: propertyId } },
        ...(takeOnLettingDate
          ? { takeOnLettingDate: new Date(takeOnLettingDate) }
          : {}),
        ...(features?.length
          ? { features: { create: features.map(featureInput) } }
          : {}),
        ...(serviceCharges?.length
          ? { serviceCharges: { create: serviceCharges } }
          : {}),
        ...(meterNumbers?.length
          ? { meterNumbers: { create: meterNumbers } }
          : {}),
      },
      data.propertyId,
      tenantId,
    );
  }

  /**
   * Unit codes must be unique table-wide. Generate them inside a transaction
   * with a bounded retry so two concurrent creates cannot collide on
   * `count + 1` (the previous implementation counted *all* units in the
   * database, across every tenant, and had no retry at all).
   */
  private async createWithGeneratedCode(
    data: Omit<Prisma.UnitCreateInput, 'code'>,
    propertyId: string,
    tenantId?: string,
    attempt = 0,
  ): Promise<CreatedUnit> {
    const code = await this.nextUnitCode(propertyId, tenantId);

    try {
      return await this.prisma.unit.create({
        data: { ...data, code },
        include: { property: true, features: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        attempt < 5
      ) {
        return this.createWithGeneratedCode(
          data,
          propertyId,
          tenantId,
          attempt + 1,
        );
      }
      throw error;
    }
  }

  private async nextUnitCode(propertyId: string, tenantId?: string) {
    const count = await this.prisma.unit.count({
      where: {
        propertyId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
    });
    return `UNIT-${String(count + 1).padStart(3, '0')}`;
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: UnitFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;
    const orderField = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';

    const where: Prisma.UnitWhereInput = tenantId
      ? { property: { organizationId: tenantId } }
      : {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (filters) {
      if (filters.propertyId) where.propertyId = filters.propertyId;
      if (filters.status) where.status = filters.status as UnitStatus;
      if (filters.type) where.type = filters.type;
      if (filters.branchId) where.property = { branchId: filters.branchId };
      if (filters.floor) where.floor = Number(filters.floor);
      if (filters.bedrooms) where.bedrooms = Number(filters.bedrooms);
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.unit.findMany({
          where,
          skip,
          take: limit,
          include: {
            property: { select: { id: true, name: true, code: true } },
            rentalAgreements: {
              where: { status: AgreementStatus.ACTIVE },
              orderBy: { startDate: 'desc' },
              take: 1,
              include: { tenant: true },
            },
          },
          orderBy: { [orderField]: sortOrder },
        }),
        tx.unit.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where: Prisma.UnitWhereInput = {
      id,
      ...(tenantId ? { property: { organizationId: tenantId } } : {}),
    };

    const unit = await requireRecord(
      this.prisma.unit.findFirst({
        where,
        include: {
          property: true,
          features: { orderBy: { name: 'asc' } },
          serviceCharges: true,
          meterNumbers: true,
          rentalAgreements: {
            orderBy: { startDate: 'desc' },
            include: {
              tenant: true,
              invoices: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                  dueDate: true,
                  balanceAmount: true,
                  currency: true,
                },
              },
            },
          },
        },
      }),
      'Unit',
    );

    const agreements = unit.rentalAgreements.map((agreement) => ({
      status: agreement.status,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
    }));

    return {
      ...unit,
      occupancy: {
        status: unit.status,
        derivedStatus: deriveOccupancyStatus(agreements, unit.status),
        availableActions: availableActions(unit.status, agreements),
      },
    };
  }

  async update(id: string, data: UpdateUnitDto, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.unit, {
        id,
        property: { organizationId: tenantId },
      });
    }

    const {
      features,
      serviceCharges,
      meterNumbers,
      takeOnLettingDate,
      propertyId,
      ...scalars
    } = data;

    if (propertyId) {
      await assertTenantRecord(this.prisma.property, {
        id: propertyId,
        ...(tenantId ? { organizationId: tenantId } : {}),
      });
    }

    return this.prisma.unit.update({
      where: { id },
      data: {
        ...scalars,
        ...(propertyId ? { property: { connect: { id: propertyId } } } : {}),
        ...(takeOnLettingDate
          ? { takeOnLettingDate: new Date(takeOnLettingDate) }
          : {}),
        ...(features
          ? {
              features: {
                deleteMany: {},
                create: features.map(featureInput),
              },
            }
          : {}),
        ...(serviceCharges
          ? {
              serviceCharges: {
                deleteMany: {},
                create: serviceCharges,
              },
            }
          : {}),
        ...(meterNumbers
          ? {
              meterNumbers: {
                deleteMany: {},
                create: meterNumbers,
              },
            }
          : {}),
      } as Prisma.UnitUpdateInput,
      include: { property: true, features: true },
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.unit, {
        id,
        property: { organizationId: tenantId },
      });
    }

    // Rental agreements reference units with `onDelete: Restrict`, so deleting
    // a tenanted unit would surface as a 500 FK violation.
    const agreements = await this.prisma.rentalAgreement.count({
      where: { unitId: id },
    });
    if (agreements > 0) {
      throw new ConflictException(
        `This unit is referenced by ${agreements} rental agreement(s). Terminate or reassign them before deleting the unit.`,
      );
    }

    return this.prisma.unit.delete({ where: { id } });
  }

  // ------------------------------------------------------- status transitions

  /**
   * Change occupancy status after validating the transition against the unit's
   * rental agreements. This is the only supported way to move a unit between
   * VACANT / OCCUPIED / RESERVED / MAINTENANCE.
   */
  async setStatus(id: string, target: UnitStatus, tenantId?: string) {
    await assertTenantRecord(this.prisma.unit, {
      id,
      ...(tenantId ? { property: { organizationId: tenantId } } : {}),
    });

    const unit = await this.prisma.unit.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!unit) throw new BadRequestException('Unit not found.');

    const agreements = await this.prisma.rentalAgreement.findMany({
      where: { unitId: id },
      select: { status: true, startDate: true, endDate: true },
    });

    const check = checkTransition(
      unit.status,
      target,
      buildOccupancyContext(agreements),
    );
    if (!check.allowed) {
      throw new ConflictException(check.reason);
    }

    return this.prisma.unit.update({
      where: { id },
      data: { status: target },
      include: { property: true },
    });
  }

  /**
   * Re-derive a unit's occupancy status from its rental agreements. Called by
   * the leases module whenever an agreement changes, and exposed so a property
   * manager can repair drifted data on demand.
   */
  async syncOccupancyStatus(id: string, tenantId?: string) {
    await assertTenantRecord(this.prisma.unit, {
      id,
      ...(tenantId ? { property: { organizationId: tenantId } } : {}),
    });

    const unit = await this.prisma.unit.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!unit) throw new BadRequestException('Unit not found.');

    const agreements = await this.prisma.rentalAgreement.findMany({
      where: { unitId: id },
      select: { status: true, startDate: true, endDate: true },
    });

    const derived = deriveOccupancyStatus(agreements, unit.status);
    if (derived === unit.status) {
      return { id, status: unit.status, changed: false };
    }

    await this.prisma.unit.update({
      where: { id },
      data: { status: derived },
    });
    return { id, status: derived, changed: true };
  }

  // ------------------------------------------------------------ export/import

  async exportCsv(
    tenantId?: string,
    filters?: UnitFilters,
    search?: string,
  ): Promise<string> {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      filters,
    );

    const rows = (data as unknown as UnitExportRow[]).map((unit) => {
      const agreement = unit.rentalAgreements?.[0];
      return {
        code: unit.code,
        name: unit.name,
        status: unit.status,
        propertyCode: unit.property?.code ?? '',
        propertyName: unit.property?.name ?? '',
        type: unit.type ?? '',
        floor: unit.floor ?? '',
        bedrooms: unit.bedrooms ?? '',
        bathrooms: unit.bathrooms ?? '',
        areaSqFt: unit.areaSqFt ?? '',
        baseRent: unit.baseRent ?? '',
        currency: unit.currency ?? '',
        furnished: unit.furnished ? 'yes' : 'no',
        currentTenant: agreement?.tenant
          ? `${agreement.tenant.surname} ${agreement.tenant.otherNames ?? ''}`.trim()
          : '',
        leaseEnd: agreement?.endDate ?? '',
      };
    });

    return toCsv(UNIT_EXPORT_HEADERS, rows);
  }

  importTemplate(): string {
    return toCsv(UNIT_IMPORT_HEADERS, []);
  }

  async importCsv(dto: ImportUnitsDto, tenantId?: string) {
    const parsed = parseCsv(dto.csv);

    if (parsed.errors.length > 0) {
      throw new BadRequestException(parsed.errors);
    }

    const missingHeaders = ['propertyCode', 'name'].filter(
      (header) => !parsed.headers.includes(header),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `The file is missing required column(s): ${missingHeaders.join(', ')}. ` +
          'Download the import template for the expected layout.',
      );
    }

    const results: Array<{
      row: number;
      name: string;
      status: 'created' | 'skipped' | 'failed';
      id?: string;
      message?: string;
    }> = [];

    const propertyCache = new Map<string, string | null>();

    const resolvePropertyId = async (propertyCode: string) => {
      if (propertyCache.has(propertyCode)) {
        return propertyCache.get(propertyCode) ?? undefined;
      }

      const property = await this.prisma.property.findFirst({
        where: {
          code: propertyCode,
          ...(tenantId ? { organizationId: tenantId } : {}),
        },
        select: { id: true },
      });

      if (!property && dto.createMissingProperties) {
        const created = await this.prisma.property.create({
          data: {
            code: propertyCode,
            name: propertyCode,
            ...(tenantId
              ? { organization: { connect: { id: tenantId } } }
              : {}),
          } as Prisma.PropertyCreateInput,
          select: { id: true },
        });
        propertyCache.set(propertyCode, created.id);
        return created.id;
      }

      propertyCache.set(propertyCode, property?.id ?? null);
      return property?.id;
    };

    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;
      const name = row.name ?? '';

      if (!row.propertyCode || !name) {
        results.push({
          row: rowNumber,
          name,
          status: 'failed',
          message: 'Both "propertyCode" and "name" are required.',
        });
        continue;
      }

      try {
        const propertyId = await resolvePropertyId(row.propertyCode);
        if (!propertyId) {
          results.push({
            row: rowNumber,
            name,
            status: 'failed',
            message: `No property with code "${row.propertyCode}" exists in your organization.`,
          });
          continue;
        }

        const existing = await this.prisma.unit.findFirst({
          where: { propertyId, name },
          select: { id: true },
        });
        if (existing) {
          results.push({
            row: rowNumber,
            name,
            status: 'skipped',
            message: 'A unit with this name already exists on the property.',
          });
          continue;
        }

        if (dto.dryRun) {
          results.push({ row: rowNumber, name, status: 'created' });
          continue;
        }

        const created = await this.createWithGeneratedCode(
          {
            name,
            property: { connect: { id: propertyId } },
            type: row.type || undefined,
            floor: row.floor ? Number(row.floor) : undefined,
            bedrooms: row.bedrooms ? Number(row.bedrooms) : undefined,
            bathrooms: row.bathrooms ? Number(row.bathrooms) : undefined,
            areaSqFt: row.areaSqFt ? Number(row.areaSqFt) : undefined,
            baseRent: row.baseRent ? Number(row.baseRent) : undefined,
            currency: row.currency || undefined,
            furnished: parseYesNo(row.furnished),
            ownerOccupied: parseYesNo(row.ownerOccupied),
          },
          propertyId,
          tenantId,
        );

        results.push({
          row: rowNumber,
          name,
          status: 'created',
          id: created.id,
        });
      } catch (error) {
        results.push({
          row: rowNumber,
          name,
          status: 'failed',
          message:
            error instanceof Error
              ? error.message
              : 'Unknown error while importing row.',
        });
      }
    }

    return {
      total: parsed.rows.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      dryRun: dto.dryRun === true,
      results,
    };
  }
}

/** A newly created unit, as returned by create/update. */
type CreatedUnit = Prisma.UnitGetPayload<{
  include: { property: true; features: true };
}>;

/**
 * A unit row as returned by `findAll` (property summary + the newest active
 * agreement), narrowed for the CSV export.
 */
interface UnitExportRow {
  code: string;
  name: string;
  status: string;
  property?: { code?: string | null; name?: string | null } | null;
  type?: string | null;
  floor?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaSqFt?: number | string | null;
  baseRent?: number | string | null;
  currency?: string | null;
  furnished?: boolean | null;
  rentalAgreements?: Array<{
    endDate?: Date | string | null;
    tenant?: { surname?: string | null; otherNames?: string | null } | null;
  }>;
}

/** Statuses a unit can legally move to right now, for the UI action buttons. */
function availableActions(
  current: UnitStatus,
  agreements: Array<{
    status: AgreementStatus;
    startDate: Date;
    endDate: Date | null;
  }>,
): UnitStatus[] {
  const context = buildOccupancyContext(agreements);
  return Object.values(UnitStatus).filter(
    (target) => checkTransition(current, target, context).allowed,
  );
}

function featureInput(feature: { name: string; featureType?: string }) {
  return {
    name: feature.name,
    featureType: feature.featureType ?? null,
  };
}

function parseYesNo(value?: string): boolean | undefined {
  if (!value) return undefined;
  return ['true', 'yes', 'y', '1'].includes(value.trim().toLowerCase());
}
