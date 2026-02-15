import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.TenantCreateInput, tenantId?: string) {
        if (tenantId) {
            data.organization = { connect: { id: tenantId } };
        }
        return this.prisma.tenant.create({ data });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.tenant.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.findUnique({
            where,
            include: {
                leases: true,
                emergencyContacts: true,
            },
        });
    }

    update(id: string, data: Prisma.TenantUpdateInput, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.update({
            where,
            data,
        });
    }

    remove(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.delete({ where });
    }
}
