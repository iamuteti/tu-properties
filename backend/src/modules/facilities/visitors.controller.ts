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
import { FACILITIES_DOOR_ROLES } from './facilities-roles';
import { FacilitiesService } from './facilities.service';
import { VisitorsService } from './visitors.service';
import {
  AccessCardDecisionDto,
  BarVisitorDto,
  CreateAccessCardDto,
  CreateVisitorDto,
  CreateVisitDto,
  UnbarVisitorDto,
  UpdateAccessCardDto,
  UpdateVisitorDto,
} from './dto/facilities.dto';

/**
 * Module 13 — the gate: visitors and their visits.
 *
 * On a single, deliberately narrow role list (`FACILITIES_DOOR_ROLES`) — no
 * leasing officer, no accountant. The people in the visitor log did not choose to be
 * recorded and have no other relationship with the organization, which makes this
 * the one place in the product where a narrow list is more defensible than a broad
 * one. The roles are a guess at a job, though, and a deployment that staffs its own
 * gate should revisit them first.
 *
 * Barring somebody is a separate route rather than a `PATCH { isBlacklisted }`
 * because it needs a reason, it has to be undone deliberately, and it should be one
 * audited action rather than a checkbox that a PATCH can flip as an afterthought.
 */
@UseGuards(JwtAuthGuard)
@Controller('facilities/visitors')
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Get()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('isBlacklisted') isBlacklisted?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.visitors.findAll(getTenantId(req), {
      search,
      isBlacklisted,
      includeInactive,
    });
  }

  @Get('export')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="visitors.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.visitors.exportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.visitors.findOne(id, getTenantId(req));
  }

  @Post()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.create')
  create(@Body() dto: CreateVisitorDto, @Request() req) {
    return this.visitors.create(dto, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVisitorDto,
    @Request() req,
  ) {
    return this.visitors.update(id, dto, requireTenantId(req));
  }

  /**
   * Bar somebody from the site.
   *
   * Requires a reason in the body, refuses while they are on site, and is refused
   * outright if they are already barred. All three are enforced by the service so
   * they hold however the endpoint is called.
   */
  @Post(':id/bar')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.update')
  bar(@Param('id') id: string, @Body() dto: BarVisitorDto, @Request() req) {
    return this.visitors.bar(id, dto.reason, requireTenantId(req));
  }

  /**
   * Lift a bar. Keeps the original reason on the record — a history with a blank
   * "why" in it cannot answer a question about whether they have been in trouble
   * before.
   */
  @Post(':id/unbar')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.update')
  unbar(@Param('id') id: string, @Body() dto: UnbarVisitorDto, @Request() req) {
    void dto;
    return this.visitors.unbar(id, requireTenantId(req));
  }

  /**
   * There is deliberately no delete.
   *
   * Rather than a 405 with no explanation, this says why: the visit log is the
   * record of who came into the building, and deleting the visitor deletes it. The
   * way out is `PATCH /:id` with `isActive: false`.
   */
  @Delete(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.delete')
  remove(): never {
    throw new ConflictException(
      'Visitors are never deleted — the visit log is the record of who came into the building. Mark them inactive instead, which hides them from the picker while keeping the visits.',
    );
  }
}

/**
 * Module 13 — the visit log itself, at its own route.
 *
 * Separate from the visitor directory because they are different documents with
 * different rates of change: a visitor row changes when somebody is added to the
 * list, a visit changes every time somebody arrives. Putting them under one prefix
 * would make `/visitors/visits` read as a sub-resource of a person, which it is
 * not — the same mistake master doc issue 48 records for the duplicate lease lists.
 */
@UseGuards(JwtAuthGuard)
@Controller('facilities/visits')
export class VisitorVisitsController {
  constructor(private readonly visitors: VisitorsService) {}

  /**
   * The gate book.
   *
   * `state` is a **derived** filter, not a stored one: `onsite`, `expected`,
   * `overdue` and `history` are comparisons between two timestamps and the current
   * time, so there is nothing to read from a column and nothing to keep in step.
   */
  @Get()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('visitorId') visitorId?: string,
    @Query('propertyId') propertyId?: string,
    @Query('state') state?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.visitors.visits(getTenantId(req), {
      search,
      visitorId,
      propertyId,
      state,
      from,
      to,
    });
  }

  @Get('export')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="visitor-visits.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.visitors.visitsExportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.visitors.visit(id, getTenantId(req));
  }

  /**
   * Log somebody arriving.
   *
   * A **barred visitor is refused outright** rather than accepted with a warning:
   * the visitor being a row rather than a name on a book is the whole point of this
   * module, and a refusal the caller can override anyway just means the paper and
   * the system disagree.
   */
  @Post()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.create')
  create(@Body() dto: CreateVisitDto, @Request() req) {
    return this.visitors.createVisit(dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/check-in')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.update')
  checkIn(@Param('id') id: string, @Request() req) {
    return this.visitors.checkInOut(id, 'check-in', requireTenantId(req));
  }

  @Post(':id/check-out')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.update')
  checkOut(@Param('id') id: string, @Request() req) {
    return this.visitors.checkInOut(id, 'check-out', requireTenantId(req));
  }

  /**
   * Record that somebody was expected before they arrive.
   *
   * Distinct from `check-in` because "was this expected" and "did they arrive" are
   * different questions: a contractor booked for Thursday who never turns up has to
   * be visible as a missed appointment, which is only possible if the expectation is
   * recorded before the arrival.
   */
  @Post(':id/pre-approve')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('visitors.create')
  preApprove(@Param('id') id: string, @Request() req) {
    return this.visitors.preApprove(id, requireTenantId(req), getUserId(req));
  }
}

