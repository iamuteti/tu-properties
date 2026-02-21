import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(data: Prisma.UserCreateInput) {
        return this.prisma.user.create({ data });
    }

    async findOneByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async findOne(id: string) {
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.user.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }

    async update(id: string, data: Prisma.UserUpdateInput, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.user.update({
            where,
            data,
        });
    }

    async remove(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.user.delete({ where });
    }
}
