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
import { AgreementsService, type PaginationParams } from './agreements.service';
import type { AgreementFilters } from './dto/agreement.dto';
import {
  CreateAgreementTemplateDto,
  CreateAgreementDto,
  ExtendAgreementDto,
  RenewAgreementDto,
  TerminateAgreementDto,
  UpdateAgreementTemplateDto,
  UpdateAgreementDto,
} from './dto/agreement.dto';
import { AgreementTemplatesService } from './agreement-templates.service';
import { RENEWAL_WINDOW_DAYS } from './agreement-lifecycle';

const AGREEMENT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
];

/**
 * Agreements (Module 5).
 *
 * The lifecycle is explicit: `status` cannot be set through `PATCH /agreements/:id`
 * (the DTO does not include it), only through the action endpoints, which apply
 * the rules in `agreement-lifecycle.ts` and the unit occupancy side-effects.
 */
@UseGuards(JwtAuthGuard)
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Post()
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.create')
  create(@Body() dto: CreateAgreementDto, @Request() req) {
    return this.agreementsService.create(dto, requireTenantId(req));
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
    const filters: AgreementFilters = {
      status,
      agreementType,
      unitId,
      tenantId,
      propertyId,
    };
    return this.agreementsService.findAll(
      requireTenantId(req),
      params,
      filters,
    );
  }

  /**
   * Expiry reminders (checklist: stub until Notifications exists). The UI shows
   * this as "ends soon"; delivery becomes a scheduled job in Module 18.
   */
  @Get('expiring')
  expiring(@Request() req, @Query('days') days?: string) {
    return this.agreementsService.expiring(
      requireTenantId(req),
      days ? parseInt(days, 10) : RENEWAL_WINDOW_DAYS,
    );
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="agreements.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('agreementType') agreementType?: string,
  ) {
    const csv = await this.agreementsService.exportCsv(
      requireTenantId(req),
      { status, agreementType },
      search,
    );
    res.send(csv);
  }

  /** Occupancy history for a unit: tenancies plus the vacant gaps between them. */
  @Get('units/:unitId/occupancy-history')
  occupancyHistory(@Param('unitId') unitId: string, @Request() req) {
    return this.agreementsService.occupancyHistory(
      unitId,
      requireTenantId(req),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.agreementsService.findOne(id, requireTenantId(req));
  }

  /** Everything billed and collected against this agreement. */
  @Get(':id/ledger')
  ledger(@Param('id') id: string, @Request() req) {
    return this.agreementsService.ledger(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgreementDto,
    @Request() req,
  ) {
    return this.agreementsService.update(id, dto, requireTenantId(req));
  }

  // ------------------------------------------------------------- lifecycle

  @Post(':id/activate')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  activate(@Param('id') id: string, @Request() req) {
    return this.agreementsService.activate(id, requireTenantId(req));
  }

  /** Renew: creates the successor agreement and links the renewal chain. */
  @Post(':id/renew')
  @Roles(...AGREEMENT_WRITE_ROLES)
  // The permission vocabulary is module + {view,create,update,delete}; a renewal is an
  // update to the tenancy (and it creates the successor).
  @Permissions('agreements.update')
  renew(
    @Param('id') id: string,
    @Body() dto: RenewAgreementDto,
    @Request() req,
  ) {
    return this.agreementsService.renew(id, dto, requireTenantId(req));
  }

  @Post(':id/extend')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendAgreementDto,
    @Request() req,
  ) {
    return this.agreementsService.extend(id, dto, requireTenantId(req));
  }

  @Post(':id/terminate')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  terminate(
    @Param('id') id: string,
    @Body() dto: TerminateAgreementDto,
    @Request() req,
  ) {
    return this.agreementsService.terminate(id, dto, requireTenantId(req));
  }

  @Post(':id/expire')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  expire(@Param('id') id: string, @Request() req) {
    return this.agreementsService.expire(id, requireTenantId(req));
  }

  @Post(':id/reactivate')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  reactivate(@Param('id') id: string, @Request() req) {
    return this.agreementsService.reactivate(id, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.agreementsService.remove(id, requireTenantId(req));
  }
}

/** Agreement templates (Module 5): reusable default terms for the create form. */
@UseGuards(JwtAuthGuard)
@Controller('agreement-templates')
export class AgreementTemplatesController {
  constructor(private readonly templates: AgreementTemplatesService) {}

  @Get()
  list(@Request() req) {
    return this.templates.list(requireTenantId(req));
  }

  @Post()
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  create(@Body() dto: CreateAgreementTemplateDto, @Request() req) {
    return this.templates.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgreementTemplateDto,
    @Request() req,
  ) {
    return this.templates.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...AGREEMENT_WRITE_ROLES)
  @Permissions('agreements.update')
  remove(@Param('id') id: string, @Request() req) {
    return this.templates.remove(id, requireTenantId(req));
  }
}
