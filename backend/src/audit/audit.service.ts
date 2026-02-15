import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
    constructor(private prisma: PrismaService) { }

    async logAction(data: Prisma.AuditLogCreateInput) {
        return this.prisma.auditLog.create({ data });
    }

    async getLogsForEntity(entity: string, entityId: string) {
        return this.prisma.auditLog.findMany({
            where: { entity, entityId },
            orderBy: { createdAt: 'desc' },
            include: { user: true },
        });
    }

    async getLogsByUser(userId: string) {
        return this.prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }
}
