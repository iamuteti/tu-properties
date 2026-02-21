import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PropertiesService {
    constructor(
        private prisma: PrismaService,
    ) { }

    create(data: Prisma.PropertyCreateInput, tenantId?: string) {
        if (tenantId) {
            data.organization = { connect: { id: tenantId } };
        }
        return this.prisma.property.create({ data });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.property.findMany({ 
            where,
            include: {
                landlord: true,
                _count: {
                    select: { units: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.property.findUnique({ 
            where,
            include: {
                landlord: true,
                units: true,
            },
        });
    }

    update(id: string, data: Prisma.PropertyUpdateInput, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.property.update({
            where,
            data,
        });
    }

    remove(id: string, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.property.delete({ where });
    }
}
