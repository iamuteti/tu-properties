import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ChargeCategory, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import type {
  ChargeFilters,
  CreateChargeDto,
  UpdateChargeDto,
} from './dto/charge.dto';
import type {
  PaginationParams,
  PaginatedResult,
} from '../statements/owner-statements.service';

/**
 * Costs charged to an owner (Module 6).
 *
 * Repairs the company carried out, utilities it advanced, insurance and legal
 * fees — money spent on the owner's property that the owner owes back. They are
 * deducted on the next owner statement.
 *
 * A charge that has been rolled into an issued statement is frozen: it belongs
 * to a document the owner already has, so editing or deleting it would make
 * that statement stop reconciling.
 */
@Injectable()
export class LandlordChargesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateChargeDto,
    organizationId: string,
    userId?: string,
  ): Promise<any> {
    await this.assertLandlord(dto.landlordId, organizationId);

    if (dto.propertyId) {
      const property = await requireRecord(
        this.prisma.property.findFirst({
          where: { id: dto.propertyId, organizationId },
          select: { id: true, landlordId: true, name: true },
        }),
        'Property',
      );

      if (property.landlordId !== dto.landlordId) {
        throw new BadRequestException(
          'That property belongs to a different landlord.',
        );
      }
    }

    const created = await this.prisma.landlordCharge.create({
      data: {
        organizationId,
        landlordId: dto.landlordId,
        propertyId: dto.propertyId ?? null,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        chargeDate: dto.chargeDate ? new Date(dto.chargeDate) : new Date(),
        notes: dto.notes ?? null,
        createdBy: userId ?? null,
      },
      include: { property: { select: { id: true, name: true } } },
    });

    return this.findOne(created.id, organizationId);
  }

  findAll(
    organizationId: string,
    params?: PaginationParams,
    filters?: ChargeFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'chargeDate',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: Prisma.LandlordChargeWhereInput = { organizationId };

    if (filters?.landlordId) where.landlordId = filters.landlordId;
    if (filters?.propertyId) where.propertyId = filters.propertyId;
    if (filters?.category) where.category = filters.category;
    if (filters?.unstated) where.ownerStatementId = null;
    if (filters?.from || filters?.to) {
      where.chargeDate = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { landlord: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.landlordCharge.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            landlord: { select: { id: true, code: true, name: true } },
            property: { select: { id: true, name: true } },
            ownerStatement: {
              select: { id: true, statementNumber: true, status: true },
            },
          },
        }),
        tx.landlordCharge.count({ where }),
      ]);

      return {
        data: data.map((charge) => ({
          ...charge,
          amount: Number(charge.amount),
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(id: string, organizationId: string): Promise<any> {
    const charge = await requireRecord(
      this.prisma.landlordCharge.findFirst({
        where: { id, organizationId },
        include: {
          landlord: { select: { id: true, code: true, name: true } },
          property: { select: { id: true, name: true } },
          ownerStatement: {
            select: { id: true, statementNumber: true, status: true },
          },
        },
      }),
      'Landlord charge',
    );

    return { ...charge, amount: Number(charge.amount) };
  }

  async update(
    id: string,
    dto: UpdateChargeDto,
    organizationId: string,
  ): Promise<any> {
    await this.assertEditable(id, organizationId);

    await this.prisma.landlordCharge.update({
      where: { id },
      data: {
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.chargeDate ? { chargeDate: new Date(dto.chargeDate) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string): Promise<{ id: string }> {
    await this.assertEditable(id, organizationId);
    await this.prisma.landlordCharge.delete({ where: { id } });
    return { id };
  }

  /** Charges for one landlord, newest first, with the unstated total. */
  async historyForLandlord(landlordId: string, organizationId: string) {
    await this.assertLandlord(landlordId, organizationId);

    const charges = await this.prisma.landlordCharge.findMany({
      where: { landlordId, organizationId },
      include: {
        property: { select: { id: true, name: true } },
        ownerStatement: {
          select: { id: true, statementNumber: true, status: true },
        },
      },
      orderBy: { chargeDate: 'desc' },
    });

    const unstated = charges
      .filter((charge) => !charge.ownerStatementId)
      .reduce((sum, charge) => sum + Number(charge.amount), 0);

    return {
      data: charges.map((charge) => ({
        ...charge,
        amount: Number(charge.amount),
      })),
      totals: {
        unstated: Number(unstated.toFixed(2)),
        total: Number(
          charges
            .reduce((sum, charge) => sum + Number(charge.amount), 0)
            .toFixed(2),
        ),
        count: charges.length,
      },
    };
  }

  async exportCsv(
    organizationId: string,
    filters?: ChargeFilters,
  ): Promise<string> {
    const charges = await this.prisma.landlordCharge.findMany({
      where: {
        organizationId,
        ...(filters?.landlordId ? { landlordId: filters.landlordId } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
      },
      include: {
        landlord: { select: { code: true, name: true } },
        property: { select: { name: true } },
      },
      orderBy: { chargeDate: 'desc' },
    });

    return toCsv(
      [
        'landlordCode',
        'landlord',
        'property',
        'category',
        'description',
        'amount',
        'chargeDate',
        'statementId',
      ],
      charges.map((charge) => ({
        landlordCode: charge.landlord.code,
        landlord: charge.landlord.name,
        property: charge.property?.name ?? '',
        category: charge.category,
        description: charge.description,
        amount: Number(charge.amount).toFixed(2),
        chargeDate: charge.chargeDate.toISOString().slice(0, 10),
        statementId: charge.ownerStatementId ?? '',
      })),
    );
  }

  // ------------------------------------------------------------- internals

  private async assertEditable(
    id: string,
    organizationId: string,
  ): Promise<void> {
    await assertTenantRecord(this.prisma.landlordCharge, {
      id,
      organizationId,
    });

    const charge = await requireRecord(
      this.prisma.landlordCharge.findFirst({
        where: { id, organizationId },
        select: { ownerStatementId: true },
      }),
      'Landlord charge',
    );

    if (charge.ownerStatementId) {
      throw new ConflictException(
        'This charge is already on an owner statement, which the owner has been sent. Void that statement to change it.',
      );
    }
  }

  private async assertLandlord(
    landlordId: string,
    organizationId: string,
  ): Promise<void> {
    await assertTenantRecord(this.prisma.landlord, {
      id: landlordId,
      organizationId,
    });
  }
}

export const CHARGE_CATEGORIES = Object.values(ChargeCategory);
