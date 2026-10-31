import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { getUserId } from '@/common/utils';
import { PlatformService } from './platform.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

/**
 * Subscription plan catalog (Module 19 Phase D).
 *
 * SUPER_ADMIN only — the same guard as the rest of `/platform/...`.
 * Plans are the pricing/feature catalog: an organization's subscription
 * references one plan, and the plan's defaults (price, seats, properties,
 * features) are what the operator sells.
 */
@Controller('platform/plans')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformPlansController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.platformService.findAllPlans();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.platformService.findPlan(id);
  }

  @Post()
  create(@Body() dto: CreateSubscriptionPlanDto, @Request() req: any) {
    return this.platformService.createPlan(dto, getUserId(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
    @Request() req: any,
  ) {
    return this.platformService.updatePlan(id, dto, getUserId(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.platformService.deletePlan(id, getUserId(req));
  }
}
