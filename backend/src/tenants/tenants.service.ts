import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@/prisma/generated/prisma';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.TenantCreateInput) {
        return this.prisma.tenant.create({ data });
    }

    findAll() {
        return this.prisma.tenant.findMany();
    }

    findOne(id: string) {
        return this.prisma.tenant.findUnique({
            where: { id },
            include: {
                leases: true,
                emergencyContacts: true,
            },
        });
    }

    update(id: string, data: Prisma.TenantUpdateInput) {
        return this.prisma.tenant.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.tenant.delete({ where: { id } });
    }
}
