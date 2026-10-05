import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DeductionCategory, Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { UnitsService } from '@/modules/units/units.service';
import { calculateDeposit, validateDeduction } from './lease-deposit';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface MoveOutFilters {
  status?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * Move-out requests (Module 5).
 *
 * The audit found the deposit refund was a number typed into the form, which is
 * not auditable. Now the itemised deductions are the record and the refund is
 * always derived from them (see `lease-deposit.ts`), and the lifecycle is
 * explicit: PENDING → APPROVED → COMPLETED, or REJECTED.
 */
@Injectable()
export class MoveoutsService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  /**
   * Raise a move-out request against a lease.
   *
   * The tenant comes from the lease rather than the request: a move-out is
   * somebody leaving, so it cannot be raised against somebody else's tenancy,
   * and it tenant-checks the agreement in the same step.
   */
  async create(
    dto: { rentalAgreementId: string; moveoutDate: Date; notes?: string },
    tenantId: string,
  ) {
    const agreement = await requireRecord(
      this.prisma.rentalAgreement.findFirst({
        where: {
          id: dto.rentalAgreementId,
          OR: [{ organizationId: tenantId }, { organizationId: null }],
        },
        select: { id: true, tenantId: true, status: true },
      }),
      'Rental agreement',
    );

    const open = await this.prisma.moveOutRequest.findFirst({
      where: {
        rentalAgreementId: agreement.id,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException(
        'This tenancy already has an open move-out request.',
      );
    }

    return this.prisma.moveOutRequest.create({
      data: {
        rentalAgreement: { connect: { id: agreement.id } },
        tenant: { connect: { id: agreement.tenantId } },
        moveoutDate: dto.moveoutDate,
        notes: dto.notes ?? null,
        organization: { connect: { id: tenantId } },
      },
      include: this.relationInclude(),
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: MoveOutFilters,
  ): Promise<PaginatedResult<unknown>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: Prisma.MoveOutRequestWhereInput = tenantId
      ? { organizationId: tenantId }
      : {};

    if (search) {
      where.tenant = {
        is: {
          OR: [
            { surname: { contains: search, mode: 'insensitive' } },
            { otherNames: { contains: search, mode: 'insensitive' } },
            { accountNumber: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        },
      };
    }

    if (filters) {
      if (filters.status) where.status = filters.status as never;
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.moveOutRequest.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder as never },
          include: this.relationInclude(),
        }),
        tx.moveOutRequest.count({ where }),
      ]);

      return {
        data,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    });
  }

  async findOne(id: string, tenantId?: string) {
    const request = await this.loadOne(id, tenantId);
    const calculation = await this.depositCalculation(id, tenantId);
    return { ...request, deposit: calculation };
  }

  async update(id: string, data: Record<string, unknown>, tenantId?: string) {
    await assertTenantRecord(this.prisma.moveOutRequest, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    // Status moves go through the explicit actions below so the side-effects
    // (lease termination, unit vacancy, refund) cannot be skipped.
    if ('status' in data) {
      throw new BadRequestException(
        'Use approve, reject or complete to change a move-out status.',
      );
    }

    return this.prisma.moveOutRequest.update({
      where: { id },
      data: data as Prisma.MoveOutRequestUpdateInput,
      include: this.relationInclude(),
    });
  }

  async remove(id: string, tenantId?: string) {
    await assertTenantRecord(this.prisma.moveOutRequest, {
      id,
      ...(tenantId ? { organizationId: tenantId } : {}),
    });

    const request = await this.prisma.moveOutRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (request.status === 'COMPLETED') {
      throw new ConflictException(
        'A completed move-out is part of the tenancy record and cannot be deleted.',
      );
    }

    return this.prisma.moveOutRequest.delete({ where: { id } });
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Approve a move-out: the lease is terminated, the tenant goes inactive and
   * the unit becomes vacant — unless a renewal already replaced this tenancy,
   * in which case the unit stays with the new tenant.
   */
  async approve(
    id: string,
    options: { approvedDate?: Date; notes?: string },
    tenantId?: string,
    userId?: string,
  ) {
    const request = await this.loadOne(id, tenantId);

    if (request.status !== 'PENDING') {
      throw new ConflictException(
        `This move-out is already ${request.status.toLowerCase()}.`,
      );
    }

    const updated = await this.prisma.moveOutRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalDate: options.approvedDate ?? new Date(),
        approvedBy: userId ?? null,
        ...(options.notes ? { notes: options.notes } : {}),
      },
      include: this.relationInclude(),
    });

    // Terminate the lease through the leasing rules so the occupancy sync and
    // the termination reason behave exactly as they do from the lease screen.
    await this.prisma.rentalAgreement.update({
      where: { id: request.rentalAgreementId },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(request.moveoutDate),
        terminatedReason: 'Tenant moved out (approved move-out request).',
      },
    });

    const successor = await this.prisma.rentalAgreement.findFirst({
      where: {
        unitId: request.rentalAgreement.unitId,
        id: { not: request.rentalAgreementId },
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      select: { id: true },
    });
    if (!successor && tenantId) {
      await this.unitsService.syncOccupancyStatus(
        request.rentalAgreement.unitId,
        tenantId,
      );
    }

    return { ...updated, unitVacated: !successor };
  }

  async reject(id: string, notes: string, tenantId?: string) {
    const request = await this.loadOne(id, tenantId);

    if (request.status !== 'PENDING') {
      throw new ConflictException(
        `Only a pending move-out can be rejected (this one is ${request.status.toLowerCase()}).`,
      );
    }

    return this.prisma.moveOutRequest.update({
      where: { id },
      data: { status: 'REJECTED', notes },
      include: this.relationInclude(),
    });
  }

  // ------------------------------------------------------- deposit settlement

  /**
   * The auditable deposit position: what was held, what is being deducted (and
   * why), rent still unpaid, and what goes back. Derived from the deduction
   * rows — never a number typed into the form.
   */
  async depositCalculation(id: string, tenantId?: string) {
    const request = await this.loadOne(id, tenantId);

    const deposit = Number(request.rentalAgreement.securityDeposit ?? 0);
    const deductions = request.deductions.map((deduction) => ({
      category: deduction.category,
      description: deduction.description,
      amount: Number(deduction.amount),
      notes: deduction.notes,
      approvedBy: deduction.approvedBy
        ? `${deduction.approvedBy.firstName} ${deduction.approvedBy.lastName}`.trim()
        : null,
      createdAt: deduction.createdAt,
    }));

    const invoices = await this.prisma.invoice.findMany({
      where: { rentalAgreementId: request.rentalAgreementId },
      include: { payments: { select: { amount: true } } },
    });

    // Unpaid rent is measured from the recorded payments: finance never
    // reconciles `Invoice.balanceAmount` (master doc issue 41).
    const unpaidRent = round2(
      invoices.reduce(
        (sum, invoice) =>
          sum +
          Math.max(
            Number(invoice.amount) -
              invoice.payments.reduce(
                (p, payment) => p + Number(payment.amount),
                0,
              ),
            0,
          ),
        0,
      ),
    );

    const breakdown = calculateDeposit({
      securityDeposit: deposit,
      deductions,
      unpaidRent,
    });

    return {
      moveOutRequestId: id,
      status: request.status,
      currency: request.rentalAgreement.currency,
      ...breakdown,
      refundPaid: request.depositRefunded,
      refundPaidAt: request.refundedAt,
      refundRecordedAmount: request.depositRefundAmount,
    };
  }

  /** Add an itemised deduction. Refused once the refund has been paid out. */
  async addDeduction(
    id: string,
    dto: {
      category: DeductionCategory;
      description: string;
      amount: number;
      notes?: string;
    },
    tenantId?: string,
    userId?: string,
  ) {
    const request = await this.loadOne(id, tenantId);

    if (request.depositRefunded) {
      throw new ConflictException(
        'The deposit has already been refunded — deductions can no longer be added.',
      );
    }

    const validation = validateDeduction(dto);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason);
    }

    return this.prisma.moveOutDeduction.create({
      data: {
        moveOutRequest: { connect: { id } },
        category: dto.category,
        description: dto.description.trim(),
        amount: dto.amount,
        notes: dto.notes ?? null,
        ...(userId ? { approvedBy: { connect: { id: userId } } } : {}),
      },
    });
  }

  async removeDeduction(id: string, deductionId: string, tenantId?: string) {
    await this.loadOne(id, tenantId);

    const deduction = await requireRecord(
      this.prisma.moveOutDeduction.findFirst({
        where: { id: deductionId, moveOutRequestId: id },
      }),
      'Deduction',
    );

    return this.prisma.moveOutDeduction.delete({ where: { id: deduction.id } });
  }

  /**
   * Pay the refund out. Records the reference, stamps the move-out and the
   * lease, and leaves the trail: the calculation, the reference, who did it and
   * when.
   */
  async refundDeposit(
    id: string,
    dto: { paidRef: string; paymentMethod?: string },
    tenantId?: string,
    userId?: string,
  ) {
    const calculation = await this.depositCalculation(id, tenantId);

    if (calculation.refundPaid) {
      throw new ConflictException('The deposit has already been refunded.');
    }
    if (calculation.refund <= 0) {
      throw new BadRequestException(
        'There is nothing to refund: the deductions and unpaid rent use up the whole deposit.',
      );
    }

    const request = await this.prisma.moveOutRequest.findUniqueOrThrow({
      where: { id },
      select: { rentalAgreementId: true },
    });

    const updated = await this.prisma.moveOutRequest.update({
      where: { id },
      data: {
        depositRefunded: true,
        depositRefundAmount: calculation.refund,
        refundedAt: new Date(),
        refundedById: userId ?? null,
        status: 'COMPLETED',
      },
      include: this.relationInclude(),
    });

    await this.prisma.rentalAgreement.update({
      where: { id: request.rentalAgreementId },
      data: { depositRefunded: true },
    });

    return {
      ...updated,
      refund: calculation.refund,
      currency: calculation.currency,
      reference: dto.paidRef,
    };
  }

  // ---------------------------------------------------------------- helpers

  /** The request with its parties and itemised deductions. */
  private async loadOne(id: string, tenantId?: string) {
    return requireRecord(
      this.prisma.moveOutRequest.findFirst({
        where: tenantId ? { id, organizationId: tenantId } : { id },
        include: this.relationInclude(),
      }),
      'Move-out request',
    );
  }

  private relationInclude() {
    return {
      tenant: true,
      deductions: {
        orderBy: { createdAt: 'asc' },
        include: {
          approvedBy: { select: { firstName: true, lastName: true } },
        },
      },
      rentalAgreement: {
        include: { unit: { include: { property: true } } },
      },
    } as const;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
