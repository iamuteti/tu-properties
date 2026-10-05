import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  SupplierStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PayablesService } from '@/modules/finance/payables/payables.service';
import { GoodsReceiptStockInService } from '@/modules/inventory/goods-receipt-stock-in.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { receiveOutcome, round2 } from './procurement-comparison';
import {
  billCategoryFor,
  checkPurchaseOrderAction,
  daysOverdue,
  isPurchaseOrderOverdue,
  label,
  offerablePurchaseOrderActions,
  OPEN_ORDER_STATUSES,
  type PurchaseOrderGateContext,
} from './procurement-lifecycle';
import type {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreateBillFromOrderDto,
  PurchaseOrderFilters,
  RecordGoodsReceiptDto,
  UpdatePurchaseOrderDto,
} from './dto/procurement.dto';

type Tx = Prisma.TransactionClient;

const ORDER_INCLUDE = {
  supplier: {
    select: { id: true, code: true, name: true, email: true, phone: true },
  },
  raisedBy: { select: { id: true, firstName: true, lastName: true } },
  rfq: { select: { id: true, reference: true, status: true } },
  quote: { select: { id: true, totalAmount: true, leadTimeDays: true } },
  purchaseRequest: {
    select: { id: true, reference: true, title: true, category: true },
  },
  supplierBill: {
    select: {
      id: true,
      billNumber: true,
      status: true,
      totalAmount: true,
      balanceAmount: true,
    },
  },
  lines: { orderBy: { sortOrder: 'asc' as const } },
  deliveries: {
    include: {
      lines: true,
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { receivedAt: 'desc' as const },
  },
} as const;

const ORDER_EXPORT_HEADERS = [
  'reference',
  'status',
  'supplier',
  'category',
  'reference_rfq',
  'lineCount',
  'subtotal',
  'taxAmount',
  'totalAmount',
  'currency',
  'orderDate',
  'expectedDelivery',
  'receivedAt',
  'billNumber',
];

/**
 * Module 10 — purchase orders.
 *
 * A purchase order is the document that commits money, so this class is the one
 * in the module that is most careful about what it derives and what it trusts:
 *
 * 1. **`status` is never written directly.** Everything moves through an action
 *    gated by `checkPurchaseOrderAction`. Notably: an order that already has
 *    goods received against it cannot be cancelled, because a cancellation with
 *    receipts on it is a contradiction an auditor cannot read past.
 * 2. **Received quantities are derived from receipts, never decremented.**
 *    `syncLineReceipts` recomputes every line's `receivedQuantity` from the
 *    receipt rows inside the same transaction, for the same reason an invoice's
 *    `paidAmount` is: a correction has to be able to move money backwards.
 * 3. **The bill comes from finance, not from here.** `createBillForOrder` hands
 *    the order to `PayablesService`, which prices it through the tax engine and
 *    posts the ledger entry. Procurement decides what was bought; finance decides
 *    what it costs and which account it lands in. The one thing this class owns
 *    is the mapping between the two vocabularies.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private payables: PayablesService,
    private stockIn: GoodsReceiptStockInService,
  ) {}

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: PurchaseOrderFilters = {},
  ) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: this.buildWhere(organizationId, filters),
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const now = new Date();
    return rows.map((row) => this.decorate(row, now));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const row = await this.record(id, organizationId);
    return this.decorate(row, new Date());
  }

  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};
    const now = new Date();

    const [byStatus, open, bySupplier] = await Promise.all([
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { ...base, status: { in: OPEN_ORDER_STATUSES } },
        select: {
          status: true,
          expectedDelivery: true,
          totalAmount: true,
          supplierId: true,
          supplierBillId: true,
        },
        take: 5000,
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: base,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      open: open.length,
      openValue: round2(
        open.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      ),
      awaitingDelivery: open.filter(
        (row) => row.status !== PurchaseOrderStatus.DRAFT,
      ).length,
      overdue: open.filter((row) => isPurchaseOrderOverdue(row, now)).length,
      awaitingBill: open.filter(
        (row) =>
          row.status === PurchaseOrderStatus.RECEIVED && !row.supplierBillId,
      ).length,
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count._all]),
      ) as Partial<Record<PurchaseOrderStatus, number>>,
      bySupplier: bySupplier
        .map((row) => ({
          supplierId: row.supplierId,
          orders: row._count._all,
          value: Number(row._sum.totalAmount ?? 0),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: PurchaseOrderFilters = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, filters);

    return toCsv(
      ORDER_EXPORT_HEADERS,
      rows.map((row) => {
        const record = row as unknown as {
          reference: string;
          status: string;
          category: string;
          rfq?: { reference?: string | null } | null;
          lines?: unknown[];
          subtotal: unknown;
          taxAmount: unknown;
          totalAmount: unknown;
          currency: string;
          orderDate: Date;
          expectedDelivery: Date | null;
          receivedAt: Date | null;
          supplier?: { name?: string | null } | null;
          supplierBill?: { billNumber?: string | null } | null;
        };
        return {
          reference: record.reference,
          status: record.status,
          supplier: record.supplier?.name ?? '',
          category: record.category,
          reference_rfq: record.rfq?.reference ?? '',
          lineCount: record.lines?.length ?? 0,
          subtotal: record.subtotal?.toString() ?? '',
          taxAmount: record.taxAmount?.toString() ?? '',
          totalAmount: record.totalAmount?.toString() ?? '',
          currency: record.currency,
          orderDate: record.orderDate?.toISOString() ?? '',
          expectedDelivery: record.expectedDelivery?.toISOString() ?? '',
          receivedAt: record.receivedAt?.toISOString() ?? '',
          billNumber: record.supplierBill?.billNumber ?? '',
        };
      }),
    );
  }

  // =================================================================== writes

  /**
   * Raise an order.
   *
   * Three routes in, one shape out:
   *
   * - from an **awarded quote** — the lines come from the quote, so the order
   *   cannot disagree with the quotation that won;
   * - from an **approved request** — the category comes from the request;
   * - **standalone** — a supplier and some lines, which is what re-ordering the
   *   same thing every quarter looks like.
   *
   * Totals are always summed from the lines. `taxAmount` is the one figure a
   * caller may supply, because a supplier's quote states whether tax is included
   * and only somebody holding the document knows.
   */
  async create(
    dto: CreatePurchaseOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    await this.assertSupplier(dto.supplierId, organizationId);

    let lines: {
      description: string;
      specification?: string;
      quantity: number;
      unitPrice: number;
    }[] = [];
    let currency = dto.currency?.toUpperCase() || 'KES';
    let category = dto.category;
    let quoteId: string | undefined;
    let quoteLeadTimeDays: number | null = null;

    if (dto.quoteId) {
      const quote = await requireRecord(
        this.prisma.rfqQuote.findFirst({
          where: {
            id: dto.quoteId,
            supplierId: dto.supplierId,
            organizationId,
            status: 'AWARDED',
          },
          include: {
            rfq: { select: { id: true, reference: true, currency: true } },
            lines: { orderBy: { sortOrder: 'asc' as const } },
          },
        }),
        'Awarded quotation',
      );

      lines = quote.lines.map((line) => ({
        description: line.description,
        specification: undefined,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      }));
      currency = quote.currency || quote.rfq.currency;
      quoteId = quote.id;
      quoteLeadTimeDays = quote.leadTimeDays;

      if (dto.rfqId && dto.rfqId !== quote.rfqId) {
        throw new BadRequestException(
          'That quotation is not on the RFQ this order says it came from.',
        );
      }
      dto.rfqId = quote.rfqId;
    } else {
      lines = (dto.lines ?? []).map((line) => ({
        description: line.description.trim(),
        specification: line.specification?.trim(),
        quantity: Number(line.quantity),
        unitPrice: round2(line.unitPrice),
      }));
    }

    if (lines.length === 0) {
      throw new BadRequestException(
        'An order needs at least one line. Raise it from an awarded quotation, or add lines.',
      );
    }

    // An order from a request must be about that request, and the request must
    // be one somebody approved. Cross-checking the reference rather than the id
    // alone means a mismatched pair is caught even when both records exist.
    const purchaseRequestId = dto.purchaseRequestId;
    if (purchaseRequestId) {
      const request = await requireRecord(
        this.prisma.purchaseRequest.findFirst({
          where: { id: purchaseRequestId, organizationId },
          select: { id: true, reference: true, status: true, category: true },
        }),
        'Purchase request',
      );

      if (request.status !== PurchaseRequestStatus.APPROVED) {
        throw new ConflictException(
          `Purchase request ${request.reference} is ${label(
            request.status,
          ).toLowerCase()}. Only an approved request can become a purchase order.`,
        );
      }

      // The requester chose the category; an order that quietly disagrees with
      // the request it answers is how a maintenance purchase posts to office
      // expenses six weeks later.
      category = request.category;
    }

    // With neither a quotation nor a request to take the category from, the
    // caller has to say what kind of purchase this is — the standalone route.
    if (!category) {
      throw new BadRequestException(
        'Say what this purchase is for — the category decides which expense account the bill lands in.',
      );
    }

    const subtotal = round2(
      lines.reduce(
        (sum, line) => sum + round2(line.quantity * line.unitPrice),
        0,
      ),
    );
    const taxAmount = round2(dto.taxAmount ?? 0);
    const total = round2(subtotal + taxAmount);

    // The RFQ an order belongs to, when there is one, must be awarded — an order
    // against a round that is still collecting answers bypassed the comparison.
    if (dto.rfqId && !quoteId) {
      const rfq = await requireRecord(
        this.prisma.rfq.findFirst({
          where: { id: dto.rfqId, organizationId },
          select: { id: true, reference: true, status: true },
        }),
        'RFQ',
      );
      if (rfq.status !== 'AWARDED') {
        throw new ConflictException(
          `RFQ ${rfq.reference} has not been awarded, so no order can be raised against it. Award a quotation first.`,
        );
      }
    }

    const created = await this.createWithReference({
      organization: { connect: { id: organizationId } },
      supplier: { connect: { id: dto.supplierId } },
      category,
      currency,
      subtotal: new Prisma.Decimal(subtotal),
      taxAmount: new Prisma.Decimal(taxAmount),
      totalAmount: new Prisma.Decimal(total),
      orderDate: new Date(),
      expectedDelivery: dto.expectedDelivery
        ? new Date(dto.expectedDelivery)
        : // Derived from the quotation's own lead time when the supplier stated
          // one, so the promised date is the supplier's promise rather than a
          // guess somebody has to keep adjusting.
          quoteLeadTimeDays != null
          ? addUtcDays(new Date(), quoteLeadTimeDays)
          : undefined,
      deliveryAddress: dto.deliveryAddress?.trim(),
      terms: dto.terms?.trim(),
      notes: dto.notes?.trim(),
      ...(dto.rfqId ? { rfq: { connect: { id: dto.rfqId } } } : {}),
      ...(quoteId ? { quote: { connect: { id: quoteId } } } : {}),
      ...(purchaseRequestId
        ? { purchaseRequest: { connect: { id: purchaseRequestId } } }
        : {}),
      ...(userId ? { raisedBy: { connect: { id: userId } } } : {}),
      lines: {
        create: lines.map((line, index) => ({
          organization: { connect: { id: organizationId } },
          description: line.description,
          specification: line.specification,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.unitPrice),
          amount: new Prisma.Decimal(round2(line.quantity * line.unitPrice)),
          sortOrder: index,
        })),
      },
    } satisfies Omit<Prisma.PurchaseOrderCreateInput, 'reference'>);

    return this.findOne(created.id, organizationId);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);

    if (
      existing.status === PurchaseOrderStatus.CLOSED ||
      existing.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new ConflictException(
        `This order is ${label(
          existing.status,
        ).toLowerCase()} and its record can no longer be edited.`,
      );
    }

    // Once the supplier has accepted, the promised date and delivery address
    // are part of what they agreed to. Changing them afterwards makes the order
    // and the supplier's copy of it disagree, which is a dispute about delivery
    // dates nobody can settle afterwards.
    const agreed =
      existing.status !== PurchaseOrderStatus.DRAFT &&
      existing.status !== PurchaseOrderStatus.SENT;

    if (
      agreed &&
      (dto.expectedDelivery !== undefined || dto.deliveryAddress !== undefined)
    ) {
      throw new ConflictException(
        'This order has already been accepted by the supplier, so the delivery date and address can no longer be changed.',
      );
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(dto.expectedDelivery !== undefined
          ? {
              expectedDelivery: dto.expectedDelivery
                ? new Date(dto.expectedDelivery)
                : null,
            }
          : {}),
        ...(dto.deliveryAddress !== undefined
          ? { deliveryAddress: dto.deliveryAddress?.trim() || null }
          : {}),
        ...(dto.terms !== undefined
          ? { terms: dto.terms?.trim() || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
      },
      include: ORDER_INCLUDE,
    });

    return this.findOne(id, organizationId);
  }

  /** Edit the lines of an order that has not gone out yet. */
  async replaceLines(
    id: string,
    dto: {
      lines: { description: string; quantity: number; unitPrice: number }[];
    },
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException(
        `This order is ${label(
          existing.status,
        ).toLowerCase()}. Cancel it and raise a new one if the supplier needs different terms.`,
      );
    }

    if (!dto.lines?.length) {
      throw new BadRequestException('An order needs at least one line.');
    }

    const lines = dto.lines.map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unitPrice: round2(line.unitPrice),
    }));

    const subtotal = round2(
      lines.reduce(
        (sum, line) => sum + round2(line.quantity * line.unitPrice),
        0,
      ),
    );
    const taxAmount = Number(existing.taxAmount);

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: lines.map((line, index) => ({
          organizationId,
          purchaseOrderId: id,
          description: line.description,
          quantity: new Prisma.Decimal(line.quantity),
          unitPrice: new Prisma.Decimal(line.unitPrice),
          amount: new Prisma.Decimal(round2(line.quantity * line.unitPrice)),
          sortOrder: index,
        })),
      });
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          subtotal: new Prisma.Decimal(subtotal),
          totalAmount: new Prisma.Decimal(round2(subtotal + taxAmount)),
        },
      });
    });

    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException(
        `This order is ${label(
          existing.status,
        ).toLowerCase()}. Cancel it instead of deleting it — the record is the history.`,
      );
    }

    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { message: 'Purchase order deleted.' };
  }

  // ============================================================= transitions

  async send(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'SEND', {
      lineCount: existing.lines.length,
      totalAmount: Number(existing.totalAmount),
    });

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.SENT, sentAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  async accept(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'ACCEPT', {});

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ACCEPTED, acceptedAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Record goods arriving.
   *
   * The receipt and the line quantities are written in one transaction, and the
   * order's status is derived from the receipts rather than decided by the
   * caller — receiving the last of what was ordered finishes the order, and
   * deciding that by hand is how an order with three of four lines delivered
   * ends up marked RECEIVED.
   */
  async receive(
    id: string,
    dto: RecordGoodsReceiptDto,
    organizationId: string,
    userId?: string,
  ) {
    const existing = await this.record(id, organizationId);

    // Which gate applies is a fact about the record, not about the click: an
    // order already part-received takes RECEIVE_PART, a fresh accepted order
    // takes RECEIVE. Asking the client to say so would let a caller pick the
    // weaker gate.
    this.assertCanAct(
      existing,
      existing.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
        ? 'RECEIVE_PART'
        : 'RECEIVE',
      {
        hasReceipt: dto.lines.length > 0,
        outstandingQuantity: outstandingQuantity(existing),
      },
    );

    // Every line must belong to this order. This is the cross-tenant write
    // Module 2 closed for units: an id from the body connected to another
    // organization's line would put a receipt against somebody else's order.
    const lineIds = dto.lines.map((line) => line.purchaseOrderLineId);
    const known = await this.prisma.purchaseOrderLine.findMany({
      where: { id: { in: lineIds }, purchaseOrderId: id, organizationId },
      select: {
        id: true,
        description: true,
        quantity: true,
        receivedQuantity: true,
      },
    });

    if (known.length !== new Set(lineIds).size) {
      throw new BadRequestException(
        'One of those lines is not part of this purchase order.',
      );
    }

    const receivedByLine = new Map(known.map((line) => [line.id, line]));

    // Over-receipt is refused rather than clamped. A quantity above what is
    // outstanding means either a typing error or a delivery nobody agreed to;
    // silently capping it would make the order look complete while the excess
    // vanishes, and the excess still has to be paid for.
    for (const line of dto.lines) {
      const target = receivedByLine.get(line.purchaseOrderLineId);
      if (!target) continue;
      const outstanding =
        Number(target.quantity) - Number(target.receivedQuantity);
      if (round2(line.quantity) > round2(outstanding) + 0.001) {
        throw new BadRequestException(
          `"${target.description}" only has ${round2(outstanding)} outstanding, so ${round2(
            line.quantity,
          )} cannot be received against it.`,
        );
      }
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceipt.create({
        data: {
          organization: { connect: { id: organizationId } },
          purchaseOrder: { connect: { id } },
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
          deliveryNote: dto.deliveryNote?.trim(),
          conditionNote: dto.conditionNote?.trim(),
          ...(userId ? { receivedBy: { connect: { id: userId } } } : {}),
          lines: {
            create: dto.lines.map((line) => ({
              organization: { connect: { id: organizationId } },
              purchaseOrderLine: { connect: { id: line.purchaseOrderLineId } },
              quantity: new Prisma.Decimal(round2(line.quantity)),
            })),
          },
        },
        include: { lines: true },
      });

      await this.syncLineReceipts(tx, id);
      await this.syncReceiveStatus(tx, id);

      return created;
    });

    return { receipt, order: await this.findOne(id, organizationId) };
  }

  async close(id: string, organizationId: string) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'CLOSE', {});

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CLOSED, closedAt: new Date() },
    });

    return this.findOne(id, organizationId);
  }

  async cancel(
    id: string,
    dto: CancelPurchaseOrderDto,
    organizationId: string,
  ) {
    const existing = await this.record(id, organizationId);
    this.assertCanAct(existing, 'CANCEL', {
      cancellationReason: dto.reason,
      hasReceipt: existing.deliveries.length > 0,
    });

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason.trim(),
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * Raise the supplier bill for what has been received.
   *
   * Delegated to `PayablesService` rather than reimplemented: the tax engine,
   * the expense-account mapping and the ledger entry are all finance's, and a
   * second bill-creation path is exactly how an AP total ends up wrong.
   *
   * The bill's lines are the order's lines, priced as received — so a part
   * delivery bills for the part that arrived rather than for the whole order.
   * The order then points back at the bill, which is what makes "has this been
   * invoiced?" answerable without a join across three tables.
   */
  async createBillForOrder(
    id: string,
    dto: CreateBillFromOrderDto,
    organizationId: string,
    userId?: string,
  ) {
    const order = await this.record(id, organizationId);

    if (order.status === PurchaseOrderStatus.DRAFT) {
      throw new ConflictException(
        'This order has not been sent, so there is nothing to bill for.',
      );
    }
    if (order.status === PurchaseOrderStatus.CANCELLED) {
      throw new ConflictException(
        'This order was cancelled, so there is nothing to bill for.',
      );
    }
    if (order.deliveries.length === 0) {
      throw new ConflictException(
        'Record the goods arriving before raising the bill — a bill for goods nobody signed for is a dispute waiting to happen.',
      );
    }
    if (order.supplierBillId) {
      throw new ConflictException(
        `A bill has already been raised against this order (${order.supplierBill?.billNumber ?? order.supplierBillId}).`,
      );
    }

    const receivedLines = order.lines.filter(
      (line) => Number(line.receivedQuantity) > 0,
    );
    if (receivedLines.length === 0) {
      throw new ConflictException(
        'Nothing has been received against this order, so there is nothing to bill for.',
      );
    }

    // Each line bills at its own unit price for the units that actually turned
    // up, so a part delivery bills the part — no proration of the *price*, which
    // would quietly halve what the supplier is owed for the goods that did
    // arrive.
    const lines = receivedLines.map((line) => ({
      description:
        order.status === PurchaseOrderStatus.RECEIVED
          ? line.description
          : `${line.description} (part received: ${Number(
              line.receivedQuantity,
            )} of ${Number(line.quantity)})`,
      quantity:
        order.status === PurchaseOrderStatus.RECEIVED
          ? Number(line.quantity)
          : Number(line.receivedQuantity),
      unitPrice: round2(Number(line.unitPrice)),
      amount:
        order.status === PurchaseOrderStatus.RECEIVED
          ? round2(Number(line.amount))
          : round2(Number(line.unitPrice) * Number(line.receivedQuantity)),
      taxRate: undefined,
      taxAmount: undefined,
      expenseAccountCode: undefined,
    }));

    const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
    // Tax follows the billed fraction, not the whole order: a part delivery
    // does not attract the tax on the part still outstanding.
    const taxAmount = round2(
      Number(order.taxAmount) *
        (Number(order.subtotal) > 0 ? subtotal / Number(order.subtotal) : 1),
    );

    // The bill's category comes from the order's, mapped through the vocabulary
    // bridge in the lifecycle module. Finance has the last word on the account
    // — this only decides which bucket the purchase is in.
    const bill = await this.payables.createBill(
      {
        supplierId: order.supplierId,
        supplierReference: dto.supplierReference,
        billDate: dto.billDate,
        dueDate: undefined,
        currency: order.currency,
        category: billCategoryFor(order.category) as never,
        subtotal,
        taxAmount,
        totalAmount: round2(subtotal + taxAmount),
        notes: [
          `Purchase order ${order.reference}`,
          ...(order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
            ? [
                'Part delivery — the remaining lines will be billed on a later receipt.',
              ]
            : []),
        ].join('\n'),
        lines,
        createdBy: userId,
      },
      organizationId,
    );

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { supplierBillId: bill.id },
    });

    return { bill, order: await this.findOne(id, organizationId) };
  }

  /**
   * What has arrived and still needs stock-in.
   *
   * Delegates to `GoodsReceiptStockInService` (Module 11) rather than reporting on
   * the receipt rows itself. This method used to answer "the inventory module does
   * not exist yet" — the honest answer at the time, and the reason Module 10 could
   * not meet its own acceptance criterion (master doc issue 81). Now the question
   * has a real answer: which receipt lines still need somebody to say which item
   * they are and which store they went to.
   */
  async pendingStockIn(id: string, organizationId: string | undefined) {
    return this.stockIn.pendingForOrder(id, organizationId);
  }

  // ================================================================== helpers

  /** Load a tenant-scoped order with its lines and receipts for mutation. */
  async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.purchaseOrder.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: ORDER_INCLUDE,
      }),
      'Purchase order',
    );
  }

  private async assertSupplier(supplierId: string, organizationId: string) {
    const supplier = await requireRecord(
      this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId },
        select: { id: true, name: true, status: true },
      }),
      'Supplier',
    );

    if (supplier.status === SupplierStatus.ARCHIVED) {
      throw new BadRequestException(
        `${supplier.name} is archived — reactivate it before ordering from them.`,
      );
    }
  }

  /** Throw the gate's own reason — it is written for the person who pressed it. */
  private assertCanAct(
    order: {
      id: string;
      status: PurchaseOrderStatus;
      lines: { quantity: unknown; receivedQuantity: unknown }[];
      deliveries: unknown[];
    },
    action: Parameters<typeof checkPurchaseOrderAction>[1],
    context: Partial<PurchaseOrderGateContext>,
  ) {
    const check = checkPurchaseOrderAction(order.status, action, {
      lineCount: order.lines.length,
      totalAmount: 0,
      outstandingQuantity: outstandingQuantity(order),
      hasReceipt: order.deliveries.length > 0,
      ...context,
    });
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? `That action is not allowed from ${order.status}.`,
      );
    }
  }

  /**
   * Recompute every line's `receivedQuantity` from the receipt rows.
   *
   * Derived, never decremented, for the reason every other money column in this
   * codebase is: a returned or corrected delivery has to be able to move a
   * quantity *backwards*, and a counter that only ever goes up cannot.
   */
  private async syncLineReceipts(tx: Tx, purchaseOrderId: string) {
    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId },
      select: { id: true },
    });

    for (const line of lines) {
      const aggregate = await tx.goodsReceiptLine.aggregate({
        where: { purchaseOrderLineId: line.id },
        _sum: { quantity: true },
      });
      const received = round2(Number(aggregate._sum.quantity ?? 0));

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQuantity: new Prisma.Decimal(received) },
      });
    }
  }

  /**
   * Move the order to RECEIVED or PARTIALLY_RECEIVED from what has arrived.
   *
   * Never to CLOSED: closing is a separate, explicit act by somebody who has
   * checked the bill matches. Deriving it here would mean an order could close
   * itself the moment a delivery landed.
   */
  private async syncReceiveStatus(tx: Tx, purchaseOrderId: string) {
    const order = await tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { lines: true },
    });
    if (!order) return;

    // Only an accepted order advances. A receipt against a DRAFT or SENT order
    // is a data-entry mistake; the gate refused it before this ran.
    if (
      order.status !== PurchaseOrderStatus.ACCEPTED &&
      order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      return;
    }

    const outcome = receiveOutcome(
      order.lines.map((line) => ({
        orderedQuantity: Number(line.quantity),
        receivedQuantity: Number(line.receivedQuantity),
      })),
    );

    if (outcome === 'RECEIVED') {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: PurchaseOrderStatus.RECEIVED, receivedAt: new Date() },
      });
    } else if (outcome === 'PARTIALLY_RECEIVED') {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
      });
    }
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: PurchaseOrderFilters,
  ): Prisma.PurchaseOrderWhereInput {
    const where: Prisma.PurchaseOrderWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.status) where.status = filters.status as PurchaseOrderStatus;
    if (filters.category) where.category = filters.category as never;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.purchaseRequestId)
      where.purchaseRequestId = filters.purchaseRequestId;
    if (filters.rfqId) where.rfqId = filters.rfqId;
    if (filters.open) where.status = { in: OPEN_ORDER_STATUSES };
    if (filters.overdue) {
      where.expectedDelivery = { lt: new Date() };
      where.status = { in: OPEN_ORDER_STATUSES };
    }
    if (filters.hasBill === true) where.supplierBillId = { not: null };
    if (filters.hasBill === false) where.supplierBillId = null;
    if (filters.search) {
      where.OR = [
        { reference: { contains: filters.search, mode: 'insensitive' } },
        {
          supplier: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async createWithReference(
    input: Omit<Prisma.PurchaseOrderCreateInput, 'reference'>,
  ) {
    const organizationId =
      typeof input.organization === 'object' && 'connect' in input.organization
        ? (input.organization.connect as { id: string }).id
        : (input.organization as unknown as string);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = await this.nextReference(organizationId);
      try {
        return await this.prisma.purchaseOrder.create({
          data: { ...input, reference },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('reference')) throw error;
      }
    }

    throw new ConflictException(
      'Could not allocate a purchase order reference. Please try again.',
    );
  }

  private async nextReference(organizationId: string) {
    const prefix = `PO-${new Date().getFullYear()}-`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { organizationId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });

    const sequence = last
      ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1
      : 1;

    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }

  /** Derived, never stored: overdue, receipt progress, what the row offers. */
  private decorate<
    T extends {
      status: PurchaseOrderStatus;
      expectedDelivery: Date | null;
      supplierBillId: string | null;
      totalAmount: unknown;
      lines: {
        quantity: unknown;
        receivedQuantity: unknown;
        amount: unknown;
      }[];
      deliveries: { lines: { stockInRecordedAt: Date | null }[] }[];
    },
  >(row: T, now: Date) {
    const outstanding = outstandingQuantity(row);
    const orderedValue = round2(
      row.lines.reduce((sum, line) => sum + Number(line.amount), 0),
    );
    const receivedValue = round2(
      row.lines.reduce(
        (sum, line) =>
          sum +
          (Number(line.quantity) === 0
            ? 0
            : Number(line.amount) *
              (Number(line.receivedQuantity) / Number(line.quantity))),
        0,
      ),
    );

    const pendingStockIn = row.deliveries
      .flatMap((delivery) => delivery.lines)
      .filter((line) => !line.stockInRecordedAt).length;

    return {
      ...row,
      statusLabel: label(row.status),
      overdue: isPurchaseOrderOverdue(row, now),
      daysOverdue: daysOverdue(row, now),
      outstandingQuantity: round2(outstanding),
      outstandingValue: round2(Math.max(0, orderedValue - receivedValue)),
      receivedPercent:
        orderedValue > 0 ? Math.round((receivedValue / orderedValue) * 100) : 0,
      pendingStockInLines: pendingStockIn,
      availableActions: offerablePurchaseOrderActions(row.status, {
        lineCount: row.lines.length,
        totalAmount: Number(row.totalAmount),
        outstandingQuantity: outstanding,
        hasReceipt: row.deliveries.length > 0,
      }),
    };
  }
}

/** Units still to arrive across every line of an order. */
function outstandingQuantity(order: {
  lines: { quantity: unknown; receivedQuantity: unknown }[];
}): number {
  return round2(
    order.lines.reduce(
      (sum, line) =>
        sum +
        Math.max(
          0,
          Number(line.quantity ?? 0) - Number(line.receivedQuantity ?? 0),
        ),
      0,
    ),
  );
}

/** Midnight UTC on `date` plus `days`, so a promised date is a calendar day. */
function addUtcDays(date: Date, days: number): Date {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
