import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';

export interface BranchFilters {
  isActive?: boolean;
}

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.BranchCreateInput, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }
    return this.prisma.branch.create({ data });
  }

  async findAll(tenantId?: string, search?: string, filters?: BranchFilters) {
    const where: Prisma.BranchWhereInput = {
      ...(tenantId ? { organizationId: tenantId } : {}),
      ...(filters?.isActive !== undefined
        ? { isActive: filters.isActive }
        : {}),
    };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.branch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where: Prisma.BranchWhereInput = {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    };
    return requireRecord(this.prisma.branch.findFirst({ where }), 'Branch');
  }

  async update(id: string, data: Prisma.BranchUpdateInput, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.branch, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.branch.update({ where: { id }, data });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.branch, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.branch.delete({ where: { id } });
  }
}
