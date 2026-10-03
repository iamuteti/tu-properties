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
import { UnitsService, PaginationParams, UnitFilters } from './units.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  CreateUnitDto,
  ImportUnitsDto,
  SetUnitStatusDto,
  UpdateUnitDto,
} from './dto/unit.dto';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.create')
  create(@Body() createUnitDto: CreateUnitDto, @Request() req) {
    return this.unitsService.create(createUnitDto, getTenantId(req));
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('propertyId') propertyId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('branchId') branchId?: string,
    @Query('floor') floor?: string,
    @Query('bedrooms') bedrooms?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: UnitFilters = {
      propertyId,
      status,
      type,
      branchId,
      floor,
      bedrooms,
    };
    return this.unitsService.findAll(getTenantId(req), params, filters);
  }

  @Get('import-template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="units-import-template.csv"',
  )
  importTemplate() {
    return this.unitsService.importTemplate();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="units.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('propertyId') propertyId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('branchId') branchId?: string,
  ) {
    const csv = await this.unitsService.exportCsv(
      getTenantId(req),
      { propertyId, status, type, branchId },
      search,
    );
    res.send(csv);
  }

  @Post('import')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.create')
  import(@Body() body: ImportUnitsDto, @Request() req) {
    return this.unitsService.importCsv(body, getTenantId(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.unitsService.findOne(id, getTenantId(req));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.update')
  update(
    @Param('id') id: string,
    @Body() updateUnitDto: UpdateUnitDto,
    @Request() req,
  ) {
    return this.unitsService.update(id, updateUnitDto, getTenantId(req));
  }

  /**
   * Occupancy transition. Separate from `PATCH /units/:id` on purpose: the UI
   * offers this as explicit status actions (Mark Occupied, Take Out of
   * Service, …) and the service validates each transition against the unit's
   * rental agreements.
   */
  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.update')
  setStatus(
    @Param('id') id: string,
    @Body() body: SetUnitStatusDto,
    @Request() req,
  ) {
    return this.unitsService.setStatus(id, body.status, getTenantId(req));
  }

  /** Re-derive occupancy status from the unit's rental agreements. */
  @Post(':id/sync-status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.update')
  syncStatus(@Param('id') id: string, @Request() req) {
    return this.unitsService.syncOccupancyStatus(id, getTenantId(req));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('units.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.unitsService.remove(id, getTenantId(req));
  }
}