/**
 * Module 13 — access cards.
 *
 * The most sensitive screen in the module, and the one with the fewest reasons to
 * be generous. Three decisions:
 *
 * - **The whole register is under `access_cards.view`, which is narrower than
 *   `visitors.view`.** Being able to see that a person came to the building is not
 *   the same power as being able to see every fob in it, and only
 *   `FACILITIES_DOOR_ROLES` gets the first.
 * - **There is no `PATCH /:id/status`.** Six named actions, each with its own gate
 *   in `access-card-lifecycle.ts`. `REACTIVATE` in particular must not be reachable
 *   from a lost card — a lost card has been in somebody else's pocket, so its number
 *   is compromised and the way back is a *new* card.
 * - **Deleting a card is refused.** A card that issued access and no longer does so
 *   is `REVOKED` with a reason; deleting the row would make "who could get in last
 *   month" unanswerable.
 */
@UseGuards(JwtAuthGuard)
@Controller('facilities/access-cards')
export class AccessCardsController {
  constructor(private readonly facilities: FacilitiesService) {}

  /**
   * The register.
   *
   * `?status=EXPIRED` filters on the **effective** status, which is why this is a
   * service method and not a `where` clause: it has to find cards whose `expiresAt`
   * has passed even though their column still says ACTIVE, because that is what the
   * gate honours and a filter that disagreed with it would hide live cards.
   */
  @Get()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.view')
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('holder') holder?: string,
    @Query('propertyId') propertyId?: string,
    @Query('unitId') unitId?: string,
    @Query('facilityId') facilityId?: string,
    @Query('expiringSoon') expiringSoon?: string,
  ) {
    return this.facilities.accessCards(getTenantId(req), {
      search,
      type,
      status,
      holder,
      propertyId,
      unitId,
      facilityId,
      expiringSoon,
    });
  }

  @Get('export')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="access-cards.csv"')
  async export(@Res() res: Response, @Request() req) {
    res.send(await this.facilities.accessCardsExportCsv(getTenantId(req)));
  }

  @Get(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.facilities.accessCard(id, getTenantId(req));
  }

  @Post()
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.create')
  create(@Body() dto: CreateAccessCardDto, @Request() req) {
    return this.facilities.createAccessCard(dto, requireTenantId(req));
  }

  /**
   * Holder name and expiry only.
   *
   * Deliberately not a general update: `cardNumber`, `type`, `status` and the "what
   * it opens" columns are all absent because each has an action of its own. Moving a
   * card to a different unit would hand a resident a fob for a door nobody
   * approved, so a card that needs to be somewhere else is revoked and reissued.
   */
  @Patch(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccessCardDto,
    @Request() req,
  ) {
    return this.facilities.updateAccessCard(id, dto, requireTenantId(req));
  }

  @Post(':id/suspend')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  suspend(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'SUSPEND',
      dto,
      requireTenantId(req),
    );
  }

  @Post(':id/reactivate')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  reactivate(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'REACTIVATE',
      dto,
      requireTenantId(req),
    );
  }

  /**
   * Report a card lost.
   *
   * Terminal on purpose: a lost card has been in somebody else's pocket, so its
   * number is treated as compromised and there is no `reactivate` from here. The way
   * back is to issue a new card and record it against this one.
   */
  @Post(':id/mark-lost')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  markLost(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'MARK_LOST',
      dto,
      requireTenantId(req),
    );
  }

  /**
   * End a card early — the contractor whose visa ran out before the card did.
   * Deliberately settable by hand, because nobody is going to be standing at a
   * reader at 23:59 on the expiry date.
   */
  @Post(':id/mark-expired')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  markExpired(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'MARK_EXPIRED',
      dto,
      requireTenantId(req),
    );
  }

  @Post(':id/revoke')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  revoke(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'REVOKE',
      dto,
      requireTenantId(req),
    );
  }

  @Post(':id/record-replacement')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.update')
  recordReplacement(
    @Param('id') id: string,
    @Body() dto: AccessCardDecisionDto,
    @Request() req,
  ) {
    return this.facilities.decideAccessCard(
      id,
      'RECORD_REPLACEMENT',
      dto,
      requireTenantId(req),
    );
  }

  /** A card that issued access is revoked with a reason, never deleted. */
  @Delete(':id')
  @Roles(...FACILITIES_DOOR_ROLES)
  @Permissions('access_cards.delete')
  remove(): never {
    throw new ConflictException(
      'Access cards are never deleted — a card that issued access and no longer does so is revoked with a reason instead. Deleting the row would make "who could get in last month" unanswerable.',
    );
  }
}
