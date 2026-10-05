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
import { HR_PAYROLL_ROLES } from './hr-roles';
import { PayrollRunsService } from './payroll-runs.service';
import {
  CreatePayrollRunDto,
  PayPayrollRunDto,
  VoidPayrollRunDto,
} from './dto/hr.dto';

/**
 * Module 12 — payroll runs.
 *
 * Every route that changes a run's state is a **named action**, never a `PATCH`.
 * `PUT /hr/payroll-runs/:id` cannot move a run to PAID, which is the whole point of
 * having states: `calculate → approve → post → pay` is a sequence with a ledger
 * entry in the middle of it, and a body field called `status` would let a client
 * skip straight past the posting.
 *
 * `pay` requires `payroll.pay` separately from `payroll.approve` on purpose. Those
 * are two different acts by two different people in a well-run company — the one
 * who signs off the figures and the one who releases the money — and collapsing
 * them is how a payroll gets approved by whoever built it.
 */
@UseGuards(JwtAuthGuard)
@Controller('hr/payroll-runs')
export class PayrollRunsController {
  constructor(private readonly runs: PayrollRunsService) {}

  @Get()
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
  ) {
    return this.runs.findAll(getTenantId(req), { status, year, search });
  }

  @Get('export')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll-runs.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.runs.exportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.runs.findOne(id, getTenantId(req));
  }

  /** One payslip in full, with its lines and the rules that produced it. */
  @Get('payslips/:payslipId')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  payslip(@Param('payslipId') payslipId: string, @Request() req) {
    return this.runs.payslip(payslipId, getTenantId(req));
  }

  @Post()
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.create')
  create(@Body() dto: CreatePayrollRunDto, @Request() req) {
    return this.runs.create(dto, requireTenantId(req), getUserId(req));
  }

  /**
   * Work out the payslips. Read-only in effect until it is approved, and it
   * replaces any previous calculation rather than adding to it — otherwise a
   * recalculation pays the difference twice.
   */
  @Post(':id/calculate')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.update')
  calculate(@Param('id') id: string, @Request() req) {
    return this.runs.calculate(id, requireTenantId(req), getUserId(req));
  }

  /**
   * Sign off the figures. Refuses while any payslip would pay nothing or less than
   * nothing — in the service, not here, so a client cannot skip the check.
   */
  @Post(':id/approve')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.approve')
  approve(@Param('id') id: string, @Request() req) {
    return this.runs.approve(id, requireTenantId(req), getUserId(req));
  }

  /**
   * Post the whole run as one journal entry, through Module 7's service.
   *
   * Refuses if the entry would not balance, which `AccountingService.postEntry`
   * would refuse anyway — this is here so the reason reaches the person running the
   * payroll rather than arriving as a generic 400 from deep inside finance.
   */
  @Post(':id/post')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.update')
  post(@Param('id') id: string, @Request() req) {
    return this.runs.post(id, requireTenantId(req), getUserId(req));
  }

  /** Release the money. Requires the run to be posted. */
  @Post(':id/pay')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.pay')
  pay(@Param('id') id: string, @Body() dto: PayPayrollRunDto, @Request() req) {
    return this.runs.pay(id, dto, requireTenantId(req), getUserId(req));
  }

  /** Void with a reason. Never deletes — a voided run is a record of what happened. */
  @Post(':id/void')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.approve')
  voidRun(
    @Param('id') id: string,
    @Body() dto: VoidPayrollRunDto,
    @Request() req,
  ) {
    return this.runs.voidRun(id, dto, requireTenantId(req), getUserId(req));
  }

  /** A draft run has nothing worth keeping; anything calculated is a document. */
  @Delete(':id')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.runs.remove(id, requireTenantId(req));
  }
}
