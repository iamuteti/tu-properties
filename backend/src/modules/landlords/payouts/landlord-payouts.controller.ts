import {
  Body,
  Controller,
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
import { PaymentMethod, PayoutStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getUserId, requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { LandlordPayoutsService } from './landlord-payouts.service';
import type { PaginationParams } from '../statements/owner-statements.service';
import type { PayoutFilters } from './dto/payout.dto';
import { CreatePayoutDto, UpdatePayoutStatusDto } from './dto/payout.dto';

const PAYOUT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Owner payouts (Module 6).
 *
 * A payout is created PENDING; `PATCH /:id/status` is the only way it moves,
 * and that endpoint enforces the state machine (a transfer reference to mark it
 * paid, a reason to mark it failed, no overpayment against its statement).
 */
@UseGuards(JwtAuthGuard)
@Controller('landlord-payouts')
export class LandlordPayoutsController {
  constructor(private readonly payouts: LandlordPayoutsService) {}

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('landlordId') landlordId?: string,
    @Query('ownerStatementId') ownerStatementId?: string,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('paidFrom') paidFrom?: string,
    @Query('paidTo') paidTo?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: PayoutFilters = {
      landlordId,
      ownerStatementId,
      status: status as PayoutStatus,
      method: method as PaymentMethod,
      paidFrom,
      paidTo,
    };
    return this.payouts.findAll(requireTenantId(req), params, filters);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="landlord-payouts.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('landlordId') landlordId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.payouts.exportCsv(requireTenantId(req), {
      landlordId,
      status: status as PayoutStatus,
    });
    res.send(csv);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.payouts.findOne(id, requireTenantId(req));
  }

  @Post()
  @Roles(...PAYOUT_ROLES)
  @Permissions('owner_payouts.create')
  create(@Body() dto: CreatePayoutDto, @Request() req) {
    return this.payouts.create(dto, requireTenantId(req), getUserId(req));
  }

  @Patch(':id/status')
  @Roles(...PAYOUT_ROLES)
  @Permissions('owner_payouts.update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePayoutStatusDto,
    @Request() req,
  ) {
    return this.payouts.updateStatus(id, dto, requireTenantId(req));
  }
}
