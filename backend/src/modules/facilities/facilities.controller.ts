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
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import {
  FACILITIES_BOOK_ROLES,
  FACILITIES_DECIDE_ROLES,
  FACILITIES_VIEW_ROLES,
} from './facilities-roles';
import { FacilitiesService } from './facilities.service';
import {
  BookingDecisionDto,
  BulkBookingActionDto,
  CreateBookingDto,
  CreateFacilityDto,
  UpdateBookingDto,
  UpdateFacilityDto,
} from './dto/facilities.dto';

/**
 * Module 13 — facilities and their bookings.
 *
 * Three permission tiers across two resources, and the boundaries are the design:
 *
 * - `facilities.view` reads the register and the diary. Broad.
 * - `facilities.create`/`.update` registers a facility and closes one.
 * - `facility_bookings.create` reserves a slot, which is *wider* than deciding —
 *   a leasing officer showing a prospect around should not need an administrator.
 * - `facility_bookings.decide` approves, declines, cancels and moves bookings, and
 *   is **narrower**: whoever books on a resident's behalf must not be the person
 *   who signs it off. `facility_bookings.delete` is narrower still and is held by
 *   nobody in `SYSTEM_ROLES` — deleting a booking is refused by the service with an
 *   explanation rather than exposed as a button that always 403s.
 *
 * Every state change is a named `@Post(':id/<verb>')` route. There is no
 * `PATCH .../status` on either resource, which is what makes
 * `booking-lifecycle.ts` the only way a booking moves.
 *
 * ── A trap this controller sits in ────────────────────────────────────────
 * `@Get(':id')` below is a one-segment wildcard on the `facilities` prefix, so it
 * **also matches `/facilities/bookings`, `/facilities/visitors` and
 * `/facilities/access-cards`** — the three sibling resources. Whichever route Nest
 * registered first wins, so this controller being first in `facilities.module.ts`'s
 * `controllers` array made all three of them 404 with "Facility not found", and the
 * bookings list looked like it had a broken filter rather than a broken route.
 *
 * The fix is ordering: the three sub-resource controllers are registered **before**
 * this one, so their static segments are matched first and `:id` only ever sees a
 * real facility id. That is a real precondition, not a preference, so it is stated
 * here and in `facilities.module.ts`, and the behaviour is verified live rather than
 * assumed. **Reordering the `controllers` array silently reintroduces the bug** — if
 * these three prefixes ever grow a second level (e.g.
 * `/facilities/visitors/:id/check-in` is fine, but a top-level `/facilities/stats`
 * would not be), give them their own first segment instead.
 */
