import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, PropertyStatus, UnitStatus } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { parseCsv, toCsv } from '@/common/csv';
import type {
  AmenityInputDto,
  CreatePropertyDto,
  ImportPropertiesDto,
  UpdatePropertyDto,
} from './dto/property.dto';
import type { CreateUnitTypeDto, UpdateUnitTypeDto } from './dto/unit-type.dto';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PropertyFilters {
  type?: string;
  category?: string;
  status?: string;
  landlordId?: string;
  branchId?: string;
  /** Include ARCHIVED properties in the result set (default: excluded). */
  includeArchived?: boolean;
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

const PROPERTY_EXPORT_HEADERS = [
  'code',
  'name',
  'status',
  'type',
  'category',
  'landlordCode',
  'landlordName',
  'branchCode',
  'estateArea',
  'areaRegion',
  'country',
  'roadStreet',
  'numberOfFloors',
  'units',
  'dateAcquired',
  'lrNumber',
];

const SORTABLE_FIELDS = new Set([
  'code',
  'name',
  'status',
  'type',
  'category',
  'numberOfFloors',
  'createdAt',
  'updatedAt',
]);

const PROPERTY_IMPORT_HEADERS = [
  'code',
  'name',
  'type',
  'category',
  'status',
  'landlordCode',
  'branchCode',
  'estateArea',
  'areaRegion',
  'country',
  'roadStreet',
  'numberOfFloors',
  'dateAcquired',
  'lrNumber',
  'notes',
];

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreatePropertyDto, tenantId?: string) {
    const { amenities, dateAcquired, landlordId, branchId, ...scalars } = data;

    await this.assertRelationsBelongToTenant(landlordId, branchId, tenantId);

    if (tenantId) {
      await this.assertWithinPropertyLimit(tenantId);
      const duplicate = await this.prisma.property.findFirst({
        where: { organizationId: tenantId, code: scalars.code },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Property code "${scalars.code}" is already in use.`,
        );
      }
    }

    return this.prisma.property.create({
      data: {
        ...scalars,
        ...(dateAcquired ? { dateAcquired: new Date(dateAcquired) } : {}),
        ...(landlordId ? { landlord: { connect: { id: landlordId } } } : {}),
        ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
        ...(tenantId ? { organization: { connect: { id: tenantId } } } : {}),
        ...(amenities?.length
          ? { amenities: { create: normalizeAmenities(amenities) } }
          : {}),
      } as Prisma.PropertyCreateInput,
      include: { amenities: true, branch: true },
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: PropertyFilters,
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

    const where: Prisma.PropertyWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};

    if (filters) {
      if (filters.type) where.type = filters.type;
      if (filters.category) where.category = filters.category;
      if (filters.landlordId) where.landlordId = filters.landlordId;
      if (filters.branchId) where.branchId = filters.branchId;
    }

    // Archived properties stay out of day-to-day listings unless the caller
    // asks for a specific status or explicitly includes them.
    if (filters?.status) {
      where.status = filters.status as PropertyStatus;
    } else if (!filters?.includeArchived) {
      where.status = { not: PropertyStatus.ARCHIVED };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { lrNumber: { contains: search, mode: 'insensitive' } },
        { roadStreet: { contains: search, mode: 'insensitive' } },
        { estateArea: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.property.findMany({
          where,
          skip,
          take: limit,
          include: {
            landlord: true,
            branch: true,
            _count: {
              select: { units: true, amenities: true },
            },
          },
          orderBy: { [orderField]: sortOrder },
        }),
        tx.property.count({ where }),
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
    const where: Prisma.PropertyWhereInput = {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    };

    const property = await requireRecord(
      this.prisma.property.findFirst({
        where,
        include: {
          landlord: true,
          branch: true,
          amenities: { orderBy: { name: 'asc' } },
          standingCharges: true,
          // The property's own unit types and the deposit each of them
          // carries. This is the onboarding picture: a property declares
          // "1B, 2B, 3B" and what each is worth as a deposit.
          unitTypes: {
            orderBy: { code: 'asc' },
            include: { depositRule: true },
          },
          units: {
            orderBy: [{ status: 'asc' }, { name: 'asc' }],
            include: {
              agreements: {
                where: { status: 'ACTIVE' },
                orderBy: { startDate: 'desc' },
                take: 1,
                include: { tenant: true },
              },
            },
          },
        },
      }),
      'Property',
    );

    return { ...property, occupancy: summarizeOccupancy(property.units) };
  }

  async update(id: string, data: UpdatePropertyDto, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.property, {
        id,
        organizationId: tenantId,
      });
    }

    const { amenities, dateAcquired, landlordId, branchId, code, ...scalars } =
      data;

    await this.assertRelationsBelongToTenant(landlordId, branchId, tenantId);

    if (code) {
      const duplicate = await this.prisma.property.findFirst({
        where: {
          code,
          ...(tenantId ? { organizationId: tenantId } : {}),
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Property code "${code}" is already in use.`,
        );
      }
    }

    return this.prisma.property.update({
      where: { id },
      data: {
        ...scalars,
        ...(code ? { code } : {}),
        ...(dateAcquired ? { dateAcquired: new Date(dateAcquired) } : {}),
        ...(landlordId !== undefined
          ? landlordId === null
            ? { landlord: { disconnect: true } }
            : { landlord: { connect: { id: landlordId } } }
          : {}),
        ...(branchId !== undefined
          ? branchId === null
            ? { branch: { disconnect: true } }
            : { branch: { connect: { id: branchId } } }
          : {}),
        ...(amenities
          ? {
              amenities: {
                deleteMany: {},
                create: normalizeAmenities(amenities),
              },
            }
          : {}),
      } as Prisma.PropertyUpdateInput,
      include: { amenities: true, branch: true },
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.property, {
        id,
        organizationId: tenantId,
      });
    }

    const unitCount = await this.prisma.unit.count({
      where: { propertyId: id },
    });
    if (unitCount > 0) {
      throw new ConflictException(
        `This property still has ${unitCount} unit(s). Delete or move them before deleting the property.`,
      );
    }

    return this.prisma.property.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- unit types

  /**
   * The property's own kinds of unit, with the deposit rule on each.
   *
   * This is the onboarding picture: a property declares "1B, 2B, 3B" and what
   * each of them costs as a deposit. A type with **no rule** is "nobody has
   * decided the deposit yet", which is a different thing from a rule of zero —
   * "this kind of unit takes no deposit" — and the two are kept apart.
   */
  async listUnitTypes(id: string, tenantId?: string) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    return this.prisma.propertyUnitType.findMany({
      where: { propertyId: id },
      orderBy: { code: 'asc' },
      include: {
        depositRule: true,
        _count: { select: { units: true } },
      },
    });
  }

  async createUnitType(id: string, dto: CreateUnitTypeDto, tenantId?: string) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    const code = dto.code.trim();
    if (!code) {
      throw new BadRequestException('A unit type needs a code.');
    }

    const existing = await this.prisma.propertyUnitType.findFirst({
      where: { propertyId: id, code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `This property already has a unit type called "${code}".`,
      );
    }

    return this.prisma.propertyUnitType.create({
      data: {
        propertyId: id,
        code,
        name: dto.name.trim(),
        bedrooms: dto.bedrooms ?? null,
        bathrooms: dto.bathrooms ?? null,
      },
      include: { depositRule: true, _count: { select: { units: true } } },
    });
  }

  async updateUnitType(
    unitTypeId: string,
    dto: UpdateUnitTypeDto,
    tenantId?: string,
  ) {
    const unitType = await this.prisma.propertyUnitType.findFirst({
      where: {
        id: unitTypeId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
      select: { id: true, propertyId: true },
    });
    if (!unitType) {
      throw new NotFoundException('Unit type not found.');
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      const clash = await this.prisma.propertyUnitType.findFirst({
        where: {
          propertyId: unitType.propertyId,
          code: { equals: code, mode: 'insensitive' },
          NOT: { id: unitTypeId },
        },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `This property already has a unit type called "${code}".`,
        );
      }
    }

    return this.prisma.propertyUnitType.update({
      where: { id: unitTypeId },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
        ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {}),
      },
      include: { depositRule: true, _count: { select: { units: true } } },
    });
  }

  /**
   * Remove a kind of unit.
   *
   * The units that were of this kind keep existing and lose their type — they
   * are not deleted, because a unit is somebody's home. The deposit rule goes
   * with the type, which puts that kind of unit back to "nobody has decided"
   * rather than silently to "no deposit".
   */
  async removeUnitType(unitTypeId: string, tenantId?: string) {
    const unitType = await this.prisma.propertyUnitType.findFirst({
      where: {
        id: unitTypeId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
      select: { id: true, _count: { select: { units: true } } },
    });
    if (!unitType) {
      throw new NotFoundException('Unit type not found.');
    }

    await this.prisma.propertyUnitType.delete({ where: { id: unitTypeId } });
    return {
      id: unitTypeId,
      removed: true,
      unitsLeftUntyped: unitType._count.units,
    };
  }

  // ---------------------------------------------------------------- amenities

  async listAmenities(id: string, tenantId?: string) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });
    return this.prisma.propertyAmenity.findMany({
      where: { propertyId: id },
      orderBy: { name: 'asc' },
    });
  }

  async addAmenity(id: string, dto: AmenityInputDto, tenantId?: string) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    const [amenity] = normalizeAmenities([dto]);
    return this.prisma.propertyAmenity.upsert({
      where: { propertyId_name: { propertyId: id, name: amenity.name } },
      create: { ...amenity, propertyId: id },
      update: {
        category: amenity.category ?? null,
        notes: amenity.notes ?? null,
      },
    });
  }

  async replaceAmenities(
    id: string,
    amenities: AmenityInputDto[],
    tenantId?: string,
  ) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    const normalized = normalizeAmenities(amenities);
    return this.prisma.$transaction(async (tx) => {
      await tx.propertyAmenity.deleteMany({ where: { propertyId: id } });
      if (normalized.length === 0) return [];
      await tx.propertyAmenity.createMany({
        data: normalized.map((amenity) => ({ ...amenity, propertyId: id })),
        skipDuplicates: true,
      });
      return tx.propertyAmenity.findMany({
        where: { propertyId: id },
        orderBy: { name: 'asc' },
      });
    });
  }

  async removeAmenity(id: string, amenityId: string, tenantId?: string) {
    await assertTenantRecord(this.prisma.property, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });
    await requireRecord(
      this.prisma.propertyAmenity.findFirst({
        where: { id: amenityId, propertyId: id },
      }),
      'Amenity',
    );
    return this.prisma.propertyAmenity.delete({ where: { id: amenityId } });
  }

  // -------------------------------------------------------------- occupancy

  /**
   * Availability calendar feed: vacant units plus leases that end inside the
   * requested window (the "available from" pipeline every competitor shows).
   */
  async availability(
    tenantId?: string,
    options?: { propertyId?: string; from?: Date; to?: Date },
  ) {
    const from = options?.from ?? new Date();
    const to =
      options?.to ?? new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);

    const unitWhere: Prisma.UnitWhereInput = {
      ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      ...(options?.propertyId ? { propertyId: options.propertyId } : {}),
      // A unit under maintenance is not available to a prospect, and neither
      // is one that is currently let.
      status: { in: [UnitStatus.VACANT, UnitStatus.RESERVED] },
    };

    return this.prisma.unit.findMany({
      where: unitWhere,
      include: {
        property: { select: { id: true, name: true, code: true } },
        agreements: {
          where: {
            status: 'ACTIVE',
            // Leases ending inside the window are the "coming available"
            // pipeline; open-ended ones are always relevant.
            OR: [{ endDate: null }, { endDate: { gte: from, lte: to } }],
          },
          orderBy: { endDate: 'asc' },
          include: { tenant: true },
        },
      },
      orderBy: [{ propertyId: 'asc' }, { name: 'asc' }],
    });
  }

  async occupancySummary(tenantId?: string) {
    const grouped = await this.prisma.unit.groupBy({
      by: ['status'],
      where: tenantId ? { property: { organizationId: tenantId } } : {},
      _count: { _all: true },
    });
    return grouped.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }

  // ------------------------------------------------------------ export/import

  async exportCsv(
    tenantId?: string,
    filters?: PropertyFilters,
    search?: string,
  ): Promise<string> {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      { ...filters, includeArchived: filters?.includeArchived ?? true },
    );

    const rows = (data as unknown as PropertyExportRow[]).map((property) => ({
      code: property.code,
      name: property.name,
      status: property.status,
      type: property.type ?? '',
      category: property.category ?? '',
      landlordCode: property.landlord?.code ?? '',
      landlordName: property.landlord?.name ?? '',
      branchCode: property.branch?.code ?? property.branch?.name ?? '',
      estateArea: property.estateArea ?? '',
      areaRegion: property.areaRegion ?? '',
      country: property.country ?? '',
      roadStreet: property.roadStreet ?? '',
      numberOfFloors: property.numberOfFloors ?? '',
      units: property._count?.units ?? 0,
      dateAcquired: property.dateAcquired ?? '',
      lrNumber: property.lrNumber ?? '',
    }));

    return toCsv(PROPERTY_EXPORT_HEADERS, rows);
  }

  importTemplate(): string {
    return toCsv(PROPERTY_IMPORT_HEADERS, []);
  }

  /**
   * Bulk import properties from CSV. Each row is validated and reported
   * independently so one bad row never blocks the rest of the file.
   */
  async importCsv(dto: ImportPropertiesDto, tenantId?: string) {
    const parsed = parseCsv(dto.csv);

    if (parsed.errors.length > 0) {
      throw new BadRequestException(parsed.errors);
    }

    const missingHeaders = ['code', 'name'].filter(
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
      code: string;
      status: 'created' | 'skipped' | 'failed';
      id?: string;
      message?: string;
    }> = [];

    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2; // header is row 1
      const code = row.code ?? '';

      if (!code || !row.name) {
        results.push({
          row: rowNumber,
          code,
          status: 'failed',
          message: 'Both "code" and "name" are required.',
        });
        continue;
      }

      try {
        const landlordId = await this.resolveLandlordId(
          row.landlordCode,
          tenantId,
        );
        const branchId = await this.resolveBranchId(row.branchCode, tenantId);

        const existing = tenantId
          ? await this.prisma.property.findFirst({
              where: { organizationId: tenantId, code },
              select: { id: true },
            })
          : await this.prisma.property.findFirst({
              where: { code },
              select: { id: true },
            });

        if (existing) {
          results.push({
            row: rowNumber,
            code,
            status: 'skipped',
            message: 'A property with this code already exists.',
          });
          continue;
        }

        if (dto.dryRun) {
          results.push({ row: rowNumber, code, status: 'created' });
          continue;
        }

        const created = await this.create(
          {
            code,
            name: row.name,
            type: row.type || undefined,
            category: row.category || undefined,
            status: (row.status as PropertyStatus) || undefined,
            landlordId,
            branchId,
            estateArea: row.estateArea || undefined,
            areaRegion: row.areaRegion || undefined,
            country: row.country || undefined,
            roadStreet: row.roadStreet || undefined,
            numberOfFloors: row.numberOfFloors
              ? Number(row.numberOfFloors)
              : undefined,
            dateAcquired: row.dateAcquired || undefined,
            lrNumber: row.lrNumber || undefined,
            notes: row.notes || undefined,
          } as CreatePropertyDto,
          tenantId,
        );

        results.push({
          row: rowNumber,
          code,
          status: 'created',
          id: created.id,
        });
      } catch (error) {
        results.push({
          row: rowNumber,
          code,
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

  // ---------------------------------------------------------------- helpers

  /**
   * A landlord or branch id supplied by a client must belong to the caller's
   * organization — otherwise tenant A could attach its property to tenant B's
   * landlord record.
   */
  /**
   * Module 19 Phase C — plan-limit enforcement.
   *
   * `Organization.maxProperties` was set in seed data and never read (master
   * doc audit row 39): an org on a 10-property plan could register unlimited
   * buildings. Soft-deleted rows do not consume the allowance — an archived
   * property is not a property the org is running.
   */
  private async assertWithinPropertyLimit(tenantId: string): Promise<void> {
    const [org, count] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: tenantId },
        select: { maxProperties: true },
      }),
      this.prisma.property.count({
        where: { organizationId: tenantId, deletedAt: null },
      }),
    ]);
    if (org && count >= org.maxProperties) {
      throw new ConflictException(
        `Property limit reached for this organization (max ${org.maxProperties}). Upgrade the plan to add more properties.`,
      );
    }
  }

  private async assertRelationsBelongToTenant(
    landlordId: string | null | undefined,
    branchId: string | null | undefined,
    tenantId?: string,
  ) {
    if (!tenantId) return;

    if (landlordId) {
      const landlord = await this.prisma.landlord.findFirst({
        where: { id: landlordId, organizationId: tenantId },
        select: { id: true },
      });
      if (!landlord) {
        throw new BadRequestException(
          'The selected landlord does not exist in your organization.',
        );
      }
    }

    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: tenantId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException(
          'The selected branch does not exist in your organization.',
        );
      }
    }
  }

  private async resolveLandlordId(
    landlordCode: string | undefined,
    tenantId?: string,
  ): Promise<string | undefined> {
    if (!landlordCode) return undefined;
    const landlord = await this.prisma.landlord.findFirst({
      where: {
        code: landlordCode,
        ...(tenantId ? { organizationId: tenantId } : {}),
      },
      select: { id: true },
    });
    if (!landlord) {
      throw new BadRequestException(
        `No landlord with code "${landlordCode}" exists in your organization.`,
      );
    }
    return landlord.id;
  }

  private async resolveBranchId(
    branchCode: string | undefined,
    tenantId?: string,
  ): Promise<string | undefined> {
    if (!branchCode) return undefined;
    const branch = await this.prisma.branch.findFirst({
      where: {
        OR: [{ code: branchCode }, { name: branchCode }],
        ...(tenantId ? { organizationId: tenantId } : {}),
      },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(
        `No branch matching "${branchCode}" exists in your organization.`,
      );
    }
    return branch.id;
  }
}

