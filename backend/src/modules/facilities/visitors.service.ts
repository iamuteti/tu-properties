import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  CreateVisitorDto,
  CreateVisitDto,
  VisitorFilters,
  VisitFilters,
} from './dto/facilities.dto';

/** What a create or a patch may set. `isActive` is the update-only half. */
type VisitorPatch = Partial<CreateVisitorDto> & { isActive?: boolean };

/**
 * Module 13 — the gate: who is on site, and who has been here before.
 *
 * Two tables and the split is the whole design. `Visitor` is a *person*;
 * `VisitorVisit` is an *arrival*. The module doc called for "a simple log for v1",
 * and one table is simpler — until the question "have we had this person before, and
 * are they on the barred list" turns out to have no answer, because the name is
 * typed onto yesterday's row. That question is the entire point of a visitor log.
 *
 * **A visit has no status column.** `checkedInAt`/`checkedOutAt` are the facts and
 * "is this person still here", "who overstayed", "who is expected in the next hour"
 * are comparisons against the clock. An enum would be a fourth thing that can
 * disagree with the two timestamps it is supposed to describe — the exact failure
 * this codebase has now fixed in six other places: invoice money columns, stock
 * levels, received quantities, owner-statement lines, work-order `overdue`, and
 * booking `COMPLETED`.
 */
