import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseRequestStatus,
  QuoteStatus,
  RfqStatus,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { compareQuotes, round2 } from './procurement-comparison';
import {
  checkRfqAction,
  isRfqOverdue,
  label,
  offerableRfqActions,
  RFQ_NEXT_STATUS,
  OPEN_RFQ_STATUSES,
  warnsSingleSource,
  type RfqGateContext,
} from './procurement-lifecycle';
import type {
  AwardQuoteDto,
  CancelRfqDto,
  CreateRfqDto,
  DeclineInvitationDto,
  InviteSuppliersDto,
  RecordQuoteDto,
  RfqFilters,
} from './dto/procurement.dto';

/**
 * The shape `compare` needs.
 *
 * Declared structurally rather than as `typeof RFQ_INCLUDE` because the RFQ is
 * read through several different queries with different includes; this is the
 * one intersection all of them share.
 */
interface ComparableRfq {
  status: RfqStatus;
  purchaseRequest: {
    estimatedAmount: unknown;
    lines: {
      id: string;
      description: string;
      quantity: unknown;
      estimatedAmount: unknown;
    }[];
  } | null;
  invitations: { supplierId: string; status: string }[];
  quotes: {
    id: string;
    supplierId: string;
    status: QuoteStatus;
    totalAmount: unknown;
    leadTimeDays: number | null;
    validUntil: Date | null;
    submittedAt: Date;
    supplier: { name: string };
    lines: {
      description: string;
      quantity: unknown;
      unitPrice: unknown;
      purchaseRequestLineId: string | null;
    }[];
  }[];
}

