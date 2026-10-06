import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  getTenantId,
  getUserId,
  requireRecord,
  requireTenantId,
} from '@/common/utils';
import type {
  ContractQueryDto,
  CreateContractDto,
  ExpiryReportQueryDto,
  RenewContractDto,
  UpdateContractDto,
} from './dto/contracts.dto';
import { canFileComplianceCertificate } from './legal-roles';
import type { Prisma, UserRole } from '@prisma/client';
import {
  buildRenewalChain,
  daysUntil,
  deriveContractStatus,
  describeShapeViolation,
  nextReminderBand,
  noticeDueAt,
  reminderDaysFor,
  type ContractStatus,
  type ContractType,
  type RenewalNode,
} from './contract-expiry';

/**
 * The shape every read returns.
 *
 * `status`, `daysUntilExpiry`, `noticeDueAt` and `reminderBand` are all **derived**
 * and none of them is a column - see the header of `contract-expiry.ts` for why a
 * stored status would drift. They are computed here, once, so the list, the detail
 * screen and the reminder sweep cannot disagree about whether a contract is expiring.
 */
export interface ContractView {
  id: string;
  organizationId: string;
  reference: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  startDate: Date | null;
  expiresAt: Date | null;
  /** Negative once the date is past. `null` for an open-ended agreement. */
  daysUntilExpiry: number | null;
  noticeDays: number | null;
  noticeDueAt: Date | null;
  autoRenew: boolean;
  renewalOfId: string | null;
  documentId: string | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The one related entity's id, whichever column carried it. */
  relatedId: string | null;
  /** The counterparty's display name, resolved so the list needs no N+1 from the UI. */
  relatedLabel: string | null;
  /** Whether a document is attached. Null when `hasDocument` was not requested. */
  hasDocument: boolean | null;
  /** The band the nightly sweep would alert on, or null when there is nothing to warn about. */
  reminderBand: number | null;
}

/** The four related-entity columns, so the relation include below cannot drift from the schema. */
const RELATED_COLUMNS = [
  'rentalAgreementId',
  'saleTransactionId',
  'supplierId',
  'landlordId',
] as const;

/**
 * Which relation name backs each column, for `include` and for label resolution.
 *
 * Selects match the real schemas rather than a wish: `Tenant` has `surname`/`otherNames`
 * and not `firstName`/`lastName`, `Landlord` has `name`/`code`, `RentalAgreement` is
 * identified by `code`, and `Unit` by `name`/`code`. Getting these wrong is exactly
 * what a hand-written test mock cannot catch - a mock that invents plausible field
 * names keeps every unit test green and then 500s on first contact with the database.
 *
 * `RentalAgreement` also brings `startDate`, `endDate` and `noticePeriodDays` - see
 * `effectiveTerm` for why they are selected.
 */
export const RELATED_INCLUDE = {
  rentalAgreement: {
    select: {
      code: true,
      startDate: true,
      endDate: true,
      noticePeriodDays: true,
      tenant: { select: { surname: true, otherNames: true, email: true } },
      unit: { select: { name: true, code: true } },
    },
  },
  saleTransaction: { select: { code: true, propertyTitle: true } },
  supplier: { select: { name: true, code: true } },
  landlord: { select: { name: true, code: true, email: true } },
} satisfies Prisma.ContractSelect;

/**
 * The include shared by every read: the four related entities (so the list can label
 * a counterparty without a second request) and `renewals` (so `isSuperseded` can be
 * resolved - it cannot be read off the row, because `renewalOfId` points at the
 * predecessor).
 */
const READ_INCLUDE = { ...RELATED_INCLUDE, renewals: { select: { id: true } } };

/** The columns a list returns. Deliberately explicit: `notes` is omitted from list rows. */
export const LIST_SELECT = {
  id: true,
  organizationId: true,
  reference: true,
  title: true,
  type: true,
  startDate: true,
  expiresAt: true,
  noticeDays: true,
  autoRenew: true,
  renewalOfId: true,
  documentId: true,
  createdAt: true,
  updatedAt: true,
  rentalAgreementId: true,
  saleTransactionId: true,
  supplierId: true,
  landlordId: true,
  renewals: { select: { id: true } },
  rentalAgreement: {
    select: {
      code: true,
      startDate: true,
      endDate: true,
      noticePeriodDays: true,
      tenant: { select: { surname: true, otherNames: true, email: true } },
      unit: { select: { name: true, code: true } },
    },
  },
  saleTransaction: { select: { code: true, propertyTitle: true } },
  supplier: { select: { name: true, code: true } },
  landlord: { select: { name: true, code: true, email: true } },
} satisfies Prisma.ContractSelect;