@Injectable()
export class VisitorsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================== visitors

  async findAll(
    organizationId: string | undefined,
    filters: VisitorFilters = {},
  ) {
    const rows = await this.prisma.visitor.findMany({
      where: this.visitorWhere(organizationId, filters),
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, company: true },
        },
        _count: { select: { visits: true } },
      },
      orderBy: [
        { isBlacklisted: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      take: 500,
    });

    // The on-site figure needs the open visits, so they are fetched once rather
    // than per row — a per-row query here is the N+1 that makes a gate screen slow
    // exactly when the gate is busy.
    const openVisits = await this.prisma.visitorVisit.findMany({
      where: {
        organizationId: organizationId ?? undefined,
        checkedInAt: { not: null },
        checkedOutAt: null,
      },
      select: { visitorId: true, expectedOutAt: true },
    });

    const onSite = new Map<string, number>();
    for (const visit of openVisits) {
      onSite.set(visit.visitorId, (onSite.get(visit.visitorId) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...this.visitorView(row),
      totalVisits: row._count.visits,
      onSiteNow: onSite.get(row.id) ?? 0,
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const visitor = await requireRecord(
      this.prisma.visitor.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
            },
          },
          accessCards: {
            select: {
              id: true,
              cardNumber: true,
              status: true,
              expiresAt: true,
              type: true,
            },
          },
        },
      }),
      'Visitor',
    );

    const now = new Date();
    const visits = await this.prisma.visitorVisit.findMany({
      where: {
        visitorId: id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            phone: true,
            isBlacklisted: true,
          },
        },
        property: { select: { id: true, name: true } },
      },
      orderBy: { expectedAt: 'desc' },
      take: 30,
    });

    const cards = await this.prisma.accessCard.findMany({
      where: { visitorId: id, ...(organizationId ? { organizationId } : {}) },
      select: {
        id: true,
        cardNumber: true,
        status: true,
        expiresAt: true,
        type: true,
      },
      orderBy: { issuedAt: 'desc' },
    });

    const onSite = visits.filter(
      (visit) => visit.checkedInAt && !visit.checkedOutAt,
    );

    return {
      ...this.visitorView(visitor),
      contact: visitor.contact,
      accessCards: cards,
      visits: visits.map((visit) => this.visitView(visit, now)),
      statistics: {
        totalVisits: visits.length,
        onSiteNow: onSite.length,
        overdue: onSite.filter(
          (visit) => visit.expectedOutAt && visit.expectedOutAt < now,
        ).length,
        lastVisitAt: visits[0]?.expectedAt ?? null,
        cardsHeld: cards.length,
      },
    };
  }

  async create(dto: CreateVisitorDto, organizationId: string) {
    if (dto.contactId) {
      await requireRecord(
        this.prisma.contact.findFirst({
          where: { id: dto.contactId, organizationId },
          select: { id: true },
        }),
        'Contact',
      );
    }

    const created = await this.prisma.visitor.create({
      data: {
        organization: { connect: { id: organizationId } },
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        company: dto.company?.trim() || null,
        idType: dto.idType?.trim() || null,
        idNumber: dto.idNumber?.trim() || null,
        ...(dto.contactId
          ? { contact: { connect: { id: dto.contactId } } }
          : {}),
        notes: dto.notes?.trim() || null,
      },
    });

    return this.findOne(created.id, organizationId);
  }

  async update(id: string, dto: VisitorPatch, organizationId: string) {
    await this.visitorRecord(id, organizationId);

    if (dto.contactId) {
      await requireRecord(
        this.prisma.contact.findFirst({
          where: { id: dto.contactId, organizationId },
          select: { id: true },
        }),
        'Contact',
      );
    }

    await this.prisma.visitor.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.company !== undefined
          ? { company: dto.company?.trim() || null }
          : {}),
        ...(dto.idType !== undefined
          ? { idType: dto.idType?.trim() || null }
          : {}),
        ...(dto.idNumber !== undefined
          ? { idNumber: dto.idNumber?.trim() || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.contactId !== undefined
          ? {
              contact: dto.contactId
                ? { connect: { id: dto.contactId } }
                : { disconnect: true },
            }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Bar somebody from the site.
   *
   * Its own action, and the reason requires an entry — "do not admit" with nothing
   * behind it is indistinguishable from a mistake, and this is the decision somebody
   * will be asked to justify at the gate. Refuses while they are on site: barring
   * somebody who is currently inside the building creates a situation the gate has
   * to resolve in person, and quietly allowing it is worse than making the guard
   * check somebody out first.
   */
  async bar(id: string, reason: string, organizationId: string) {
    const visitor = await this.visitorRecord(id, organizationId);

    if (visitor.isBlacklisted) {
      throw new ConflictException(
        `${visitor.firstName} ${visitor.lastName} is already barred. Lift the bar first if the reason no longer holds.`,
      );
    }

    const onSite = await this.prisma.visitorVisit.count({
      where: {
        visitorId: id,
        ...(organizationId ? { organizationId } : {}),
        checkedInAt: { not: null },
        checkedOutAt: null,
      },
    });
    if (onSite > 0) {
      throw new ConflictException(
        `${visitor.firstName} ${visitor.lastName} is currently on site (${onSite} open visit${onSite === 1 ? '' : 's'}). Check ${onSite === 1 ? 'them' : 'them all'} out first — barring somebody who is already inside creates a situation the gate has to resolve in person.`,
      );
    }

    await this.prisma.visitor.update({
      where: { id },
      data: {
        isBlacklisted: true,
        blacklistedAt: new Date(),
        blacklistReason: reason.trim(),
      },
    });

    return {
      ...(await this.findOne(id, organizationId)),
      message: `${visitor.firstName} ${visitor.lastName} barred from the site.`,
    };
  }

  /**
   * Lift a bar.
   *
   * Deliberately *not* clearing `blacklistReason`. The reason somebody was barred is
   * the fact that explains a later decision to bar them again, and a history with a
   * blank "why" in it cannot answer a question about whether they have been in
   * trouble before.
   */
  async unbar(id: string, organizationId: string) {
    const visitor = await this.visitorRecord(id, organizationId);

    if (!visitor.isBlacklisted) {
      throw new ConflictException(
        `${visitor.firstName} ${visitor.lastName} is not barred, so there is nothing to lift.`,
      );
    }

    await this.prisma.visitor.update({
      where: { id },
      data: { isBlacklisted: false, blacklistedAt: null },
    });

    return {
      ...(await this.findOne(id, organizationId)),
      message: `${visitor.firstName} ${visitor.lastName} may be admitted again. The original reason has been kept on their record.`,
    };
  }

  /**
   * There is no delete.
   *
   * Rather than a 405 with no explanation, this says why: the visit log is the
   * record of who came into the building, and deleting the visitor deletes it. The
   * way out is `isActive`, which hides somebody from the picker without erasing
   * their history.
   */
  remove(): never {
    throw new ConflictException(
      'Visitors are never deleted — the visit log is the record of who came into the building. Mark them inactive instead, which hides them from the picker while keeping the visits.',
    );
  }

  async exportCsv(organizationId: string | undefined): Promise<string> {
    const rows = await this.findAll(organizationId);

    return toCsv(
      [
        'name',
        'phone',
        'email',
        'company',
        'idType',
        'idNumber',
        'isBlacklisted',
        'blacklistReason',
        'totalVisits',
        'onSiteNow',
      ],
      rows.map((row) => ({
        name: row.displayName,
        phone: row.phone ?? '',
        email: row.email ?? '',
        company: row.company ?? '',
        idType: row.idType ?? '',
        idNumber: row.idNumber ?? '',
        isBlacklisted: row.isBlacklisted ? 'yes' : 'no',
        blacklistReason: row.blacklistReason ?? '',
        totalVisits: row.totalVisits,
        onSiteNow: row.onSiteNow,
      })),
    );
  }

  // ================================================================= visits

  async visits(organizationId: string | undefined, filters: VisitFilters = {}) {
    const now = new Date();

    const rows = await this.prisma.visitorVisit.findMany({
      where: this.visitWhere(organizationId, filters, now),
      include: {
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            phone: true,
            isBlacklisted: true,
          },
        },
        property: { select: { id: true, name: true } },
      },
      orderBy: [{ expectedAt: 'desc' }],
      take: 500,
    });

    return rows.map((row) => this.visitView(row, now));
  }

  async visit(id: string, organizationId: string | undefined) {
    const visit = await requireRecord(
      this.prisma.visitorVisit.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          visitor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              phone: true,
              idType: true,
              idNumber: true,
              isBlacklisted: true,
              blacklistReason: true,
            },
          },
          property: { select: { id: true, name: true } },
          accessCard: {
            select: {
              id: true,
              cardNumber: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      }),
      'Visit',
    );

    return this.visitView(visit, new Date());
  }

  /**
   * Log somebody arriving — or arriving *later*, which is why `expectedAt` exists.
   *
   * **A barred visitor is refused outright.** That is the entire reason the visitor
   * is a row rather than a name on the gate book, and a refusal the caller has to
   * override is worse than a refusal: it means the gate book and the system will
   * disagree. If somebody genuinely should be admitted, lift the bar first — which
   * keeps a decision and a reason on the record.
   */
  async createVisit(
    dto: CreateVisitDto,
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    const visitor = await requireRecord(
      this.prisma.visitor.findFirst({
        where: { id: dto.visitorId, organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isBlacklisted: true,
          blacklistReason: true,
        },
      }),
      'Visitor',
    );

    if (visitor.isBlacklisted) {
      throw new ConflictException(
        `${visitor.firstName} ${visitor.lastName} is barred from this site: ${visitor.blacklistReason ?? 'no reason recorded'}. Lift the bar on their record first if they should be admitted — that keeps the decision and the reason together.`,
      );
    }

    const hostName = await this.resolveHostName(dto, organizationId);
    const expectedAt = dto.expectedAt ? new Date(dto.expectedAt) : new Date();
    const expectedOutAt = dto.expectedOutAt
      ? new Date(dto.expectedOutAt)
      : null;

    if (Number.isNaN(expectedAt.getTime())) {
      throw new BadRequestException(
        'The expected arrival time is not a date the server understands.',
      );
    }
    if (expectedOutAt && Number.isNaN(expectedOutAt.getTime())) {
      throw new BadRequestException(
        'The expected leaving time is not a date the server understands.',
      );
    }
    if (expectedOutAt && expectedOutAt <= expectedAt) {
      throw new BadRequestException(
        'The visitor is expected to leave at or before they arrive, so there is no visit to log.',
      );
    }

    if (dto.accessCardId) {
      await requireRecord(
        this.prisma.accessCard.findFirst({
          where: { id: dto.accessCardId, organizationId },
          select: { id: true },
        }),
        'Access card',
      );
    }

    const created = await this.prisma.visitorVisit.create({
      data: {
        organization: { connect: { id: organizationId } },
        visitor: { connect: { id: visitor.id } },
        ...(dto.propertyId
          ? {
              property: {
                connect: {
                  id: await this.assertProperty(dto.propertyId, organizationId),
                },
              },
            }
          : {}),
        ...(dto.tenantId
          ? {
              tenant: {
                connect: {
                  id: await this.assertTenant(dto.tenantId, organizationId),
                },
              },
            }
          : {}),
        ...(dto.contactId
          ? {
              contact: {
                connect: {
                  id: await this.assertContact(dto.contactId, organizationId),
                },
              },
            }
          : {}),
        ...(dto.userId
          ? {
              user: {
                connect: {
                  id: await this.assertUser(dto.userId, organizationId),
                },
              },
            }
          : {}),
        hostName,
        ...(dto.hostPhone ? { hostPhone: dto.hostPhone.trim() } : {}),
        purpose: dto.purpose?.trim() || null,
        expectedAt,
        expectedOutAt,
        ...(dto.accessCardId
          ? { accessCard: { connect: { id: dto.accessCardId } } }
          : {}),
        notes: dto.notes?.trim() || null,
        // Signing somebody in at the desk is pre-approval as well as arrival: the
        // guard is the authority. `preApprovedByUserId` is for the case where
        // somebody called ahead, which is a different fact with a different meaning.
        ...(actorUserId
          ? { preApprovedByUser: { connect: { id: actorUserId } } }
          : {}),
      },
    });

    return this.visit(created.id, organizationId);
  }

  /**
   * Mark somebody in or out.
   *
   * The state is the timestamps, so the guards are about which transition is
   * meaningful rather than about a status field: checking out somebody who never
   * checked in would create a visit that appears to have happened without anybody
   * being on site for it, and checking in twice would leave two open visits for one
   * person.
   */
  async checkInOut(
    id: string,
    action: 'check-in' | 'check-out',
    organizationId: string,
  ) {
    const visit = await requireRecord(
      this.prisma.visitorVisit.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        select: {
          id: true,
          checkedInAt: true,
          checkedOutAt: true,
          expectedOutAt: true,
        },
      }),
      'Visit',
    );

    const now = new Date();

    if (action === 'check-in') {
      if (visit.checkedInAt) {
        throw new ConflictException(
          'They are already checked in. Check them out first — two open visits for one person makes the on-site count a lie.',
        );
      }
      await this.prisma.visitorVisit.update({
        where: { id },
        data: { checkedInAt: now },
      });
    } else {
      if (!visit.checkedInAt) {
        throw new ConflictException(
          'They were never checked in, so checking them out would create a visit that appears to have happened without anybody being on site for it. Check them in first.',
        );
      }
      if (visit.checkedOutAt) {
        throw new ConflictException('They are already checked out.');
      }
      await this.prisma.visitorVisit.update({
        where: { id },
        data: { checkedOutAt: now },
      });
    }

    return this.visit(id, organizationId);
  }

  /**
   * Pre-authorise somebody who has not arrived.
   *
   * Separate from `createVisit` because "was this expected" and "did they arrive"
   * are different questions: a contractor booked for Thursday who never turns up
   * must be visible as a missed appointment, and that is only possible if the
   * expectation is recorded before the arrival.
   */
  async preApprove(
    id: string,
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    const visit = await requireRecord(
      this.prisma.visitorVisit.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        select: { id: true, checkedInAt: true, preApprovedByUserId: true },
      }),
      'Visit',
    );

    if (visit.checkedInAt) {
      throw new ConflictException(
        'They are already on site, so they need no pre-approval. Nothing to record.',
      );
    }
    if (visit.preApprovedByUserId) {
      throw new ConflictException(
        'This visit has already been pre-authorised.',
      );
    }

    await this.prisma.visitorVisit.update({
      where: { id },
      data: {
        ...(actorUserId
          ? { preApprovedByUser: { connect: { id: actorUserId } } }
          : {}),
      },
    });

    return this.visit(id, organizationId);
  }

  async visitsExportCsv(organizationId: string | undefined): Promise<string> {
    const rows = await this.visits(organizationId);

    return toCsv(
      [
        'visitor',
        'company',
        'phone',
        'hostName',
        'property',
        'purpose',
        'expectedAt',
        'expectedOutAt',
        'checkedInAt',
        'checkedOutAt',
        'state',
      ],
      rows.map((row) => ({
        visitor: row.visitorName,
        company: row.visitorCompany ?? '',
        phone: row.visitorPhone ?? '',
        hostName: row.hostName,
        property: row.property?.name ?? '',
        purpose: row.purpose ?? '',
        expectedAt: new Date(row.expectedAt).toISOString(),
        expectedOutAt: row.expectedOutAt
          ? new Date(row.expectedOutAt).toISOString()
          : '',
        checkedInAt: row.checkedInAt
          ? new Date(row.checkedInAt).toISOString()
          : '',
        checkedOutAt: row.checkedOutAt
          ? new Date(row.checkedOutAt).toISOString()
          : '',
        state: row.stateLabel,
      })),
    );
  }

  // =============================================================== helpers

  private visitorWhere(
    organizationId: string | undefined,
    filters: VisitorFilters,
  ): Prisma.VisitorWhereInput {
    const where: Prisma.VisitorWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.isBlacklisted === 'true') where.isBlacklisted = true;
    else if (filters.isBlacklisted === 'false') where.isBlacklisted = false;

    if (!filters.includeInactive) where.isActive = true;

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * `state` is a **derived** filter, and that is why it is not a `where` clause: the
   * open/overdue states depend on two timestamps and the current time, so any query
   * that tried to express them in SQL would be a snapshot taken at a different
   * instant from the rows it is displayed against.
   */
  private visitWhere(
    organizationId: string | undefined,
    filters: VisitFilters,
    now: Date,
  ): Prisma.VisitorVisitWhereInput {
    const where: Prisma.VisitorVisitWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.visitorId) where.visitorId = filters.visitorId;
    if (filters.propertyId) where.propertyId = filters.propertyId;

    if (filters.state === 'onsite') {
      where.checkedInAt = { not: null };
      where.checkedOutAt = null;
    } else if (filters.state === 'expected') {
      where.checkedInAt = null;
      where.checkedOutAt = null;
    } else if (filters.state === 'history') {
      where.checkedOutAt = { not: null };
    }
    // `overdue` is derived on read and cannot be a `where` clause without repeating
    // the whole comparison in SQL, so it is applied in `visits` after the read.

    if (filters.from || filters.to) {
      where.expectedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { hostName: { contains: search, mode: 'insensitive' } },
        { purpose: { contains: search, mode: 'insensitive' } },
        { visitor: { firstName: { contains: search, mode: 'insensitive' } } },
        { visitor: { lastName: { contains: search, mode: 'insensitive' } } },
        { visitor: { company: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // `overdue` still needs the *candidate* set narrowed to open visits with an
    // expected departure, so that part is a where clause; only the comparison with
    // `now` happens afterwards.
    if (filters.state === 'overdue') {
      where.checkedInAt = { not: null };
      where.checkedOutAt = null;
      where.expectedOutAt = { not: null, lt: now };
    }

    return where;
  }

  /** What the gate book says, filled from whichever host was given. */
  private async resolveHostName(
    dto: CreateVisitDto,
    organizationId: string,
  ): Promise<string> {
    const explicit = dto.hostName?.trim();
    if (explicit) return explicit;

    if (dto.tenantId) {
      const tenant = await requireRecord(
        this.prisma.tenant.findFirst({
          where: { id: dto.tenantId, organizationId },
          select: { surname: true, otherNames: true },
        }),
        'Tenant',
      );
      return [tenant.otherNames, tenant.surname].filter(Boolean).join(' ');
    }

    if (dto.contactId) {
      const contact = await requireRecord(
        this.prisma.contact.findFirst({
          where: { id: dto.contactId, organizationId },
          select: { firstName: true, lastName: true, company: true },
        }),
        'Contact',
      );
      return [contact.company, contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(' ');
    }

    if (dto.userId) {
      const user = await requireRecord(
        this.prisma.user.findFirst({
          where: { id: dto.userId, organizationId },
          select: { firstName: true, lastName: true },
        }),
        'User',
      );
      return `${user.firstName} ${user.lastName}`;
    }

    throw new BadRequestException(
      'Say who the visitor is here to see — a name, or a resident, contact or staff login we can look the name up from. A gate book with no host is a visit nobody can be asked about.',
    );
  }

  private async visitorRecord(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.visitor.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Visitor',
    );
  }

  private async assertProperty(propertyId: string, organizationId: string) {
    await requireRecord(
      this.prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        select: { id: true },
      }),
      'Property',
    );
    return propertyId;
  }

  /** `Tenant.organizationId` is nullable here, so the filter is in the where clause. */
  private async assertTenant(tenantId: string, organizationId: string) {
    await requireRecord(
      this.prisma.tenant.findFirst({
        where: { id: tenantId, organizationId },
        select: { id: true },
      }),
      'Tenant',
    );
    return tenantId;
  }

  private async assertContact(contactId: string, organizationId: string) {
    await requireRecord(
      this.prisma.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { id: true },
      }),
      'Contact',
    );
    return contactId;
  }

  private async assertUser(userId: string, organizationId: string) {
    await requireRecord(
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true },
      }),
      'User',
    );
    return userId;
  }

  private visitorView(row: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    idType: string | null;
    idNumber: string | null;
    isBlacklisted: boolean;
    blacklistedAt: Date | null;
    blacklistReason: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: `${row.firstName} ${row.lastName}`,
      phone: row.phone,
      email: row.email,
      company: row.company,
      idType: row.idType,
      idNumber: row.idNumber,
      isBlacklisted: row.isBlacklisted,
      blacklistedAt: row.blacklistedAt,
      blacklistReason: row.blacklistReason,
      notes: row.notes,
      isActive: row.isActive,
      createdAt: row.createdAt,
    };
  }

  /**
   * The derived state of one visit.
   *
   * Every field is a comparison against `now`, so there is no column to fall out of
   * step and nothing to sweep. `OVERSTAY` is the important one: it is the answer to
   * "who is still in the building who should not be", and it cannot be stored
   * because it stops being true without a single write happening.
   */
  private visitView(
    row: {
      id: string;
      propertyId: string | null;
      hostName: string;
      hostPhone: string | null;
      purpose: string | null;
      expectedAt: Date;
      expectedOutAt: Date | null;
      checkedInAt: Date | null;
      checkedOutAt: Date | null;
      notes: string | null;
      preApprovedByUserId: string | null;
      createdAt: Date;
      visitor: {
        id: string;
        firstName: string;
        lastName: string;
        company: string | null;
        phone: string | null;
        isBlacklisted: boolean;
      };
      property?: { id: string; name: string } | null;
      accessCard?: {
        id: string;
        cardNumber: string;
        status: string;
        expiresAt: Date | null;
      } | null;
    },
    now: Date,
  ) {
    const onSite = Boolean(row.checkedInAt) && !row.checkedOutAt;
    const expectedOutAt = row.expectedOutAt;
    const overdue =
      onSite &&
      Boolean(expectedOutAt) &&
      expectedOutAt !== null &&
      expectedOutAt < now;

    const state = row.checkedOutAt
      ? 'COMPLETED'
      : overdue
        ? 'OVERSTAY'
        : row.checkedInAt
          ? 'ON_SITE'
          : row.expectedAt < now
            ? 'MISSED'
            : 'EXPECTED';

    const stateLabel = {
      COMPLETED: 'Left',
      OVERSTAY: 'Overstayed',
      ON_SITE: 'On site',
      MISSED: 'Did not arrive',
      EXPECTED: 'Expected',
    }[state];

    return {
      id: row.id,
      propertyId: row.propertyId,
      property: row.property ?? null,
      visitorId: row.visitor.id,
      visitorName: `${row.visitor.firstName} ${row.visitor.lastName}`,
      visitorCompany: row.visitor.company,
      visitorPhone: row.visitor.phone,
      visitorIsBlacklisted: row.visitor.isBlacklisted,
      hostName: row.hostName,
      hostPhone: row.hostPhone,
      purpose: row.purpose,
      expectedAt: row.expectedAt,
      expectedOutAt: row.expectedOutAt,
      checkedInAt: row.checkedInAt,
      checkedOutAt: row.checkedOutAt,
      notes: row.notes,
      preApprovedByUserId: row.preApprovedByUserId,
      isPreApproved: Boolean(row.preApprovedByUserId),
      accessCard: row.accessCard ?? null,
      createdAt: row.createdAt,
      state,
      stateLabel,
      isOnSite: onSite,
      isOverdue: overdue,
      /** Negative once overdue. Null when no departure was expected. */
      minutesOverdue:
        overdue && row.expectedOutAt
          ? Math.floor((now.getTime() - row.expectedOutAt.getTime()) / 60000)
          : null,
      /** The two actions the UI may offer, from the same rules the service enforces. */
      availableActions: onSite
        ? ['check-out']
        : row.checkedOutAt
          ? []
          : ['check-in'],
    };
  }
}
