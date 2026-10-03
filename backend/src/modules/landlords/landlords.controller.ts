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
import { ManagementFeeType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { LandlordsService, type PaginationParams } from './landlords.service';
import type { LandlordFilters } from './dto/landlord.dto';
import { CreateLandlordDto, UpdateLandlordDto } from './dto/landlord.dto';
import { LandlordChargesService } from './charges/landlord-charges.service';
import type { ChargeFilters } from './charges/dto/charge.dto';
import { CreateChargeDto, UpdateChargeDto } from './charges/dto/charge.dto';
import { LandlordPayoutsService } from './payouts/landlord-payouts.service';
import { OwnerStatementsService } from './statements/owner-statements.service';
import { getUserId } from '@/common/utils';

const LANDLORD_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Landlord profiles (Module 6) plus the three owner-money sub-resources.
 *
 * Charges hang off `/landlords/charges` rather than a nested `/:id/charges` so a
 * filter can span landlords; the landlord id is a query parameter. Statements
 * and payouts have their own controllers because they are documents with their
 * own lifecycle.
 */
@UseGuards(JwtAuthGuard)
@Controller('landlords')
export class LandlordsController {
  constructor(
    private readonly landlordsService: LandlordsService,
    private readonly chargesService: LandlordChargesService,
    private readonly payoutsService: LandlordPayoutsService,
    private readonly statementsService: OwnerStatementsService,
  ) {}

  @Post()
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.create')
  create(@Body() dto: CreateLandlordDto, @Request() req) {
    return this.landlordsService.create(dto, requireTenantId(req));
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
    @Query('managementFeeType') managementFeeType?: string,
    @Query('hasProperties') hasProperties?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: LandlordFilters = {
      status: status as LandlordFilters['status'],
      managementFeeType: managementFeeType as ManagementFeeType,
      hasProperties: hasProperties === 'true',
    };
    return this.landlordsService.findAll(requireTenantId(req), params, filters);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="landlords.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('managementFeeType') managementFeeType?: string,
  ) {
    const csv = await this.landlordsService.exportCsv(requireTenantId(req), {
      status: status as LandlordFilters['status'],
      managementFeeType: managementFeeType as ManagementFeeType,
    });
    res.send(csv);
  }

  // -------------------------------------------------------- owner charges

  @Get('charges')
  findCharges(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('landlordId') landlordId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('category') category?: string,
    @Query('unstated') unstated?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
    };
    const filters: ChargeFilters = {
      landlordId,
      propertyId,
      category: category as ChargeFilters['category'],
      unstated: unstated === 'true',
      from,
      to,
    };
    return this.chargesService.findAll(requireTenantId(req), params, filters);
  }

  @Get('charges/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="landlord-charges.csv"')
  async exportCharges(
    @Request() req,
    @Res() res: Response,
    @Query('landlordId') landlordId?: string,
    @Query('category') category?: string,
  ) {
    const csv = await this.chargesService.exportCsv(requireTenantId(req), {
      landlordId,
      category: category as ChargeFilters['category'],
    });
    res.send(csv);
  }

  @Post('charges')
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.update')
  createCharge(@Body() dto: CreateChargeDto, @Request() req) {
    return this.chargesService.create(
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Get('charges/:id')
  findCharge(@Param('id') id: string, @Request() req) {
    return this.chargesService.findOne(id, requireTenantId(req));
  }

  @Patch('charges/:id')
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.update')
  updateCharge(
    @Param('id') id: string,
    @Body() dto: UpdateChargeDto,
    @Request() req,
  ) {
    return this.chargesService.update(id, dto, requireTenantId(req));
  }

  @Delete('charges/:id')
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.update')
  removeCharge(@Param('id') id: string, @Request() req) {
    return this.chargesService.remove(id, requireTenantId(req));
  }

  // ------------------------------------------------------- landlord detail

  /** Statements, payouts and charges for one landlord, for the detail page. */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.landlordsService.findOne(id, requireTenantId(req));
  }

  /** What this landlord is still owed, across every statement ever issued. */
  @Get(':id/outstanding')
  async outstanding(@Param('id') id: string, @Request() req) {
    const tenantId = requireTenantId(req);
    const [balance, charges, payouts] = await Promise.all([
      this.statementsService.outstanding(id, tenantId),
      this.chargesService.historyForLandlord(id, tenantId),
      this.payoutsService.historyForLandlord(id, tenantId),
    ]);

    return { ...balance, charges: charges.totals, payouts: payouts.totals };
  }

  @Patch(':id')
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLandlordDto,
    @Request() req,
  ) {
    return this.landlordsService.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...LANDLORD_WRITE_ROLES)
  @Permissions('landlords.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.landlordsService.remove(id, requireTenantId(req));
  }
}
