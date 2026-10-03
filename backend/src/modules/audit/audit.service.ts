import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditListParams {
  organizationId?: string;
  entity?: string;
  action?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logAction(data: Prisma.AuditLogCreateInput) {
    return this.prisma.auditLog.create({ data });
  }

  /**
   * Tenant-scoped audit listing.
   * - SUPER_ADMIN: no organizationId → sees everything (platform view).
   * - ADMIN: always filtered to their own organizationId.
   */
  async getAll(params: AuditListParams) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.action ? { action: params.action } : {}),
    };

    const [data, total] = await this.prisma.$transaction(async (tx) =>
      Promise.all([
        tx.auditLog.findMany({
          where,
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]),
    );

    return {
      data,
      meta: { total: total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getLogsForEntity(
    entity: string,
    entityId: string,
    organizationId?: string,
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  async getLogsByUser(userId: string, organizationId?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        userId,
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
