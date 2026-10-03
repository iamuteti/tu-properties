import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord } from '@/common/utils';
import type { CreateLeaseTemplateDto } from './dto/lease.dto';

/**
 * Lease templates (Module 5).
 *
 * A template is a bundle of default terms the create form prefills — it never
 * becomes the lease itself, so editing a template can never change a lease that
 * was already signed.
 */
@Injectable()
export class LeaseTemplatesService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.leaseTemplate.findMany({
      where: { organizationId: tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateLeaseTemplateDto, tenantId: string) {
    return this.prisma.leaseTemplate.create({
      data: { ...dto, organization: { connect: { id: tenantId } } },
    });
  }

  async update(id: string, dto: CreateLeaseTemplateDto, tenantId: string) {
    await assertTenantRecord(this.prisma.leaseTemplate, {
      id,
      organizationId: tenantId,
    });
    return this.prisma.leaseTemplate.update({
      where: { id },
      data: dto as Prisma.LeaseTemplateUpdateInput,
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.leaseTemplate, {
      id,
      organizationId: tenantId,
    });

    // Deactivate rather than delete: leases created from it are still on file.
    return this.prisma.leaseTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }
}