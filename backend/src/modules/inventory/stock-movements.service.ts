import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  balanceAfter,
  checkMovement,
  checkTransfer,
  num,
  round2,
  round4,
  runningBalances,
  stockOnHand,
  type LedgerMovement,
} from './stock-ledger';
import {
  ManualMovementType,
  type IssueStockDto,
  type RecordStockMovementDto,
  type RecordStockTakeDto,
  type StockMovementFilters,
  type TransferStockDto,
} from './dto/inventory.dto';
import { WarehousesService } from './warehouses.service';
import { InventoryNotificationsService } from './inventory-notifications.service';

type Tx = Prisma.TransactionClient;

const MOVEMENT_INCLUDE = {
  item: { select: { id: true, sku: true, name: true, unitOfMeasure: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  workOrder: {
    select: { id: true, reference: true, title: true, status: true },
  },
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
} as const;

const MOVEMENT_EXPORT_HEADERS = [
  'recordedAt',
  'itemSku',
  'item',
  'warehouse',
  'quantity',
  'type',
  'balanceAfter',
  'unitCost',
  'reason',
  'reference',
  'recordedBy',
];

/**
 * Module 11 — the writer for the stock ledger.
 *
 * Every path in here ends the same way: validate against the balance, insert one
 * or two `StockMovement` rows, and derive nothing into a column. The four entry
 * points differ only in who supplies the reference and who supplies the sign:
 *
 * - `record()` — a person moving stock by hand (opening balance, count
 *   correction, return). The caller gives a positive quantity and a direction.
 * - `transfer()` — **two rows**, negative out of the source and positive into the
 *   destination, sharing a `transferGroup`. One row with two warehouses would make
 *   each store's balance stop being a sum.
 * - `recordStockTake()` — the caller states the quantity they *counted* and this
 *   derives the difference, so a count is repeatable by somebody else instead of
 *   being a subtraction somebody has to get right.
 * - `issueForWorkOrder()` — maintenance's half of the story, and the only writer
 *   of a movement that points at a work order.
 *
 * `GoodsReceiptLineId` and `workOrderId` are set **only** here, by the module that
 * owns that record. That is what makes stock-in idempotent (the receipt line's
 * unique index stops the same line being booked in twice) and what lets the item
 * page say which jobs consumed it without a second, parallel materials table.
 */
@Injectable()
export class StockMovementsService {
  constructor(
    private prisma: PrismaService,
    private warehouses: WarehousesService,
    private alerts: InventoryNotificationsService,
  ) {}

  // ==================================================================== reads

  async findAll(
    organizationId: string | undefined,
    filters: StockMovementFilters = {},
  ) {
    const rows = await this.prisma.stockMovement.findMany({
      where: this.buildWhere(organizationId, filters),
      include: MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });

    const balances = await this.balancesFor(
      organizationId,
      rows.map((row) => ({ itemId: row.itemId, warehouseId: row.warehouseId })),
    );

    return rows.map((row) => ({
      ...row,
      quantity: num(row.quantity),
      unitCost: row.unitCost == null ? null : round4(num(row.unitCost)),
      direction: num(row.quantity) >= 0 ? 'in' : 'out',
      balanceAfter:
        balances.get(`${row.itemId}:${row.warehouseId}:${row.id}`) ?? null,
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const row = await requireRecord(
      this.prisma.stockMovement.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: MOVEMENT_INCLUDE,
      }),
      'Stock movement',
    );

    const balances = await this.balancesFor(organizationId, [
      { itemId: row.itemId, warehouseId: row.warehouseId },
    ]);

    return {
      ...row,
      quantity: num(row.quantity),
      unitCost: row.unitCost == null ? null : round4(num(row.unitCost)),
      balanceAfter:
        balances.get(`${row.itemId}:${row.warehouseId}:${row.id}`) ?? null,
    };
  }

  async stats(organizationId: string | undefined) {
    const base = organizationId ? { organizationId } : {};

    const [byType, recent, inWindow] = await Promise.all([
      this.prisma.stockMovement.groupBy({
        by: ['type'],
        where: base,
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.count({ where: base }),
      this.prisma.stockMovement.count({
        where: {
          ...base,
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
    ]);

    return {
      total: recent,
      last30Days: inWindow,
      byType: Object.fromEntries(
        byType.map((row) => [row.type, row._count._all]),
      ) as Partial<Record<StockMovementType, number>>,
      netUnitsByType: Object.fromEntries(
        byType.map((row) => [row.type, round2(num(row._sum.quantity))]),
      ) as Partial<Record<StockMovementType, number>>,
    };
  }

  async exportCsv(
    organizationId: string | undefined,
    filters: StockMovementFilters = {},
  ): Promise<string> {
    const rows = await this.findAll(organizationId, filters);

    return toCsv(
      MOVEMENT_EXPORT_HEADERS,
      rows.map((row) => {
        const record = row as unknown as {
          createdAt: Date;
          item: { sku: string; name: string };
          warehouse: { name: string };
          quantity: number;
          type: string;
          balanceAfter: number | null;
          unitCost: number | null;
          reason: string | null;
          workOrder?: { reference?: string } | null;
          goodsReceiptLine?: {
            goodsReceipt?: { purchaseOrder?: { reference?: string } };
          } | null;
          createdBy?: { firstName?: string; lastName?: string } | null;
        };
        return {
          recordedAt: record.createdAt?.toISOString() ?? '',
          itemSku: record.item?.sku ?? '',
          item: record.item?.name ?? '',
          warehouse: record.warehouse?.name ?? '',
          quantity: record.quantity,
          type: record.type,
          balanceAfter: record.balanceAfter ?? '',
          unitCost: record.unitCost ?? '',
          reason: record.reason ?? '',
          reference:
            record.workOrder?.reference ??
            record.goodsReceiptLine?.goodsReceipt?.purchaseOrder?.reference ??
            '',
          recordedBy: record.createdBy
            ? `${record.createdBy.firstName ?? ''} ${record.createdBy.lastName ?? ''}`.trim()
            : '',
        };
      }),
    );
  }

  // =================================================================== writes

  /**
   * A movement a person records by hand.
   *
   * The sign is derived from `direction`, never taken from a signed quantity —
   * see the DTO note. `OPENING` and `RETURN` therefore default to coming in, and
   * a `RETURN` that is going out has to say so, which is the whole point: a
   * supplier credit note and a broken bucket look identical in the ledger
   * otherwise.
   */
  async record(
    dto: RecordStockMovementDto,
    organizationId: string,
    userId?: string,
  ) {
    const item = await this.assertItem(dto.itemId, organizationId);
    const warehouse = await this.assertWarehouse(
      dto.warehouseId,
      organizationId,
    );

    if (!item.isActive) {
      throw new ConflictException(
        `${item.sku} is retired, so stock cannot be moved against it. Reactivate it first.`,
      );
    }

    const amount = round2(Math.abs(num(dto.quantity)));

    // The default direction is the one the type almost always is. Saying it out
    // loud in the DTO would mean every "add these 20 boxes" form posts a field
    // nobody thinks about.
    const defaultIn =
      dto.type === ManualMovementType.OPENING ||
      dto.type === ManualMovementType.RETURN;
    const direction = dto.direction ?? (defaultIn ? 'IN' : 'OUT');
    const quantity = direction === 'IN' ? amount : -amount;

    // A count is the one movement with an opinion about the reason: an adjustment
    // with no explanation is a mystery that never gets solved.
    if (dto.type === ManualMovementType.ADJUSTMENT && !dto.reason?.trim()) {
      throw new BadRequestException(
        'A stock adjustment needs a reason — the next person to read this ledger is trying to work out who changed what and why.',
      );
    }

    const balanceBefore = await this.balanceAt(
      dto.itemId,
      dto.warehouseId,
      organizationId,
    );

    const check = checkMovement(
      dto.type as LedgerMovement['type'],
      quantity,
      balanceBefore,
    );
    if (!check.allowed) {
      throw new ConflictException(
        check.reason ?? 'That movement is not allowed.',
      );
    }

    const created = await this.prisma.stockMovement.create({
      data: {
        organization: { connect: { id: organizationId } },
        item: { connect: { id: dto.itemId } },
        warehouse: { connect: { id: dto.warehouseId } },
        quantity: new Prisma.Decimal(quantity),
        type: dto.type as StockMovementType,
        unitCost:
          dto.unitCost == null ? undefined : new Prisma.Decimal(dto.unitCost),
        reason: dto.reason?.trim(),
        notes: dto.notes?.trim(),
        ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
      },
    });

    // Fired *after* the write and outside any transaction: the alert reads the
    // balance, which only exists once the movement is committed, and a
    // notification failure must never roll back the movement.
    await this.alerts.announceAfterMovement({
      itemId: dto.itemId,
      organizationId,
    });

    return this.findOne(created.id, organizationId);
  }

  /**
   * Move stock between stores: two rows, one `transferGroup`.
   *
   * Both rows are written in one transaction and the whole transfer is refused
   * rather than partly applied, because a transfer that took 10 out of the main
   * store and failed to put them anywhere is the exact situation the two-row
   * design exists to make impossible.
   */
  async transfer(
    dto: TransferStockDto,
    organizationId: string,
    userId?: string,
  ) {
    if (!dto.lines?.length) {
      throw new BadRequestException('A transfer needs at least one line.');
    }

    const source = await this.assertWarehouse(
      dto.fromWarehouseId,
      organizationId,
    );
    const destination = await this.assertWarehouse(
      dto.toWarehouseId,
      organizationId,
    );

    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.itemId)) {
        throw new BadRequestException(
          'The same item appears twice — merge the lines so the transfer is one fact per item.',
        );
      }
      seen.add(line.itemId);
    }

    // Resolve and check every line *before* writing anything.
    const planned: {
      itemId: string;
      quantity: number;
      label: string;
      onHand: number;
    }[] = [];

    for (const line of dto.lines) {
      const item = await this.assertItem(line.itemId, organizationId);
      if (!item.isActive) {
        throw new ConflictException(
          `${item.sku} is retired, so it cannot be moved between stores.`,
        );
      }

      const onHand = await this.balanceAt(
        line.itemId,
        dto.fromWarehouseId,
        organizationId,
      );

      const check = checkTransfer({
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        quantity: line.quantity,
        onHandAtSource: onHand,
      });
      if (!check.allowed) {
        throw new ConflictException(
          check.reason ?? 'That transfer is not allowed.',
        );
      }

      planned.push({
        itemId: line.itemId,
        quantity: round2(Math.abs(num(line.quantity))),
        label: `${item.sku} — ${item.name}`,
        onHand,
      });
    }

    const transferGroup = `TRF-${new Date().getFullYear()}-${randomSuffix()}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const rows: { id: string }[] = [];

      for (const line of planned) {
        // Out of the source first, so a reader walking the ledger sees the stock
        // leave before it arrives.
        const out = await tx.stockMovement.create({
          data: {
            organization: { connect: { id: organizationId } },
            item: { connect: { id: line.itemId } },
            warehouse: { connect: { id: dto.fromWarehouseId } },
            quantity: new Prisma.Decimal(-line.quantity),
            type: StockMovementType.TRANSFER,
            transferGroup,
            reason: `Transfer to ${destination.name}`,
            notes: dto.notes?.trim(),
            ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
          },
          select: { id: true },
        });

        const into = await tx.stockMovement.create({
          data: {
            organization: { connect: { id: organizationId } },
            item: { connect: { id: line.itemId } },
            warehouse: { connect: { id: dto.toWarehouseId } },
            quantity: new Prisma.Decimal(line.quantity),
            type: StockMovementType.TRANSFER,
            transferGroup,
            reason: `Transfer from ${source.name}`,
            notes: dto.notes?.trim(),
            ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
          },
          select: { id: true },
        });

        rows.push(out, into);
      }

      return rows;
    });

    return {
      transferGroup,
      from: { id: source.id, name: source.name, code: source.code },
      to: {
        id: destination.id,
        name: destination.name,
        code: destination.code,
      },
      lines: planned.map((line) => ({
        itemId: line.itemId,
        description: line.label,
        quantity: line.quantity,
        balanceBefore: line.onHand,
        balanceAfter: round2(line.onHand - line.quantity),
      })),
      movements: await Promise.all(
        created.map((row) => this.findOne(row.id, organizationId)),
      ),
    };
  }

  /**
   * Record a stock take.
   *
   * The caller states what they *counted*; this derives the difference and writes
   * one `ADJUSTMENT` per **variance**. Lines where the count matched produce no
   * row, and that is deliberate rather than an omission: `checkMovement` refuses a
   * zero-quantity movement everywhere else in this module for the same reason —
   * a row that changes nothing is a row that looks like an event and is not one.
   * The response reports how many lines matched, which is where a human reads
   * "we counted and it was right", and the POST is in the audit trail either way.
   *
   * A count is allowed to make stock negative: the whole reason somebody is
   * counting is that the books might be the thing that is wrong.
   */
  async recordStockTake(
    dto: RecordStockTakeDto,
    organizationId: string,
    userId?: string,
  ) {
    if (!dto.lines?.length) {
      throw new BadRequestException('A stock take needs at least one line.');
    }

    const defaultWarehouse =
      await this.warehouses.resolveDefault(organizationId);

    const variances: {
      itemId: string;
      itemLabel: string;
      warehouseId: string;
      warehouseLabel: string;
      counted: number;
      expected: number;
      difference: number;
    }[] = [];

    const writes: {
      itemId: string;
      warehouseId: string;
      difference: number;
      reason: string;
    }[] = [];

    for (const line of dto.lines) {
      const item = await this.assertItem(line.itemId, organizationId);
      const warehouse = await this.assertWarehouse(
        line.warehouseId || defaultWarehouse || '',
        organizationId,
      );

      const counted = round2(num(line.quantity));
      const expected = await this.balanceAt(
        line.itemId,
        warehouse.id,
        organizationId,
      );
      const difference = round2(counted - expected);

      if (difference === 0) continue;

      variances.push({
        itemId: line.itemId,
        itemLabel: `${item.sku} — ${item.name}`,
        warehouseId: warehouse.id,
        warehouseLabel: warehouse.name,
        counted,
        expected,
        difference,
      });

      writes.push({
        itemId: line.itemId,
        warehouseId: warehouse.id,
        difference,
        reason:
          line.reason?.trim() ||
          `Stock take at ${warehouse.name}: counted ${counted}, books said ${expected}`,
      });
    }

    const created =
      writes.length === 0
        ? []
        : await this.prisma.$transaction(async (tx) => {
            const rows: { id: string }[] = [];
            for (const write of writes) {
              const row = await tx.stockMovement.create({
                data: {
                  organization: { connect: { id: organizationId } },
                  item: { connect: { id: write.itemId } },
                  warehouse: { connect: { id: write.warehouseId } },
                  quantity: new Prisma.Decimal(write.difference),
                  type: StockMovementType.ADJUSTMENT,
                  reason: write.reason,
                  notes: dto.notes?.trim(),
                  ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
                },
                select: { id: true },
              });
              rows.push(row);
            }
            return rows;
          });

    // A count that came up short is the strongest possible reorder signal, so the
    // alert fires for every item the count disagreed on.
    for (const itemId of new Set(variances.map((row) => row.itemId))) {
      await this.alerts.announceAfterMovement({ itemId, organizationId });
    }

    return {
      counted: dto.lines.length,
      variances: variances.length,
      matched: dto.lines.length - variances.length,
      adjustments: variances,
      movements: await Promise.all(
        created.map((row) => this.findOne(row.id, organizationId)),
      ),
    };
  }

  // ============================================================== integration

  /**
   * Issue material against a maintenance work order.
   *
   * The maintenance module's half of the ledger. Called *by*
   * `WorkOrdersService`, not exposed here directly, because who may issue stock
   * is a maintenance question (`work_orders.update`) as much as an inventory one
   * — the controller combines both permissions.
   *
   * Issued stock is never returned by deleting the movement: `reverseForWorkOrder`
   * writes the opposite row instead, so the ledger keeps saying what happened.
   */
  async issueForWorkOrder(
    workOrderId: string,
    dto: IssueStockDto,
    organizationId: string,
    userId?: string,
  ) {
    if (!dto.lines?.length) {
      throw new BadRequestException(
        'Record what the job used, or nothing at all.',
      );
    }

    // Re-read the work order rather than trusting the id: this is the one writer
    // that attaches stock to somebody else's record, so the scope check belongs
    // here even though maintenance has already checked it.
    const workOrder = await requireRecord(
      this.prisma.workOrder.findFirst({
        where: { id: workOrderId, organizationId },
        select: { id: true, reference: true, title: true },
      }),
      'Work order',
    );

    const created: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const line of dto.lines) {
        const item = await this.assertItem(
          line.inventoryItemId,
          organizationId,
          tx,
        );
        if (!item.isActive) {
          throw new ConflictException(
            `${item.sku} is retired, so it cannot be issued to a job.`,
          );
        }
        await this.assertWarehouse(line.warehouseId, organizationId, tx);

        const balanceBefore = await this.balanceAt(
          line.inventoryItemId,
          line.warehouseId,
          organizationId,
          tx,
        );

        const quantity = -round2(Math.abs(num(line.quantity)));
        const check = checkMovement(
          'WORK_ORDER_ISSUE',
          quantity,
          balanceBefore,
        );
        if (!check.allowed) {
          throw new ConflictException(
            check.reason ?? 'That issue is not allowed.',
          );
        }

        const row = await tx.stockMovement.create({
          data: {
            organization: { connect: { id: organizationId } },
            item: { connect: { id: line.inventoryItemId } },
            warehouse: { connect: { id: line.warehouseId } },
            quantity: new Prisma.Decimal(quantity),
            type: StockMovementType.WORK_ORDER_ISSUE,
            workOrder: { connect: { id: workOrderId } },
            reason: `Issued to ${workOrder.reference}: ${workOrder.title}`,
            notes: line.notes?.trim() || dto.notes?.trim(),
            ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
          },
          select: { id: true },
        });

        created.push(row.id);
      }
    });

    // Consumption is the signal a buyer actually wants, so the alert fires after
    // the whole issue is committed rather than per line — a job that takes six
    // items should say so once.
    for (const itemId of new Set(
      dto.lines.map((line) => line.inventoryItemId),
    )) {
      await this.alerts.announceAfterMovement({ itemId, organizationId });
    }

    return this.movementsForWorkOrder(workOrderId, organizationId, created);
  }

  /**
   * Put back what a job was issued.
   *
   * The honest inverse: a positive row on the same work order rather than a
   * delete, because "the technician used the wrong pipe and put it back" is a
   * fact, and a ledger that cannot say so will disagree with the shelf within a
   * week.
   */
  async reverseForWorkOrder(
    workOrderId: string,
    movementIds: string[],
    organizationId: string,
    userId?: string,
  ) {
    if (!movementIds?.length) {
      throw new BadRequestException('Choose the issues to put back.');
    }

    const originals = await this.prisma.stockMovement.findMany({
      where: {
        id: { in: movementIds },
        workOrderId,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    if (originals.length !== new Set(movementIds).size) {
      throw new BadRequestException(
        'One of those is not an issue against this work order.',
      );
    }

    for (const original of originals) {
      if (original.type !== StockMovementType.WORK_ORDER_ISSUE) {
        throw new BadRequestException(
          'Only material issued to a job can be put back.',
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows: { id: string }[] = [];
      for (const original of originals) {
        const row = await tx.stockMovement.create({
          data: {
            organization: { connect: { id: organizationId } },
            item: { connect: { id: original.itemId } },
            warehouse: { connect: { id: original.warehouseId } },
            quantity: new Prisma.Decimal(
              round2(Math.abs(num(original.quantity))),
            ),
            type: StockMovementType.RETURN,
            workOrder: { connect: { id: workOrderId } },
            reason: `Put back to the store from ${original.id}`,
            ...(userId ? { createdBy: { connect: { id: userId } } } : {}),
          },
          select: { id: true },
        });
        rows.push(row);
      }
      return rows;
    });

    return this.movementsForWorkOrder(
      workOrderId,
      organizationId,
      created.map((row) => row.id),
    );
  }

  async movementsForWorkOrder(
    workOrderId: string,
    organizationId: string | undefined,
    highlightIds: string[] = [],
  ) {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        workOrderId,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        item: {
          select: { id: true, sku: true, name: true, unitOfMeasure: true },
        },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const balances = await this.balancesFor(
      organizationId,
      rows.map((row) => ({ itemId: row.itemId, warehouseId: row.warehouseId })),
    );

    return rows.map((row) => ({
      ...row,
      quantity: num(row.quantity),
      unitCost: row.unitCost == null ? null : round4(num(row.unitCost)),
      balanceAfter:
        balances.get(`${row.itemId}:${row.warehouseId}:${row.id}`) ?? null,
      isNew: highlightIds.includes(row.id),
    }));
  }

  /**
   * The level on hand at one store — the sum of the movements, every time.
   *
   * Takes an optional transaction client so a caller mid-transaction reads its own
   * uncommitted rows rather than the committed ledger behind them.
   */
  async balanceAt(
    itemId: string,
    warehouseId: string,
    organizationId: string,
    client?: Tx,
  ): Promise<number> {
    const prisma = client ?? this.prisma;
    const rows = await prisma.stockMovement.findMany({
      where: {
        itemId,
        warehouseId,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        type: true,
        createdAt: true,
      },
      take: 50_000,
    });
    return stockOnHand(rows as unknown as LedgerMovement[]);
  }

  /**
   * The balance *as of* each movement, keyed `item:warehouse:movementId`.
   *
   * The historical figure, not the current one: a ledger screen filtered to
   * "adjustments last quarter" should show what the shelf held at the time of
   * each of them, which is the only figure that makes the variances add up.
   */
  async balancesFor(
    organizationId: string | undefined,
    pairs: { itemId: string; warehouseId: string }[],
  ) {
    if (pairs.length === 0) return new Map<string, number>();

    const rows = await this.prisma.stockMovement.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        OR: pairs.map((pair) => ({
          itemId: pair.itemId,
          warehouseId: pair.warehouseId,
        })),
      },
      select: {
        id: true,
        itemId: true,
        warehouseId: true,
        quantity: true,
        unitCost: true,
        type: true,
        createdAt: true,
      },
      take: 200_000,
    });

    const grouped = new Map<
      string,
      {
        id: string;
        quantity: unknown;
        unitCost: unknown;
        type: string;
        createdAt: Date;
      }[]
    >();

    for (const row of rows) {
      const key = `${row.itemId}:${row.warehouseId}`;
      const existing = grouped.get(key);
      if (existing) existing.push(row);
      else grouped.set(key, [row]);
    }

    const result = new Map<string, number>();
    for (const [key, group] of grouped) {
      // `chronological` owns the tie-break, so a pair written in the same
      // millisecond still produces the same balance on every read.
      for (const step of runningBalances(
        group as unknown as LedgerMovement[],
      )) {
        result.set(`${key}:${step.id}`, step.balance);
      }
    }

    return result;
  }

  // ================================================================== helpers

  async assertItem(id: string, organizationId: string, client?: Tx) {
    return requireRecord(
      (client ?? this.prisma).inventoryItem.findFirst({
        where: { id, organizationId },
        select: { id: true, sku: true, name: true, isActive: true },
      }),
      'Inventory item',
    );
  }

  async assertWarehouse(id: string, organizationId: string, client?: Tx) {
    if (!id) {
      throw new BadRequestException(
        'Say which store this is — there is no store to default to in this organization yet.',
      );
    }
    return requireRecord(
      (client ?? this.prisma).warehouse.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true, code: true, isActive: true },
      }),
      'Warehouse',
    );
  }

  private buildWhere(
    organizationId: string | undefined,
    filters: StockMovementFilters,
  ): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = {};

    if (organizationId) where.organizationId = organizationId;
    if (filters.itemId) where.itemId = filters.itemId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.workOrderId) where.workOrderId = filters.workOrderId;
    if (filters.type) where.type = filters.type as StockMovementType;
    if (filters.goodsReceiptId) {
      where.goodsReceiptLine = { goodsReceiptId: filters.goodsReceiptId };
    }

    if (filters.direction === 'in') where.quantity = { gt: 0 };
    else if (filters.direction === 'out') where.quantity = { lt: 0 };
    else if (filters.direction === 'transfer')
      where.type = StockMovementType.TRANSFER;
    else if (filters.direction === 'adjustment') {
      where.type = StockMovementType.ADJUSTMENT;
    }

    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: startOfDay(filters.from) } : {}),
        ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
      };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.item = {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    return where;
  }
}

/** Short random suffix so two transfers in the same second are distinguishable. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * A date filter means a whole day, not an instant.
 *
 * `new Date('2026-01-31')` is midnight at the **start** of that day in UTC, so
 * `lte` on it silently drops every movement on the 31st — and the page looks
 * correct because the boundary rows are simply absent. `startOfDay`/`endOfDay`
 * treat a bare date as the day a person meant, and pass a full timestamp through
 * untouched so the caller can still ask for an exact instant.
 */
function startOfDay(value: string): Date {
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime()) && /T|\d:\d/.test(value)) return parsed;
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
}

function endOfDay(value: string): Date {
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime()) && /T|\d:\d/.test(value)) return parsed;
  return new Date(
    parsed.getTime() - parsed.getTimezoneOffset() * 60_000 + 86_399_999,
  );
}
