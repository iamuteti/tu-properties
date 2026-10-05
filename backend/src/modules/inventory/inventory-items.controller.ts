import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
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
import { getTenantId, requireTenantId } from '@/common/utils';
import {
  INVENTORY_VIEW_ROLES as VIEW_ROLES,
  INVENTORY_WRITE_ROLES as WRITE_ROLES,
} from './inventory-roles';
import { InventoryItemsService } from './inventory-items.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

/**
 * Module 11 — inventory items.
 *
 * Read for anybody who can see a work order, because a technician standing in a
 * cupboard needs to know what is on the shelf; write for the roles that own the
 * store. `@Permissions('inventory_items.*')` is the structured half — a seeded
 * role that has not been re-seeded after Module 11 lands has no such permission,
 * which is exactly the failure `seed-roles.ts` exists to fix (issue 36).
 */
@UseGuards(JwtAuthGuard)
@Controller('inventory/items')
export class InventoryItemsController {
  constructor(private readonly items: InventoryItemsService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('inventory_items.view')
  findAll(
    @Request() req,
    @Query('category') category?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('includeRetired') includeRetired?: string,
  ) {
    return this.items.findAll(getTenantId(req), {
      category,
      warehouseId,
      status,
      search,
      includeRetired: includeRetired === 'true',
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('inventory_items.view')
  stats(@Request() req) {
    return this.items.stats(getTenantId(req));
  }

  /** What to order, worst first. The screen a buyer actually opens. */
  @Get('reorder-list')
  @Roles(...VIEW_ROLES)
  @Permissions('inventory_items.view')
  reorderList(@Request() req) {
    return this.items.reorderList(getTenantId(req));
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('inventory_items.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="inventory-items.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.items.exportCsv(getTenantId(req), {
      category,
      status,
      search,
    });
    res.send(csv);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('inventory_items.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.items.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @Permissions('inventory_items.create')
  create(@Body() dto: CreateInventoryItemDto, @Request() req) {
    return this.items.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @Permissions('inventory_items.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @Request() req,
  ) {
    return this.items.update(id, dto, requireTenantId(req));
  }

  /**
   * Refused once any movement exists — see the service. Retiring is the way.
   */
  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @Permissions('inventory_items.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.items.remove(id, requireTenantId(req));
  }
}