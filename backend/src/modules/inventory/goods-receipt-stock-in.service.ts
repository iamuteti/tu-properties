import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { num, round2 } from './stock-ledger';
import type { BookStockInDto } from './dto/inventory.dto';

type Tx = Prisma.TransactionClient;

/**
 * Module 11 — the procurement seam: goods arriving become stock.
 *
 * This is the acceptance criterion Module 10 could not meet (master doc issue
 * 81): a goods receipt recorded that the paint had arrived and nothing further
 * happened, because there was no inventory to put it on. The direction of the
 * dependency is deliberate and one-directional — **procurement imports this
 * module, this module imports nothing from procurement.** It reads the receipt
 * rows through Prisma, which is enough, and that keeps the two services from
 * importing each other into a cycle.
 *
 * The mapping is passed in per line rather than guessed. A purchase order says
 * "6 × 20mm compression coupling"; an inventory item says `PLMB-0042`. Only
 * somebody holding both documents knows they are the same thing, and a
 * description-similarity guess would quietly turn a delivery of the wrong
 * fittings into the right stock. So `BookStockInDto.lines` carries the
 * `{ goodsReceiptLineId, inventoryItemId, warehouseId }` triple explicitly, and
 * this service validates all three sides.
 *
 * Idempotency comes from the schema, not from a check: `StockMovement`'s
 * `goodsReceiptLineId` is unique, so a receipt line becomes at most one movement
 * and a double submit is a constraint error that reads as a 409 rather than as
 * stock arriving twice.
 */
@Injectable()
export class GoodsReceiptStockInService {
  constructor(private prisma: PrismaService) {}

  /**
   * What has arrived and still needs a home on a shelf.
   *
   * Replaces Module 10's honest "the inventory module does not exist yet". A
   * receipt line whose `inventoryItemId` is null is a real state — a laptop
   * bought for the office has no shelf — so the answer is a list of lines to
   * decide about rather than an error.
   */
  async pendingForOrder(
    purchaseOrderId: string,
    organizationId: string | undefined,
  ) {
    const order = await requireRecord(
      this.prisma.purchaseOrder.findFirst({
        where: {
          id: purchaseOrderId,
          ...(organizationId ? { organizationId } : {}),
        },
        include: {
          deliveries: {
            include: {
              lines: {
                include: {
                  purchaseOrderLine: {
                    select: {
                      id: true,
                      description: true,
                      specification: true,
                      quantity: true,
                      receivedQuantity: true,
                      unitPrice: true,
                    },
                  },
                  inventoryItem: {
                    select: {
                      id: true,
                      sku: true,
                      name: true,
                      unitOfMeasure: true,
                    },
                  },
                  stockMovement: {
                    select: { id: true, createdAt: true, warehouseId: true },
                  },
                },
              },
            },
            orderBy: { receivedAt: 'desc' as const },
          },
        },
      }),
      'Purchase order',
    );

    const pending = order.deliveries.flatMap((delivery) =>
      delivery.lines
        .filter((line) => !line.stockMovement)
        .map((line) => ({
          goodsReceiptId: delivery.id,
          goodsReceiptLineId: line.id,
          receivedAt: delivery.receivedAt,
          deliveryNote: delivery.deliveryNote,
          purchaseOrderLineId: line.purchaseOrderLineId,
          description: line.purchaseOrderLine.description,
          specification: line.purchaseOrderLine.specification,
          quantity: num(line.quantity),
          unitPrice: num(line.purchaseOrderLine.unitPrice),
          /** True when somebody already said which item it is but not which store. */
          itemChosen: Boolean(line.inventoryItemId),
          inventoryItem: line.inventoryItem,
        })),
    );

    return {
      purchaseOrderId: order.id,
      reference: order.reference,
      /** What this module is for, so the caller can render it rather than guess. */
      stockInModuleAvailable: true,
      note: pending.length
        ? 'Book each of these into a store so the shelf reflects what arrived. Anything that never goes on a shelf — a laptop, a printer, a desk — can be marked as not stock instead, so it stops being raised as a question every morning.'
        : 'Everything received against this order has been dealt with.',
      pending,
      /** Receipt lines that were booked, so the order page can show both. */
      booked: order.deliveries.flatMap((delivery) =>
        delivery.lines
          .filter((line) => line.stockMovement)
          .map((line) => ({
            goodsReceiptLineId: line.id,
            inventoryItem: line.inventoryItem,
            movementId: line.stockMovement?.id,
            warehouseId: line.stockMovement?.warehouseId ?? null,
            recordedAt: line.stockMovement?.createdAt ?? null,
          })),
      ),
    };
  }

