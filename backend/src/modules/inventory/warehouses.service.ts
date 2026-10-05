import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import { num, round2 } from './stock-ledger';
import type {
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from './dto/inventory.dto';

const WAREHOUSE_EXPORT_HEADERS = [
  'code',
  'name',
  'isDefault',
  'isActive',
  'distinctItems',
  'unitsHeld',
  'address',
  'phone',
];

/**
 * Module 11 — warehouses (stores).
 *
 * Small service by design: a store has no state machine, no money and no
 * approval. Two decisions are worth writing down.
 *
 * **At most one default.** `isDefault` is a convenience — "book the goods in
 * without saying where" — and two defaults would make every screen that uses it
 * a coin toss. Setting one demotes the others in the same transaction rather than
 * refusing, because "make this the main store" is not an error.
 *
 * **A store is never deleted once it has stock.** The movements reference it
 * `Restrict`, and a warehouse holding history is a fact about where things were,
 * not a catalogue entry. `isActive` retires it instead.
 */
@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string | undefined, includeInactive = false) {
    const rows = await this.prisma.warehouse.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 200,
    });

    if (rows.length === 0) return [];

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['warehouseId'],
      where: {
        ...(organizationId ? { organizationId } : {}),
        warehouseId: { in: rows.map((row) => row.id) },
      },
      _sum: { quantity: true },
    });

    // groupBy counts *rows*, not distinct items, so "how many different things do
    // we hold here" needs the item ids themselves.
    const itemIds = await this.prisma.stockMovement.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        warehouseId: { in: rows.map((row) => row.id) },
      },
      select: { warehouseId: true, itemId: true },
      distinct: ['warehouseId', 'itemId'],
      take: 20_000,
    });

    const quantities = new Map(
      grouped.map((row) => [row.warehouseId, round2(num(row._sum.quantity))]),
    );
    const counts = new Map<string, Set<string>>();
    for (const row of itemIds) {
      const set = counts.get(row.warehouseId);
      if (set) set.add(row.itemId);
      else counts.set(row.warehouseId, new Set([row.itemId]));
    }

    return rows.map((row) => ({
      ...row,
      unitsHeld: quantities.get(row.id) ?? 0,
      distinctItems: counts.get(row.id)?.size ?? 0,
      hasStock: (quantities.get(row.id) ?? 0) !== 0,
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const warehouse = await requireRecord(
      this.prisma.warehouse.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Warehouse',
    );

    const [stock, itemCount, recent, lowHere] = await Promise.all([
      this.prisma.stockMovement.aggregate({
        where: {
          warehouseId: id,
          ...(organizationId ? { organizationId } : {}),
        },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        where: {
          warehouseId: id,
          ...(organizationId ? { organizationId } : {}),
        },
      }),
      // `warehouse` is included even though every row is this store. The ledger's
      // row shape is the same on every endpoint, and a client rendering one of
      // them should not have to special-case the other to avoid a column of `—`.
      this.prisma.stockMovement.findMany({
        where: {
          warehouseId: id,
          ...(organizationId ? { organizationId } : {}),
        },
        include: {
          item: {
            select: { id: true, sku: true, name: true, unitOfMeasure: true },
          },
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
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      // The reorder list for *this* store. An item can be fine in the main store
      // and empty at the site store, and only this store's own balance can say
      // which.
      this.prisma.stockMovement.groupBy({
        by: ['itemId'],
        where: {
          warehouseId: id,
          ...(organizationId ? { organizationId } : {}),
        },
        _sum: { quantity: true },
      }),
    ]);

    const quantities = new Map(
      lowHere.map((row) => [row.itemId, round2(num(row._sum.quantity))]),
    );
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        unitOfMeasure: true,
        reorderLevel: true,
        unitCost: true,
      },
    });

    const belowReorder = items
      .map((item) => ({
        ...item,
        onHand: quantities.get(item.id) ?? 0,
      }))
      .filter((item) => item.onHand < round2(num(item.reorderLevel)))
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        onHand: item.onHand,
        reorderLevel: round2(num(item.reorderLevel)),
        unitOfMeasure: item.unitOfMeasure,
        unitCost: item.unitCost == null ? null : Number(item.unitCost),
      }))
      .sort((a, b) => a.onHand - b.onHand);

    return {
      ...warehouse,
      unitsHeld: round2(num(stock._sum.quantity)),
      distinctItems: itemCount.length,
      belowReorder,
      recentMovements: recent.map((movement) => ({
        ...movement,
        quantity: num(movement.quantity),
      })),
    };
  }

  async create(dto: CreateWarehouseDto, organizationId: string) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.warehouse.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `A store with the code ${code} already exists.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: {
          organization: { connect: { id: organizationId } },
          code,
          name: dto.name.trim(),
          address: dto.address?.trim(),
          phone: dto.phone?.trim(),
          isDefault: dto.isDefault ?? false,
          notes: dto.notes?.trim(),
        },
      });

      // The first store in an organization becomes the default whether or not
      // anybody asked: with exactly one, "book it in without saying where" has
      // exactly one right answer.
      await this.applyDefault(
        tx,
        organizationId,
        warehouse.id,
        dto.isDefault ?? false,
      );

      return warehouse;
    });

    return this.findOne(created.id, organizationId);
  }

  async update(id: string, dto: UpdateWarehouseDto, organizationId: string) {
    await this.record(id, organizationId);

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const clash = await this.prisma.warehouse.findFirst({
        where: { organizationId, code, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `A store with the code ${code} already exists.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warehouse.update({
        where: { id },
        data: {
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.address !== undefined
            ? { address: dto.address?.trim() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes?.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (dto.isDefault !== undefined) {
        await this.applyDefault(tx, organizationId, id, dto.isDefault);
      }
    });

    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string) {
    const warehouse = await this.record(id, organizationId);

    const movements = await this.prisma.stockMovement.count({
      where: { warehouseId: id },
    });

    if (movements > 0) {
      throw new ConflictException(
        `${warehouse.name} has ${movements} stock movement${
          movements === 1 ? '' : 's'
        } against it, so it cannot be deleted — the ledger would lose the record of where that stock was. Deactivate it instead.`,
      );
    }

    const remaining = await this.prisma.warehouse.count({
      where: { organizationId, id: { not: id } },
    });
    if (remaining === 0) {
      throw new ConflictException(
        'This is the only store, so it cannot be deleted — goods receipts and stock issues would have nowhere to go.',
      );
    }

    await this.prisma.warehouse.delete({ where: { id } });
    return { message: `${warehouse.name} deleted.` };
  }

  /**
   * The store a movement lands in when the caller does not say.
   *
   * Prefers the flagged default, then the first active store, then nothing —
   * which makes the caller name a warehouse rather than silently choosing an
   * arbitrary one.
   */
  async resolveDefault(organizationId: string): Promise<string | null> {
    const rows = await this.prisma.warehouse.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: 1,
    });
    return rows[0]?.id ?? null;
  }

  async record(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.warehouse.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Warehouse',
    );
  }

  async exportCsv(organizationId: string | undefined): Promise<string> {
    const rows = (await this.findAll(organizationId, true)) as unknown as {
      code: string;
      name: string;
      isDefault: boolean;
      isActive: boolean;
      distinctItems: number;
      unitsHeld: number;
      address: string | null;
      phone: string | null;
    }[];

    return toCsv(
      WAREHOUSE_EXPORT_HEADERS,
      rows.map((row) => ({
        code: row.code,
        name: row.name,
        isDefault: row.isDefault ? 'yes' : 'no',
        isActive: row.isActive ? 'yes' : 'no',
        distinctItems: row.distinctItems,
        unitsHeld: row.unitsHeld,
        address: row.address ?? '',
        phone: row.phone ?? '',
      })),
    );
  }

  /**
   * Keep exactly zero or one default per organization.
   *
   * Demotes rather than refuses: "make this the main store" is a decision, and a
   * second 409 for it would just train people to leave the flag alone.
   */
  private async applyDefault(
    tx: Prisma.TransactionClient,
    organizationId: string,
    warehouseId: string,
    makeDefault: boolean,
  ) {
    if (!makeDefault) {
      await tx.warehouse.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
      return;
    }

    await tx.warehouse.updateMany({
      where: { organizationId, id: { not: warehouseId }, isDefault: true },
      data: { isDefault: false },
    });
    await tx.warehouse.update({
      where: { id: warehouseId },
      data: { isDefault: true },
    });
  }
}
