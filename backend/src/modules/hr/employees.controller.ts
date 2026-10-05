import {
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, requireTenantId } from '@/common/utils';
import { HR_COMPENSATION_ROLES, HR_VIEW_ROLES } from './hr-roles';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  EmployeeComponentDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';

/**
 * Module 12 — employees.
 *
 * Two permission levels on the same controller, and the split is the security
 * boundary of the module rather than a convenience:
 *
 * - `employees.view` returns the **directory**. The `select` behind it physically
 *   cannot include a salary, because the fields that would let it are not in the
 *   query. Every role that can see a colleague can use this.
 * - `employees.compensation` is required for `findOne`, `create`, `update`,
 *   `terminate` and the component endpoints — the paths that return or change pay,
 *   bank details or national identifiers.
 *
 * There are about ten roles in this system and exactly one of them should see a
 * salary. A single endpoint that returned the whole record would make "who can see
 * salaries" unanswerable, and it would be answered by widening the role list until
 * the answer was "everybody".
 */
@UseGuards(JwtAuthGuard)
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles(...HR_VIEW_ROLES)
  @Permissions('employees.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('employmentType') employmentType?: string,
    @Query('status') status?: string,
    @Query('hasUser') hasUser?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.employees.findAll(getTenantId(req), {
      search,
      department,
      employmentType,
      status,
      hasUser,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('stats')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('employees.view')
  stats(@Request() req) {
    // Deliberately no salary aggregates. "Total payroll cost" on a dashboard is
    // read by people with no business knowing it, and it is one of the easiest
    // numbers in this product to expose by accident.
    return this.employees.stats(getTenantId(req));
  }

  @Get('export')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('employees.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="employees.csv"')
  async export(@Res() res: Response, @Request() req) {
    // The directory, not the full record: an export leaves the building.
    res.send(await this.employees.exportCsv(getTenantId(req)));
  }

  /** Full record including compensation. `employees.compensation` only. */
  @Get(':id')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  findOne(@Param('id') id: string, @Request() req) {
    return this.employees.findOne(id, getTenantId(req));
  }

  /**
   * Would this leave request be granted?
   *
   * Read-only, under `employees.view` rather than `compensation` — somebody
   * filing their own request has no business reading anybody's salary, but the
   * balance check is exactly what they need to see.
   */
  @Get(':id/leave-preview')
  @Roles(...HR_VIEW_ROLES)
  @Permissions('employees.view')
  previewLeave(
    @Param('id') id: string,
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('leaveType') leaveType?: string,
  ) {
    return this.employees.previewLeave(
      id,
      { startDate: startDate ?? '', endDate: endDate ?? '', leaveType },
      getTenantId(req),
    );
  }

  @Post()
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  create(@Body() dto: CreateEmployeeDto, @Request() req) {
    return this.employees.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Request() req,
  ) {
    return this.employees.update(id, dto, requireTenantId(req));
  }

  /**
   * Leaving is a date, not a delete.
   *
   * Payslips reference the employee row and a payslip is a document an employee
   * may need years later, so termination sets a date and keeps everything.
   */
  @Post(':id/terminate')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  terminate(
    @Param('id') id: string,
    @Body() body: { terminationDate: string },
    @Request() req,
  ) {
    return this.employees.terminate(
      id,
      body.terminationDate,
      requireTenantId(req),
    );
  }

  @Post(':id/components')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  setComponents(
    @Param('id') id: string,
    @Body() body: { components: EmployeeComponentDto[] },
    @Request() req,
  ) {
    return this.employees.setComponents(
      id,
      body.components ?? [],
      requireTenantId(req),
    );
  }

  /**
   * Link or unlink a login.
   *
   * One-to-one on purpose: without it one person could be two employees in the same
   * organization, be paid twice, and appear on two payslips for one month of work.
   */
  @Post(':id/link-user')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  linkUser(
    @Param('id') id: string,
    @Body() body: { userId: string | null },
    @Request() req,
  ) {
    return this.employees.linkUser(
      id,
      body.userId ?? null,
      requireTenantId(req),
    );
  }

  /**
   * There is deliberately no delete.
   *
   * Rather than a 405 with no explanation, this says why: payslips reference the
   * employee row and a payslip is a document somebody may need years later, so the
   * only way out is a leaving date, which hides them from the directory and from the
   * next payroll run while keeping the history intact.
   */
  @Delete(':id')
  @Roles(...HR_COMPENSATION_ROLES)
  @Permissions('employees.compensation')
  remove() {
    throw new ConflictException(
      'Employees are never deleted. Record a leaving date instead — it hides them from the directory and from the next payroll run while keeping their payslips, which are documents somebody may need years later.',
    );
  }
}
