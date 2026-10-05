import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantPortalGuard } from '@/security/guards/tenant-portal.guard';
import { requireTenantId, getUserId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { TenantRequestsService } from './tenant-requests.service';
import { DecideTenantRequestDto } from './dto/tenant-request.dto';

const DECIDER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
];

/**
 * Staff queue for resident-submitted requests.
 *
 * Reads need `tenant_requests.view`; deciding needs `tenant_requests.update`.
 * Approving does not perform the change here — the service delegates to the
 * leasing/move-out services so the same rules and audit trail apply.
 */
@UseGuards(JwtAuthGuard)
@Controller('tenant-requests')
export class TenantRequestsController {
  constructor(private readonly requests: TenantRequestsService) {}

  @Get()
  @Permissions('tenant_requests.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.requests.findAll(requireTenantId(req), {
      status,
      type,
      tenantId,
    });
  }

  @Get(':id')
  @Permissions('tenant_requests.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.requests.findOne(id, requireTenantId(req));
  }

  @Post(':id/decide')
  @Roles(...DECIDER_ROLES)
  @Permissions('tenant_requests.update')
  decide(
    @Param('id') id: string,
    @Body() dto: DecideTenantRequestDto,
    @Request() req,
  ) {
    return this.requests.decide(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
      req,
    );
  }
}

/**
 * Resident side of the same queue, mounted under the portal so it inherits the
 * tenant-scoped guards and the session-tenant scope.
 */
@UseGuards(JwtAuthGuard, TenantPortalGuard)
@Controller('portal/requests')
export class PortalRequestsController {
  constructor(private readonly requests: TenantRequestsService) {}

  @Get()
  list(@Request() req) {
    return this.requests.listForPortal(req);
  }

  @Post()
  create(
    @Body() dto: import('./dto/tenant-request.dto').CreateTenantRequestDto,
    @Request() req,
  ) {
    return this.requests.createFromPortal(dto, req);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @Request() req) {
    return this.requests.withdraw(id, req);
  }
}
