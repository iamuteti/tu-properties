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
import { TenantsService, PaginationParams, TenantFilters } from './tenants.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() createTenantDto: Prisma.TenantCreateInput, @Request() req) {
    const tenantId = getTenantId(req);
    return this.tenantsService.create(createTenantDto, tenantId);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('agreementType') agreementType?: string,
    @Query('status') status?: string,
    @Query('gender') gender?: string,
  ) {
    const tenantId = getTenantId(req);
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: TenantFilters = {
      agreementType,
      status,
      gender,
    };
    return this.tenantsService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.tenantsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTenantDto: Prisma.TenantUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.tenantsService.update(id, updateTenantDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.tenantsService.remove(id, tenantId);
  }
}
