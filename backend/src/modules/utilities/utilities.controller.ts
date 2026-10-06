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
import { getUserId, requireTenantId } from '@/common/utils';
import {
  UTILITIES_BILL_ROLES,
  UTILITIES_RATE_ROLES,
  UTILITIES_RECORD_ROLES,
  UTILITIES_REGISTER_ROLES,
  UTILITIES_VIEW_ROLES,
  UTILITIES_VOID_ROLES,
} from './utilities-roles';
import { UtilitiesService } from './utilities.service';
import {
  BillPeriodDto,
  BulkReadingsDto,
  ChargeQueryDto,
  CreateMeterDto,
  CreateRateDto,
  CreateReadingDto,
  MeterQueryDto,
  RateQueryDto,
  ReadingQueryDto,
  SupersedeRateDto,
  UpdateMeterDto,
  UpdateReadingDto,
  VoidChargeDto,
} from './dto/utilities.dto';

/**
 * Module 14 - meters, readings, tariffs and consumption billing.
 *
 * One controller rather than four, and specifically *not* four controllers sharing a
 * prefix - that is the Module 13 route-shadowing trap (`@Get(':id')` on a prefix
 * swallowing `/facilities/bookings`). Here every list route is a literal segment
 * (`/meters`, `/readings`, `/rates`, `/charges`) declared before any `:id`, so there
 * is no one-segment wildcard that can eat a sibling resource. The four concerns stay
 * separated by permission and by DTO, which is what actually matters.
 *
 * Five permission tiers, and the split that matters is not view-versus-write:
 *
 * - `utility_meters.view`/`.create`/`.update` reads and maintains the register.
 *   Registering a meter is **narrower** than recording a reading - see
 *   `utilities-roles.ts`, which is why two different role lists appear below.
 * - `meter_readings.view`/`.create`/`.update`/`.delete` records what a register
 *   showed. Held by the roles whose job is physically at the meter, and **not** by
 *   ACCOUNTANT.
 * - `utility_rates.view`/`.create`/`.update` is a commercial decision about what the
 *   estate charges residents. An accountant may bill from a tariff and may not write
 *   one.
 * - `utility_charges.view`/`.create` prices consumption; `utility_charges.bill`
 *   raises the invoice, which is the money action.
 * - `utility_charges.void` reverses a charge and is the narrowest grant here: it
 *   decides a resident does not owe for water they were once billed.
 *
 * Every state change is a named `@Post(':id/<verb>')` route - `retire`, `supersede`,
 * `bill`, `bill-and-invoice`, `void`. There is no `PATCH .../status` on any resource,
 * which is what keeps `status` out of every update DTO.
 */
@Controller('utilities')
@UseGuards(JwtAuthGuard)
export class UtilitiesController {
  constructor(private readonly service: UtilitiesService) {}

  // ---------------------------------------------------------------- meters

  @Get('meters')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_meters.view')
  findAllMeters(@Request() req: unknown, @Query() query: MeterQueryDto) {
    return this.service.findAllMeters(requireTenantId(req), query);
  }

  @Post('meters')
  @Roles(...UTILITIES_REGISTER_ROLES)
  @Permissions('utility_meters.create')
  createMeter(@Request() req: unknown, @Body() dto: CreateMeterDto) {
    return this.service.createMeter(requireTenantId(req), dto);
  }

  /**
   * Declared after the literal `/meters/export` route below on purpose - Nest matches
   * in declaration order, so a wildcard registered first would answer an export
   * request with "meter not found". `routing.spec.ts` pins this.
   */
  @Get('meters/export')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_meters.view')
  @Header('Content-Type', 'text/csv')
  async exportMeters(
    @Request() req: unknown,
    @Query() query: MeterQueryDto,
    @Res() res: Response,
  ) {
    res.send(await this.service.metersCsv(requireTenantId(req), query));
  }

  @Get('meters/:id')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_meters.view')
  findOneMeter(@Request() req: unknown, @Param('id') id: string) {
    return this.service.findOneMeter(requireTenantId(req), id);
  }

  @Patch('meters/:id')
  @Roles(...UTILITIES_REGISTER_ROLES)
  @Permissions('utility_meters.update')
  updateMeter(
    @Request() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdateMeterDto,
  ) {
    return this.service.updateMeter(requireTenantId(req), id, dto);
  }

  @Post('meters/:id/retire')
  @Roles(...UTILITIES_REGISTER_ROLES)
  @Permissions('utility_meters.update')
  retireMeter(@Request() req: unknown, @Param('id') id: string) {
    return this.service.retireMeter(requireTenantId(req), id);
  }

  // -------------------------------------------------------------- readings

