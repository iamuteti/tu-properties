import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnerStatementStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  CreateLandlordDto,
  LandlordFilters,
  UpdateLandlordDto,
} from './dto/landlord.dto';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Landlord profiles (Module 6).
 *
 * A landlord is an owner, not a tenant: the money relationship runs the other
 * way. The profile carries the management agreement terms (fee type/rate/amount
 * that the owner statement deducts) and the bank details a payout is sent to.
 */
@Injectable()
export class LandlordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLandlordDto, tenantId: string): Promise<any> {
    const code = dto.code ?? (await this.nextCode(tenantId));

    const clash = await this.prisma.landlord.findFirst({
      where: { code },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`Landlord code ${code} is already in use.`);
    }

    return this.prisma.landlord.create({
      data: {
        organization: { connect: { id: tenantId } },
        code,
        name: dto.name,
        ...this.profileFields(dto),
      } as Prisma.LandlordCreateInput,
    });
  }

  findAll(
    tenantId: string,
    params?: PaginationParams,
    filters?: LandlordFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: Prisma.LandlordWhereInput = { organizationId: tenantId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { alternativePhone: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { postalCode: { contains: search, mode: 'insensitive' } },
        { accountName: { contains: search, mode: 'insensitive' } },
        { bankName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filters?.status) where.status = filters.status;
    if (filters?.managementFeeType)
      where.managementFeeType = filters.managementFeeType;
    if (filters?.hasProperties) where.properties = { some: {} };

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.landlord.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            properties: {
              select: { id: true, code: true, name: true, status: true },
            },
            _count: {
              select: {
                properties: true,
                ownerStatements: true,
                payouts: true,
              },
            },
          },
        }),
        tx.landlord.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  /** Profile plus the owner's portfolio and money history, for the detail page. */
  async findOne(id: string, tenantId: string): Promise<any> {
    const landlord = await requireRecord(
      this.prisma.landlord.findFirst({
        where: { id, organizationId: tenantId },
        include: {
          properties: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              type: true,
              _count: { select: { units: true } },
            },
            orderBy: { name: 'asc' },
          },
        },
      }),
      'Landlord',
    );

    const [statements, payouts, charges] = await Promise.all([
      this.prisma.ownerStatement.findMany({
        where: { landlordId: id, organizationId: tenantId },
        select: {
          id: true,
          statementNumber: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          grossIncome: true,
          expenses: true,
          managementFee: true,
          carriedForward: true,
          netPayout: true,
          issuedAt: true,
        },
        orderBy: { periodEnd: 'desc' },
        take: 12,
      }),
      this.prisma.landlordPayout.findMany({
        where: { landlordId: id, organizationId: tenantId },
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          reference: true,
          paidAt: true,
          createdAt: true,
          ownerStatement: { select: { id: true, statementNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.landlordCharge.findMany({
        where: { landlordId: id, organizationId: tenantId },
        select: {
          id: true,
          category: true,
          description: true,
          amount: true,
          chargeDate: true,
          ownerStatementId: true,
          property: { select: { id: true, name: true } },
        },
        orderBy: { chargeDate: 'desc' },
        take: 12,
      }),
    ]);

    const toNumber = (value: Prisma.Decimal | number) => Number(value);
    const paid = payouts
      .filter((payout) => payout.status === PayoutStatus.PAID)
      .reduce((sum, payout) => sum + toNumber(payout.amount), 0);
    const outstanding = statements
      .filter(
        (statement) =>
          statement.status === OwnerStatementStatus.ISSUED ||
          statement.status === OwnerStatementStatus.SETTLED,
      )
      .reduce((sum, statement) => sum + toNumber(statement.netPayout), 0);

    return {
      ...landlord,
      managementFeeRate: toNumber(landlord.managementFeeRate),
      managementFeeAmount: toNumber(landlord.managementFeeAmount),
      statements: statements.map((statement) => ({
        ...statement,
        grossIncome: toNumber(statement.grossIncome),
        expenses: toNumber(statement.expenses),
        managementFee: toNumber(statement.managementFee),
        carriedForward: toNumber(statement.carriedForward),
        netPayout: toNumber(statement.netPayout),
      })),
      payouts: payouts.map((payout) => ({
        ...payout,
        amount: toNumber(payout.amount),
      })),
      charges: charges.map((charge) => ({
        ...charge,
        amount: toNumber(charge.amount),
      })),
      totals: {
        properties: landlord.properties.length,
        units: landlord.properties.reduce(
          (sum, property) => sum + property._count.units,
          0,
        ),
        paidOut: Number(paid.toFixed(2)),
        // Gross of every issued statement less what has actually been paid out.
        outstanding: Number(Math.max(0, outstanding - paid).toFixed(2)),
        unstatedCharges: Number(
          charges
            .filter((charge) => !charge.ownerStatementId)
            .reduce((sum, charge) => sum + toNumber(charge.amount), 0)
            .toFixed(2),
        ),
      },
    };
  }

  async update(
    id: string,
    dto: UpdateLandlordDto,
    tenantId: string,
  ): Promise<any> {
    await assertTenantRecord(this.prisma.landlord, {
      id,
      organizationId: tenantId,
    });

    return this.prisma.landlord.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...this.profileFields(dto),
      },
    });
  }

  /**
   * Landlords are soft-deleted only. Their properties, invoices and statements
   * stay in the books, so a hard delete would orphan the money history.
   */
  async remove(id: string, tenantId: string): Promise<{ id: string }> {
    await assertTenantRecord(this.prisma.landlord, {
      id,
      organizationId: tenantId,
    });

    const landlord = await this.prisma.landlord.findFirst({
      where: { id, organizationId: tenantId },
      select: {
        properties: { select: { id: true, name: true }, take: 3 },
        _count: {
          select: { invoices: true, receipts: true, ownerStatements: true },
        },
      },
    });

    if (!landlord) throw new NotFoundException('Landlord not found');

    const dependencies = [
      landlord.properties.length
        ? `${landlord.properties.length} propert(y/ies)`
        : null,
      landlord._count.invoices
        ? `${landlord._count.invoices} invoice(s)`
        : null,
      landlord._count.ownerStatements
        ? `${landlord._count.ownerStatements} owner statement(s)`
        : null,
    ].filter(Boolean);

    if (dependencies.length > 0) {
      throw new ConflictException(
        `This landlord cannot be deleted because of ${dependencies.join(', ')}. ` +
          'Set the status to INACTIVE instead — the records stay intact.',
      );
    }

    await this.prisma.landlord.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });

    return { id };
  }

  async exportCsv(
    tenantId: string,
    filters?: LandlordFilters,
  ): Promise<string> {
    const landlords = await this.prisma.landlord.findMany({
      where: {
        organizationId: tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.managementFeeType
          ? { managementFeeType: filters.managementFeeType }
          : {}),
      },
      include: { _count: { select: { properties: true } } },
      orderBy: { name: 'asc' },
    });

    return toCsv(
      [
        'code',
        'name',
        'status',
        'email',
        'phone',
        'city',
        'country',
        'bankName',
        'accountName',
        'accountNumber',
        'taxPin',
        'managementFeeType',
        'managementFeeRate',
        'managementFeeAmount',
        'properties',
      ],
      landlords.map((landlord) => ({
        code: landlord.code,
        name: landlord.name,
        status: landlord.status,
        email: landlord.email ?? '',
        phone: landlord.phone ?? '',
        city: landlord.city ?? '',
        country: landlord.country ?? '',
        bankName: landlord.bankName ?? '',
        accountName: landlord.accountName ?? '',
        accountNumber: landlord.accountNumber ?? '',
        taxPin: landlord.taxPin ?? '',
        managementFeeType: landlord.managementFeeType,
        managementFeeRate: Number(landlord.managementFeeRate).toFixed(2),
        managementFeeAmount: Number(landlord.managementFeeAmount).toFixed(2),
        properties: landlord._count.properties,
      })),
    );
  }

  // ------------------------------------------------------------- internals

  /**
   * Map the DTO onto Prisma. Explicit field by field: passing the DTO straight
   * through would let a client set `organizationId`, `code` or `deletedAt`
   * through `PATCH`.
   */
  private profileFields(
    dto: CreateLandlordDto | UpdateLandlordDto,
  ): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    const simple = [
      'status',
      'email',
      'phone',
      'alternativePhone',
      'address',
      'city',
      'country',
      'postalCode',
      'bankName',
      'bankBranch',
      'accountName',
      'accountNumber',
      'taxPin',
      'vatRegistered',
      'managementFeeType',
      'managementFeeRate',
      'managementFeeAmount',
      'notes',
    ] as const;

    for (const field of simple) {
      const value = (dto as Record<string, unknown>)[field];
      if (value !== undefined) fields[field] = value;
    }

    return fields;
  }

  /** `LLD-001`, scoped per organization, with a retry on a unique collision. */
  private async nextCode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await this.prisma.landlord.count({
        where: { organizationId: tenantId },
      });
      const candidate = `LLD-${String(count + 1 + attempt).padStart(3, '0')}`;
      const clash = await this.prisma.landlord.findFirst({
        where: { code: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    return `LLD-${Date.now().toString().slice(-6)}`;
  }
}
