import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UnitsService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.UnitCreateInput) {
        return this.prisma.unit.create({ data });
    }

    findAll() {
        return this.prisma.unit.findMany({
            include: {
                property: true,
                unitType: true,
            },
        });
    }

    findOne(id: string) {
        return this.prisma.unit.findUnique({
            where: { id },
            include: {
                property: true,
                unitType: true,
                leases: true,
            },
        });
    }

    update(id: string, data: Prisma.UnitUpdateInput) {
        return this.prisma.unit.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.unit.delete({ where: { id } });
    }
}