  @Get('readings')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('meter_readings.view')
  findAllReadings(@Request() req: unknown, @Query() query: ReadingQueryDto) {
    return this.service.findAllReadings(requireTenantId(req), query);
  }

  @Post('readings')
  @Roles(...UTILITIES_RECORD_ROLES)
  @Permissions('meter_readings.create')
  createReading(@Request() req: unknown, @Body() dto: CreateReadingDto) {
    return this.service.createReading(
      requireTenantId(req),
      dto,
      getUserId(req),
    );
  }

  /**
   * Bulk entry, because a clipboard of forty meters is the real workflow on an estate
   * with one bulk water meter.
   *
   * Per-row outcomes rather than all-or-nothing: one mistyped meter number must not
   * discard thirty-nine good readings, and the caller needs to know which row to fix.
   */
  @Post('readings/bulk')
  @Roles(...UTILITIES_RECORD_ROLES)
  @Permissions('meter_readings.create')
  createReadingsBulk(@Request() req: unknown, @Body() dto: BulkReadingsDto) {
    return this.service.createReadingsBulk(
      requireTenantId(req),
      dto.readings,
      getUserId(req),
    );
  }

  @Get('readings/export')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('meter_readings.view')
  @Header('Content-Type', 'text/csv')
  async exportReadings(
    @Request() req: unknown,
    @Query() query: ReadingQueryDto,
    @Res() res: Response,
  ) {
    res.send(await this.service.readingsCsv(requireTenantId(req), query));
  }

  @Patch('readings/:id')
  @Roles(...UTILITIES_RECORD_ROLES)
  @Permissions('meter_readings.update')
  updateReading(
    @Request() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdateReadingDto,
  ) {
    return this.service.updateReading(requireTenantId(req), id, dto);
  }

  // ----------------------------------------------------------------- rates

  @Get('rates')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_rates.view')
  findAllRates(@Request() req: unknown, @Query() query: RateQueryDto) {
    return this.service.findAllRates(requireTenantId(req), query);
  }

  @Post('rates')
  @Roles(...UTILITIES_RATE_ROLES)
  @Permissions('utility_rates.create')
  createRate(@Request() req: unknown, @Body() dto: CreateRateDto) {
    return this.service.createRate(requireTenantId(req), dto);
  }

  @Post('rates/:id/supersede')
  @Roles(...UTILITIES_RATE_ROLES)
  @Permissions('utility_rates.update')
  supersedeRate(
    @Request() req: unknown,
    @Param('id') id: string,
    @Body() dto: SupersedeRateDto,
  ) {
    return this.service.supersedeRate(
      requireTenantId(req),
      id,
      dto.ratePerUnit,
      dto.validTo,
    );
  }

  // --------------------------------------------------------------- charges

  @Get('charges')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_charges.view')
  findAllCharges(@Request() req: unknown, @Query() query: ChargeQueryDto) {
    return this.service.findAllCharges(requireTenantId(req), query);
  }

  /**
   * Price a period without asking for money.
   *
   * A separate action from `bill-and-invoice` because they fail independently: a
   * charge can be priced and reviewed before an invoice exists, which is also what
   * makes a wrong figure correctable without raising a credit note.
   */
  @Post('charges/bill')
  @Roles(...UTILITIES_BILL_ROLES)
  @Permissions('utility_charges.bill')
  billPeriod(@Request() req: unknown, @Body() dto: BillPeriodDto) {
    return this.service.billPeriod(requireTenantId(req), dto, getUserId(req));
  }

  /** The acceptance criterion: a reading in, a correctly-calculated invoice out. */
  @Post('charges/bill-and-invoice')
  @Roles(...UTILITIES_BILL_ROLES)
  @Permissions('utility_charges.bill')
  billAndInvoice(@Request() req: unknown, @Body() dto: BillPeriodDto) {
    return this.service.billAndInvoice(
      requireTenantId(req),
      dto,
      getUserId(req),
    );
  }

  @Get('charges/export')
  @Roles(...UTILITIES_VIEW_ROLES)
  @Permissions('utility_charges.view')
  @Header('Content-Type', 'text/csv')
  async exportCharges(
    @Request() req: unknown,
    @Query() query: ChargeQueryDto,
    @Res() res: Response,
  ) {
    res.send(await this.service.chargesCsv(requireTenantId(req), query));
  }

  @Post('charges/:id/void')
  @Roles(...UTILITIES_VOID_ROLES)
  @Permissions('utility_charges.void')
  voidCharge(
    @Request() req: unknown,
    @Param('id') id: string,
    @Body() dto: VoidChargeDto,
  ) {
    return this.service.voidCharge(
      requireTenantId(req),
      id,
      dto,
      getUserId(req),
    );
  }
}
