import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { UnitsService, PaginationParams, UnitFilters } from './units.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  create(@Body() createUnitDto: any, @Request() req) {
    const tenantId = getTenantId(req);
    return this.unitsService.create(createUnitDto, tenantId);
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
  ) {
    const tenantId = getTenantId(req);
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
    };
    return this.unitsService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.unitsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUnitDto: Prisma.UnitUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.unitsService.update(id, updateUnitDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.unitsService.remove(id, tenantId);
  }
}