/**
 * Module 15 - the contract register.
 *
 * One service over one table. `Document` and its Document Center are left untouched and
 * this service borrows from them rather than building a second file store - the schema
 * has already paid for that mistake twice (`landlordId`/`tenantId`, `Supplier`), and a
 * contract's addenda and riders need no schema at all, because the Document Center
 * already attaches a file to any record through its `(entityType, entityId)` pair.
 *
 * Five things this service does that are easy to get wrong and are therefore worth
 * naming:
 *
 * 1. **The shape is checked before the write, and the refusal is a sentence.** The
 *    database enforces `contracts_one_related_entity` and `contracts_entity_matches_type`,
 *    but a constraint violation surfaces as a 500 and tells the user which dropdown to
 *    fix about as well as `violates check constraint`. `describeShapeViolation` gets
 *    there first.
 * 2. **`type` is immutable, and so is the counterparty.** See the DTO header. A
 *    mis-filed contract is deleted and refiled.
 * 3. **Renewal inherits, it does not choose.** The new contract takes its predecessor's
 *    `type` and related entity, and must end after it. A renewal that pointed at a
 *    different landlord would not be a renewal.
 * 4. **Notice is separate from expiry throughout.** `noticeDueAt` is computed on every
 *    read and is a first-class field in the response, because a contract past its
 *    notice deadline while still running is the case this module exists to catch.
 * 5. **A missing document is reported, not refused.** Contracts are routinely
 *    reconstructed from paperwork that arrives later, and refusing to file until the
 *    scan exists would mean the register is empty exactly when it is needed.
 */
