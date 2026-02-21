import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LeasesService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.LeaseCreateInput, tenantId?: string) {
        if (tenantId) {
            data.organization = { connect: { id: tenantId } };
        }
        return this.prisma.lease.create({ data });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.lease.findMany({
            where,
            include: {
                unit: {
                    include: {
                        property: true,
                    },
                },
                tenant: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.lease.findUnique({
            where,
            include: {
                unit: true,
                tenant: true,
                invoices: true,
                payments: true,
            },
        });
    }

    update(id: string, data: Prisma.LeaseUpdateInput, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.lease.update({
            where,
            data,
        });
    }

    remove(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.lease.delete({ where });
    }
}
