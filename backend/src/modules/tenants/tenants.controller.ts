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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  TenantsService,
  PaginationParams,
  TenantFilters,
} from './tenants.service';
import { Prisma, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('tenants.create')
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
    @Query('propertyId') propertyId?: string,
    @Query('withDeposit') withDeposit?: string,
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
      propertyId,
      withDeposit:
        withDeposit === 'true'
          ? true
          : withDeposit === 'false'
            ? false
            : undefined,
    };
    return this.tenantsService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.tenantsService.findOne(id, tenantId);
  }

  /**
   * The printable receipt for one of this tenant's receipts.
   *
   * Served as HTML with print CSS so the browser's own print dialog produces the
   * PDF — there is no PDF library in the stack to fight with. `?download=1` sends
   * it as a file instead of opening it.
   *
   * It hangs off the tenant rather than off `finance/receipts` because this is
   * where a resident's receipt is read: the tenant's page is the resident file,
   * and the roles that hold `tenants.view` (a property manager, a leasing
   * officer) are not the roles that hold `receipts.view`. A receipt the person
   * responsible for the tenancy cannot print is a receipt that will be
   * re-keyed by hand.
   */
  @Get(':id/receipts/:receiptId/document')
  async receiptDocument(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Request() req,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const tenantId = getTenantId(req);
    const { html, receiptNumber } =
      await this.tenantsService.renderReceiptDocument(id, receiptId, tenantId);

    if (download === 'true' || download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${receiptNumber}.html"`,
      );
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('tenants.update')
  update(
    @Param('id') id: string,
    @Body() updateTenantDto: Prisma.TenantUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.tenantsService.update(id, updateTenantDto, tenantId);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('tenants.delete')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.tenantsService.remove(id, tenantId);
  }
}
