import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { assertTicketTransition } from './support-ticket-lifecycle';
import {
  CreateSupportTicketDto,
  SetTicketStatusDto,
  UpdateSupportTicketDto,
} from './dto/support-ticket.dto';

export interface TicketActor {
  userId: string;
  role: string;
  tenantId?: string;
}

const TICKET_INCLUDE = {
  raisedBy: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.SupportTicketInclude;

/**
 * Support tickets (Module 19) — the tenant's line to the platform.
 *
 * Scoping is the whole design: a tenant sees exactly their own
 * organization's tickets (cross-tenant reads 404 via `requireRecord`, the
 * issue-24 rule), while SUPER_ADMIN sees everything. The tenant never writes
 * `status` — closing their own ticket goes through `setStatus`, which
 * enforces the same state machine the platform moves through.
 */
@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSupportTicketDto, actor: TicketActor) {
    const organizationId = await this.resolveOrg(dto, actor);
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organization: { connect: { id: organizationId } },
        raisedBy: { connect: { id: actor.userId } },
        subject: dto.subject,
        description: dto.description,
        ...(dto.priority ? { priority: dto.priority } : {}),
      },
      include: TICKET_INCLUDE,
    });
    this.logger.log(
      `Ticket ${ticket.id} raised for org ${organizationId} by ${actor.userId}`,
    );
    return ticket;
  }

  async findAll(
    actor: TicketActor,
    params?: { status?: TicketStatus; page?: number; limit?: number },
  ) {
    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const where: Prisma.SupportTicketWhereInput = {
      ...(actor.tenantId ? { organizationId: actor.tenantId } : {}),
      ...(params?.status ? { status: params.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, actor: TicketActor) {
    return requireRecord(
      this.prisma.supportTicket.findFirst({
        where: {
          id,
          ...(actor.tenantId ? { organizationId: actor.tenantId } : {}),
        },
        include: TICKET_INCLUDE,
      }),
      'Support ticket',
    );
  }

  /**
   * Tenant edit of the request itself — subject/description while OPEN.
   * The platform answers through `setStatus`, not by rewriting the question.
   */
  async update(id: string, dto: UpdateSupportTicketDto, actor: TicketActor) {
    const ticket = await this.findOne(id, actor);
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException(
        `Only an OPEN ticket can be edited (this one is ${ticket.status})`,
      );
    }
    if (
      actor.tenantId &&
      ticket.raisedByUserId !== actor.userId &&
      actor.role !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the person who raised this ticket (or an organization admin) may edit it',
      );
    }
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      include: TICKET_INCLUDE,
    });
  }

  /**
   * Move a ticket through the state machine.
   *
   * Tenants may only CLOSE their own tickets (no resolution — the resolution
   * is the platform's answer, and a tenant writing it would be the platform's
   * words in their mouth). The platform may move anything, with a resolution
   * required for RESOLVED.
   */
  async setStatus(id: string, dto: SetTicketStatusDto, actor: TicketActor) {
    const ticket = await this.findOne(id, actor);
    try {
      assertTicketTransition(ticket.status, dto.status);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const isPlatform = !actor.tenantId && actor.role === 'SUPER_ADMIN';
    if (!isPlatform) {
      if (dto.status !== TicketStatus.CLOSED) {
        throw new ForbiddenException(
          'You may only close your own tickets — the platform team handles the rest',
        );
      }
      if (dto.resolution) {
        throw new BadRequestException(
          'Only the platform team may write a resolution',
        );
      }
    } else if (dto.status === TicketStatus.RESOLVED && !dto.resolution) {
      throw new BadRequestException(
        'Resolving a ticket requires a resolution — it is the answer the tenant reads',
      );
    } else if (dto.status !== TicketStatus.RESOLVED && dto.resolution) {
      throw new BadRequestException(
        'A resolution is only meaningful when resolving',
      );
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.resolution !== undefined ? { resolution: dto.resolution } : {}),
        ...(dto.status === TicketStatus.RESOLVED
          ? { resolvedAt: new Date(), resolvedById: actor.userId }
          : {}),
      },
      include: TICKET_INCLUDE,
    });
  }

  /** Delete is for OPEN tickets only — history that has been answered stays. */
  async remove(id: string, actor: TicketActor) {
    const ticket = await this.findOne(id, actor);
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException(
        `Only an OPEN ticket can be deleted (this one is ${ticket.status})`,
      );
    }
    if (
      actor.tenantId &&
      ticket.raisedByUserId !== actor.userId &&
      actor.role !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only the person who raised this ticket (or an organization admin) may delete it',
      );
    }
    await this.prisma.supportTicket.delete({ where: { id } });
    return { deleted: true };
  }

  private async resolveOrg(
    dto: CreateSupportTicketDto,
    actor: TicketActor,
  ): Promise<string> {
    // SUPER_ADMIN has no tenant: the organization comes from the body, never
    // from a default — silently filing a stranger's request under the wrong
    // org is exactly the failure the explicit field prevents.
    if (!actor.tenantId) {
      if (actor.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException(
          'User has no organization assigned; cannot raise a ticket',
        );
      }
      if (!dto.organizationId) {
        throw new BadRequestException(
          'organizationId is required when raising a ticket as a platform admin',
        );
      }
    }
    const organizationId = actor.tenantId ?? dto.organizationId!;
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org.id;
  }
}
