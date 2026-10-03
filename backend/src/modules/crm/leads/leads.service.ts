import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ContactType, LeadSource, LeadStage, Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  ConvertLeadDto,
  CreateLeadDto,
  PublicLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { availableStages, checkStageChange } from './lead-pipeline';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface LeadFilters {
  stage?: string;
  source?: string;
  propertyId?: string;
  branchId?: string;
  assignedAgentId?: string;
  /** Only leads nobody has picked up yet. */
  unassigned?: boolean;
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
  'stage',
  'source',
]);

const LEAD_EXPORT_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'source',
  'sourceDetail',
  'stage',
  'interestedProperty',
  'branch',
  'assignedAgent',
  'convertedContactId',
  'lostReason',
  'createdAt',
];

interface LeadListRow {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  sourceDetail?: string | null;
  stage: string;
  interestedProperty?: { name?: string | null } | null;
  branch?: { name?: string | null } | null;
  assignedAgent?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  contactId?: string | null;
  lostReason?: string | null;
  createdAt: Date;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLeadDto, tenantId: string, userId?: string) {
    await this.assertReachable(dto, tenantId);

    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'A lead needs an email address or a phone number so it can be worked.',
      );
    }

    const { interestedPropertyId, branchId, assignedAgentId, ...scalars } = dto;

    return this.prisma.lead.create({
      data: {
        ...scalars,
        organization: { connect: { id: tenantId } },
        ...(interestedPropertyId
          ? { interestedProperty: { connect: { id: interestedPropertyId } } }
          : {}),
        ...(branchId ? { branch: { connect: { id: branchId } } } : {}),
        ...(assignedAgentId
          ? { assignedAgent: { connect: { id: assignedAgentId } } }
          : {}),
        // The enquiry itself is the first communication on the timeline.
        communications: {
          // Nested create on a scalar-FK payload: the organization has to be
          // written as a scalar here too (mixing both styles is rejected).
          create: {
            channel: 'NOTE',
            direction: 'INBOUND',
            subject: 'Lead captured',
            content: dto.message ?? null,
            organizationId: tenantId,
            loggedById: userId ?? null,
          },
        },
      },
      include: this.listInclude(),
    });
  }

  /**
   * Capture a lead from an unauthenticated source (website form, Facebook
   * Lead Ads). The caller must already have passed the shared-secret check in
   * the controller; the organization comes from the org the secret belongs to.
   */
  async createFromPublicSource(
    dto: PublicLeadDto,
    tenantId: string,
  ): Promise<{ id: string; stage: LeadStage }> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'A lead needs an email address or a phone number so it can be worked.',
      );
    }

    if (dto.interestedPropertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: dto.interestedPropertyId, organizationId: tenantId },
        select: { id: true },
      });
      if (!property) {
        throw new BadRequestException(
          'interestedPropertyId does not match a property in this organization.',
        );
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        message: dto.message ?? null,
        source: dto.source ?? LeadSource.OTHER,
        sourceDetail: dto.sourceDetail ?? null,
        organization: { connect: { id: tenantId } },
        ...(dto.interestedPropertyId
          ? {
              interestedProperty: { connect: { id: dto.interestedPropertyId } },
            }
          : {}),
        communications: {
          create: {
            channel: 'NOTE',
            direction: 'INBOUND',
            subject: `Captured from ${dto.source ?? 'web'}`,
            content: dto.message ?? null,
            organizationId: tenantId,
          },
        },
      },
      select: { id: true, stage: true },
    });

    return lead;
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: LeadFilters,
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

    const where: Prisma.LeadWhereInput = { organizationId: tenantId };

    if (filters) {
      if (filters.stage) where.stage = filters.stage as LeadStage;
      if (filters.source) where.source = filters.source as LeadSource;
      if (filters.propertyId) where.interestedPropertyId = filters.propertyId;
      if (filters.branchId) where.branchId = filters.branchId;
      if (filters.assignedAgentId) {
        where.assignedAgentId = filters.assignedAgentId;
      }
      if (filters.unassigned) where.assignedAgentId = null;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.lead.findMany({
          where,
          skip,
          take: limit,
          include: this.listInclude(),
          orderBy: { [orderField]: sortOrder },
        }),
        tx.lead.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /**
   * The pipeline board feed: every open lead grouped client-side by stage.
   * Bounded by `limit` so a tenant with thousands of leads cannot pull the
   * whole table into a browser tab.
   */
  pipeline(
    tenantId: string,
    options?: { propertyId?: string; agentId?: string },
  ) {
    const where: Prisma.LeadWhereInput = {
      organizationId: tenantId,
      stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
      ...(options?.propertyId
        ? { interestedPropertyId: options.propertyId }
        : {}),
      ...(options?.agentId ? { assignedAgentId: options.agentId } : {}),
    };

    return this.prisma.lead.findMany({
      where,
      include: this.listInclude(),
      orderBy: [{ stage: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async findOne(id: string, tenantId: string) {
    const lead = await requireRecord(
      this.prisma.lead.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          ...this.listInclude(),
          communications: {
            orderBy: { occurredAt: 'desc' },
            include: {
              loggedBy: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      'Lead',
    );

    return {
      ...lead,
      pipeline: {
        availableStages: availableStages(lead.stage, {
          converted: Boolean(lead.contactId),
        }),
      },
    };
  }

  async update(id: string, dto: UpdateLeadDto, tenantId: string) {
    await assertTenantRecord(this.prisma.lead, {
      id,
      organizationId: tenantId,
    });
    await this.assertReachable(dto, tenantId);

    const { interestedPropertyId, branchId, assignedAgentId, ...scalars } = dto;

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...scalars,
        ...(interestedPropertyId !== undefined
          ? interestedPropertyId === null
            ? { interestedProperty: { disconnect: true } }
            : { interestedProperty: { connect: { id: interestedPropertyId } } }
          : {}),
        ...(branchId !== undefined
          ? branchId === null
            ? { branch: { disconnect: true } }
            : { branch: { connect: { id: branchId } } }
          : {}),
        ...(assignedAgentId !== undefined
          ? assignedAgentId === null
            ? { assignedAgent: { disconnect: true } }
            : { assignedAgent: { connect: { id: assignedAgentId } } }
          : {}),
      },
      include: this.listInclude(),
    });
  }

  async remove(id: string, tenantId: string) {
    await assertTenantRecord(this.prisma.lead, {
      id,
      organizationId: tenantId,
    });
    return this.prisma.lead.delete({ where: { id } });
  }

  /**
   * Move a lead through the pipeline. This is the only way `stage` changes —
   * `PATCH /crm/leads/:id` cannot set it — so the rules in `lead-pipeline.ts`
   * cannot be bypassed.
   */
  async setStage(
    id: string,
    stage: LeadStage,
    tenantId: string,
    reason?: string,
  ) {
    const lead = await requireRecord(
      this.prisma.lead.findFirst({
        where: { id, organizationId: tenantId },
        select: { id: true, stage: true, contactId: true },
      }),
      'Lead',
    );

    if (stage === LeadStage.LOST && !reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when marking a lead as lost.',
      );
    }

    const check = checkStageChange(lead.stage, stage, {
      converted: Boolean(lead.contactId),
    });
    if (!check.allowed) {
      throw new ConflictException(check.reason);
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        stage,
        ...(stage === LeadStage.LOST ? { lostReason: reason } : {}),
      },
      include: this.listInclude(),
    });
  }

  /**
   * Convert a lead into a contact.
   *
   * Either links an existing contact (`contactId`) or creates one from the
   * lead's details. Optionally creates the Tenant record too, because in
   * practice a won lead for a rental becomes a tenant immediately.
   */
  async convert(id: string, dto: ConvertLeadDto, tenantId: string) {
    const lead = await requireRecord(
      this.prisma.lead.findFirst({
        where: { id, organizationId: tenantId },
      }),
      'Lead',
    );

    if (lead.contactId) {
      throw new ConflictException(
        'This lead has already been converted to a contact.',
      );
    }

    if (lead.stage === LeadStage.LOST) {
      throw new ConflictException(
        'This lead is marked lost. Reopen it before converting.',
      );
    }

    let contactId = dto.contactId;

    if (contactId) {
      const existing = await this.prisma.contact.findFirst({
        where: { id: contactId, organizationId: tenantId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(
          'The contact you are linking does not exist in your organization.',
        );
      }
    } else {
      const contact = await this.prisma.contact.create({
        data: {
          firstName: dto.firstName ?? lead.firstName,
          lastName: dto.lastName ?? lead.lastName ?? '',
          email: dto.email ?? lead.email,
          phone: dto.phone ?? lead.phone,
          company: dto.company ?? null,
          type: dto.type ?? defaultContactType(lead.source),
          organization: { connect: { id: tenantId } },
          // Carry the enquiry over so the contact timeline is not empty.
          communications: {
            create: {
              channel: 'NOTE',
              direction: 'INBOUND',
              subject: `Converted from lead (${lead.source})`,
              content: lead.message,
              organizationId: tenantId,
            },
          },
        },
        select: { id: true },
      });
      contactId = contact.id;
    }

    let tenantIdCreated: string | undefined;
    if (dto.createTenant) {
      const tenant = await this.prisma.tenant.create({
        data: {
          // Tenant accountNumber/code are unique table-wide.
          code: await this.nextTenantCode(tenantId),
          accountNumber: await this.nextTenantAccountNumber(),
          surname: (dto.lastName ?? lead.lastName ?? lead.firstName).trim(),
          otherNames: (dto.firstName ?? lead.firstName).trim(),
          email: dto.email ?? lead.email,
          phone: dto.phone ?? lead.phone ?? '—',
          contactId,
          organizationId: tenantId,
        },
        select: { id: true },
      });
      tenantIdCreated = tenant.id;
    }

    const converted = await this.prisma.lead.update({
      where: { id },
      data: {
        contactId,
        convertedAt: new Date(),
        stage: LeadStage.WON,
        lostReason: null,
      },
      include: this.listInclude(),
    });

    return { lead: converted, contactId, tenantId: tenantIdCreated };
  }

  // ------------------------------------------------------------ export/import

  async exportCsv(
    tenantId: string,
    filters?: LeadFilters,
    search?: string,
  ): Promise<string> {
    const { data } = await this.findAll(
      tenantId,
      { limit: 10000, search },
      filters,
    );

    const rows = (data as unknown as LeadListRow[]).map((lead) => ({
      firstName: lead.firstName,
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source,
      sourceDetail: lead.sourceDetail ?? '',
      stage: lead.stage,
      interestedProperty: lead.interestedProperty?.name ?? '',
      branch: lead.branch?.name ?? '',
      assignedAgent: lead.assignedAgent
        ? `${lead.assignedAgent.firstName ?? ''} ${lead.assignedAgent.lastName ?? ''}`.trim()
        : '',
      convertedContactId: lead.contactId ?? '',
      lostReason: lead.lostReason ?? '',
      createdAt: lead.createdAt,
    }));

    return toCsv(LEAD_EXPORT_HEADERS, rows);
  }

  // ---------------------------------------------------------------- helpers

  private listInclude() {
    return {
      interestedProperty: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      assignedAgent: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      contact: {
        select: { id: true, firstName: true, lastName: true, type: true },
      },
    } as const;
  }

  /**
   * A lead may only point at records inside the caller's organization —
   * otherwise a tenant could attach a lead to another tenant's property or
   * agent.
   */
  private async assertReachable(
    dto: {
      interestedPropertyId?: string | null;
      branchId?: string | null;
      assignedAgentId?: string | null;
    },
    tenantId: string,
  ) {
    if (dto.interestedPropertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: dto.interestedPropertyId, organizationId: tenantId },
        select: { id: true },
      });
      if (!property) {
        throw new BadRequestException(
          'The selected property does not exist in your organization.',
        );
      }
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, organizationId: tenantId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException(
          'The selected branch does not exist in your organization.',
        );
      }
    }

    if (dto.assignedAgentId) {
      const agent = await this.prisma.user.findFirst({
        where: { id: dto.assignedAgentId, organizationId: tenantId },
        select: { id: true },
      });
      if (!agent) {
        throw new BadRequestException(
          'The selected agent does not exist in your organization.',
        );
      }
    }
  }

  private async nextTenantCode(tenantId: string) {
    const count = await this.prisma.tenant.count({
      where: { organization: { id: tenantId } },
    });
    return `TEN-${String(count + 1).padStart(5, '0')}`;
  }

  private async nextTenantAccountNumber() {
    const count = await this.prisma.tenant.count();
    return `ACC-${String(count + 1).padStart(6, '0')}`;
  }
}

/** A lead from a rental site usually becomes a tenant; a sale lead a buyer. */
function defaultContactType(source: LeadSource): ContactType {
  return source === LeadSource.OTHER ? ContactType.BUYER : ContactType.TENANT;
}
