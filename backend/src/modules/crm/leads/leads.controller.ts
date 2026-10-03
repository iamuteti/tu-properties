import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, CanActivate } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { LeadStage, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId, getUserId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Public } from '@/common/decorators/public.decorator';
import {
  LeadsService,
  type LeadFilters,
  type PaginationParams,
} from './leads.service';
import {
  ConvertLeadDto,
  CreateLeadDto,
  PublicLeadDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
} from './dto/lead.dto';

/**
 * Shared-secret guard for the unauthenticated lead webhook.
 *
 * A website form or Facebook Lead Ads cannot hold a user JWT, so the endpoint is
 * `@Public()` and authenticates with a per-deployment secret in the
 * `x-webhook-secret` header instead. The comparison is constant-time, and an
 * unset secret fails closed — a deployment without one accepts nothing.
 */
@Injectable()
export class CrmWebhookGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CRM_WEBHOOK_SECRET');
    if (!expected) {
      throw new UnauthorizedException(
        'Lead capture is not configured on this deployment.',
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const provided = String(request.headers?.['x-webhook-secret'] ?? '');

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    const matches =
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer);

    if (!matches) {
      throw new UnauthorizedException('Invalid lead capture secret.');
    }

    return true;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_leads.create')
  create(@Body() dto: CreateLeadDto, @Request() req) {
    return this.leadsService.create(dto, requireTenantId(req), getUserId(req));
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('stage') stage?: string,
    @Query('source') source?: string,
    @Query('propertyId') propertyId?: string,
    @Query('branchId') branchId?: string,
    @Query('assignedAgentId') assignedAgentId?: string,
    @Query('unassigned') unassigned?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: LeadFilters = {
      stage,
      source,
      propertyId,
      branchId,
      assignedAgentId,
      unassigned: unassigned === 'true',
    };
    return this.leadsService.findAll(requireTenantId(req), params, filters);
  }

  /** Pipeline board feed: open leads only, grouped by stage client-side. */
  @Get('pipeline')
  pipeline(
    @Request() req,
    @Query('propertyId') propertyId?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.leadsService.pipeline(requireTenantId(req), {
      propertyId,
      agentId,
    });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('stage') stage?: string,
    @Query('source') source?: string,
    @Query('propertyId') propertyId?: string,
    @Query('branchId') branchId?: string,
    @Query('assignedAgentId') assignedAgentId?: string,
  ) {
    const csv = await this.leadsService.exportCsv(
      requireTenantId(req),
      { stage, source, propertyId, branchId, assignedAgentId },
      search,
    );
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.leadsService.findOne(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_leads.update')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Request() req) {
    return this.leadsService.update(id, dto, requireTenantId(req));
  }

  /**
   * Move a lead through the pipeline. Separate from `PATCH :id` so a client
   * cannot set `stage` directly and bypass the transition rules.
   */
  @Patch(':id/stage')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_leads.update')
  setStage(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
    @Request() req,
  ) {
    return this.leadsService.setStage(
      id,
      dto.stage,
      requireTenantId(req),
      dto.reason,
    );
  }

  /** Convert a lead into a contact (and optionally a tenant). */
  @Post(':id/convert')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  // Conversion writes the contact and moves the lead: that is `update` on both.
  @Permissions('crm_leads.update', 'crm_contacts.create')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @Request() req,
  ) {
    return this.leadsService.convert(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_leads.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.leadsService.remove(id, requireTenantId(req));
  }
}

/**
 * Unauthenticated lead capture for the public website form and external lead
 * sources. Lives outside `JwtAuthGuard` and is guarded by the shared webhook
 * secret; the organization comes from configuration, never from the payload, so
 * a captured request cannot target another tenant.
 */
@Controller('crm/public/leads')
export class PublicLeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  @UseGuards(CrmWebhookGuard)
  async capture(
    @Body() dto: PublicLeadDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const organizationId = this.config.get<string>(
      'CRM_WEBHOOK_ORGANIZATION_ID',
    );
    if (!organizationId) {
      throw new UnauthorizedException(
        'Lead capture is not bound to an organization on this deployment.',
      );
    }

    const lead = await this.leadsService.createFromPublicSource(
      dto,
      organizationId,
    );
    res.status(201);
    return lead;
  }

  /** Liveness probe for a marketing site to check before wiring up a form. */
  @Public()
  @Get()
  ping() {
    return {
      ok: true,
      configured: Boolean(
        this.config.get<string>('CRM_WEBHOOK_SECRET') &&
        this.config.get<string>('CRM_WEBHOOK_ORGANIZATION_ID'),
      ),
      stages: Object.values(LeadStage),
    };
  }
}