const RFQ_INCLUDE = {
  raisedBy: { select: { id: true, firstName: true, lastName: true } },
  purchaseRequest: {
    select: {
      id: true,
      reference: true,
      title: true,
      category: true,
      estimatedAmount: true,
      currency: true,
      lines: {
        select: {
          id: true,
          description: true,
          // The spec is what a supplier actually quotes against, so the RFQ
          // detail page shows it rather than making the buyer go back to the
          // request.
          specification: true,
          quantity: true,
          estimatedAmount: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
  invitations: {
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          rating: true,
        },
      },
    },
    orderBy: { invitedAt: 'asc' as const },
  },
  quotes: {
    include: {
      supplier: {
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          rating: true,
        },
      },
      lines: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          purchaseRequestLineId: true,
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { totalAmount: 'asc' as const },
  },
  awardedQuote: {
    // The lead time comes along because it is what the promised delivery date on
    // an order raised from this round was derived from.
    select: {
      id: true,
      supplierId: true,
      totalAmount: true,
      leadTimeDays: true,
    },
  },
  orders: {
    select: { id: true, reference: true, status: true, totalAmount: true },
  },
} as const;

/**
 * Module 10 — RFQs and the quotations against them.
 *
 * An RFQ is the one document in procurement that exists purely to *compare*: one
 * request, several suppliers, their answers side by side. Three decisions are
 * worth stating because they are the ones a buyer will try to get wrong:
 *
 * 1. **A single-source round is allowed but visible.** Refusing to issue an RFQ
 *    to one supplier would push the purchase into an email thread where nothing
 *    is recorded; instead `warnsSingleSource` marks it and the comparison view
 *    says so out loud.
 * 2. **Quotation totals are derived from the quote's own lines** on every read,
 *    never read from a stored total. A comparison table that disagrees with the
 *    lines printed under it is not a comparison, it is an opinion.
 * 3. **Awarding is the only way a quote becomes an order.** One quote per RFQ,
 *    enforced by the gate *and* by `awardedQuoteId` being unique.
 */
@Injectable()
export class RfqsService {
  constructor(private prisma: PrismaService) {}

  // ==================================================================== reads

  async findAll(organizationId: string | undefined, filters: RfqFilters = {}) {
    const rows = await this.prisma.rfq.findMany({
      where: this.buildWhere(organizationId, filters),
      include: RFQ_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const now = new Date();
    return rows.map((row) => this.decorate(row, now));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const row = await this.record(id, organizationId);
    return this.decorate(row, new Date());
  }

  /**
   * The comparison for one RFQ, as data.
   *
   * The arithmetic lives in `procurement-comparison.ts`; this only reads the
   * records and hands them over. Re-fetching the RFQ here rather than
   * recomputing from a passed-in row keeps one code path — a detail page and a
   * "compare" button cannot disagree about who was invited.
   */
  async comparison(id: string, organizationId: string | undefined) {
    const rfq = await this.record(id, organizationId);
    return this.compare(rfq);
  }

  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const now = new Date();

    const [byStatus, open] = await Promise.all([
      this.prisma.rfq.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.rfq.findMany({
        where: {
          ...base,
          status: { in: OPEN_RFQ_STATUSES },
        },
        select: {
          status: true,
          quotesDueAt: true,
          createdAt: true,
          _count: { select: { invitations: true, quotes: true } },
        },
        take: 2000,
      }),
    ]);

    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<RfqStatus, number>>,
      open: open.length,
      awaitingQuotes: open.filter((row) => row._count.quotes === 0).length,
      overdue: open.filter((row) => isRfqOverdue(row, now)).length,
      singleSource: open.filter((row) => row._count.invitations < 2).length,
    };
  }

  // =================================================================== writes

  /**
   * Open a quotation round.
   *
   * Copies the approved request's lines onto the invitations so a supplier is
   * asked about the *requested* items rather than a paraphrase. With no request
   * attached the RFQ stands alone, which is legitimate — re-quoting last year's
   * contract is most of what a repeat buyer does.
   */
  async create(dto: CreateRfqDto, organizationId: string, userId?: string) {
    let request: {
      id: string;
      reference: string;
      status: PurchaseRequestStatus;
      currency: string;
    } | null = null;

    if (dto.purchaseRequestId) {
      const found = await requireRecord(
        this.prisma.purchaseRequest.findFirst({
          where: { id: dto.purchaseRequestId, organizationId },
          select: {
            id: true,
            reference: true,
            status: true,
            currency: true,
          },
        }),
        'Purchase request',
      );
      request = found;

      // Only an approved request may be quoted for. This is the gate the doc's
      // acceptance criterion describes ("approved, converted to an RFQ"), and
      // enforcing it here rather than in the UI is the point of it existing.
      if (found.status !== PurchaseRequestStatus.APPROVED) {
        throw new ConflictException(
          `Purchase request ${found.reference} is ${label(
            found.status,
          ).toLowerCase()}. Only an approved request can be sent out for quotations.`,
        );
      }
    }

    if (dto.supplierIds?.length) {
      await this.assertSuppliers(organizationId, dto.supplierIds);
    }

    const created = await this.createWithReference({
      organization: { connect: { id: organizationId } },
      title: dto.title.trim(),
      notes: dto.notes?.trim(),
      status: RfqStatus.DRAFT,
      currency: dto.currency?.toUpperCase() || request?.currency || 'KES',
      quotesDueAt: dto.quotesDueAt ? new Date(dto.quotesDueAt) : undefined,
      ...(dto.purchaseRequestId
        ? { purchaseRequest: { connect: { id: dto.purchaseRequestId } } }
        : {}),
      ...(userId ? { raisedBy: { connect: { id: userId } } } : {}),
      ...(dto.supplierIds?.length
        ? {
            invitations: {
              create: dto.supplierIds.map((supplierId) => ({
                organization: { connect: { id: organizationId } },
                supplier: { connect: { id: supplierId } },
              })),
            },
          }
        : {}),
    } satisfies Omit<Prisma.RfqCreateInput, 'reference'>);

    return this.findOne(created.id, organizationId);
  }

  /**
   * Add suppliers to a round.
   *
   * Allowed while the round is open, and refused once it is awarded — adding a
   * supplier to a decided round invites a quotation nobody is going to read.
   */
  async inviteSuppliers(
    id: string,
    dto: InviteSuppliersDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status === RfqStatus.AWARDED ||
      existing.status === RfqStatus.CANCELLED ||
      existing.status === RfqStatus.CLOSED
    ) {
      throw new ConflictException(
        `This RFQ is ${label(existing.status).toLowerCase()}, so no more suppliers can be invited.`,
      );
    }

    await this.assertSuppliers(organizationId, dto.supplierIds);

    const alreadyInvited = new Set(
      existing.invitations.map((row) => row.supplierId),
    );
    const toAdd = dto.supplierIds.filter((id) => !alreadyInvited.has(id));

    if (toAdd.length === 0) {
      throw new ConflictException(
        'Every one of those suppliers has already been invited to this RFQ.',
      );
    }

    await this.prisma.rfqInvitation.createMany({
      data: toAdd.map((supplierId) => ({
        organizationId,
        rfqId: id,
        supplierId,
      })),
    });

    if (dto.notes?.trim()) {
      await this.prisma.rfq.update({
        where: { id },
        data: { notes: dto.notes.trim() },
      });
    }

    return this.findOne(id, organizationId);
  }

  /** A supplier saying no. The reason is required, and it is the record. */
  async declineInvitation(
    id: string,
    supplierId: string,
    dto: DeclineInvitationDto,
    organizationId: string,
  ) {
    const rfq = await this.record(id, organizationId);

    const invitation = await requireRecord(
      this.prisma.rfqInvitation.findFirst({
        where: { rfqId: id, supplierId, organizationId },
      }),
      'Invitation',
    );

    if (invitation.status !== 'INVITED') {
      throw new ConflictException(
        `${invitation.supplierId} has already responded to this RFQ.`,
      );
    }

    if (
      rfq.status === RfqStatus.AWARDED ||
      rfq.status === RfqStatus.CANCELLED
    ) {
      throw new ConflictException(
        `This RFQ is ${label(rfq.status).toLowerCase()} and no longer accepts responses.`,
      );
    }

    await this.prisma.rfqInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'DECLINED',
        respondedAt: new Date(),
        declineReason: dto.reason.trim(),
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Record a supplier's quotation.
   *
   * One quote per supplier per round (`@@unique([rfqId, supplierId])`), so a
   * second submission replaces the first rather than producing two competing
   * answers from the same company. The supplier must have been invited —
   * otherwise the comparison is a quote from somebody who was never asked, which
   * is not the same thing and is how a friendly supplier's price ends up winning.
   *
   * The total is summed from the lines here and stored, but every read derives it
   * again from the lines, so a stale total cannot mislead anybody.
   */
  async recordQuote(
    id: string,
    dto: RecordQuoteDto,
    organizationId: string,
    userId?: string,
  ) {
    const rfq = await this.record(id, organizationId);

    // QUOTES_RECEIVED is deliberately included, matching RECORD_QUOTE in
    // `RFQ_ACTIONS_BY_STATUS`: a round that has one answer is still collecting,
    // and a supplier who replies two days after the first one has not somehow
    // missed the deadline — the deadline is `quotesDueAt`, and a round whose
    // quotations are all in is closed explicitly or by awarding.
    if (
      rfq.status !== RfqStatus.DRAFT &&
      rfq.status !== RfqStatus.ISSUED &&
      rfq.status !== RfqStatus.QUOTES_RECEIVED
    ) {
      throw new ConflictException(
        `This RFQ is ${label(rfq.status).toLowerCase()} and no longer accepts quotations.`,
      );
    }

    await this.assertSuppliers(organizationId, [dto.supplierId]);

    const invitation = rfq.invitations.find(
      (row) => row.supplierId === dto.supplierId,
    );
    if (!invitation) {
      throw new BadRequestException(
        'That supplier was not invited to this RFQ. Invite them first, or start a new round.',
      );
    }

    // A declined supplier can change its mind and quote; anything else is a
    // client bug and would silently overwrite a real quotation.
    if (invitation.status !== 'INVITED' && invitation.status !== 'DECLINED') {
      throw new ConflictException(
        'That supplier has already submitted a quotation on this RFQ.',
      );
    }

    // Every line the supplier named must belong to this request. This is the
    // cross-tenant write Module 2 closed for units, one level deeper: an id
    // from the body connected to another organization's line.
    if (rfq.purchaseRequest?.lines.length) {
      const valid = new Set(rfq.purchaseRequest.lines.map((line) => line.id));
      for (const line of dto.lines) {
        if (
          line.purchaseRequestLineId &&
          !valid.has(line.purchaseRequestLineId)
        ) {
          throw new BadRequestException(
            'One of the quoted lines refers to an item that is not on this purchase request.',
          );
        }
      }
    }

    const total = round2(
      dto.lines.reduce(
        (sum, line) => sum + round2(Number(line.quantity) * line.unitPrice),
        0,
      ),
    );

    // Nested create only; the parent sets `quoteId`, so passing it here is
    // Prisma rejecting the payload for a field the caller cannot know yet.
    const lines = dto.lines.map((line, index) => ({
      organizationId,
      description: line.description.trim(),
      quantity: new Prisma.Decimal(line.quantity),
      unitPrice: new Prisma.Decimal(line.unitPrice),
      amount: new Prisma.Decimal(
        round2(Number(line.quantity) * line.unitPrice),
      ),
      purchaseRequestLineId: line.purchaseRequestLineId,
      sortOrder: index,
    }));

    // Split into the scalar columns and the relations on purpose: mixing a
    // scalar `rfqId` with an `organization: { connect }` makes Prisma reject the
    // payload ("Unknown argument") — the same class of bug as master doc issue
    // 42, where a payment body mixed `invoiceId` with a nested connect.
    const columns = {
      rfqId: id,
      supplierId: dto.supplierId,
      organizationId,
      totalAmount: new Prisma.Decimal(total),
      currency: rfq.currency,
      leadTimeDays: dto.leadTimeDays,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      notes: dto.notes?.trim(),
      status: QuoteStatus.SUBMITTED,
    };

    const existing = await this.prisma.rfqQuote.findFirst({
      where: { rfqId: id, supplierId: dto.supplierId, organizationId },
      select: { id: true },
    });

    const quote = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.rfqQuote.update({
            where: { id: existing.id },
            data: {
              ...columns,
              // A resubmission is a new answer, so the original submission date
              // moves with it — otherwise "first response time" would report the
              // time of a quote the supplier has withdrawn.
              submittedAt: new Date(),
              lines: { deleteMany: {}, create: lines },
            },
          })
        : await tx.rfqQuote.create({
            data: { ...columns, lines: { create: lines } },
          });

      // The invitation now says "they answered", which is what the RFQ list
      // counts when it says how many of the suppliers invited have replied.
      await tx.rfqInvitation.updateMany({
        where: { rfqId: id, supplierId: dto.supplierId },
        data: { status: 'QUOTED', respondedAt: new Date() },
      });

      // A quote against a draft round issues it as a side effect: a
      // paper round that was never sent out should have stayed a draft, and
      // recording a quotation for it is proof that somebody did ask.
      await tx.rfq.update({
        where: { id },
        data: {
          status: RFQ_NEXT_STATUS.RECORD_QUOTE,
          ...(rfq.status === RfqStatus.DRAFT
            ? { issuedAt: rfq.issuedAt ?? new Date() }
            : {}),
        },
      });

      return saved;
    });

    void userId;
    return { quote, rfq: await this.findOne(id, organizationId) };
  }

  async issue(id: string, organizationId: string) {
    const rfq = await this.record(id, organizationId);
    this.assertCanAct(rfq, 'ISSUE', {
      invitationCount: rfq.invitations.length,
    });

    await this.prisma.rfq.update({
      where: { id },
      data: { status: RfqStatus.ISSUED, issuedAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Close the round without awarding it.
   *
   * CLOSED, not CANCELLED: the round ran its course and somebody decided not to
   * buy. Only `cancel` records a reason, because only `cancel` tells a supplier
   * anything.
   */
  async close(id: string, organizationId: string) {
    const rfq = await this.record(id, organizationId);
    this.assertCanAct(rfq, 'CLOSE', { quoteCount: rfq.quotes.length });

    await this.prisma.rfq.update({
      where: { id },
      data: { status: RFQ_NEXT_STATUS.CLOSE, closedAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Reopen a closed round.
   *
   * The only way back from CLOSED. Useful when the winning quote turns out to be
   * unbuyable (the supplier never prices delivery, say) and the round needs more
   * time — starting a fresh one loses the quotations already collected, which is
   * the thing nobody wants to type up twice.
   */
  async reopen(id: string, organizationId: string) {
    const rfq = await this.record(id, organizationId);
    this.assertCanAct(rfq, 'REOPEN', {});

    await this.prisma.rfq.update({
      where: { id },
      data: {
        status: RFQ_NEXT_STATUS.REOPEN,
        closedAt: null,
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Award a quotation.
   *
   * Refused while the RFQ is still ISSUED — there may be quotations on the way,
   * and awarding before the round is closed is how a supplier finds out by email
   * that they lost. AWARDED is terminal.
   */
  async award(id: string, dto: AwardQuoteDto, organizationId: string) {
    const rfq = await this.record(id, organizationId);
    const quote = rfq.quotes.find((row) => row.id === dto.quoteId);

    if (!quote) {
      throw new BadRequestException(
        'That quotation is not on this RFQ, so it cannot be awarded.',
      );
    }

    this.assertCanAct(rfq, 'AWARD', {
      quoteId: quote.id,
      quoteStatus: quote.status,
      quoteCount: rfq.quotes.length,
      alreadyAwarded: Boolean(rfq.awardedQuoteId),
    });

    await this.prisma.$transaction(async (tx) => {
      // Everyone else's quotation is rejected rather than withdrawn: they were
      // genuinely considered, and the record should say so.
      await tx.rfqQuote.updateMany({
        where: { rfqId: id, id: { not: quote.id } },
        data: { status: QuoteStatus.REJECTED },
      });

      await tx.rfqQuote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.AWARDED },
      });

      await tx.rfq.update({
        where: { id },
        data: {
          status: RfqStatus.AWARDED,
          awardedQuoteId: quote.id,
          awardedAt: new Date(),
          closedAt: new Date(),
          ...(dto.note?.trim()
            ? {
                notes: [rfq.notes, `Awarded: ${dto.note.trim()}`]
                  .filter(Boolean)
                  .join('\n\n'),
              }
            : {}),
        },
      });
    });

    return this.findOne(id, organizationId);
  }

  async cancel(id: string, dto: CancelRfqDto, organizationId: string) {
    const rfq = await this.record(id, organizationId);
    this.assertCanAct(rfq, 'CANCEL', { cancellationReason: dto.reason });

    await this.prisma.rfq.update({
      where: { id },
      data: {
        status: RfqStatus.CANCELLED,
        cancellationReason: dto.reason.trim(),
        closedAt: new Date(),
      },
    });

    return this.findOne(id, organizationId);
  }

  /** Shortlist or un-shortlist a quotation — a filter, not a decision. */
  async setQuoteStatus(
    id: string,
    quoteId: string,
    status: QuoteStatus,
    organizationId: string,
  ) {
    const rfq = await this.record(id, organizationId);

    if (
      rfq.status === RfqStatus.AWARDED ||
      rfq.status === RfqStatus.CANCELLED
    ) {
      throw new ConflictException(
        'This RFQ has been awarded or cancelled; its quotations are now a record of what was considered.',
      );
    }

    const quote = await requireRecord(
      this.prisma.rfqQuote.findFirst({
        where: { id: quoteId, rfqId: id, organizationId },
      }),
      'Quotation',
    );

    if (quote.status === QuoteStatus.AWARDED) {
      throw new ConflictException(
        'That quotation has been awarded, so its status cannot change.',
      );
    }

    await this.prisma.rfqQuote.update({
      where: { id: quote.id },
      data: { status },
    });

    return this.findOne(id, organizationId);
  }

  /** Which RFQs a supplier was invited to — the supplier's own view. */
  async invitationsForSupplier(supplierId: string, organizationId: string) {
    await this.assertSuppliers(organizationId, [supplierId]);

    return this.prisma.rfqInvitation.findMany({
      where: { supplierId, organizationId },
      include: {
        rfq: {
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            quotesDueAt: true,
            purchaseRequest: {
              select: {
                id: true,
                reference: true,
                lines: {
                  select: {
                    id: true,
                    description: true,
                    specification: true,
                    quantity: true,
                    sortOrder: true,
                  },
                  orderBy: { sortOrder: 'asc' as const },
                },
              },
            },
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  // ================================================================== helpers

  /** Load a tenant-scoped RFQ with everything the comparison needs. */
  async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.rfq.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: RFQ_INCLUDE,
      }),
      'RFQ',
    );
  }

  /**
   * Every supplier id must be an active supplier in this organization.
   *
   * `ARCHIVED` is refused deliberately: inviting a supplier who has been shut is
   * usually a data-entry mistake, and the RFQ would look normal until the
   * comparison had nothing to compare.
   */
  private async assertSuppliers(organizationId: string, supplierIds: string[]) {
    const unique = [...new Set(supplierIds)];
    if (unique.length === 0) return;

    const found = await this.prisma.supplier.findMany({
      where: { id: { in: unique }, organizationId },
      select: { id: true, name: true, status: true },
    });

    if (found.length !== unique.length) {
      throw new BadRequestException(
        'One of those suppliers does not exist in this organization.',
      );
    }

    const archived = found.filter(
      (supplier) => supplier.status === SupplierStatus.ARCHIVED,
    );
    if (archived.length > 0) {
      throw new BadRequestException(
        `${archived.map((supplier) => supplier.name).join(', ')} ${
          archived.length === 1 ? 'is' : 'are'
        } archived — reactivate ${archived.length === 1 ? 'it' : 'them'} before inviting ${
          archived.length === 1 ? 'it' : 'them'
        } to a new RFQ.`,
      );
    }
  }

  /** Throw the gate's own reason — it is written for the person who pressed it. */
  private assertCanAct(
    rfq: {
      id: string;
      status: RfqStatus;
      invitations: unknown[];
      quotes: unknown[];
    },
    action: Parameters<typeof checkRfqAction>[1],
    context: Partial<RfqGateContext>,
  ) {
    const check = checkRfqAction(rfq.status, action, {
      invitationCount: rfq.invitations.length,
      quoteCount: rfq.quotes.length,
      ...context,
    });
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? `That action is not allowed from ${rfq.status}.`,
      );
    }
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: RfqFilters,
  ): Prisma.RfqWhereInput {
    const where: Prisma.RfqWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.status) where.status = filters.status as RfqStatus;
    if (filters.purchaseRequestId)
      where.purchaseRequestId = filters.purchaseRequestId;
    if (filters.supplierId) {
      where.invitations = { some: { supplierId: filters.supplierId } };
    }
    if (filters.overdue) {
      where.quotesDueAt = { lt: new Date() };
      where.status = { in: [RfqStatus.DRAFT, RfqStatus.ISSUED] };
    }
    if (filters.open) {
      where.status = { in: OPEN_RFQ_STATUSES };
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async createWithReference(
    input: Omit<Prisma.RfqCreateInput, 'reference'>,
  ) {
    const organizationId =
      typeof input.organization === 'object' && 'connect' in input.organization
        ? (input.organization.connect as { id: string }).id
        : (input.organization as unknown as string);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = await this.nextReference(organizationId);
      try {
        return await this.prisma.rfq.create({ data: { ...input, reference } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('reference')) throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate an RFQ reference. Please try again.',
    );
  }

  private async nextReference(organizationId: string) {
    const prefix = `RFQ-${new Date().getFullYear()}-`;
    const last = await this.prisma.rfq.findFirst({
      where: { organizationId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const sequence = last
      ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1
      : 1;

    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }

  /**
   * The comparison arithmetic for one RFQ.
   *
   * Called from `decorate` on every read and from `comparison()` directly, so
   * the list row, the detail header and the "compare" endpoint cannot disagree
   * about who was invited or which quote wins.
   */
  private compare(row: ComparableRfq) {
    return compareQuotes(
      row.quotes.map((quote) => ({
        id: quote.id,
        supplierId: quote.supplierId,
        supplierName: quote.supplier.name,
        status: quote.status,
        leadTimeDays: quote.leadTimeDays,
        validUntil: quote.validUntil,
        submittedAt: quote.submittedAt,
        lines: quote.lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          requestLineId: line.purchaseRequestLineId,
        })),
      })),
      {
        estimatedAmount:
          row.purchaseRequest?.estimatedAmount != null
            ? Number(row.purchaseRequest.estimatedAmount)
            : null,
        lines: (row.purchaseRequest?.lines ?? []).map((line) => ({
          id: line.id,
          description: line.description,
          quantity: Number(line.quantity),
          estimatedAmount:
            line.estimatedAmount != null ? Number(line.estimatedAmount) : null,
        })),
      },
      { invitationCount: row.invitations.length },
    );
  }

  /** Derived, never stored: overdue, comparison, what the row should offer. */
  private decorate<T extends ComparableRfq & { quotesDueAt: Date | null }>(
    row: T,
    now: Date,
  ) {
    return {
      ...row,
      statusLabel: label(row.status),
      overdue: isRfqOverdue(row, now),
      daysOverdue: row.quotesDueAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - row.quotesDueAt.getTime()) / 86_400_000,
            ),
          )
        : 0,
      singleSource: warnsSingleSource({
        invitationCount: row.invitations.length,
      }),
      quotesReceived: row.quotes.length,
      declinedCount: row.invitations.filter(
        (invitation) => invitation.status === 'DECLINED',
      ).length,
      availableActions: offerableRfqActions(row.status, {
        invitationCount: row.invitations.length,
        quoteCount: row.quotes.length,
      }),
      comparison: this.compare(row),
    };
  }
}
