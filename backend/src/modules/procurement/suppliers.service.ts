import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SupplierStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PayablesService } from '@/modules/finance/payables/payables.service';
import { requireRecord } from '@/common/utils';
import { round2 } from './procurement-comparison';
import type { UpdateSupplierProcurementDto } from './dto/procurement.dto';

/**
 * Module 10 — the procurement view of a supplier.
 *
 * Suppliers already existed for accounts payable (Module 7), and this service
 * deliberately does **not** create a second vendor table. Two "supplier" records
 * for the same plumber would be a data-entry mistake at best and a wrong AP
 * total at worst, so the procurement-only fields — what they supply, a rating,
 * the contract window — were added to the existing model rather than the other
 * way round.
 *
 * What is new here is `performance`, and it is **derived**: order count, spend,
 * on-time delivery rate and quotation win rate are calculated from the orders
 * and RFQs, never stored. A stored score rots the moment a supplier is late
 * once, and the number people argue about is the one that has to be right.
 */
@Injectable()
export class ProcurementSuppliersService {
  constructor(
    private prisma: PrismaService,
    private payables: PayablesService,
  ) {}

  // ==================================================================== reads

  /**
   * Suppliers with their performance figures.
   *
   * Reuses `PayablesService.findSuppliers` for the base record so the two
   * modules cannot list the same supplier differently, and adds the procurement
   * aggregates on top.
   */
  async findAll(
    organizationId: string | undefined,
    filters: {
      status?: SupplierStatus;
      category?: string;
      contractOnly?: boolean;
      search?: string;
    } = {},
  ) {
    const base = await this.payables.findSuppliers(organizationId, {
      ...(filters.status ? { status: filters.status } : {}),
    });

    const performance = await this.performanceFor(
      organizationId,
      base.map((supplier) => supplier.id),
    );

    const now = new Date();

    return (
      base
        // An archived supplier is not offered to a buyer unless they asked for
        // archives specifically: it cannot be invited to an RFQ (the RFQ service
        // refuses) and ordering from one is refused too, so showing it in the
        // picker would only produce a later failure.
        .filter((supplier) =>
          filters.status ? true : supplier.status !== SupplierStatus.ARCHIVED,
        )
        .filter((supplier) => this.matchesFilters(supplier, filters, now))
        .map((supplier) => ({
          ...supplier,
          performance: performance.get(supplier.id) ?? emptyPerformance(),
          contractExpired:
            supplier.contractEndDate != null &&
            new Date(supplier.contractEndDate).getTime() < now.getTime(),
          contractExpiringSoon:
            supplier.contractEndDate != null &&
            new Date(supplier.contractEndDate).getTime() >= now.getTime() &&
            new Date(supplier.contractEndDate).getTime() <
              now.getTime() + 60 * 86_400_000,
        }))
    );
  }

