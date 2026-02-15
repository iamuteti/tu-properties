import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@/prisma/generated/prisma';

@Injectable()
export class PropertiesService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.PropertyCreateInput) {
        return this.prisma.property.create({ data });
    }

    findAll() {
        return this.prisma.property.findMany();
    }

    findOne(id: string) {
        return this.prisma.property.findUnique({ where: { id } });
    }

    update(id: string, data: Prisma.PropertyUpdateInput) {
        return this.prisma.property.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.property.delete({ where: { id } });
    }
}