/**
 * A property row as returned by `findAll` (landlord/branch summary + unit
 * count), narrowed for the CSV export.
 */
interface PropertyExportRow {
  code: string;
  name: string;
  status: string;
  type?: string | null;
  category?: string | null;
  landlord?: { code?: string | null; name?: string | null } | null;
  branch?: { code?: string | null; name?: string | null } | null;
  estateArea?: string | null;
  areaRegion?: string | null;
  country?: string | null;
  roadStreet?: string | null;
  numberOfFloors?: number | null;
  dateAcquired?: Date | string | null;
  lrNumber?: string | null;
  _count?: { units: number };
}

/** De-duplicate and normalise amenity input before it reaches the database. */
function normalizeAmenities(
  amenities: AmenityInputDto[],
): Array<{ name: string; category?: string | null; notes?: string | null }> {
  const seen = new Set<string>();
  const rows: Array<{
    name: string;
    category?: string | null;
    notes?: string | null;
  }> = [];

  for (const amenity of amenities) {
    const name = amenity.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name,
      category: amenity.category?.trim() || null,
      notes: amenity.notes?.trim() || null,
    });
  }

  return rows;
}

/** Occupancy rollup for a property's units, used by the detail page. */
export function summarizeOccupancy(
  units: Array<{ status: string }>,
): Record<string, number> & { total: number } {
  const summary: Record<string, number> & { total: number } = { total: 0 };
  for (const unit of units) {
    summary.total += 1;
    summary[unit.status] = (summary[unit.status] ?? 0) + 1;
  }
  return summary;
}
