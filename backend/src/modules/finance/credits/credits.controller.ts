import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CustomerCreditSource, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { CreditsService } from './credits.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  @Permissions('credits.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('tenantId') tenantId?: string,
    @Query('landlordId') landlordId?: string,
  ) {
    return this.creditsService.findAll(getTenantId(req), {
      status,
      tenantId,
      landlordId,
    });
  }

  /** Per-customer usable balances — what the dashboard and the pay page read. */
  @Get('balances')
  @Permissions('credits.view')
  balances(@Request() req) {
    return this.creditsService.balances(getTenantId(req));
  }

  @Get(':id')
  @Permissions('credits.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.creditsService.findOne(id, getTenantId(req));
  }

  @Post()
  @Permissions('credits.create')
  create(
    @Body()
    body: {
      tenantId?: string;
      landlordId?: string;
      customerName?: string;
      amount: number;
      reason?: string;
      source?: CustomerCreditSource;
      currency?: string;
    },
    @Request() req,
  ) {
    return this.creditsService.create(
      { ...body, createdBy: getUserId(req) },
      getTenantId(req),
    );
  }

  /**
   * Spend a credit. With no `invoiceIds` it goes oldest-invoice-first; with
   * them it follows exactly the order and amounts given (the manual override).
   */
  @Post(':id/apply')
  @Permissions('credits.update')
  apply(
    @Param('id') id: string,
    @Body()
    body: { invoiceIds?: string[]; amount?: number },
    @Request() req,
  ) {
    return this.creditsService.applyToInvoices(
      id,
      { ...body, appliedBy: getUserId(req) },
      getTenantId(req),
    );
  }

  @Delete(':id')
  @Permissions('credits.delete')
  void(@Param('id') id: string, @Request() req) {
    return this.creditsService.void(id, getTenantId(req));
  }
}