  /**
   * Book received goods into a store.
   *
   * Everything is validated before a single row is written, and the writes plus
   * the receipt-line flags go in one transaction — so a receipt can never say
   * "booked in" while the ledger disagrees.
   */
  async book(
    purchaseOrderId: string,
    dto: BookStockInDto,
    organizationId: string,
    userId?: string,
  ) {
    if (!dto.lines?.length) {
      throw new BadRequestException('Nothing to book in.');
    }

    const order = await requireRecord(
      this.prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, organizationId },
        select: { id: true, reference: true },
      }),
      'Purchase order',
    );

    const receiptLineIds = dto.lines.map((line) => line.goodsReceiptLineId);
    const lines = await this.prisma.goodsReceiptLine.findMany({
      where: {
        id: { in: receiptLineIds },
        goodsReceipt: { purchaseOrderId },
        organizationId,
      },
      include: {
        purchaseOrderLine: {
          select: {
            id: true,
            description: true,
            unitPrice: true,
          },
        },
        stockMovement: { select: { id: true } },
      },
    });

    if (lines.length !== new Set(receiptLineIds).size) {
      throw new BadRequestException(
        'One of those receipt lines is not part of this purchase order.',
      );
    }

    const already = lines.filter((line) => line.stockMovement);
    if (already.length > 0) {
      throw new ConflictException(
        `${already.length} of those lines have already been booked into stock. Book only what is still waiting.`,
      );
    }

    // Duplicate lines in one request would create two movements for one receipt.
    if (new Set(receiptLineIds).size !== receiptLineIds.length) {
      throw new BadRequestException(
        'The same receipt line appears twice — book each line once.',
      );
    }

    const lineById = new Map(lines.map((line) => [line.id, line]));

    const planned: {
      goodsReceiptLineId: string;
      itemId: string;
      sku: string;
      itemName: string;
      warehouseId: string;
      warehouseName: string;
      quantity: number;
      unitCost: number;
      description: string;
    }[] = [];

    for (const requested of dto.lines) {
      const line = lineById.get(requested.goodsReceiptLineId);
      if (!line) continue;

      const item = await requireRecord(
        this.prisma.inventoryItem.findFirst({
          where: { id: requested.inventoryItemId, organizationId },
          select: {
            id: true,
            sku: true,
            name: true,
            isActive: true,
            unitOfMeasure: true,
          },
        }),
        'Inventory item',
      );

      if (!item.isActive) {
        throw new ConflictException(
          `${item.sku} is retired, so goods cannot be booked into it. Reactivate it or pick another item.`,
        );
      }

      const warehouse = await requireRecord(
        this.prisma.warehouse.findFirst({
          where: { id: requested.warehouseId, organizationId },
          select: { id: true, name: true, isActive: true },
        }),
        'Warehouse',
      );

      if (!warehouse.isActive) {
        throw new ConflictException(
          `${warehouse.name} is deactivated, so stock cannot be booked into it.`,
        );
      }

      const quantity = round2(num(line.quantity));
      if (quantity <= 0) {
        throw new BadRequestException(
          `"${line.purchaseOrderLine.description}" has nothing on this receipt line to book in.`,
        );
      }

      // The movement's cost is the price on the order line — the price that was
      // actually agreed and will be on the supplier bill. Leaving it null would
      // make the shelf value fall back to today's catalogue price.
      const unitCost = round2(num(line.purchaseOrderLine.unitPrice));

      planned.push({
        goodsReceiptLineId: line.id,
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        quantity,
        unitCost,
        description: line.purchaseOrderLine.description,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const movements: { id: string }[] = [];

      for (const line of planned) {
        const movement = await tx.stockMovement.create({
          data: {
            organization: { connect: { id: organizationId } },
            item: { connect: { id: line.itemId } },
            warehouse: { connect: { id: line.warehouseId } },
            quantity: new Prisma.Decimal(line.quantity),
            type: StockMovementType.GOODS_RECEIPT,
            unitCost: new Prisma.Decimal(line.unitCost),
            goodsReceiptLine: { connect: { id: line.goodsReceiptLineId } },
            reason: `Goods received on ${order.reference}`,
            notes: dto.notes?.trim(),
            ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
          },
          select: { id: true },
        });

        await tx.goodsReceiptLine.update({
          where: { id: line.goodsReceiptLineId },
          data: {
            inventoryItemId: line.itemId,
            stockInRecordedAt: new Date(),
          },
        });

        movements.push(movement);
      }

      return movements;
    });

    return {
      purchaseOrderId: order.id,
      reference: order.reference,
      booked: planned.length,
      movements: created.length,
      lines: planned,
      pending: await this.pendingForOrder(purchaseOrderId, organizationId),
    };
  }

  /**
   * Mark a receipt line as deliberately not going on a shelf.
   *
   * The third answer, and without it the pending list never empties: a laptop, a
   * phone, a printer. Recording it as "not stock" is honest, and it stops the same
   * line being raised as a question every morning for the life of the order.
   */
  async markNotStock(goodsReceiptLineId: string, organizationId: string) {
    const line = await requireRecord(
      this.prisma.goodsReceiptLine.findFirst({
        where: { id: goodsReceiptLineId, organizationId },
        include: {
          purchaseOrderLine: { select: { description: true } },
          stockMovement: { select: { id: true } },
        },
      }),
      'Goods receipt line',
    );

    if (line.stockMovement) {
      throw new ConflictException(
        `"${line.purchaseOrderLine.description}" has already been booked into stock.`,
      );
    }

    await this.prisma.goodsReceiptLine.update({
      where: { id: goodsReceiptLineId },
      data: { stockInRecordedAt: new Date() },
    });

    return {
      message: `"${line.purchaseOrderLine.description}" marked as not going into stock.`,
      goodsReceiptLineId,
    };
  }

  /** The warehouse goods land in when the caller does not say. */
  async defaultWarehouse(organizationId: string) {
    const rows = await this.prisma.warehouse.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
      take: 1,
    });
    return rows[0] ?? null;
  }
}
