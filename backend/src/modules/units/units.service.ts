import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

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

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, tenantId?: string) {
    if (tenantId) {
      data.property = { connect: { id: data.property?.connect?.id } };
      // Note: Property should already have organizationId set
    }

    // Generate unique unit code
    const count = await this.prisma.unit.count();
    const nextNumber = count + 1;
    const code = `UNIT-${String(nextNumber).padStart(3, '0')}`;

    data.code = code;

    return this.prisma.unit.create({
      data: data as Prisma.UnitCreateInput,
      include: {
        property: true,
      },
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: UnitFilters,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { property: { organizationId: tenantId } } : {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (filters) {
      if (filters.propertyId) where.propertyId = filters.propertyId;
      if (filters.status) where.status = filters.status;
      if (filters.type) where.type = filters.type;
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.unit.findMany({
          where,
          skip,
          take: limit,
          include: {
            property: true,
            rentalAgreements: {
              orderBy: { startDate: 'desc' },
              take: 1,
              include: { tenant: true },
            },
          },
          orderBy: { [sortBy]: sortOrder },
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

  findOne(id: string, tenantId?: string) {
    const where = tenantId
      ? { id, property: { organizationId: tenantId } }
      : { id };
    return this.prisma.unit.findUnique({
      where,
      include: {
        property: true,
        rentalAgreements: true,
      },
    });
  }

  update(id: string, data: Prisma.UnitUpdateInput, tenantId?: string) {
    const where = tenantId
      ? { id, property: { organizationId: tenantId } }
      : { id };
    return this.prisma.unit.update({
      where,
      data,
    });
  }

  remove(id: string, tenantId?: string) {
    const where = tenantId
      ? { id, property: { organizationId: tenantId } }
      : { id };
    return this.prisma.unit.delete({ where });
  }
}
