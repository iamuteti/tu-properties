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
import { PropertiesService, PaginationParams, PropertyFilters } from './properties.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/common/utils';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  create(
    @Body() createPropertyDto: Prisma.PropertyCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.propertiesService.create(createPropertyDto, tenantId);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('landlordId') landlordId?: string,
  ) {
    const tenantId = getTenantId(req);
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: PropertyFilters = {
      type,
      category,
      landlordId,
    };
    return this.propertiesService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.propertiesService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePropertyDto: Prisma.PropertyUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.propertiesService.update(id, updatePropertyDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.propertiesService.remove(id, tenantId);
  }
}
