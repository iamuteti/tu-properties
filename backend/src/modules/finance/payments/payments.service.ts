import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class PaymentsService {
    constructor(private prisma: PrismaService, private usersService: UsersService) { }

    async create(data: Prisma.PaymentCreateInput & { recordedBy?: string }, tenantId?: string) {
        const paymentData: Prisma.PaymentCreateInput = { ...data };
        
        // Add tenant organization if provided
        if (tenantId) {
            paymentData.organization = { connect: { id: tenantId } };
        }
        
        return this.prisma.payment.create({ data: paymentData });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.payment.findMany({
            where,
            include: {
                invoice: true,
                lease: true,
                receipt: true,
            },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.payment.findUnique({
            where,
            include: {
                invoice: true,
                lease: true,
                receipt: true,
            },
        });
    }

    delete(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.payment.delete({
            where,
        });
    }

    async deleteMany(ids: string[], tenantId?: string) {
        const where = tenantId
            ? { id: { in: ids }, organizationId: tenantId }
            : { id: { in: ids } };
        const result = await this.prisma.payment.deleteMany({
            where,
        });
        return { deleted: result.count };
    }
}