@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List contracts, tenant-scoped.
   *
   * Filtering is on the columns the status derivation reads, never on the derived
   * status itself - see `ContractQueryDto.expiresFrom`. The sort is by `expiresAt` with
   * nulls last, because "what ends next" is the question the screen exists to answer,
   * and a null (open-ended) contract must not sort to the top as if it were most urgent.
   */
  async findAll(query: ContractQueryDto, req: any) {
    const tenantId = getTenantId(req);

    const where: Record<string, any> = {
      ...(tenantId ? { organizationId: tenantId } : {}),
    };

    if (query.type) where.type = query.type;

    if (query.expiresFrom || query.expiresTo) {
      where.expiresAt = {
        ...(query.expiresFrom ? { gte: new Date(query.expiresFrom) } : {}),
        ...(query.expiresTo ? { lte: new Date(query.expiresTo) } : {}),
      };
    }

    if (query.relatedId) {
      // "Narrow to one counterparty, whichever kind it is" - an OR across the four
      // typed columns, which is only expressible because they are four real columns
      // rather than one polymorphic pair.
      where.OR = RELATED_COLUMNS.map((column) => ({
        [column]: query.relatedId,
      }));
    }

    if (query.hasDocument !== undefined) {
      where.documentId = query.hasDocument ? { not: null } : null;
    }

    if (query.search) {
      // Case-insensitive on the two fields a person would search by. `contains` with
      // `mode: 'insensitive'` because contract references are cited aloud.
      where.AND = [
        {
          OR: [
            { reference: { contains: query.search, mode: 'insensitive' } },
            { title: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const rows = await this.prisma.contract.findMany({
      where,
      select: LIST_SELECT,
      // `asc` with nulls last is the whole point: an open-ended management agreement
      // has no date to miss and must not appear as the most urgent contract.
      orderBy: [
        { expiresAt: { sort: 'asc', nulls: 'last' } },
        { reference: 'asc' },
      ],
    });

    const now = new Date();
    return rows.map((row) => this.toView(row as ContractRow, now));
  }

  /**
   * One contract, with its derived status, its renewal chain and its attached
   * documents.
   *
   * `renewalChain` walks back to the original agreement and is what answers "what
   * happened to this one?" - the half of renewal tracking an end date cannot give.
   * The walk is done in memory from the contracts already fetched, so it is bounded by
   * the chain length and not by a query per link.
   */
  async findOne(id: string, req: any) {
    const tenantId = getTenantId(req);
    const contract = await requireRecord(
      this.prisma.contract.findFirst({
        where: { id, ...(tenantId ? { organizationId: tenantId } : {}) },
        include: {
          ...READ_INCLUDE,
          document: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              version: true,
            },
          },
          renewalOf: { select: { id: true, reference: true, expiresAt: true } },
          // The successor, when there is one. Named `renewals` because that is the
          // relation name in the schema - a `renewedBy` does not exist, and inventing
          // one would mean adding a column that duplicates the same edge.
          renewals: {
            select: { id: true, reference: true, expiresAt: true, title: true },
          },
        },
      }),
      'Contract',
    );

    const now = new Date();
    const detail = contract as ContractRow;
    const chain = await this.resolveChain(detail, tenantId);

    return {
      ...this.toView(detail, now),
      renewalChain: chain,
      // The predecessor this contract renews, if any.
      renewalOf: detail.renewalOf ?? null,
      // The contract that replaced this one, if any. Present is what makes the
      // register's `SUPERSEDED` status true.
      renewals: detail.renewals ?? [],
      // The authoritative scan, via the `documentId` foreign key.
      document: detail.document ?? null,
      // Addenda and riders, via the Document Center's own `(entityType, entityId)` pair.
      // No schema of ours and no relation needed - see the module doc's gap list, where
      // "attachments" was specified as a table and is in fact an index.
      attachments: await this.findAttachments(id, tenantId),
    };
  }

  /**
   * Every file attached to a contract, tenant-scoped.
   *
   * Queried through `Document`'s `(entityType, entityId)` pair rather than a reverse
   * relation on `Contract`, because `Document` is entity-agnostic and already indexes
   * exactly this pair. Adding a second attachment mechanism beside it is the mistake
   * this schema has made before.
   */
  private async findAttachments(contractId: string, tenantId?: string) {
    return this.prisma.document.findMany({
      where: {
        ...(tenantId ? { organizationId: tenantId } : {}),
        entityType: 'CONTRACT',
        entityId: contractId,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        version: true,
        uploadedById: true,
        createdAt: true,
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * The expiry report - derived statuses over a bounded forward window.
   *
   * This is where the derived statuses are *reported*, as opposed to filtered. It
   * loads the contracts ending inside the window (an indexed range scan on
   * `contracts_organizationId_type_expiresAt_idx`), derives each status, and returns
   * them ordered by urgency rather than by date.
   *
   * Ordered by status severity and not by date, because the two answers are different
   * and conflating them is how a notice-due contract expires quietly: a contract past
   * its notice deadline is committed to ending, and it can be 45 days out while a
   * contract 14 days out is still freely renegotiable. Sorting by date puts the
   * renegotiable one above the committed one.
   */
  async expiryReport(query: ExpiryReportQueryDto, req: any) {
    const tenantId = getTenantId(req);
    const now = new Date();
    const withinDays = query.withinDays ?? 180;
    const horizon = new Date(now.getTime() + withinDays * 86_400_000);

    const rows = await this.prisma.contract.findMany({
      where: {
        ...(tenantId ? { organizationId: tenantId } : {}),
        ...(query.type ? { type: query.type } : {}),
        // Both bounds. Without the lower bound this loads every contract that has
        // ever ended in the organization's history on every nightly report.
        expiresAt: { gt: now, lte: horizon },
      },
      select: LIST_SELECT,
      orderBy: [{ expiresAt: 'asc' }],
    });

    const views = rows.map((row) => this.toView(row as ContractRow, now));

    return {
      generatedAt: now.toISOString(),
      withinDays,
      horizon: horizon.toISOString(),
      total: views.length,
      byStatus: countBy(views, (view) => view.status),
      // Only the rows a person has to act on. An open-ended or undated contract has
      // no end date to report on and is not in this query's scope at all.
      needsAttention: views
        .filter(
          (view) => view.status === 'NOTICE_DUE' || view.reminderBand !== null,
        )
        .sort(compareByUrgency),
    };
  }

  /**
   * File a contract.
   *
   * Three refusals before anything is written, each with a sentence the user can act
   * on: the shape (`describeShapeViolation`), the term (`expiresAt` after
   * `startDate`), and - for `COMPLIANCE` - whether this role may file a certificate at
   * all. The last one exists because the role grants are organisation-wide, so a
   * maintenance manager holding `contracts.create` could otherwise file a supplier
   * agreement alongside the certificates they are there to maintain.
   */
  async create(dto: CreateContractDto, req: any) {
    const tenantId = requireTenantId(req);
    const userId = getUserId(req);
    // Narrowed with an explicit assertion rather than left `any`: `req.user.role` is
    // untyped everywhere in this codebase (the documented `no-unsafe-*` baseline), and
    // reading it into a typed local is what stops the value from spreading. The guard
    // keeps even the read itself from being an unsafe member access.
    const role = (req as { user?: { role?: UserRole } } | undefined)?.user
      ?.role;

    const related = {
      rentalAgreementId: dto.rentalAgreementId ?? null,
      saleTransactionId: dto.saleTransactionId ?? null,
      supplierId: dto.supplierId ?? null,
      landlordId: dto.landlordId ?? null,
    };

    const violation = describeShapeViolation(dto.type, related);
    if (violation) {
      throw new BadRequestException(violation);
    }

    if (dto.type === 'COMPLIANCE' && !canFileComplianceCertificate(role)) {
      throw new ForbiddenException(
        'Only a maintenance manager or an administrator can file a compliance certificate.',
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (startDate && expiresAt && expiresAt <= startDate) {
      throw new BadRequestException(
        'The end of the term must be after it starts - the dates read as if they were typed the wrong way round.',
      );
    }

    // A typed FK that names a row in another organization, or no row at all, is the
    // one thing the CHECK constraints cannot catch. Verified here so the user gets a
    // 400 naming the field rather than a P2003 from deep inside Prisma.
    await this.assertRelatedExists(related, tenantId);

    // Checked here rather than left to the unique index, for the reason
    // `utilities.service.ts` checks a meter number before creating one: a constraint
    // violation surfaces as a 500 and says nothing about which field was wrong. A
    // contract reference is citable, so "CON-0004 is already used in this organization"
    // is the whole answer the user needs.
    await this.assertReferenceAvailable(tenantId, dto.reference);

    const created = await this.prisma.contract.create({
      data: {
        organizationId: tenantId,
        reference: dto.reference,
        title: dto.title,
        type: dto.type,
        ...related,
        documentId: dto.documentId ?? null,
        startDate,
        expiresAt,
        noticeDays: dto.noticeDays ?? null,
        autoRenew: dto.autoRenew ?? false,
        notes: dto.notes ?? null,
        createdByUserId: userId ?? null,
      },
      select: LIST_SELECT,
    });

    return this.toView(created as ContractRow, new Date());
  }

  /**
   * Correct a contract's dates, title, notice period, notes and attachment.
   *
   * `type`, the four entity columns and `renewalOfId` are not editable here - see the
   * DTO header. The two terms can be re-ordered into an invalid pair by two separate
   * PATCHes, so both dates are re-checked together on every write.
   */
  async update(id: string, dto: UpdateContractDto, req: any) {
    const tenantId = requireTenantId(req);
    await this.requireOwned(id, tenantId);

    const startDate =
      dto.startDate !== undefined ? new Date(dto.startDate) : undefined;
    const expiresAt =
      dto.expiresAt !== undefined ? new Date(dto.expiresAt) : undefined;

    if (startDate && expiresAt && expiresAt <= startDate) {
      throw new BadRequestException(
        'The end of the term must be after it starts - the dates read as if they were typed the wrong way round.',
      );
    }

    // `documentId: null` is meaningful (the scan was the wrong one), so it is passed
    // through when the key is present rather than only when truthy.
    const data: Record<string, any> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.startDate !== undefined) data.startDate = startDate;
    if (dto.expiresAt !== undefined) data.expiresAt = expiresAt;
    if (dto.noticeDays !== undefined) data.noticeDays = dto.noticeDays;
    if (dto.autoRenew !== undefined) data.autoRenew = dto.autoRenew;
    if (dto.documentId !== undefined) data.documentId = dto.documentId || null;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.contract.update({
      where: { id },
      data,
      select: LIST_SELECT,
    });

    return this.toView(updated as ContractRow, new Date());
  }

  /**
   * Replace an expiring contract with a new term.
   *
   * A **new** row rather than an update of the old one, and that is the design rather
   * than a convenience: the old contract's end date is evidence. Updating it in place
   * would overwrite the date somebody is relying on in a renewal argument, and would
   * leave nothing to answer "what was the rent last year?" with. The new row carries
   * `renewalOfId`, which is what makes the history walkable.
   *
   * Inherited from the predecessor: `type`, the related entity, and `startDate` when
   * the new term begins when the old one ends. Inherited only because they are the
   * contract's identity - a renewal that named a different landlord, or a different
   * type, would be a different contract pretending to be a continuation.
   */
  async renew(id: string, dto: RenewContractDto, req: any) {
    const tenantId = requireTenantId(req);
    const userId = getUserId(req);
    const predecessor = await this.requireOwned(id, tenantId);

    const expiresAt = new Date(dto.expiresAt);

    if (predecessor.expiresAt && expiresAt <= predecessor.expiresAt) {
      throw new BadRequestException(
        `The new term must end after the one it replaces (${predecessor.reference} ends ${predecessor.expiresAt.toISOString().slice(0, 10)}).`,
      );
    }

    const startDate =
      predecessor.expiresAt && dto.expiresAt
        ? predecessor.expiresAt
        : predecessor.startDate;

    if (startDate && expiresAt <= startDate) {
      throw new BadRequestException(
        'The new term must end after it starts - the dates read as if they were typed the wrong way round.',
      );
    }

    // The reference is unique per organization and the renewal is a new citable
    // document, so it needs its own. Derived rather than asked for: the predecessor's
    // reference with a `-R2` suffix, suffixed again if that has been used.
    const reference = await this.nextRenewalReference(
      tenantId,
      predecessor.reference,
    );

    const created = await this.prisma.contract.create({
      data: {
        organizationId: tenantId,
        reference,
        title: predecessor.title,
        type: predecessor.type,
        rentalAgreementId: predecessor.rentalAgreementId,
        saleTransactionId: predecessor.saleTransactionId,
        supplierId: predecessor.supplierId,
        landlordId: predecessor.landlordId,
        documentId: dto.documentId ?? null,
        startDate,
        expiresAt,
        noticeDays: dto.noticeDays ?? predecessor.noticeDays,
        autoRenew: dto.autoRenew ?? predecessor.autoRenew,
        renewalOfId: predecessor.id,
        notes: dto.notes ?? predecessor.notes,
        createdByUserId: userId ?? null,
      },
      select: LIST_SELECT,
    });

    this.logger.log(
      `Contract ${predecessor.reference} renewed as ${reference} in org ${tenantId}`,
    );

    return this.toView(created as ContractRow, new Date());
  }

  /**
   * Remove a contract from the register.
   *
   * Meaning "this row was entered in error", not "this contract has lapsed" - a lapse
   * is recorded by letting the term end. `contracts.delete` is held by the admin tier
   * and by nobody who negotiates contracts, for that reason.
   *
   * A contract with a renewal is refused rather than deleted. The renewal points at it
   * (`renewalOfId`, `ON DELETE SET NULL`), so the delete would succeed and quietly
   * orphan the successor - leaving a live contract in the register whose history now
   * starts from nothing. That is a data-entry mistake with a legal consequence, so it
   * is caught here where the sentence can explain it.
   */
  async remove(id: string, req: any) {
    const tenantId = requireTenantId(req);
    const contract = await this.requireOwned(id, tenantId);

    if (contract.renewals.length > 0) {
      throw new BadRequestException(
        `${contract.reference} has been renewed (as ${contract.renewals[0].reference ?? 'a later contract'}). Delete the renewal first, or let the original term stand - deleting it would break the renewal's history.`,
      );
    }

    await this.prisma.contract.delete({ where: { id } });
    return { deleted: true, reference: contract.reference };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Turn a Prisma row into the response shape, deriving everything.
   *
   * `isSuperseded` comes from `renewals.length > 0` rather than from `renewalOfId`:
   * the renewal points at *this* contract, so a contract that carries `renewalOfId`
   * is the new term and the original is the superseded one. Reading the wrong column
   * flags the renewal as superseded and leaves the original looking live.
   *
   * Blanks go out as `null` and the derived numbers as real values, so a client never
   * has to distinguish "not applicable" from "not computed".
   */
  private toView(row: ContractRow, now: Date): ContractView {
    const { startDate, expiresAt, noticeDays } = effectiveTerm(row);

    const status = deriveContractStatus(
      {
        type: row.type,
        startDate,
        expiresAt,
        noticeDays,
        autoRenew: row.autoRenew,
        isSuperseded: (row.renewals?.length ?? 0) > 0,
      },
      now,
    );

    const relatedId =
      row.rentalAgreementId ??
      row.saleTransactionId ??
      row.supplierId ??
      row.landlordId ??
      null;

    return {
      id: row.id,
      organizationId: row.organizationId,
      reference: row.reference,
      title: row.title,
      type: row.type,
      status,
      startDate,
      expiresAt,
      daysUntilExpiry: expiresAt ? daysUntil(expiresAt, now) : null,
      noticeDays,
      noticeDueAt: noticeDueAt(expiresAt, noticeDays) ?? null,
      autoRenew: row.autoRenew,
      renewalOfId: row.renewalOfId,
      documentId: row.documentId,
      notes: row.notes ?? null,
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      relatedId,
      relatedLabel: labelFor(row),
      hasDocument: row.documentId ? true : null,
      reminderBand: expiresAt
        ? nextReminderBand(
            daysUntil(expiresAt, now),
            reminderDaysFor(noticeDays),
          )
        : null,
    };
  }

  /**
   * Walk the renewal chain back to the original agreement.
   *
   * Built from a single bounded fetch of the whole organization's contract ids and
   * references rather than a lookup per link, because the chain is short and a query
   * per link is a query per link. `buildRenewalChain` terminates on a cycle, which
   * matters here because these ids come from scanned paperwork typed in by hand.
   */
  private async resolveChain(contract: ContractRow, tenantId?: string) {
    const links = await this.prisma.contract.findMany({
      where: {
        ...(tenantId ? { organizationId: tenantId } : {}),
        OR: [
          // The successor of this contract.
          { renewalOfId: contract.id },
          // The predecessor it renews. The `?? '__none__'` guard matters: `renewalOfId`
          // is `ON DELETE SET NULL`, so a null here would otherwise become
          // `id = null`, which Prisma translates into a filter that matches nothing
          // rather than into an error.
          { id: contract.renewalOfId ?? '__none__' },
        ],
      },
      select: { id: true, reference: true, expiresAt: true, renewalOfId: true },
    });

    const byId = new Map<string, RenewalNode>(
      links.map((link) => [link.id, link]),
    );

    // `contract` itself may not be in `links` - it is only selected when it is its own
    // successor or predecessor, which is never true - so it is added explicitly.
    const start: RenewalNode = {
      id: contract.id,
      reference: contract.reference,
      expiresAt: contract.expiresAt,
      renewalOfId: contract.renewalOfId,
    };
    byId.set(start.id, start);

    return buildRenewalChain(start, byId).map((node) => ({
      id: node.id,
      reference: node.reference,
      expiresAt: node.expiresAt,
      isCurrent: node.id === contract.id,
    }));
  }

  /**
   * Refuse a reference already used in this organization.
   *
   * Scoped to the organization deliberately: two organizations in this system are
   * separate businesses that both started their contracts at `CON-0001`, and forcing a
   * global sequence would leak one tenant's document numbering to another.
   */
  private async assertReferenceAvailable(tenantId: string, reference: string) {
    const taken = await this.prisma.contract.findFirst({
      where: { organizationId: tenantId, reference },
      select: { id: true },
    });

    if (taken) {
      throw new ConflictException(
        `Reference ${reference} is already used in this organization. Contract references are cited in letters and in disputes, so they have to be unique - pick the next unused one.`,
      );
    }
  }

  /**
   * Confirm a typed FK names a row that exists **in this organization**.
   *
   * The CHECK constraints can see how many entity columns are set and whether they
   * match `type`; they cannot see that the id belongs to another tenant. Without this
   * a caller could attach a contract to another organization's supplier, and the row
   * would pass every constraint in the table.
   */
  private async assertRelatedExists(
    related: Record<string, string | null>,
    tenantId: string,
  ) {
    // A closure per column rather than a `(this.prisma[name] as any)` lookup table.
    // The dynamic version needed an `any` to compile, which lost every type on the
    // delegate and produced the `no-unsafe-*` noise this method exists to avoid; with
    // closures each delegate keeps its real argument types, so a wrong `where` is a
    // compile error rather than a runtime one.
    //
    // Every column is checked, not just the one `type` implies: the shape has already
    // been validated by `describeShapeViolation` before this runs, so anything set here
    // is being checked for *tenancy* - the only thing the CHECK constraints cannot see.
    const scoped = { id: true } as const;
    const checks: {
      column:
        | 'rentalAgreementId'
        | 'saleTransactionId'
        | 'supplierId'
        | 'landlordId';
      label: string;
      exists: (id: string) => Promise<unknown>;
    }[] = [
      {
        column: 'rentalAgreementId',
        label: 'lease',
        exists: (id) =>
          this.prisma.rentalAgreement.findFirst({
            where: { id, organizationId: tenantId },
            select: scoped,
          }),
      },
      {
        column: 'saleTransactionId',
        label: 'sale',
        exists: (id) =>
          this.prisma.saleTransaction.findFirst({
            where: { id, organizationId: tenantId },
            select: scoped,
          }),
      },
      {
        column: 'supplierId',
        label: 'supplier',
        exists: (id) =>
          this.prisma.supplier.findFirst({
            where: { id, organizationId: tenantId },
            select: scoped,
          }),
      },
      {
        column: 'landlordId',
        label: 'landlord',
        exists: (id) =>
          this.prisma.landlord.findFirst({
            where: { id, organizationId: tenantId },
            select: scoped,
          }),
      },
    ];

    for (const check of checks) {
      const id = related[check.column];
      if (!id) continue;

      if (!(await check.exists(id))) {
        throw new BadRequestException(
          `That ${check.label} is not in this organization. Pick one of your own records.`,
        );
      }
    }
  }

  /**
   * Fetch a contract scoped to the tenant, or 404.
   *
   * 404 rather than 403 for another organization's contract: telling a user that a
   * record exists but belongs to someone else is the same leak as reading it.
   */
  private async requireOwned(
    id: string,
    tenantId?: string,
  ): Promise<ContractRow> {
    // `include` rather than the shared `LIST_SELECT`, because this needs the successor's
    // `reference` for the delete refusal's sentence, which a list row does not carry.
    return requireRecord(
      this.prisma.contract.findFirst({
        where: { id, ...(tenantId ? { organizationId: tenantId } : {}) },
        include: { renewals: { select: { id: true, reference: true } } },
      }),
      'Contract',
    ) as Promise<ContractRow>;
  }

  /**
   * The next free `-R<n>` reference for a renewal, in this organization.
   *
   * Generated rather than accepted from the caller because it is the same citable
   * identifier the register is built on, and a renewal is a new document somebody may
   * cite. Retries on collision rather than throwing, because two renewals of adjacent
   * terms filed in the same second is a normal thing to do.
   */
  private async nextRenewalReference(
    tenantId: string,
    base: string,
  ): Promise<string> {
    const root = base.replace(/-R\d+$/, '');

    for (let attempt = 2; attempt < 100; attempt += 1) {
      const candidate = `${root}-R${attempt}`;
      const clash = await this.prisma.contract.findFirst({
        where: { organizationId: tenantId, reference: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    // 98 attempts is not a number anybody reaches by hand; if it happens the
    // organization has a machine filing renewals and the suffix should change shape.
    return `${root}-R${Date.now()}`;
  }
}

/** Urgency order for the expiry report. `NOTICE_DUE` first - see the method header. */
const STATUS_URGENCY: Record<ContractStatus, number> = {
  NOTICE_DUE: 0,
  EXPIRING_SOON: 1,
  EXPIRED: 2,
  PENDING: 3,
  ACTIVE: 4,
  OPEN_ENDED: 5,
  SUPERSEDED: 6,
  UNDATED: 7,
};

function compareByUrgency(a: ContractView, b: ContractView): number {
  const byStatus = STATUS_URGENCY[a.status] - STATUS_URGENCY[b.status];
  if (byStatus !== 0) return byStatus;
  // Within a status, soonest first.
  return (
    (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity)
  );
}

function countBy<T>(
  items: T[],
  key: (item: T) => string,
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const bucket = key(item);
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * A contract row as every read returns it, **derived from `LIST_SELECT` rather than
 * hand-written**.
 *
 * That is the second half of the fix for the defect that shipped a 500. `satisfies
 * Prisma.ContractSelect` on the literal makes a wrong field a compile error; deriving
 * this from the same literal makes it impossible for the *spec's mock* to describe a
 * shape the service cannot produce. The original `ContractRow` was written out by hand
 * and claimed `notes` and `createdByUserId` were present when neither is in the select -
 * so a mock built from it agreed with a type that was itself fiction, and the whole
 * suite stayed green while every read 500'd.
 *
 * Concretely: adding a field to `LIST_SELECT` widens this type automatically, removing
 * one narrows it, and a test fixture that returns the wrong shape stops compiling.
 *
 * The three detail-only relations (`renewalOf`, `document`, and a richer `renewals`)
 * are intersected on rather than selected, because they are resolved by `include` in
 * `findOne` only. They are optional here so one row type serves both the list and the
 * detail path.
 */
type ContractRowFromSelect = Prisma.ContractGetPayload<{
  select: typeof LIST_SELECT;
}>;

/** The four related entities, non-nullable where the schema says they are. */
interface RelatedShape {
  rentalAgreementId: string | null;
  saleTransactionId: string | null;
  supplierId: string | null;
  landlordId: string | null;
}

/**
 * `renewals` comes back as `{ id }[]` from the select, but `requireOwned` includes
 * `{ id, reference }` and `findOne` includes `{ id, reference, expiresAt, title }`.
 * Widening to the union means one row type covers all three call sites, and every
 * consumer already treats `reference` as optional (the delete refusal falls back to a
 * generic phrase).
 */
/**
 * Exported so the service spec's fixtures are typed against it.
 *
 * That export is the point rather than an incidental convenience: with the type
 * module-private, `contracts.service.spec.ts` had to declare its fixture shape by hand
 * or fall back to `Record<string, any>`, and both let it invent a field the service
 * cannot produce. Verified - typing the fixture with this type makes a fixture using
 * `Tenant.firstName` a compile error, where previously it type-checked happily while
 * every read 500'd.
 */
export type ContractRow = ContractRowFromSelect &
  RelatedShape & {
    renewals: {
      id: string;
      reference?: string;
      expiresAt?: Date | null;
      title?: string;
    }[];
    /** Detail-only. The predecessor this contract renews, resolved for `findOne`. */
    renewalOf?: {
      id: string;
      reference: string;
      expiresAt: Date | null;
    } | null;
    /** Detail-only. The authoritative scan, resolved for `findOne`. */
    document?: {
      id: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      version: number;
    } | null;
    /**
     * Not in `LIST_SELECT`, so a list row does not carry them.
     *
     * Declared optional rather than `string | null` because the honest type is
     * "absent", and `toView` normalises both to `null` on the way out.
     */
    notes?: string | null;
    createdByUserId?: string | null;
  };

/**
 * The dates and notice period a contract is actually read against.
 *
 * `RentalAgreement` already carries `startDate`, `endDate` and `noticePeriodDays`, and
 * this module does **not** add a second copy of them for lease contracts. A `LEASE`
 * contract therefore falls back to the lease's own dates when its own columns are
 * empty, which is what stops the register disagreeing with the lease module about when
 * a tenancy ends - two columns holding the same fact is a second copy that drifts the
 * first time somebody corrects one of them.
 *
 * A value set on the contract still wins, and that is deliberate rather than a
 * loophole. The register records what was *signed*, and a contract reconstructed from
 * paperwork can legitimately differ from the lease row: an addendum that extended the
 * term, or a lease record keyed to the wrong end date. Where the two disagree the
 * contract wins, because the register is the evidence and the lease row is the
 * operational view.
 *
 * Applies to `LEASE` only. `SaleTransaction`, `Supplier` and `Landlord` carry no
 * comparable date or notice column, and `COMPLIANCE` has no counterparty at all.
 */
function effectiveTerm(row: ContractRow): {
  startDate: Date | null;
  expiresAt: Date | null;
  noticeDays: number | null;
} {
  const lease = row.type === 'LEASE' ? row.rentalAgreement : null;
  return {
    startDate: row.startDate ?? lease?.startDate ?? null,
    expiresAt: row.expiresAt ?? lease?.endDate ?? null,
    noticeDays: row.noticeDays ?? lease?.noticePeriodDays ?? null,
  };
}

/**
 * A human label for whichever counterparty the contract points at.
 *
 * Resolved here so the list screen does not have to render four different shapes, and
 * null rather than an empty string when there is no counterparty - a compliance
 * certificate genuinely has none, and "COMPLIANCE certificate" would be an invention.
 */
function labelFor(row: ContractRow): string | null {
  if (row.supplier) return row.supplier.name;
  if (row.saleTransaction) return row.saleTransaction.code;
  if (row.landlord) return row.landlord.name || row.landlord.email || null;
  if (row.rentalAgreement) {
    const tenant = row.rentalAgreement.tenant;
    // `surname` is the required column and `otherNames` the optional one, so the
    // surname alone is a complete label - and joining the wrong way round would put
    // "Otieno Ama" in the register.
    const name = tenant
      ? [tenant.surname, tenant.otherNames].filter(Boolean).join(' ')
      : '';
    if (name) return name;
    if (row.rentalAgreement.code) return row.rentalAgreement.code;
    return (
      row.rentalAgreement.unit?.name ?? row.rentalAgreement.unit?.code ?? null
    );
  }
  return null;
}
