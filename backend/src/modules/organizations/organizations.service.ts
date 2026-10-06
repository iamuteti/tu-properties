import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, VacancyPolicy } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.OrganizationCreateInput) {
    return this.prisma.organization.create({ data });
  }

  async findAll() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            properties: true,
            tenants: true,
          },
        },
      },
    });
    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return organization;
  }

  async findBySlug(slug: string) {
    return this.prisma.organization.findUnique({
      where: { slug },
    });
  }

  async findBySubdomain(subdomain: string) {
    return this.prisma.organization.findUnique({
      where: { subdomain },
    });
  }

  async findByCustomDomain(domain: string) {
    return this.prisma.organization.findUnique({
      where: { customDomain: domain },
    });
  }

  async update(id: string, data: Prisma.OrganizationUpdateInput) {
    await this.findOne(id); // Verify exists
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  /**
   * Self-service profile update for the caller's own organization (System
   * Settings). Whitelists the fields a tenant admin may change — plan,
   * limits, subdomain and custom domain stay platform-managed.
   */
  async updateProfile(
    id: string,
    data: {
      name?: string;
      contactEmail?: string | null;
      contactPhone?: string | null;
      legalName?: string | null;
      taxId?: string | null;
      currency?: string;
      timezone?: string;
      /**
       * Module 14 — Utilities. What to do with a bulk meter's consumption for a unit
       * with nobody under a lease.
       *
       * Nullable on purpose, and `null` is meaningful rather than "unset": it means the
       * same as `RECORD_ONLY`, and is kept distinct from `RECORD_ONLY` so that "nobody
       * has decided" stays visible as its own state.
       */
      vacancyPolicy?: VacancyPolicy | null;
    },
  ) {
    await this.findOne(id); // Verify exists
    const clean: Prisma.OrganizationUpdateInput = {};
    if (data.name !== undefined) clean.name = data.name;
    if (data.contactEmail !== undefined) clean.contactEmail = data.contactEmail;
    if (data.contactPhone !== undefined) clean.contactPhone = data.contactPhone;
    if (data.legalName !== undefined) clean.legalName = data.legalName;
    if (data.taxId !== undefined) clean.taxId = data.taxId;
    if (data.currency !== undefined) clean.currency = data.currency;
    if (data.timezone !== undefined) clean.timezone = data.timezone;
    // Explicitly `!== undefined` so a caller can send `null` to go back to "nobody has
    // decided" — a column nobody can clear is a setting nobody can undo.
    if (data.vacancyPolicy !== undefined) clean.vacancyPolicy = data.vacancyPolicy;
    return this.prisma.organization.update({
      where: { id },
      data: clean,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Verify exists
    return this.prisma.organization.delete({
      where: { id },
    });
  }

  async checkSlugAvailability(slug: string): Promise<boolean> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
    });
    return !existing;
  }

  async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
    const existing = await this.prisma.organization.findUnique({
      where: { subdomain },
    });
    return !existing;
  }
}
