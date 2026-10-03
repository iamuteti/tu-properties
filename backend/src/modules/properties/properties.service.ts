import {
  BadRequestException,
  ConflictException,
  Injectable,
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
          securityDeposits: true,
          units: {
            orderBy: [{ status: 'asc' }, { name: 'asc' }],
            include: {
              rentalAgreements: {
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
        rentalAgreements: {
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
