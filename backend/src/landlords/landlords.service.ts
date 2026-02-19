import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LandlordsService {
    constructor(
        private prisma: PrismaService,
    ) { }

    create(data: Prisma.LandlordCreateInput, tenantId?: string) {
        if (tenantId) {
            data.organization = { connect: { id: tenantId } };
        }
        return this.prisma.landlord.create({ data });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.landlord.findMany({
            where,
            orderBy: { name: 'asc' },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.landlord.findUnique({
            where,
        });
    }

    update(id: string, data: Prisma.LandlordUpdateInput, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.landlord.update({
            where,
            data,
        });
    }

    remove(id: string, tenantId?: string) {
        const where = tenantId 
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.landlord.delete({ where });
    }
}
