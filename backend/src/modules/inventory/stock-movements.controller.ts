import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import {
  INVENTORY_VIEW_ROLES as VIEW_ROLES,
  INVENTORY_WRITE_ROLES as WRITE_ROLES,
} from './inventory-roles';
import { GoodsReceiptStockInService } from './goods-receipt-stock-in.service';
import { InventoryNotificationsService } from './inventory-notifications.service';
import { StockMovementsService } from './stock-movements.service';
import {
  BookStockInRequestDto,
  MarkNotStockDto,
  RecordStockMovementDto,
  RecordStockTakeDto,
  TransferStockDto,
} from './dto/inventory.dto';

/**
 * Module 11 — the stock ledger.
 *
 * Four write endpoints and none of them takes a status, a balance or a sign:
 * `record` takes a positive quantity and a direction, `transfer` writes the pair,
 * `stock-take` takes what was *counted*, and `book-in` maps received goods onto
 * items. Every one of them derives the stock level; none of them writes it.
 *
 * `book-in` carries **both** the inventory and procurement permissions, because
 * it is the one endpoint in the codebase that writes to another module's table
 * (`goodsReceiptLine.inventoryItemId`) on that module's behalf. Procurement owns
 * the purchase order; inventory owns the shelf; this endpoint is the seam and it
 * needs consent from both.
 */
@UseGuards(JwtAuthGuard)
@Controller('inventory/stock-movements')
export class StockMovementsController {
  constructor(
    private readonly movements: StockMovementsService,
    private readonly stockIn: GoodsReceiptStockInService,
    private readonly alerts: InventoryNotificationsService,
  ) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('stock_movements.view')
  findAll(
    @Request() req,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('goodsReceiptId') goodsReceiptId?: string,
    @Query('direction') direction?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.movements.findAll(getTenantId(req), {
      itemId,
      warehouseId,
      type,
      workOrderId,
      goodsReceiptId,
      direction,
      from,
      to,
      search,
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('stock_movements.view')
  stats(@Request() req) {
    return this.movements.stats(getTenantId(req));
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('stock_movements.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="stock-movements.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('direction') direction?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    res.send(
      await this.movements.exportCsv(getTenantId(req), {
        itemId,
        warehouseId,
        type,
        direction,
        from,
        to,
        // The list matches on SKU and name; the export used to ignore that, so a
        // filtered screen produced a CSV of the *unfiltered* list. An export that
        // silently covers more than the table above it is worse than no export.
        search,
      }),
    );
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('stock_movements.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.movements.findOne(id, getTenantId(req));
  }

  /**
   * Run the reorder sweep by hand.
   *
   * The cron does this daily; the endpoint exists so an operator who has just
   * finished a stock take does not have to wait until tomorrow morning to find
   * out what it says, and so the sweep is exercisable in a test. It is
   * idempotent through the notification `dedupeKey`, so running it twice sends
   * nothing twice — which is the property that makes a manual trigger safe to
   * expose at all.
   */
  @Post('run-reorder-sweep')
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.view')
  async runReorderSweep(@Request() req) {
    return this.alerts.runReorderSweep(new Date(), getTenantId(req));
  }

  // =================================================================== writes

  /**
   * Opening balance, stock-take correction or a return — a movement a person
   * records by hand. The sign comes from `direction`, never from the caller.
   */
  @Post()
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.create')
  record(@Body() dto: RecordStockMovementDto, @Request() req) {
    return this.movements.record(dto, requireTenantId(req), getUserId(req));
  }

  /** Two rows, one transfer group. Never one. */
  @Post('transfer')
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.create')
  transfer(@Body() dto: TransferStockDto, @Request() req) {
    return this.movements.transfer(dto, requireTenantId(req), getUserId(req));
  }

  /**
   * Record what was counted, not what changed.
   *
   * The service derives the variance, so a count is repeatable by somebody else —
   * which is the whole reason a stock take is worth more than an adjustment.
   */
  @Post('stock-take')
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.create')
  stockTake(@Body() dto: RecordStockTakeDto, @Request() req) {
    return this.movements.recordStockTake(dto, requireTenantId(req), getUserId(req));
  }

  /**
   * Book received goods onto the shelf.
   *
   * Both permissions: inventory because stock is being written, procurement
   * because a `goods_receipt_lines` row of another module is being marked as
   * booked. Called from the purchase order's detail page, which already knows the
   * order.
   */
  @Post('book-in')
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.create', 'purchase_orders.view')
  bookIn(@Body() dto: BookStockInRequestDto, @Request() req) {
    return this.stockIn.book(
      dto.purchaseOrderId,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Record that a receipt line is deliberately not going on a shelf.
   *
   * Pairs with `book-in` and needs both permissions for the same reason: it
   * settles a line on somebody else's goods receipt. A laptop, a printer, a desk
   * — the goods arrived, they are just not inventory, and saying so once is
   * better than re-raising the line every morning for the life of the order.
   */
  @Post('not-stock')
  @Roles(...WRITE_ROLES)
  @Permissions('stock_movements.create', 'purchase_orders.view')
  markNotStock(@Body() dto: MarkNotStockDto, @Request() req) {
    return this.stockIn.markNotStock(dto.goodsReceiptLineId, requireTenantId(req));
  }
}