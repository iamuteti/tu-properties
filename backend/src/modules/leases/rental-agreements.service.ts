import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord } from '@/common/utils';

@Injectable()
export class RentalAgreementsService {
  constructor(private prisma: PrismaService) {}

  create(data: Prisma.RentalAgreementCreateInput, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }
    return this.prisma.rentalAgreement.create({ data });
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.rentalAgreement.findMany({
      where,
      include: {
        unit: {
          include: {
            property: true,
          },
        },
        tenant: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.rentalAgreement.findFirst({
      where,
      include: {
        unit: true,
        tenant: true,
        invoices: true,
        payments: true,
      },
    });
  }

  async update(id: string, data: Prisma.RentalAgreementUpdateInput, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.rentalAgreement, { id, organizationId: tenantId });
    }
    return this.prisma.rentalAgreement.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.rentalAgreement, { id, organizationId: tenantId });
    }
    return this.prisma.rentalAgreement.delete({ where: { id } });
  }
}
