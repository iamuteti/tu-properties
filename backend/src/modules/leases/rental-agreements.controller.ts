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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  RentalAgreementsService,
  type PaginationParams,
} from './rental-agreements.service';
import type { LeaseFilters } from './dto/lease.dto';
import {
  CreateLeaseTemplateDto,
  CreateRentalAgreementDto,
  ExtendLeaseDto,
  RenewLeaseDto,
  TerminateLeaseDto,
  UpdateLeaseTemplateDto,
  UpdateRentalAgreementDto,
} from './dto/lease.dto';
import { LeaseTemplatesService } from './lease-templates.service';
import { RENEWAL_WINDOW_DAYS } from './lease-lifecycle';

const LEASE_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
];

/**
 * Leases (Module 5).
 *
 * The lifecycle is explicit: `status` cannot be set through `PATCH /leases/:id`
 * (the DTO does not include it), only through the action endpoints, which apply
 * the rules in `lease-lifecycle.ts` and the unit occupancy side-effects.
 */
@UseGuards(JwtAuthGuard)
@Controller('leases')
export class RentalAgreementsController {
  constructor(private readonly leasesService: RentalAgreementsService) {}

  @Post()
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.create')
  create(@Body() dto: CreateRentalAgreementDto, @Request() req) {
    return this.leasesService.create(dto, requireTenantId(req));
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
    @Query('agreementType') agreementType?: string,
    @Query('unitId') unitId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('propertyId') propertyId?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: LeaseFilters = {
      status,
      agreementType,
      unitId,
      tenantId,
      propertyId,
    };
    return this.leasesService.findAll(requireTenantId(req), params, filters);
  }

  /**
   * Expiry reminders (checklist: stub until Notifications exists). The UI shows
   * this as "ends soon"; delivery becomes a scheduled job in Module 18.
   */
  @Get('expiring')
  expiring(@Request() req, @Query('days') days?: string) {
    return this.leasesService.expiring(
      requireTenantId(req),
      days ? parseInt(days, 10) : RENEWAL_WINDOW_DAYS,
    );
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leases.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('agreementType') agreementType?: string,
  ) {
    const csv = await this.leasesService.exportCsv(
      requireTenantId(req),
      { status, agreementType },
      search,
    );
    res.send(csv);
  }

  /** Occupancy history for a unit: tenancies plus the vacant gaps between them. */
  @Get('units/:unitId/occupancy-history')
  occupancyHistory(@Param('unitId') unitId: string, @Request() req) {
    return this.leasesService.occupancyHistory(unitId, requireTenantId(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.leasesService.findOne(id, requireTenantId(req));
  }

  /** Everything billed and collected against this lease. */
  @Get(':id/ledger')
  ledger(@Param('id') id: string, @Request() req) {
    return this.leasesService.ledger(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRentalAgreementDto,
    @Request() req,
  ) {
    return this.leasesService.update(id, dto, requireTenantId(req));
  }

  // ------------------------------------------------------------- lifecycle

  @Post(':id/activate')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  activate(@Param('id') id: string, @Request() req) {
    return this.leasesService.activate(id, requireTenantId(req));
  }

  /** Renew: creates the successor agreement and links the renewal chain. */
  @Post(':id/renew')
  @Roles(...LEASE_WRITE_ROLES)
  // The permission vocabulary is module + {view,create,update,delete}; a renewal is an
  // update to the tenancy (and it creates the successor).
  @Permissions('leases.update')
  renew(@Param('id') id: string, @Body() dto: RenewLeaseDto, @Request() req) {
    return this.leasesService.renew(id, dto, requireTenantId(req));
  }

  @Post(':id/extend')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  extend(@Param('id') id: string, @Body() dto: ExtendLeaseDto, @Request() req) {
    return this.leasesService.extend(id, dto, requireTenantId(req));
  }

  @Post(':id/terminate')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  terminate(
    @Param('id') id: string,
    @Body() dto: TerminateLeaseDto,
    @Request() req,
  ) {
    return this.leasesService.terminate(id, dto, requireTenantId(req));
  }

  @Post(':id/expire')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  expire(@Param('id') id: string, @Request() req) {
    return this.leasesService.expire(id, requireTenantId(req));
  }

  @Post(':id/reactivate')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  reactivate(@Param('id') id: string, @Request() req) {
    return this.leasesService.reactivate(id, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.leasesService.remove(id, requireTenantId(req));
  }
}

/** Lease templates (Module 5): reusable default terms for the create form. */
@UseGuards(JwtAuthGuard)
@Controller('lease-templates')
export class LeaseTemplatesController {
  constructor(private readonly templates: LeaseTemplatesService) {}

  @Get()
  list(@Request() req) {
    return this.templates.list(requireTenantId(req));
  }

  @Post()
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  create(@Body() dto: CreateLeaseTemplateDto, @Request() req) {
    return this.templates.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaseTemplateDto,
    @Request() req,
  ) {
    return this.templates.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...LEASE_WRITE_ROLES)
  @Permissions('leases.update')
  remove(@Param('id') id: string, @Request() req) {
    return this.templates.remove(id, requireTenantId(req));
  }
}
