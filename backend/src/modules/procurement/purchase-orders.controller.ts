import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CancelPurchaseOrderDto,
  CreateBillFromOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderLineDto,
  RecordGoodsReceiptDto,
  UpdatePurchaseOrderDto,
} from './dto/procurement.dto';

const PROCUREMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.ACCOUNTANT,
  UserRole.PROPERTY_MANAGER,
];

const VIEW_ROLES = [
  ...PROCUREMENT_ROLES,
  UserRole.LEASING_OFFICER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
];

/**
 * Module 10 — purchase orders.
 *
 * `POST /:id/create-bill` is the seam between this module and Finance: it hands
 * the order to `PayablesService`, which prices it through the tax engine and
 * posts the ledger entry. Procurement decides what was bought; finance decides
 * what it costs. Accounting needs `payables.create` as well as the procurement
 * permission, because that endpoint moves money.
 */
@UseGuards(JwtAuthGuard)
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_orders.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('purchaseRequestId') purchaseRequestId?: string,
    @Query('rfqId') rfqId?: string,
    @Query('category') category?: string,
    @Query('open') open?: string,
    @Query('overdue') overdue?: string,
    @Query('hasBill') hasBill?: string,
    @Query('search') search?: string,
  ) {
    return this.orders.findAll(getTenantId(req), {
      status,
      supplierId,
      purchaseRequestId,
      rfqId,
      category,
      open: open === 'true' ? true : undefined,
      overdue: overdue === 'true' ? true : undefined,
      hasBill:
        hasBill === 'true' ? true : hasBill === 'false' ? false : undefined,
      search,
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_orders.view')
  stats(@Request() req) {
    return this.orders.stats(getTenantId(req));
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_orders.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="purchase-orders.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('open') open?: string,
    @Query('overdue') overdue?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.orders.exportCsv(getTenantId(req), {
      status,
      supplierId,
      open: open === 'true' ? true : undefined,
      overdue: overdue === 'true' ? true : undefined,
      search,
    });
    res.send(csv);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_orders.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.orders.findOne(id, getTenantId(req));
  }

  /**
   * What has arrived and still needs stock-in.
   *
   * Answers through Module 11's service, so the mapping between a purchase order
   * line ("6 × 20mm compression coupling") and an inventory item is a decision
   * somebody records rather than a guess the API makes.
   */
  @Get(':id/stock-in')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_orders.view', 'inventory_items.view')
  pendingStockIn(@Param('id') id: string, @Request() req) {
    return this.orders.pendingStockIn(id, getTenantId(req));
  }

  @Post()
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.create')
  create(@Body() dto: CreatePurchaseOrderDto, @Request() req) {
    return this.orders.create(dto, requireTenantId(req), getUserId(req));
  }

  @Patch(':id')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Request() req,
  ) {
    return this.orders.update(id, dto, requireTenantId(req));
  }

  @Put(':id/lines')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  replaceLines(
    @Param('id') id: string,
    @Body() dto: { lines: PurchaseOrderLineDto[] },
    @Request() req,
  ) {
    return this.orders.replaceLines(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.orders.remove(id, requireTenantId(req));
  }

  // ------------------------------------------------------------ transitions

  @Post(':id/send')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  send(@Param('id') id: string, @Request() req) {
    return this.orders.send(id, requireTenantId(req));
  }

  @Post(':id/accept')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  accept(@Param('id') id: string, @Request() req) {
    return this.orders.accept(id, requireTenantId(req));
  }

  /** Record goods arriving. Derives RECEIVED vs PARTIALLY_RECEIVED itself. */
  @Post(':id/receive')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  receive(
    @Param('id') id: string,
    @Body() dto: RecordGoodsReceiptDto,
    @Request() req,
  ) {
    return this.orders.receive(id, dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/close')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  close(@Param('id') id: string, @Request() req) {
    return this.orders.close(id, requireTenantId(req));
  }

  @Post(':id/cancel')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @Request() req,
  ) {
    return this.orders.cancel(id, dto, requireTenantId(req));
  }

  /**
   * Raise the supplier bill for what was received.
   *
   * Moves money and posts a ledger entry, so it needs finance's permission as
   * well as procurement's — an order is a commitment, but the bill is an
   * accounting event and belongs to whoever owns those.
   */
  @Post(':id/create-bill')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_orders.update', 'payables.create')
  createBill(
    @Param('id') id: string,
    @Body() dto: CreateBillFromOrderDto,
    @Request() req,
  ) {
    return this.orders.createBillForOrder(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }
}
