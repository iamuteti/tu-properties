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
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, requireTenantId } from '@/common/utils';
import { HR_PAYROLL_ROLES } from './hr-roles';
import { PayrollRulesService } from './payroll-rules.service';
import {
  CreatePayrollRuleDto,
  PreviewPayrollDto,
  UpdatePayrollRuleDto,
} from './dto/hr.dto';

/**
 * Module 12 — the payroll rules engine.
 *
 * Readable by anyone who can run payroll, because configuring a rule you cannot
 * see is not a thing anyone should have to do. Writable by the same people, and
 * deliberately **not** by the administrator alone: a rule's figures are a legal
 * matter, and the accountant is better placed to enter them than somebody who
 * configures the system.
 *
 * `preview` is the reason this is safe to expose. An administrator can put a real
 * salary through the engine and see the answer before anybody is paid on the
 * strength of the rule — and can do it for a jurisdiction the organization does not
 * yet operate in, which is how you plan a new country.
 */
@UseGuards(JwtAuthGuard)
@Controller('hr/payroll-rules')
export class PayrollRulesController {
  constructor(private readonly rules: PayrollRulesService) {}

  @Get()
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  findAll(
    @Request() req,
    @Query('countryCode') countryCode?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.rules.findAll(getTenantId(req), {
      countryCode,
      includeInactive,
    });
  }

  /**
   * Is this jurisdiction actually configured?
   *
   * Sits at the top of the rules screen because the failure it reports is silent:
   * a jurisdiction with no rules pays everybody and withholds nothing, and the run
   * reports success.
   */
  @Get('coverage')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  coverage(@Request() req) {
    return this.rules.coverageFor(requireTenantId(req));
  }

  /** The organization\'s payroll jurisdiction, and whether it was inherited. */
  @Get('jurisdiction')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  jurisdiction(@Request() req) {
    return this.rules.jurisdictionOf(requireTenantId(req));
  }

  /**
   * Run the engine over a hypothetical salary.
   *
   * Read-only and side-effect free — it writes nothing and touches no payroll run.
   */
  @Post('preview')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  preview(@Body() dto: PreviewPayrollDto, @Request() req) {
    return this.rules.preview(
      {
        gross: dto.gross,
        basic: dto.basic,
        periodsPerYear: dto.periodsPerYear,
        countryCode: dto.countryCode ?? null,
        regionCode: dto.regionCode ?? null,
        at: dto.at ? new Date(dto.at) : undefined,
      },
      requireTenantId(req),
    );
  }

  @Get('export')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll-rules.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.rules.exportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.rules.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.create')
  create(@Body() dto: CreatePayrollRuleDto, @Request() req) {
    return this.rules.create(dto, requireTenantId(req));
  }

  /**
   * Edit descriptive fields freely; money-moving fields are refused on an in-force
   * rule. A rate change is a new row with a later `validFrom`, which is what keeps
   * a payslip from eighteen months ago explainable.
   */
  @Patch(':id')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRuleDto,
    @Request() req,
  ) {
    return this.rules.update(id, dto, requireTenantId(req));
  }

  /** Close a rule off. Keeps the payslips that reference it. */
  @Post(':id/retire')
  @Roles(...HR_PAYROLL_ROLES)
  @Permissions('payroll.update')
  retire(@Param('id') id: string, @Request() req) {
    return this.rules.retire(id, requireTenantId(req));
  }
}
