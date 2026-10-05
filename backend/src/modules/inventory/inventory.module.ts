import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { GoodsReceiptStockInService } from './goods-receipt-stock-in.service';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';
import { InventoryNotificationsService } from './inventory-notifications.service';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

/**
 * Module 11 — Inventory.
 *
 * The other half of Module 10's supply chain: purchase orders commit to buying,
 * this is what happens to the goods afterwards.
 *
 * **It imports nothing from procurement or maintenance, and that is the design.**
 * Procurement needs to book a goods receipt onto a shelf and maintenance needs to
 * issue material to a job, so *they* import *this* module — a single direction,
 * and the reason two services that both care about the same shelf cannot end up
 * importing each other into a cycle. Reading the receipt and work-order rows
 * through Prisma is enough for this module to do its job without either of them
 * knowing it exists.
 *
 * Exports `StockMovementsService` (for maintenance's issue endpoint) and
 * `GoodsReceiptStockInService` (for procurement's stock-in endpoint). Both are
 * exported rather than reached through HTTP, so the call stays in one
 * transaction boundary that the caller controls.
 *
 * `AuditModule` is imported for the standing requirement; the global
 * `AuditInterceptor` is what actually writes the trail for these mutations, since
 * every one of them is a `POST`/`PATCH`/`DELETE` on a tenant-scoped controller.
 * `NotificationsModule` is here for the reorder sweep.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    InventoryItemsController,
    WarehousesController,
    StockMovementsController,
  ],
  providers: [
    InventoryItemsService,
    WarehousesService,
    StockMovementsService,
    GoodsReceiptStockInService,
    InventoryNotificationsService,
  ],
  exports: [
    InventoryItemsService,
    WarehousesService,
    StockMovementsService,
    GoodsReceiptStockInService,
  ],
})
export class InventoryModule {}
