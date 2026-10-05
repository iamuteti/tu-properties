import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { requireTenantId } from '@/common/utils';
import { EmployeesService } from './employees.service';
import { LeaveService } from './leave.service';
import { PayrollRunsService } from './payroll-runs.service';
import { CreateLeaveRequestDto } from './dto/hr.dto';

/**
 * Module 12 — employee self-service, under `/hr/me`.
 *
 * The whole design is in one property: **not one route here takes an employee id.**
 * The caller is identified by their login, the employment record is resolved from
 * `User.employeeId`, and every read is scoped by that. A caller cannot ask for
 * somebody else's payslip because there is no parameter to name them, and cannot
 * file somebody else's leave because the field that would say so is discarded.
 *
 * That is why these are separate routes rather than a `scope=mine` filter on the
 * manager endpoints. A filter is a value somebody can set; a route is not.
 *
 * The permission is the new `self` action rather than `view`, and that is the
 * second half of the same argument: `employees.view` means "the tenant's staff",
 * so an employee holding it would be handed every salary in the company. The
 * permission and the scoping are independent, so a mistake in one cannot widen
 * the other — the only route where an id is even accepted is
 * `GET /payslips/:id`, and it is scoped as well as permissioned.
 */

/**
 * Who may reach self-service at all: every staff login.
 *
 * Not a statement about who gets anything useful — that is the three `self`
 * actions, and a login without them gets a 403 here rather than an empty page.
 * `USER` (the tenant portal) is deliberately excluded: a resident has no
 * employment record, so every route below would answer "this login is not linked
 * to an employment record".
 */
const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
  UserRole.LEASING_OFFICER,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.EMPLOYEE,
];

/**
 * The caller, as a definite id.
 *
 * `getUserId` returns `string | undefined` because most read endpoints cope with
 * an unauthenticated request. A self-service endpoint cannot: without a login
 * there is no employment record to resolve, so this is a 401 at the boundary
 * rather than an empty result further down.
 */
function requireUserId(req: unknown): string {
  const userId = (req as { user?: { userId?: string } })?.user?.userId;
  if (!userId) {
    throw new UnauthorizedException(
      'This page is only available to a signed-in member of staff.',
    );
  }
  return userId;
}

@UseGuards(JwtAuthGuard)
@Controller('hr/me')
export class HrSelfServiceController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly leave: LeaveService,
    private readonly runs: PayrollRunsService,
  ) {}

  /** Your own employment record and current leave balance. */
  @Get()
  @Roles(...STAFF_ROLES)
  @Permissions('employees.self')
  me(@Request() req) {
    return this.employees.selfRecord(requireUserId(req), requireTenantId(req));
  }

  /** Your own leave balance, without the rest of the record. */
  @Get('leave-balance')
  @Roles(...STAFF_ROLES)
  @Permissions('leave_requests.self')
  leaveBalance(@Request() req) {
    return this.leave.balanceForSelf(requireUserId(req), requireTenantId(req));
  }

  @Get('leave')
  @Roles(...STAFF_ROLES)
  @Permissions('leave_requests.self')
  async listLeave(
    @Request() req,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.leave.listForSelf(
      requireUserId(req),
      requireTenantId(req),
    );

    // Filtered here rather than in `listForSelf` so that method has no way to be
    // handed an employee id in the first place.
    if (!status && !from && !to) return rows;

    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!from && !to) return true;

      const start = new Date(row.startDate);
      if (from && start < new Date(from)) return false;
      if (to && start > new Date(to)) return false;
      return true;
    });
  }

  /**
   * File your own leave.
   *
   * `CreateLeaveRequestDto` carries an `employeeId` because the manager route
   * needs one. It is ignored here — the service strips it and resolves you from
   * the token — and the response says so, because a form that silently discards
   * what somebody typed is worse than one that says it did not count.
   */
  @Post('leave')
  @Roles(...STAFF_ROLES)
  @Permissions('leave_requests.self')
  async createLeave(@Body() dto: CreateLeaveRequestDto, @Request() req) {
    const result = await this.leave.createForSelf(
      requireUserId(req),
      dto,
      requireTenantId(req),
    );

    return {
      ...result,
      note:
        dto.employeeId && dto.employeeId !== result.employeeId
          ? 'The employee id you sent was ignored — this request was filed for you.'
          : undefined,
    };
  }

  @Post('leave/:id/cancel')
  @Roles(...STAFF_ROLES)
  @Permissions('leave_requests.self')
  cancelLeave(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Request() req,
  ) {
    return this.leave.cancelForSelf(
      requireUserId(req),
      id,
      requireTenantId(req),
      body.note,
    );
  }

  @Get('payslips')
  @Roles(...STAFF_ROLES)
  @Permissions('payroll.self')
  payslips(@Request() req) {
    return this.runs.payslipsForSelf(requireUserId(req), requireTenantId(req));
  }

  /**
   * One of your own payslips.
   *
   * Scoped by your employment record as well as the payslip id, so an id from
   * somebody else's payslip is a 404 rather than their salary.
   */
  @Get('payslips/:id')
  @Roles(...STAFF_ROLES)
  @Permissions('payroll.self')
  payslip(@Param('id') id: string, @Request() req) {
    return this.runs.ownPayslip(requireUserId(req), id, requireTenantId(req));
  }
}