  /**
   * One supplier, with their orders and quotations.
   *
   * The base record comes from `PayablesService` so both modules agree on what a
   * supplier is; the procurement relations are loaded here because that service's
   * include is fixed to what accounts payable needs.
   */
  async findOne(id: string, organizationId: string | undefined) {
    const supplier = await this.payables.findSupplier(id, organizationId);
    const scope = { id, ...(organizationId ? { organizationId } : {}) };

    const [orders, quotations, invitations] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: scope,
        select: {
          id: true,
          reference: true,
          status: true,
          totalAmount: true,
          currency: true,
          orderDate: true,
          expectedDelivery: true,
          receivedAt: true,
        },
        orderBy: { orderDate: 'desc' },
        take: 100,
      }),
      this.prisma.rfqQuote.findMany({
        where: scope,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          currency: true,
          leadTimeDays: true,
          validUntil: true,
          submittedAt: true,
          rfq: {
            select: { id: true, reference: true, title: true, status: true },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 100,
      }),
      this.prisma.rfqInvitation.findMany({
        where: scope,
        select: {
          id: true,
          status: true,
          invitedAt: true,
          respondedAt: true,
          declineReason: true,
          rfq: {
            select: { id: true, reference: true, title: true, status: true },
          },
        },
        orderBy: { invitedAt: 'desc' },
        take: 100,
      }),
    ]);

    const performance = await this.performanceFor(organizationId, [id]);
    const now = new Date();

    return {
      ...supplier,
      performance: performance.get(id) ?? emptyPerformance(),
      contractExpired:
        supplier.contractEndDate != null &&
        new Date(supplier.contractEndDate).getTime() < now.getTime(),
      orders,
      quotations,
      invitations,
    };
  }

  /**
   * Spend per supplier over a period.
   *
   * The "who are we buying from, and how much" question, which a supplier list
   * with a total on each row cannot answer across a year.
   */
  async spendReport(
    organizationId: string | undefined,
    from?: Date,
    to?: Date,
  ) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { notIn: [PurchaseOrderCancelled, PurchaseOrderDraft] },
        ...(from || to
          ? {
              orderDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        supplierId: true,
        totalAmount: true,
        status: true,
        supplier: { select: { name: true, code: true, category: true } },
      },
      take: 20_000,
    });

    const bySupplier = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierCode: string;
        category: string | null;
        orders: number;
        total: number;
        received: number;
        open: number;
      }
    >();

    for (const order of orders) {
      const entry = bySupplier.get(order.supplierId) ?? {
        supplierId: order.supplierId,
        supplierName: order.supplier.name,
        supplierCode: order.supplier.code,
        category: order.supplier.category,
        orders: 0,
        total: 0,
        received: 0,
        open: 0,
      };
      const amount = round2(Number(order.totalAmount));
      entry.orders += 1;
      entry.total = round2(entry.total + amount);
      if (order.status === 'RECEIVED' || order.status === 'CLOSED') {
        entry.received = round2(entry.received + amount);
      } else {
        entry.open = round2(entry.open + amount);
      }
      bySupplier.set(order.supplierId, entry);
    }

    return [...bySupplier.values()].sort((a, b) => b.total - a.total);
  }

  // =================================================================== writes

  /**
   * Create a supplier.
   *
   * Delegated to `PayablesService.createSupplier`, which already owns supplier
   * creation and its `SUP-NNNN` code allocation. Procurement adds the category
   * on top rather than having a second create path that could produce two codes.
   */
  async create(
    data: {
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      country?: string;
      taxPin?: string;
      vatRegistered?: boolean;
      paymentTermsDays?: number;
      bankName?: string;
      bankBranch?: string;
      accountName?: string;
      accountNumber?: string;
      notes?: string;
      category?: string;
      rating?: number;
      contractStartDate?: string;
      contractEndDate?: string;
      contractReference?: string;
    },
    organizationId: string,
  ) {
    const created = await this.payables.createSupplier(
      {
        name: data.name,
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.taxPin !== undefined ? { taxPin: data.taxPin } : {}),
        ...(data.vatRegistered !== undefined
          ? { vatRegistered: data.vatRegistered }
          : {}),
        ...(data.paymentTermsDays !== undefined
          ? { paymentTermsDays: data.paymentTermsDays }
          : {}),
        ...(data.bankName !== undefined ? { bankName: data.bankName } : {}),
        ...(data.bankBranch !== undefined
          ? { bankBranch: data.bankBranch }
          : {}),
        ...(data.accountName !== undefined
          ? { accountName: data.accountName }
          : {}),
        ...(data.accountNumber !== undefined
          ? { accountNumber: data.accountNumber }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      organizationId,
    );

    if (
      data.category ||
      data.rating !== undefined ||
      data.contractStartDate ||
      data.contractEndDate ||
      data.contractReference
    ) {
      await this.prisma.supplier.update({
        where: { id: created.id },
        data: this.procurementFields(data),
      });
    }

    return this.findOne(created.id, organizationId);
  }

  /** Update the procurement-only fields. Base details go through finance. */
  async update(
    id: string,
    dto: UpdateSupplierProcurementDto,
    organizationId: string,
  ) {
    await requireRecord(
      this.prisma.supplier.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        select: { id: true },
      }),
      'Supplier',
    );

    await this.prisma.supplier.update({
      where: { id },
      data: this.procurementFields(dto),
    });

    return this.findOne(id, organizationId);
  }

  // ================================================================== helpers

  private procurementFields(data: {
    category?: string;
    rating?: number;
    contractStartDate?: string;
    contractEndDate?: string;
    contractReference?: string;
    status?: SupplierStatus;
  }): Prisma.SupplierUpdateInput {
    if (
      data.contractStartDate &&
      data.contractEndDate &&
      new Date(data.contractEndDate).getTime() <
        new Date(data.contractStartDate).getTime()
    ) {
      throw new BadRequestException(
        'The contract ends before it starts. Check the dates.',
      );
    }

    return {
      ...(data.category !== undefined
        ? { category: data.category as never }
        : {}),
      ...(data.rating !== undefined ? { rating: data.rating } : {}),
      ...(data.contractStartDate !== undefined
        ? {
            contractStartDate: data.contractStartDate
              ? new Date(data.contractStartDate)
              : null,
          }
        : {}),
      ...(data.contractEndDate !== undefined
        ? {
            contractEndDate: data.contractEndDate
              ? new Date(data.contractEndDate)
              : null,
          }
        : {}),
      ...(data.contractReference !== undefined
        ? { contractReference: data.contractReference?.trim() || null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    };
  }

  private matchesFilters(
    supplier: {
      name: string;
      code: string;
      category: string | null;
      contractEndDate: Date | null;
      email: string | null;
    },
    filters: { category?: string; contractOnly?: boolean; search?: string },
    now: Date,
  ) {
    if (filters.category && supplier.category !== filters.category)
      return false;

    if (filters.contractOnly) {
      // Inside a live contract, or with no end date at all (an open-ended
      // agreement is a contract; excluding it would hide exactly the supplier
      // somebody is looking for).
      const live =
        supplier.contractEndDate == null ||
        new Date(supplier.contractEndDate).getTime() >= now.getTime();
      if (!live) return false;
    }

    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        supplier.name,
        supplier.code,
        supplier.email ?? '',
        supplier.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  }

  /**
   * Performance for a set of suppliers, in two queries rather than N.
   *
   * On-time delivery is measured against the *promised* date on the order, and
   * only for orders that actually turned up — a cancelled order that was never
   * late is not a delivery record.
   */
  private async performanceFor(
    organizationId: string | undefined,
    supplierIds: string[],
  ) {
    const result = new Map<string, ReturnType<typeof emptyPerformance>>();
    if (supplierIds.length === 0) return result;

    const scope = {
      ...(organizationId ? { organizationId } : {}),
      supplierId: { in: supplierIds },
    };

    const [orders, quotes] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: scope,
        select: {
          supplierId: true,
          status: true,
          totalAmount: true,
          orderDate: true,
          expectedDelivery: true,
          receivedAt: true,
        },
        take: 20_000,
      }),
      this.prisma.rfqQuote.findMany({
        where: {
          ...(organizationId ? { organizationId } : {}),
          supplierId: { in: supplierIds },
        },
        select: { supplierId: true, status: true },
        take: 20_000,
      }),
    ]);

    const quotesBySupplier = new Map<string, { total: number; won: number }>();
    for (const quote of quotes) {
      const entry = quotesBySupplier.get(quote.supplierId) ?? {
        total: 0,
        won: 0,
      };
      entry.total += 1;
      if (quote.status === 'AWARDED') entry.won += 1;
      quotesBySupplier.set(quote.supplierId, entry);
    }

    for (const supplierId of supplierIds) {
      const theirOrders = orders.filter(
        (order) => order.supplierId === supplierId,
      );
      const delivered = theirOrders.filter(
        (order) => order.status === 'RECEIVED' || order.status === 'CLOSED',
      );
      const onTime = delivered.filter(
        (order) =>
          order.expectedDelivery != null &&
          order.receivedAt != null &&
          order.receivedAt.getTime() <=
            order.expectedDelivery.getTime() +
              // Same calendar day counts as on time: a supplier delivering "on the
              // 30th" for a date of the 30th has done what was promised.
              86_400_000,
      );

      const theirQuotes = quotesBySupplier.get(supplierId) ?? {
        total: 0,
        won: 0,
      };

      result.set(supplierId, {
        orders: theirOrders.length,
        openOrders: theirOrders.filter((order) =>
          ['DRAFT', 'SENT', 'ACCEPTED', 'PARTIALLY_RECEIVED'].includes(
            order.status,
          ),
        ).length,
        totalSpend: round2(
          theirOrders.reduce(
            (sum, order) => sum + Number(order.totalAmount),
            0,
          ),
        ),
        delivered: delivered.length,
        onTimeDeliveries: onTime.length,
        onTimeRate:
          delivered.length > 0
            ? Math.round((onTime.length / delivered.length) * 100)
            : null,
        quotations: theirQuotes.total,
        quotationsWon: theirQuotes.won,
        winRate:
          theirQuotes.total > 0
            ? Math.round((theirQuotes.won / theirQuotes.total) * 100)
            : null,
      });
    }

    return result;
  }
}

/** The figures for a supplier who has never been used. */
function emptyPerformance() {
  return {
    orders: 0,
    openOrders: 0,
    totalSpend: 0,
    delivered: 0,
    onTimeDeliveries: 0,
    onTimeRate: null as number | null,
    quotations: 0,
    quotationsWon: 0,
    winRate: null as number | null,
  };
}

/** Named here so the spend report reads as intent rather than as a string. */
const PurchaseOrderCancelled = 'CANCELLED' as const;
const PurchaseOrderDraft = 'DRAFT' as const;
