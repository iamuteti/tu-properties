import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    async create(data: any, tenantId?: string) {
        if (tenantId) {
            data.organization = { connect: { id: tenantId } };
        }

        // Generate unique account number and code
        const count = await this.prisma.tenant.count();
        const nextNumber = count + 1;
        const accountNumber = `TEN-${String(nextNumber).padStart(3, '0')}`;
        const code = `T${String(nextNumber).padStart(3, '0')}`;

        data.accountNumber = accountNumber;
        data.code = code;

        // Handle emergency contacts
        if (data.emergencyContacts) {
            data.emergencyContacts = {
                create: data.emergencyContacts.filter((contact: any) => contact.contactName).map((contact: any, index: number) => ({
                    ...contact,
                    priority: index + 1,
                })),
            };
        }

        return this.prisma.tenant.create({ 
            data: data as Prisma.TenantCreateInput,
            include: {
                emergencyContacts: true,
            },
        });
    }

    findAll(tenantId?: string) {
        const where = tenantId ? { organizationId: tenantId } : {};
        return this.prisma.tenant.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }

    findOne(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.findUnique({
            where,
            include: {
                leases: true,
                emergencyContacts: true,
            },
        });
    }

    update(id: string, data: Prisma.TenantUpdateInput, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.update({
            where,
            data,
        });
    }

    remove(id: string, tenantId?: string) {
        const where = tenantId
            ? { id, organizationId: tenantId }
            : { id };
        return this.prisma.tenant.delete({ where });
    }
}
