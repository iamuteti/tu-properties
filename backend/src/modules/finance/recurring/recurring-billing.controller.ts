import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { RecurringBillingService } from './recurring-billing.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/recurring-billing')
export class RecurringBillingController {
  constructor(
    private readonly recurringBillingService: RecurringBillingService,
  ) {}

  /**
   * Run the billing cycle for this organization, for an optional date.
   *
   * Exposed because the scheduler is not the only way rent gets billed: after a
   * missed day, or when bringing a new organization live, someone has to run it
   * by hand — and running it twice is safe, because a lease already billed for
   * the period is skipped rather than billed again.
   */
  @Post('run')
  @Permissions('billing.run')
  run(
    @Body() body: { onDate?: string; organizationId?: string },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    const onDate = body.onDate ? new Date(body.onDate) : new Date();
    // A super admin can run another organization's cycle; everyone else is
    // confined to their own.
    const target =
      body.organizationId && req.user?.role === UserRole.SUPER_ADMIN
        ? body.organizationId
        : tenantId;
    return this.recurringBillingService.runForOrganization(
      target,
      onDate,
      getUserId(req),
    );
  }

  /** What each run did — the answer to "did rent go out this month?". */
  @Get('runs')
  @Permissions('billing.run')
  runs(@Request() req, @Query('limit') limit?: string) {
    return this.recurringBillingService.findRuns(
      getTenantId(req),
      limit ? Number(limit) : undefined,
    );
  }
}
