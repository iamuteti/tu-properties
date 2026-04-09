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

export interface LandlordFilters {
  status?: string;
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
export class LandlordsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.LandlordCreateInput, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }

    if (!data.code) {
      const count = await this.prisma.landlord.count({
        where: tenantId ? { organizationId: tenantId } : {},
      });
      data.code = `LLD-${(count + 1).toString().padStart(3, '0')}`;
    }

    return this.prisma.landlord.create({ data });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: LandlordFilters,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { organizationId: tenantId } : {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { alternativePhone: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { postalCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters) {
      if (filters.status) where.status = filters.status;
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.landlord.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            properties: true,
          },
        }),
        tx.landlord.count({ where }),
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
    return this.prisma.landlord.findUnique({
      where,
    });
  }

  update(id: string, data: Prisma.LandlordUpdateInput, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.landlord.update({
      where,
      data,
    });
  }

  remove(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.landlord.delete({ where });
  }
}
