import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OwnerStatementStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  CreatePayoutDto,
  PayoutFilters,
  UpdatePayoutStatusDto,
} from './dto/payout.dto';
import { checkPayoutStatusChange } from './payout-status';
import { computeStatementUnsettled } from '../statements/statement-calculator';
import type {
  PaginationParams,
  PaginatedResult,
} from '../statements/owner-statements.service';

/**
 * Owner payouts (Module 6).
 *
 * v1 records the intent and its outcome rather than calling a bank: the
 * transfer is made in the banking portal and the reference is recorded here, so
 * "what did we pay this owner, when, and against what" is answerable without a
 * payment integration. `status` is not settable on create — a payout starts
 * PENDING and moves through the state machine in `payout-status.ts`.
 */
@Injectable()
export class LandlordPayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreatePayoutDto,
    organizationId: string,
    userId?: string,
  ): Promise<any> {
    await this.assertLandlord(dto.landlordId, organizationId);

    if (dto.ownerStatementId) {
      const statement = await requireRecord(
        this.prisma.ownerStatement.findFirst({
          where: { id: dto.ownerStatementId, organizationId },
        }),
        'Owner statement',
      );

      if (statement.status === OwnerStatementStatus.VOID) {
        throw new ConflictException(
          'That statement was voided. Record the payout without a statement, or generate a new one.',
        );
      }

      if (statement.landlordId !== dto.landlordId) {
        throw new BadRequestException(
          'That statement belongs to a different landlord.',
        );
      }

      // Refuse at creation rather than at payment time: an oversized payout is
      // a mistake worth catching while the operator is still on the form.
      const unsettled = await this.unsettledOnStatement(
        statement.id,
        Number(statement.netPayout),
      );
      if (dto.amount > unsettled) {
        throw new BadRequestException(
          `Only ${unsettled.toLocaleString()} is still owed on statement ${statement.statementNumber}.`,
        );
      }
    }

    const created = await this.prisma.landlordPayout.create({
      data: {
        organizationId,
        landlordId: dto.landlordId,
        ownerStatementId: dto.ownerStatementId ?? null,
        amount: dto.amount,
        method: dto.method ?? 'BANK_TRANSFER',
        currency: dto.currency ?? 'KES',
        reference: dto.reference ?? null,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        notes: dto.notes ?? null,
        createdBy: userId ?? null,
      },
    });

    return this.findOne(created.id, organizationId);
  }

  findAll(
    organizationId: string,
    params?: PaginationParams,
    filters?: PayoutFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: Prisma.LandlordPayoutWhereInput = { organizationId };

    if (filters?.landlordId) where.landlordId = filters.landlordId;
    if (filters?.ownerStatementId)
      where.ownerStatementId = filters.ownerStatementId;
    if (filters?.status) where.status = filters.status;
    if (filters?.method) where.method = filters.method;
    if (filters?.paidFrom || filters?.paidTo) {
      where.createdAt = {
        ...(filters.paidFrom ? { gte: new Date(filters.paidFrom) } : {}),
        ...(filters.paidTo ? { lte: new Date(filters.paidTo) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { landlord: { name: { contains: search, mode: 'insensitive' } } },
        { landlord: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.landlordPayout.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            landlord: { select: { id: true, code: true, name: true } },
            ownerStatement: {
              select: { id: true, statementNumber: true, netPayout: true },
            },
          },
        }),
        tx.landlordPayout.count({ where }),
      ]);

      return {
        data: data.map((payout) => ({
          ...payout,
          amount: Number(payout.amount),
          ...(payout.ownerStatement
            ? {
                ownerStatement: {
                  ...payout.ownerStatement,
                  netPayout: Number(payout.ownerStatement.netPayout),
                },
              }
            : {}),
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(id: string, organizationId: string): Promise<any> {
    const payout = await requireRecord(
      this.prisma.landlordPayout.findFirst({
        where: { id, organizationId },
        include: {
          landlord: true,
          ownerStatement: {
            select: {
              id: true,
              statementNumber: true,
              periodStart: true,
              periodEnd: true,
              status: true,
              netPayout: true,
            },
          },
        },
      }),
      'Payout',
    );

    return {
      ...payout,
      amount: Number(payout.amount),
      ...(payout.ownerStatement
        ? {
            ownerStatement: {
              ...payout.ownerStatement,
              netPayout: Number(payout.ownerStatement.netPayout),
            },
          }
        : {}),
    };
  }

  /**
   * Move a payout through the state machine.
   *
   * Marking a payout PAID settles its statement once the recorded payouts cover
   * the net amount, and otherwise flips the statement to ISSUED — a statement
   * that has been paid must never read as merely issued.
   */
  async updateStatus(
    id: string,
    dto: UpdatePayoutStatusDto,
    organizationId: string,
  ): Promise<any> {
    const payout = await requireRecord(
      this.prisma.landlordPayout.findFirst({
        where: { id, organizationId },
        include: { ownerStatement: true },
      }),
      'Payout',
    );

    let unsettled: number | undefined;
    if (payout.ownerStatement) {
      unsettled = await this.unsettledOnStatement(
        payout.ownerStatement.id,
        Number(payout.ownerStatement.netPayout),
        id,
      );
    }

    const check = checkPayoutStatusChange(payout.status, dto.status, {
      amount: Number(payout.amount),
      reference: dto.reference ?? payout.reference,
      failureReason: dto.failureReason ?? payout.failureReason,
      unsettledOnStatement: unsettled,
      statementVoid:
        payout.ownerStatement?.status === OwnerStatementStatus.VOID,
    });

    if (!check.allowed) {
      throw new ConflictException(check.reason);
    }

    const data: Prisma.LandlordPayoutUpdateInput = { status: dto.status };

    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.failureReason !== undefined) data.failureReason = dto.failureReason;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status === PayoutStatus.PAID) {
      data.paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    }
    if (dto.status !== PayoutStatus.FAILED && dto.failureReason === undefined) {
      data.failureReason = null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.landlordPayout.update({ where: { id }, data });

      if (dto.status === PayoutStatus.PAID && payout.ownerStatement) {
        const statement = payout.ownerStatement;
        const stillOwed = await this.unsettledOnStatement(
          statement.id,
          Number(statement.netPayout),
        );
        const nextStatus =
          stillOwed <= 0
            ? OwnerStatementStatus.SETTLED
            : statement.status === OwnerStatementStatus.DRAFT
              ? OwnerStatementStatus.ISSUED
              : statement.status;

        if (nextStatus !== statement.status) {
          await tx.ownerStatement.update({
            where: { id: statement.id },
            data: {
              status: nextStatus,
              ...(statement.status === OwnerStatementStatus.DRAFT
                ? { issuedAt: new Date() }
                : {}),
            },
          });
        }
      }
    });

    return this.findOne(id, organizationId);
  }

  /** Payment history for one landlord. */
  async historyForLandlord(landlordId: string, organizationId: string) {
    await this.assertLandlord(landlordId, organizationId);

    const payouts = await this.prisma.landlordPayout.findMany({
      where: { landlordId, organizationId },
      include: {
        ownerStatement: {
          select: {
            id: true,
            statementNumber: true,
            periodEnd: true,
            netPayout: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paid = payouts
      .filter((payout) => payout.status === PayoutStatus.PAID)
      .reduce((sum, payout) => sum + Number(payout.amount), 0);
    const pending = payouts
      .filter((payout) => payout.status !== PayoutStatus.PAID)
      .reduce((sum, payout) => sum + Number(payout.amount), 0);

    return {
      data: payouts.map((payout) => ({
        ...payout,
        amount: Number(payout.amount),
        ...(payout.ownerStatement
          ? {
              ownerStatement: {
                ...payout.ownerStatement,
                netPayout: Number(payout.ownerStatement.netPayout),
              },
            }
          : {}),
      })),
      totals: {
        paid: Number(paid.toFixed(2)),
        pending: Number(pending.toFixed(2)),
        count: payouts.length,
      },
    };
  }

  async exportCsv(
    organizationId: string,
    filters?: PayoutFilters,
  ): Promise<string> {
    const payouts = await this.prisma.landlordPayout.findMany({
      where: {
        organizationId,
        ...(filters?.landlordId ? { landlordId: filters.landlordId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: { landlord: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return toCsv(
      [
        'landlordCode',
        'landlord',
        'statementNumber',
        'amount',
        'currency',
        'method',
        'status',
        'reference',
        'scheduledFor',
        'paidAt',
      ],
      payouts.map((payout) => ({
        landlordCode: payout.landlord.code,
        landlord: payout.landlord.name,
        statementNumber: payout.ownerStatementId ?? '',
        amount: Number(payout.amount).toFixed(2),
        currency: payout.currency,
        method: payout.method,
        status: payout.status,
        reference: payout.reference ?? '',
        scheduledFor: payout.scheduledFor?.toISOString().slice(0, 10) ?? '',
        paidAt: payout.paidAt?.toISOString().slice(0, 10) ?? '',
      })),
    );
  }

  // ------------------------------------------------------------- internals

  /** What a statement still owes, ignoring one payout (itself). */
  private async unsettledOnStatement(
    statementId: string,
    netPayout: number,
    excludePayoutId?: string,
  ): Promise<number> {
    const allocations = await this.prisma.landlordPayout.findMany({
      where: {
        ownerStatementId: statementId,
        ...(excludePayoutId ? { id: { not: excludePayoutId } } : {}),
      },
      select: { status: true, amount: true },
    });

    return computeStatementUnsettled(
      netPayout,
      allocations.map((allocation) => ({
        status: allocation.status,
        amount: Number(allocation.amount),
      })),
    );
  }

  private async assertLandlord(landlordId: string, organizationId: string) {
    await requireRecord(
      this.prisma.landlord.findFirst({
        where: { id: landlordId, organizationId },
        select: { id: true },
      }),
      'Landlord',
    );
  }
}
