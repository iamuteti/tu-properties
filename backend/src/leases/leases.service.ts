import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@/prisma/generated/prisma';

@Injectable()
export class LeasesService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.LeaseCreateInput) {
        return this.prisma.lease.create({ data });
    }

    findAll() {
        return this.prisma.lease.findMany({
            include: {
                unit: true,
                tenant: true,
            },
        });
    }

    findOne(id: string) {
        return this.prisma.lease.findUnique({
            where: { id },
            include: {
                unit: true,
                tenant: true,
                invoices: true,
                payments: true,
            },
        });
    }

    update(id: string, data: Prisma.LeaseUpdateInput) {
        return this.prisma.lease.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.lease.delete({ where: { id } });
    }
}
