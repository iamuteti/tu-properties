import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord } from '@/common/utils';
import type { CreateAgreementTemplateDto } from './dto/agreement.dto';

/**
 * Agreement templates (Module 5).
 *
 * A template is a bundle of default terms the create form prefills — it never
 * becomes the agreement itself, so editing a template can never change an
 * agreement that was already signed.
 */
@Injectable()
export class AgreementTemplatesService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.leaseTemplate.findMany({
      where: { organizationId: tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateAgreementTemplateDto, tenantId: string) {
    return this.prisma.leaseTemplate.create({
      data: { ...dto, organization: { connect: { id: tenantId } } },
    });
  }

  async update(id: string, dto: CreateAgreementTemplateDto, tenantId: string) {
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

    // Deactivate rather than delete: agreements created from it are still on file.
    return this.prisma.leaseTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