@UseGuards(JwtAuthGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  // ============================================================== facilities

  @Get()
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facilities.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('propertyId') propertyId?: string,
    @Query('kind') kind?: string,
    @Query('isBookable') isBookable?: string,
    @Query('openNow') openNow?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.facilities.findAll(getTenantId(req), {
      search,
      propertyId,
      kind,
      isBookable,
      openNow,
      includeInactive,
    });
  }

  @Get('export')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facilities.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="facilities.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.facilities.facilitiesExportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facilities.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.facilities.findOne(id, getTenantId(req));
  }

  /**
   * The diary for one facility.
   *
   * Read-only, and it answers the question a list of bookings cannot: *when is it
   * free?* That is a question about empty slots.
   */
  @Get(':id/availability')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facilities.view')
  availability(
    @Param('id') id: string,
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
  ) {
    return this.facilities.availability(
      id,
      getTenantId(req),
      from,
      to,
      days ? Number(days) : undefined,
    );
  }

  @Post()
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facilities.create')
  create(
    @Body() dto: CreateFacilityDto,
    @Query('propertyId') propertyId: string,
    @Request() req,
  ) {
    // The property comes from the query string rather than the body so that the DTO
    // has no field that could be confused with the organization. It is still
    // tenant-verified in the service.
    if (!propertyId) {
      throw new ConflictException(
        'A facility has to belong to a property. Pass ?propertyId= when creating one.',
      );
    }
    return this.facilities.create(dto, propertyId, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facilities.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFacilityDto,
    @Request() req,
  ) {
    return this.facilities.update(id, dto, requireTenantId(req));
  }

  /**
   * Close a facility for a period.
   *
   * Its own route rather than a `POST /:id/closures` under a different controller,
   * because it is the action a facility owner reaches for and it reads better at
   * `/facilities/:id/close`. Declining when live bookings fall inside is the same
   * guard Module 6 uses for overlapping owner statements.
   */
  @Post(':id/close')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_blackouts.create')
  close(
    @Param('id') id: string,
    @Body() body: { reason: string; startsAt: string; endsAt: string },
    @Request() req,
  ) {
    return this.facilities.createBlackout(
      { facilityId: id, ...body },
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Get(':id/blackouts')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facility_blackouts.view')
  async blackouts(@Param('id') id: string, @Request() req) {
    const facility = await this.facilities.findOne(id, getTenantId(req));
    return { facilityId: id, blackouts: facility.blackouts };
  }

  @Delete('blackouts/:blackoutId')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_blackouts.update')
  removeBlackout(@Param('blackoutId') blackoutId: string, @Request() req) {
    return this.facilities.deleteBlackout(blackoutId, getTenantId(req));
  }
}

/**
 * Module 13 — bookings.
 *
 * A **separate controller on a separate route** rather than more routes on
 * `FacilitiesController`, for the reason the procurement client has four objects:
 * a facility and a booking are two documents with two different owners, and merging
 * them would make "which permission does this button need" unanswerable from the
 * client.
 *
 * `facility_bookings.decide` is the one to look at. It is granted to
 * `PROPERTY_MANAGER` and `MAINTENANCE_MANAGER` but **not** to
 * `LEASING_OFFICER`, who can book — so the account that writes a request is kept
 * out of the account that grants it. The row-level "nobody approves their own
 * booking" rule in `booking-lifecycle.ts` cannot help when both are the same login,
 * which is why the split exists in the permission as well as the state machine.
 */
@UseGuards(JwtAuthGuard)
@Controller('facilities/bookings')
export class FacilityBookingsController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get()
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facility_bookings.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('facilityId') facilityId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('status') status?: string,
    @Query('when') when?: string,
    @Query('tenantId') tenantId?: string,
    @Query('contactId') contactId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.facilities.bookings(getTenantId(req), {
      search,
      facilityId,
      propertyId,
      status,
      when,
      tenantId,
      contactId,
      from,
      to,
    });
  }

  @Get('export')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facility_bookings.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="facility-bookings.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('facilityId') facilityId?: string,
    @Query('status') status?: string,
    @Query('when') when?: string,
  ) {
    res.send(
      await this.facilities.bookingsExportCsv(getTenantId(req), {
        facilityId,
        status,
        when,
      }),
    );
  }

  @Get(':id')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facility_bookings.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.facilities.booking(id, getTenantId(req));
  }

  /**
   * Would this booking be accepted?
   *
   * Read-only and under `facility_bookings.view` rather than `create`, because a
   * person filling in a booking form has to be told the clubhouse shuts at 22:00
   * while they are still looking at the time picker. It writes nothing and runs the
   * same `checkSlot` the create path uses, so it cannot answer differently from what
   * the server will then do.
   */
  @Post('preview')
  @Roles(...FACILITIES_VIEW_ROLES)
  @Permissions('facility_bookings.view')
  preview(
    @Body() body: { facilityId: string; startsAt: string; endsAt: string },
    @Request() req,
  ) {
    return this.facilities.previewBooking(
      body.facilityId,
      getTenantId(req),
      body.startsAt,
      body.endsAt,
    );
  }

  @Post()
  @Roles(...FACILITIES_BOOK_ROLES)
  @Permissions('facility_bookings.create')
  create(@Body() dto: CreateBookingDto, @Request() req) {
    return this.facilities.createBooking(
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Patch(':id')
  @Roles(...FACILITIES_BOOK_ROLES)
  @Permissions('facility_bookings.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
    @Request() req,
  ) {
    return this.facilities.updateBooking(id, dto, requireTenantId(req));
  }

  /**
   * Move a booking to a different slot.
   *
   * Its own action rather than two fields on the update DTO, because this is the one
   * edit that re-enters the overlap check and re-derives the times against the
   * facility's grid.
   */
  @Post(':id/reschedule')
  @Roles(...FACILITIES_BOOK_ROLES)
  @Permissions('facility_bookings.update')
  reschedule(
    @Param('id') id: string,
    @Body() body: { startsAt: string; endsAt: string },
    @Request() req,
  ) {
    return this.facilities.reschedule(
      id,
      body.startsAt,
      body.endsAt,
      requireTenantId(req),
    );
  }

  @Post(':id/approve')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  approve(
    @Param('id') id: string,
    @Body() dto: BookingDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decide(
      id,
      'APPROVE',
      dto.note,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/reject')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  reject(
    @Param('id') id: string,
    @Body() dto: BookingDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decide(
      id,
      'REJECT',
      dto.note,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/cancel')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  cancel(
    @Param('id') id: string,
    @Body() dto: BookingDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decide(
      id,
      'CANCEL',
      dto.note,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/reactivate')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  reactivate(@Param('id') id: string, @Request() req) {
    return this.facilities.decide(
      id,
      'REACTIVATE',
      undefined,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/no-show')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  noShow(@Param('id') id: string, @Request() req) {
    return this.facilities.decide(
      id,
      'MARK_NO_SHOW',
      undefined,
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Approve, decline or cancel a list of bookings, reported per row.
   *
   * Per-row outcomes rather than one transaction: a bulk action that rolls all
   * forty rows back because two have already passed is far less useful than one that
   * does the thirty-eight it can and says which two it could not.
   */
  @Post('bulk')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.decide')
  bulk(@Body() dto: BulkBookingActionDto, @Request() req) {
    return this.facilities.bulkDecide(
      dto.ids,
      dto.action,
      dto.note,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete(':id')
  @Roles(...FACILITIES_DECIDE_ROLES)
  @Permissions('facility_bookings.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.facilities.deleteBooking(id, getTenantId(req));
  }
}
