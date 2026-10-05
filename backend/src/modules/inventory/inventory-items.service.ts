import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  num,
  reorderSuggestion,
  round2,
  round4,
  runningBalances,
  stockOnHand,
  stockStatus,
  valuation,
  type LedgerMovement,
  type Numeric,
  type ReorderSuggestion,
  type StockStatus,
} from './stock-ledger';
import type {
  CreateInventoryItemDto,
  InventoryItemFilters,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

const ITEM_INCLUDE = {
  preferredSupplier: {
    select: { id: true, code: true, name: true, phone: true, email: true },
  },
} as const;

const ITEM_EXPORT_HEADERS = [
  'sku',
  'name',
  'category',
  'unitOfMeasure',
  'onHand',
  'reorderLevel',
  'status',
  'suggestedQuantity',
  'estimatedCost',
  'unitCost',
  'valuation',
  'preferredSupplier',
  'warehouses',
];

/**
 * A movement reduced to what the ledger arithmetic needs. Narrowing here rather
 * than passing Prisma rows around means `stock-ledger.ts` keeps working on plain
 * objects (and its own unit tests) even though the rows behind them are Decimals.
 */
function ledgerView(
  rows: {
    id: string;
    quantity: Numeric;
    unitCost?: Numeric;
    type: string;
    createdAt: Date;
    warehouseId?: string;
  }[],
): LedgerMovement[] {
  return rows.map((row) => ({
    id: row.id,
    quantity: row.quantity,
    unitCost: row.unitCost,
    type: row.type as LedgerMovement['type'],
    createdAt: row.createdAt,
  }));
}

const STATUS_LABEL: Record<StockStatus, string> = {
  OUT_OF_STOCK: 'Out of stock',
  REORDER: 'Below reorder level',
  OK: 'In stock',
};

/**
 * Module 11 — inventory items.
 *
 * Everything a caller sees about "how much of this is there" is computed here from
 * the movements, and none of it is written back. That is the module's design in
 * one place: `InventoryItem` deliberately has no quantity column, so a stock level
 * cannot drift away from the rows that justify it. The consequence to remember
 * when reading the queries below is that **a list cannot be answered from the
 * items table alone** — it needs the movements grouped in SQL alongside it, which
 * is why every read here does the two queries in parallel and joins them in
 * memory.
 *
 * One place where that trade-off is visible and deliberate: `stats` reports value
 * *at last known unit cost* rather than a true weighted average. Averaging needs
 * each item's whole movement history in order, which is not a thing a dashboard
 * should do on every load; the item detail page shows the real valuation, and the
 * two are labelled differently so nobody reads one as the other.
 */
@Injectable()
export class InventoryItemsService {
  constructor(private prisma: PrismaService) {}

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: InventoryItemFilters = {},
  ) {
    const items = await this.prisma.inventoryItem.findMany({
      where: this.buildWhere(organizationId, filters),
      include: ITEM_INCLUDE,
      orderBy: { name: 'asc' },
      take: 500,
    });

    if (items.length === 0) return [];

    const rows = await this.ledgerRows(items.map((item) => item.id));

    return this.decorate(items, rows).filter((row) =>
      this.matchesStatus(row, filters.status),
    );
  }

  async findOne(id: string, organizationId: string | undefined) {
    const item = await requireRecord(
      this.prisma.inventoryItem.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: ITEM_INCLUDE,
      }),
      'Inventory item',
    );

    const rows = await this.ledgerRows([id]);
    const [decorated] = this.decorate([item], rows);

    // The detail page shows the ledger in order, so it gets the whole history
    // with a running balance — the one view where an exact per-row valuation is
    // both affordable and the point.
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId: id, ...(organizationId ? { organizationId } : {}) },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        workOrder: { select: { id: true, reference: true, title: true } },
        goodsReceiptLine: {
          select: {
            id: true,
            goodsReceipt: {
              select: {
                id: true,
                receivedAt: true,
                deliveryNote: true,
                purchaseOrder: { select: { id: true, reference: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });

    const balances = this.balancesFor(movements);
    const value = valuation(ledgerView(movements as never));

    return {
      ...decorated,
      valuation: value,
      movements: movements.map((movement) => ({
        ...movement,
        quantity: num(movement.quantity),
        unitCost:
          movement.unitCost == null ? null : round4(num(movement.unitCost)),
        balanceAfter: balances.get(movement.id) ?? null,
      })),
      consumedBy: await this.consumingWorkOrders(id, organizationId),
    };
  }

  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};

    const [items, warehouseCount, grouped] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { ...base, isActive: true },
        select: {
          id: true,
          reorderLevel: true,
          reorderQuantity: true,
          unitCost: true,
          unitOfMeasure: true,
        },
        take: 5000,
      }),
      this.prisma.warehouse.count({ where: { ...base, isActive: true } }),
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        where: base,
        _sum: { quantity: true },
        _count: { _all: true },
      }),
    ]);

    const quantities = new Map(
      grouped.map((row) => [row.itemId, round2(num(row._sum.quantity))]),
    );
    const movements = new Map(
      grouped.map((row) => [row.itemId, row._count._all]),
    );

    let belowReorder = 0;
    let outOfStock = 0;
    let totalUnits = 0;
    // Value at each item's last known unit cost. Deliberately *not* a weighted
    // average: that needs every movement of every item in order, and this is a
    // dashboard. The item detail carries the real figure.
    let valueAtUnitCost = 0;
    let pricedItems = 0;

    const suggestions: {
      itemId: string;
      quantity: number;
      unitCost: number | null;
      unitOfMeasure: string;
    }[] = [];

    for (const item of items) {
      const onHand = quantities.get(item.id) ?? 0;
      const suggestion = reorderSuggestion({
        onHand,
        reorderLevel: item.reorderLevel,
        reorderQuantity: item.reorderQuantity,
        unitCost: item.unitCost,
        unitOfMeasure: item.unitOfMeasure,
      });

      totalUnits += onHand;

      if (item.unitCost != null) {
        pricedItems += 1;
        valueAtUnitCost = round2(valueAtUnitCost + onHand * num(item.unitCost));
      }

      if (suggestion.status === 'OUT_OF_STOCK') outOfStock += 1;
      else if (suggestion.status === 'REORDER') belowReorder += 1;

      if (suggestion.needsReorder) {
        suggestions.push({
          itemId: item.id,
          quantity: suggestion.suggestedQuantity,
          unitCost: suggestion.estimatedCost,
          unitOfMeasure: suggestion.unitOfMeasure,
        });
      }
    }

    return {
      items: items.length,
      warehouses: warehouseCount,
      /** Sum of every signed movement — the only definition of "units held". */
      totalUnits: round2(totalUnits),
      belowReorder,
      outOfStock,
      needsReorder: belowReorder + outOfStock,
      negativeBalances: [...quantities.values()].filter((value) => value < 0)
        .length,
      totalMovements: [...movements.values()].reduce((sum, n) => sum + n, 0),
      /**
       * What the shelf is worth at last known prices. Null when no item has a
       * price on file, rather than zero — "we have not priced our stock" and
       * "our stock is worthless" are different facts.
       */
      stockValueAtUnitCost: pricedItems === 0 ? null : valueAtUnitCost,
      pricedItems,
      itemsWithoutPrice: items.length - pricedItems,
      reorderSuggestions: suggestions,
    };
  }

  /**
   * What to order, worst first.
   *
   * Ordered by how far below the level each item has fallen rather than by name,
   * because the question a buyer opens this screen for is "what is about to run
   * out", and an alphabetical list answers a different one.
   */
  async reorderList(organizationId: string | undefined) {
    const items = await this.findAll(organizationId, {});
    const enriched = await this.prisma.inventoryItem.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        id: { in: items.map((row) => row.id) },
      },
      include: ITEM_INCLUDE,
    });

    const rows = items
      .filter((row) => row.reorder.needsReorder)
      .sort((a, b) => {
        const byShortfall =
          (b.reorder.shortfall ?? 0) - (a.reorder.shortfall ?? 0);
        if (byShortfall !== 0) return byShortfall;
        return a.name.localeCompare(b.name);
      });

    return rows.map((row) => {
      const full = enriched.find((item) => item.id === row.id);
      return {
        ...row,
        preferredSupplier: full?.preferredSupplier ?? null,
      };
    });
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: InventoryItemFilters = {},
  ): Promise<string> {
    const rows = (await this.findAll(organizationId, filters)) as unknown as {
      sku: string;
      name: string;
      category: string;
      unitOfMeasure: string;
      totalQuantity: number;
      reorderLevel: unknown;
      statusLabel: string;
      reorder: { suggestedQuantity: number; estimatedCost: number | null };
      unitCost: unknown;
      valuationValue: number;
      quantityByWarehouse: Record<string, number>;
      preferredSupplier?: { name?: string | null } | null;
    }[];

    return toCsv(
      ITEM_EXPORT_HEADERS,
      rows.map((row) => ({
        sku: row.sku,
        name: row.name,
        category: row.category,
        unitOfMeasure: row.unitOfMeasure,
        onHand: row.totalQuantity,
        reorderLevel: num(row.reorderLevel as never),
        status: row.statusLabel,
        suggestedQuantity: row.reorder.suggestedQuantity,
        estimatedCost: row.reorder.estimatedCost,
        unitCost: row.unitCost == null ? '' : num(row.unitCost as never),
        valuation: row.valuationValue,
        preferredSupplier: row.preferredSupplier?.name ?? '',
        warehouses: Object.keys(row.quantityByWarehouse).length,
      })),
    );
  }

  // =================================================================== writes

  async create(dto: CreateInventoryItemDto, organizationId: string) {
    const sku = dto.sku.trim().toUpperCase();

    // Checked before the insert so the message names the collision, and again
    // after it (the unique index is the real guard — two people saving at once
    // is exactly the race a `findFirst` cannot see).
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { organizationId, sku },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `SKU ${sku} already exists in this organization. SKUs are unique per organization, not globally.`,
      );
    }

    if (dto.preferredSupplierId) {
      await this.assertSupplier(dto.preferredSupplierId, organizationId);
    }

    try {
      const created = await this.prisma.inventoryItem.create({
        data: {
          organization: { connect: { id: organizationId } },
          sku,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          category: dto.category,
          unitOfMeasure: dto.unitOfMeasure?.trim() || 'unit',
          unitCost:
            dto.unitCost == null ? undefined : new Prisma.Decimal(dto.unitCost),
          reorderLevel: new Prisma.Decimal(dto.reorderLevel ?? 0),
          reorderQuantity:
            dto.reorderQuantity == null
              ? undefined
              : new Prisma.Decimal(dto.reorderQuantity),
          notes: dto.notes?.trim(),
          ...(dto.preferredSupplierId
            ? {
                preferredSupplier: { connect: { id: dto.preferredSupplierId } },
              }
            : {}),
        },
      });

      return this.findOne(created.id, organizationId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(`SKU ${sku} is already in use.`);
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateInventoryItemDto,
    organizationId: string,
  ) {
    await this.record(id, organizationId);

    if (dto.sku !== undefined) {
      const sku = dto.sku.trim().toUpperCase();
      const clash = await this.prisma.inventoryItem.findFirst({
        where: { organizationId, sku, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`SKU ${sku} is already in use.`);
      }
    }

    if (dto.preferredSupplierId) {
      await this.assertSupplier(dto.preferredSupplierId, organizationId);
    }

    await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.unitOfMeasure !== undefined
          ? { unitOfMeasure: dto.unitOfMeasure?.trim() || 'unit' }
          : {}),
        ...(dto.unitCost !== undefined
          ? {
              unitCost:
                dto.unitCost == null ? null : new Prisma.Decimal(dto.unitCost),
            }
          : {}),
        ...(dto.reorderLevel !== undefined
          ? { reorderLevel: new Prisma.Decimal(dto.reorderLevel) }
          : {}),
        ...(dto.reorderQuantity !== undefined
          ? {
              reorderQuantity:
                dto.reorderQuantity == null
                  ? null
                  : new Prisma.Decimal(dto.reorderQuantity),
            }
          : {}),
        ...(dto.preferredSupplierId !== undefined
          ? {
              preferredSupplier: dto.preferredSupplierId
                ? { connect: { id: dto.preferredSupplierId } }
                : { disconnect: true },
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.findOne(id, organizationId);
  }

  /**
   * A movement cannot be deleted out from under the balance.
   *
   * Deleting the only receipt of a purchase order's goods is how stock silently
   * disappears. The honest operation is an `ADJUSTMENT` in the opposite
   * direction, which is recorded, attributed and explained.
   */
  async remove(id: string, organizationId: string) {
    const item = await this.record(id, organizationId);

    const movements = await this.prisma.stockMovement.count({
      where: { itemId: id },
    });

    if (movements > 0) {
      throw new ConflictException(
        `${item.sku} has ${movements} stock movement${movements === 1 ? '' : 's'} against it, so deleting it would take the stock balance with it. Retire it instead, or record an adjustment.`,
      );
    }

    await this.prisma.inventoryItem.delete({ where: { id } });
    return { message: `${item.sku} deleted.` };
  }

  // ================================================================== helpers

  async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.inventoryItem.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: ITEM_INCLUDE,
      }),
      'Inventory item',
    );
  }

  /** Every movement of the given items, oldest first — one query, not N+1. */
  private async ledgerRows(itemIds: string[]) {
    return this.prisma.stockMovement.findMany({
      where: { itemId: { in: itemIds } },
      select: {
        id: true,
        itemId: true,
        warehouseId: true,
        quantity: true,
        unitCost: true,
        type: true,
        createdAt: true,
      },
      // Not sorted: the list only sums and groups, and the ordering is done by
      // `stock-ledger.ts` where the tie-break rule lives.
      take: 100_000,
    });
  }

  private decorate<
    T extends {
      id: string;
      reorderLevel: Numeric;
      reorderQuantity: Numeric;
      unitCost: Numeric;
      unitOfMeasure: string;
      isActive: boolean;
    },
  >(
    items: T[],
    rows: {
      id: string;
      itemId: string;
      warehouseId: string;
      quantity: Numeric;
      unitCost: Numeric;
      type: string;
      createdAt: Date;
    }[],
  ) {
    const byItem = new Map<string, typeof rows>();
    for (const row of rows) {
      const existing = byItem.get(row.itemId);
      if (existing) existing.push(row);
      else byItem.set(row.itemId, [row]);
    }

    return items.map((item) => {
      const itemRows = byItem.get(item.id) ?? [];
      const movements = ledgerView(itemRows);

      const onHand = stockOnHand(movements);

      const quantityByWarehouse: Record<string, number> = {};
      let lastMovementAt: Date | null = null;
      for (const row of itemRows) {
        quantityByWarehouse[row.warehouseId] = round2(
          (quantityByWarehouse[row.warehouseId] ?? 0) + num(row.quantity),
        );
        if (!lastMovementAt || row.createdAt > lastMovementAt) {
          lastMovementAt = row.createdAt;
        }
      }

      // Quantity × last known price. On the list this is the honest affordable
      // figure; the detail page replaces it with the weighted average.
      const valuationValue =
        item.unitCost == null ? 0 : round2(onHand * num(item.unitCost));

      const status = stockStatus(onHand, num(item.reorderLevel));

      return {
        ...item,
        /** The derived level. Never stored, never settable. */
        totalQuantity: onHand,
        quantityByWarehouse,
        warehouses: Object.keys(quantityByWarehouse).length,
        movementCount: itemRows.length,
        lastMovementAt,
        status,
        statusLabel: STATUS_LABEL[status],
        valuationValue,
        reorder: reorderSuggestion({
          onHand,
          reorderLevel: num(item.reorderLevel),
          reorderQuantity: item.reorderQuantity,
          unitCost: item.unitCost,
          unitOfMeasure: item.unitOfMeasure,
        }) satisfies ReorderSuggestion,
      };
    });
  }

  /**
   * The balance *after* each movement, keyed by id.
   *
   * Reuses `runningBalances` rather than open-coding the accumulation: the
   * `(createdAt, id)` tie-break that makes a same-millisecond pair stable lives in
   * exactly one place, and this is the second reader that needs it.
   */
  private balancesFor(
    movements: { id: string; quantity: Numeric; createdAt: Date }[],
  ) {
    const balances = new Map<string, number>();
    for (const step of runningBalances(
      movements as unknown as LedgerMovement[],
    )) {
      balances.set(step.id, step.balance);
    }
    return balances;
  }

  /** The jobs that consumed this item, most recent first. */
  private async consumingWorkOrders(
    itemId: string,
    organizationId: string | undefined,
  ) {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        itemId,
        workOrderId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        workOrder: {
          select: { id: true, reference: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map((row) => ({
      movementId: row.id,
      quantity: num(row.quantity),
      issuedAt: row.createdAt,
      workOrder: row.workOrder,
    }));
  }

  private matchesStatus(
    row: { status: StockStatus },
    status: string | undefined,
  ): boolean {
    if (!status) return true;
    if (status === 'belowReorder') return row.status !== 'OK';
    if (status === 'outOfStock') return row.status === 'OUT_OF_STOCK';
    if (status === 'negative') return false;
    if (status === 'ok') return row.status === 'OK';
    // An unrecognised filter is a client bug, and silently ignoring it would show
    // an unfiltered list that looks like the filter worked.
    throw new BadRequestException(
      `"${status}" is not a stock status. Use belowReorder, outOfStock or ok.`,
    );
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: InventoryItemFilters,
  ): Prisma.InventoryItemWhereInput {
    const where: Prisma.InventoryItemWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (!filters.includeRetired) where.isActive = true;
    if (filters.category) where.category = filters.category as never;
    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async assertSupplier(supplierId: string, organizationId: string) {
    await requireRecord(
      this.prisma.supplier.findFirst({
        where: { id: supplierId, organizationId },
        select: { id: true },
      }),
      'Supplier',
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('inventory_items_organizationId_sku') ||
      (message.includes('Unique constraint') && message.includes('sku'))
    );
  }
}
