import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { HR_APPROVER_ROLES, HR_VIEW_ROLES } from './hr-roles';
import { LeaveService } from './leave.service';
import {
  CreateHolidayDto,
  CreateLeavePolicyDto,
  CreateLeaveRequestDto,
  DecisionLeaveRequestDto,
} from './dto/hr.dto';

/**
 * Module 12 — leave.
 *
 * Note the permission split on the approval routes. `leave_requests.approve` is
 * separate from `leave_requests.create` on purpose: the second is held by every
 * employee (it is how they file their own request) and the first is not held by
 * anyone who should not be signing off other people's holiday — least of all the
 * person who filed it, which the engine refuses and the service refuses again.
 */
@UseGuards(JwtAuthGuard)
@Controller('hr/leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  /**
   * The working calendar.
   *
   * Ahead of `:id` deliberately, or `calendar` would be read as a request id. This
   * route answers "why does my five-day request show as three?" — every
   * non-working day says whether it is a weekend or a named public holiday.
   */
  @Get('calendar')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  calendar(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.leave.calendar(getTenantId(req), from, to);
  }

  @Get('balances')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  balances(@Request() req) {
    return this.leave.balances(getTenantId(req));
  }

  @Get('policies')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  policies(@Request() req) {
    return this.leave.policies(getTenantId(req));
  }

  @Get('holidays')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('holidays.view')
  holidays(@Request() req) {
    return this.leave.holidays(getTenantId(req));
  }

  @Get('export')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leave-requests.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    res.send(
      await this.leave.exportCsv(getTenantId(req), {
        status,
        employeeId,
        from,
        to,
      }),
    );
  }

  @Get()
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  findAll(
    @Request() req,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('leaveType') leaveType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scope') scope?: string,
  ) {
    return this.leave.findAll(
      getTenantId(req),
      { employeeId, status, leaveType, from, to, scope },
      getUserId(req),
    );
  }

  @Get(':id')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.leave.findOne(id, getTenantId(req));
  }

  /**
   * File a request.
   *
   * Held by every role that can see the directory, because this is how an employee
   * books their own holiday and it grants them nothing — the policy is checked
   * before the row is written and the decision is not theirs.
   */
  @Post()
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.create')
  create(@Body() dto: CreateLeaveRequestDto, @Request() req) {
    return this.leave.create(dto, requireTenantId(req), getUserId(req));
  }

  /**
   * Approve or reject by hand.
   *
   * The escape hatch for an organization with no `LEAVE_REQUEST` approval workflow
   * configured. Without it, leave could only ever be approved by an approval engine
   * nobody set up.
   */
  @Post(':id/approve')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('leave_requests.approve')
  approve(
    @Param('id') id: string,
    @Body() dto: DecisionLeaveRequestDto,
    @Request() req,
  ) {
    return this.leave.decide(
      id,
      dto,
      true,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/reject')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('leave_requests.approve')
  reject(
    @Param('id') id: string,
    @Body() dto: DecisionLeaveRequestDto,
    @Request() req,
  ) {
    return this.leave.decide(
      id,
      dto,
      false,
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Withdraw your own request.
   *
   * Under `leave_requests.create`, not `approve`: this is the requester's own
   * action, and it is the one decision about a request they are entitled to make.
   */
  @Post(':id/cancel')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('leave_requests.create')
  cancel(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Request() req,
  ) {
    return this.leave.cancel(
      id,
      requireTenantId(req),
      getUserId(req),
      body.note,
    );
  }

  @Delete(':id')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('leave_requests.approve')
  remove(@Param('id') id: string, @Request() req) {
    return this.leave.remove(id, requireTenantId(req));
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  @Post('policies')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('leave_policies.update')
  createPolicy(@Body() dto: CreateLeavePolicyDto, @Request() req) {
    return this.leave.createPolicy(dto, requireTenantId(req));
  }

  @Post('holidays')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('holidays.update')
  createHoliday(@Body() dto: CreateHolidayDto, @Request() req) {
    return this.leave.createHoliday(dto, requireTenantId(req));
  }

  @Delete('holidays/:id')
  @Roles(...HR_APPROVER_ROLES)
  @Permissions('holidays.update')
  removeHoliday(@Param('id') id: string, @Request() req) {
    return this.leave.removeHoliday(id, requireTenantId(req));
  }
}
