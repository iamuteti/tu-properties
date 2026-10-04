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
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId } from '@/common/utils';
import { RefundsService } from './refunds.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get()
  @Permissions('refunds.view')
  findAll(@Request() req, @Query('paymentId') paymentId?: string) {
    return this.refundsService.findAll(getTenantId(req), { paymentId });
  }

  @Get('refundable/:paymentId')
  @Permissions('refunds.view')
  refundable(@Param('paymentId') paymentId: string, @Request() req) {
    return this.refundsService.refundableAmount(paymentId, getTenantId(req));
  }

  @Get(':id')
  @Permissions('refunds.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.refundsService.findOne(id, getTenantId(req));
  }

  @Post()
  @Permissions('refunds.create')
  create(
    @Body()
    body: {
      paymentId: string;
      amount: number;
      reason: string;
      refundReference?: string;
      toCredit?: boolean;
    },
    @Request() req,
  ) {
    return this.refundsService.create(body, getTenantId(req));
  }
}
