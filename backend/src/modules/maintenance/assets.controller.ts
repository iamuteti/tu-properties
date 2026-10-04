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
import { AssetStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { AssetsService } from './assets.service';
import {
  ChangeAssetStatusDto,
  CreateAssetDto,
  UpdateAssetDto,
} from './dto/maintenance.dto';

const ASSET_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

const ASSET_VIEW_ROLES = [...ASSET_ROLES, UserRole.TECHNICIAN, UserRole.ACCOUNTANT];

/**
 * The asset register.
 *
 * Service state has its own endpoint rather than a field on the update DTO,
 * because RETIRED is terminal and an update body is the wrong place to enforce
 * that.
 */
@UseGuards(JwtAuthGuard)
@Controller('maintenance/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @Roles(...ASSET_VIEW_ROLES)
  @Permissions('assets.view')
  findAll(
    @Request() req,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('propertyId') propertyId?: string,
    @Query('unitId') unitId?: string,
    @Query('search') search?: string,
    @Query('includeRetired') includeRetired?: string,
  ) {
    return this.assets.findAll(getTenantId(req), {
      type,
      status,
      propertyId,
      unitId,
      search,
      includeRetired: includeRetired === 'true',
    });
  }

  @Get('stats')
  @Roles(...ASSET_VIEW_ROLES)
  @Permissions('assets.view')
  stats(@Request() req) {
    return this.assets.stats(getTenantId(req));
  }

  @Get('export')
  @Roles(...ASSET_VIEW_ROLES)
  @Permissions('assets.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="assets.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('propertyId') propertyId?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.assets.exportCsv(getTenantId(req), {
      type,
      status,
      propertyId,
      search,
    });
    res.send(csv);
  }

  @Get(':id')
  @Roles(...ASSET_VIEW_ROLES)
  @Permissions('assets.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.assets.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...ASSET_ROLES)
  @Permissions('assets.create')
  create(@Body() dto: CreateAssetDto, @Request() req) {
    return this.assets.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...ASSET_ROLES)
  @Permissions('assets.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req,
  ) {
    return this.assets.update(id, dto, requireTenantId(req));
  }

  @Post(':id/status')
  @Roles(...ASSET_ROLES)
  @Permissions('assets.update')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeAssetStatusDto,
    @Request() req,
  ) {
    return this.assets.changeStatus(
      id,
      dto.status as AssetStatus,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete(':id')
  @Roles(...ASSET_ROLES)
  @Permissions('assets.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.assets.remove(id, requireTenantId(req));
  }
}
