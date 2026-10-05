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
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/inventory.dto';

/**
 * Module 11 — warehouses.
 *
 * A separate controller rather than a branch of the items controller because the
 * permission is separate: knowing a store exists is part of reading the shelf,
 * renaming one is part of running the store.
 */
@UseGuards(JwtAuthGuard)
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('warehouses.view')
  findAll(@Request() req, @Query('includeInactive') includeInactive?: string) {
    return this.warehouses.findAll(
      getTenantId(req),
      includeInactive === 'true',
    );
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('warehouses.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="warehouses.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.warehouses.exportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('warehouses.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.warehouses.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @Permissions('warehouses.create')
  create(@Body() dto: CreateWarehouseDto, @Request() req) {
    return this.warehouses.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @Permissions('warehouses.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @Request() req,
  ) {
    return this.warehouses.update(id, dto, requireTenantId(req));
  }

  /** Refused once the store has any movements against it. */
  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @Permissions('warehouses.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.warehouses.remove(id, requireTenantId(req));
  }
}
