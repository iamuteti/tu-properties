import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';
import {
  CreatePmScheduleDto,
  UpdatePmScheduleDto,
} from './dto/maintenance.dto';

const PM_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

const PM_VIEW_ROLES = [...PM_ROLES, UserRole.TECHNICIAN];

/**
 * Preventive maintenance schedules.
 *
 * `run` is exposed as an endpoint as well as being a daily cron: the first
 * service after a deployment should not have to wait for the scheduler, and a
 * missed day is recovered by running it by hand — which is safe because the
 * (pmScheduleId, pmDueOn) unique constraint is what actually prevents a second
 * service being raised, not the job remembering to check.
 */
@UseGuards(JwtAuthGuard)
@Controller('maintenance/pm-schedules')
export class PmSchedulesController {
  constructor(private readonly pm: PreventiveMaintenanceService) {}

  @Get()
  @Roles(...PM_VIEW_ROLES)
  @Permissions('pm_schedules.view')
  findAll(
    @Request() req,
    @Query('assetId') assetId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('active') active?: string,
  ) {
    return this.pm.findAll(getTenantId(req), {
      assetId,
      propertyId,
      ...(active === undefined ? {} : { active: active === 'true' }),
    });
  }

  @Get('stats')
  @Roles(...PM_VIEW_ROLES)
  @Permissions('pm_schedules.view')
  stats(@Request() req) {
    return this.pm.stats(getTenantId(req));
  }

  @Get('runs')
  @Roles(...PM_VIEW_ROLES)
  @Permissions('pm_schedules.view')
  runs(@Request() req) {
    return this.pm.findRuns(getTenantId(req));
  }

  @Get(':id')
  @Roles(...PM_VIEW_ROLES)
  @Permissions('pm_schedules.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.pm.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...PM_ROLES)
  @Permissions('pm_schedules.create')
  create(@Body() dto: CreatePmScheduleDto, @Request() req) {
    return this.pm.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...PM_ROLES)
  @Permissions('pm_schedules.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePmScheduleDto,
    @Request() req,
  ) {
    return this.pm.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...PM_ROLES)
  @Permissions('pm_schedules.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.pm.remove(id, requireTenantId(req));
  }

  /** Raise this schedule's work order now. */
  @Post(':id/run')
  @Roles(...PM_ROLES)
  @Permissions('pm_schedules.update')
  run(@Param('id') id: string, @Request() req) {
    return this.pm.runOne(id, requireTenantId(req), getUserId(req));
  }

  /** Run the whole organization's due services — the cron, by hand. */
  @Post('run-due')
  @Roles(...PM_ROLES)
  @Permissions('pm_schedules.update')
  runDue(@Request() req) {
    return this.pm.runForOrganization(
      requireTenantId(req),
      new Date(),
      getUserId(req),
    );
  }
}
