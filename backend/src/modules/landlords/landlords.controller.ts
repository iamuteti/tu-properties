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
import { LandlordsService, PaginationParams, LandlordFilters } from './landlords.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/common/utils';

@Controller('landlords')
@UseGuards(JwtAuthGuard)
export class LandlordsController {
  constructor(private readonly landlordsService: LandlordsService) {}

  @Post()
  create(
    @Body() createLandlordDto: Prisma.LandlordCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.landlordsService.create(createLandlordDto, tenantId);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('status') status?: string,
  ) {
    const tenantId = getTenantId(req);
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: LandlordFilters = {
      status,
    };
    return this.landlordsService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.landlordsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateLandlordDto: Prisma.LandlordUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.landlordsService.update(id, updateLandlordDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.landlordsService.remove(id, tenantId);
  }
}
