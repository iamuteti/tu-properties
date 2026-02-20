import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UnitsService {
    constructor(private prisma: PrismaService) { }

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
                unitType: true,
            },
        });
    }

    findAll(tenantId?: string) {
        const where = tenantId 
            ? { property: { organizationId: tenantId } } 
            : {};
        return this.prisma.unit.findMany({
            where,
            include: {
                property: true,
                unitType: true,
            },
            orderBy: { createdAt: 'desc' },
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
                unitType: true,
                leases: true,
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
