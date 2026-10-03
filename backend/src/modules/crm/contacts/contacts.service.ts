import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ContactType, Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  CreateCommunicationDto,
  CreateContactDto,
  UpdateContactDto,
} from './dto/contact.dto';
import type { PaginationParams } from '../leads/leads.service';

export interface ContactFilters {
  type?: string;
  /** Only contacts with at least one lead or communication. */
  engaged?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const SORTABLE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'firstName',
  'lastName',
  'type',
]);

const CONTACT_EXPORT_HEADERS = [
  'firstName',
  'lastName',
  'type',
  'email',
  'phone',
  'company',
  'isActive',
  'leadCount',
  'communicationCount',
  'linkedTenantId',
  'createdAt',
];

interface ContactListRow {
  firstName: string;
  lastName: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  isActive: boolean;
  createdAt: Date;
  _count?: { leads: number; communications: number };
  tenant?: { id: string } | null;
}

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateContactDto, tenantId: string) {
    const { tenantId: linkTenantId, ...scalars } = dto;

    if (linkTenantId) {
      await this.assertTenantLinkable(linkTenantId, tenantId);
    }

    const contact = await this.prisma.contact.create({
      data: {
        ...scalars,
        type: (scalars.type ?? ContactType.BUYER) as ContactType,
        organization: { connect: { id: tenantId } },
      },
      include: this.listInclude(),
    });

    if (linkTenantId) {
      await this.prisma.tenant.update({
        where: { id: linkTenantId },
        data: { contactId: contact.id },
      });
    }

    return this.prisma.contact.findUniqueOrThrow({
      where: { id: contact.id },
      include: this.listInclude(),
    });
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: ContactFilters,
  ): Promise<PaginatedResult<unknown>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;
    const orderField = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';

    const where: Prisma.ContactWhereInput = { organizationId: tenantId };

    if (filters) {
      if (filters.type) where.type = filters.type as ContactType;
      if (filters.engaged) {
        where.OR = [{ leads: { some: {} } }, { communications: { some: {} } }];
      }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.contact.findMany({
          where,
          skip,
          take: limit,
          include: this.listInclude(),
          orderBy: { [orderField]: sortOrder },
        }),
        tx.contact.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /**
   * A contact with everything attached: the leads it came from, the tenant it
   * is linked to, and the full communication timeline (contact + pre-conversion
   * lead history) newest first.
   */
  async findOne(id: string, tenantId: string) {
    const contact = await requireRecord(
      this.prisma.contact.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          ...this.listInclude(),
          leads: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              stage: true,
              source: true,
              createdAt: true,
            },
          },
        },
      }),
      'Contact',
    );

    const timeline = await this.timeline(id, tenantId);

    return { ...contact, timeline };
  }

  async update(id: string, dto: UpdateContactDto, tenantId: string) {
    await assertTenantRecord(this.prisma.contact, {
      id,
      organizationId: tenantId,
    });

    const { tenantId: linkTenantId, ...scalars } = dto;

    if (linkTenantId) {
      await this.assertTenantLinkable(linkTenantId, tenantId);
    }

    await this.prisma.contact.update({
      where: { id },
      data: {
        ...scalars,
        ...(scalars.type ? { type: scalars.type as ContactType } : {}),
      },
    });

    if (linkTenantId !== undefined) {
      if (linkTenantId === null) {
        await this.prisma.tenant.updateMany({
          where: { contactId: id },
          data: { contactId: null },
        });
      } else {
        // A contact maps to at most one tenant, so release any previous link.
        await this.prisma.tenant.updateMany({
          where: { contactId: id, NOT: { id: linkTenantId } },
          data: { contactId: null },
        });
        await this.prisma.tenant.update({
          where: { id: linkTenantId },
          data: { contactId: id },
        });
      }
    }

    return this.prisma.contact.findUniqueOrThrow({
      where: { id },
      include: this.listInclude(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.contact, {
      id,
      organizationId: tenantId,
    });
    // `Tenant.contactId` is SetNull and `Lead.contactId` is SetNull, so the
    // directory entry can be deleted without orphaning a lease.
    return this.prisma.contact.delete({ where: { id } });
  }

  // ------------------------------------------------------ communication log

  /** Newest-first merged timeline for one contact. */
  async timeline(contactId: string, tenantId: string) {
    await assertTenantRecord(this.prisma.contact, {
      id: contactId,
      organizationId: tenantId,
    });

    return this.prisma.communicationLog.findMany({
      where: { organizationId: tenantId, contactId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        loggedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 500,
    });
  }

  /**
   * Log a communication. It must hang off a contact or a lead — a free-floating
   * log row would belong to nobody and could never be found again.
   */
  async logCommunication(
    dto: CreateCommunicationDto,
    tenantId: string,
    userId?: string,
  ) {
    if (!dto.contactId && !dto.leadId) {
      throw new BadRequestException(
        'A communication must be logged against a contact or a lead.',
      );
    }

    if (dto.contactId) {
      await assertTenantRecord(this.prisma.contact, {
        id: dto.contactId,
        organizationId: tenantId,
      });
    }

    if (dto.leadId) {
      await assertTenantRecord(this.prisma.lead, {
        id: dto.leadId,
        organizationId: tenantId,
      });
    }

    return this.prisma.communicationLog.create({
      data: {
        channel: dto.channel,
        direction: dto.direction ?? 'OUTBOUND',
        subject: dto.subject ?? null,
        content: dto.content ?? null,
        outcome: dto.outcome ?? null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        contactId: dto.contactId ?? null,
        leadId: dto.leadId ?? null,
        // Scalar FKs are in use (contactId/leadId), so the organization is
        // written as a scalar too — mixing the two input styles is rejected.
        organizationId: tenantId,
        loggedById: userId ?? null,
      },
      include: {
        loggedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listCommunications(
    tenantId: string,
    options: { leadId?: string; limit?: number },
  ) {
    const where: Prisma.CommunicationLogWhereInput = {
      organizationId: tenantId,
    };
    if (options.leadId) where.leadId = options.leadId;

    return this.prisma.communicationLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: Math.min(options.limit ?? 200, 500),
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: {
          select: { id: true, firstName: true, lastName: true, stage: true },
        },
        loggedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async removeCommunication(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.communicationLog, {
      id,
      organizationId: tenantId,
    });
    return this.prisma.communicationLog.delete({ where: { id } });
  }

  // ------------------------------------------------------------------ export

  async exportCsv(
    tenantId: string,
    filters?: ContactFilters,
    search?: string,
  ): Promise<string> {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      filters,
    );

    const rows = (data as unknown as ContactListRow[]).map((contact) => ({
      firstName: contact.firstName,
      lastName: contact.lastName,
      type: contact.type,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      company: contact.company ?? '',
      isActive: contact.isActive ? 'yes' : 'no',
      leadCount: contact._count?.leads ?? 0,
      communicationCount: contact._count?.communications ?? 0,
      linkedTenantId: contact.tenant?.id ?? '',
      createdAt: contact.createdAt,
    }));

    return toCsv(CONTACT_EXPORT_HEADERS, rows);
  }

  // ---------------------------------------------------------------- helpers

  private listInclude() {
    return {
      tenant: {
        select: { id: true, code: true, surname: true, otherNames: true },
      },
      _count: { select: { leads: true, communications: true } },
    } as const;
  }

  /** A tenant may only be linked if it is in the same organization and free. */
  private async assertTenantLinkable(tenantId: string, orgId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, organizationId: orgId },
      select: { id: true, contactId: true },
    });
    if (!tenant) {
      throw new BadRequestException(
        'The selected tenant does not exist in your organization.',
      );
    }
    if (tenant.contactId) {
      throw new ConflictException(
        'That tenant is already linked to another contact.',
      );
    }
  }
}
