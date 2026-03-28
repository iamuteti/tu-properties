import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

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
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  create(data: Prisma.PropertyCreateInput, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }
    return this.prisma.property.create({ data });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: PropertyFilters,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { organizationId: tenantId } : {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { lrNumber: { contains: search, mode: 'insensitive' } },
        { roadStreet: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters) {
      if (filters.type) where.type = filters.type;
      if (filters.category) where.category = filters.category;
      if (filters.landlordId) where.landlordId = filters.landlordId;
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.property.findMany({
          where,
          skip,
          take: limit,
          include: {
            landlord: true,
            _count: {
              select: { units: true },
            },
          },
          orderBy: { [sortBy]: sortOrder },
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

  findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.property.findUnique({
      where,
      include: {
        landlord: true,
        units: true,
      },
    });
  }

  update(id: string, data: Prisma.PropertyUpdateInput, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.property.update({
      where,
      data,
    });
  }

  remove(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.property.delete({ where });
  }
}
