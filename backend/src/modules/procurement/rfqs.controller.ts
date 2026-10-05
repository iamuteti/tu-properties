import {
  Body,
  Controller,
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
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { RfqsService } from './rfqs.service';
import {
  AwardQuoteDto,
  CancelRfqDto,
  CreateRfqDto,
  DeclineInvitationDto,
  InviteSuppliersDto,
  RecordQuoteDto,
  SetQuoteStatusDto,
} from './dto/procurement.dto';

const PROCUREMENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.ACCOUNTANT,
  UserRole.PROPERTY_MANAGER,
];

const VIEW_ROLES = [
  ...PROCUREMENT_ROLES,
  UserRole.LEASING_OFFICER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
];

/**
 * Module 10 — RFQs and quotations.
 *
 * `GET /:id/comparison` is the endpoint the module exists for: the doc's
 * acceptance criterion is "compared across suppliers", and the arithmetic is
 * done on the server (`procurement-comparison.ts`) so the list, the detail
 * header and the comparison cannot disagree about who was invited or which
 * quote wins.
 *
 * The comparison is also embedded in the list and detail responses, so the
 * common case — "who is cheapest on this round?" — needs one request.
 */
@UseGuards(JwtAuthGuard)
@Controller('procurement/rfqs')
export class RfqsController {
  constructor(private readonly rfqs: RfqsService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('rfqs.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('purchaseRequestId') purchaseRequestId?: string,
    @Query('overdue') overdue?: string,
    @Query('open') open?: string,
    @Query('search') search?: string,
  ) {
    return this.rfqs.findAll(getTenantId(req), {
      status,
      supplierId,
      purchaseRequestId,
      overdue: overdue === 'true' ? true : undefined,
      open: open === 'true' ? true : undefined,
      search,
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('rfqs.view')
  stats(@Request() req) {
    return this.rfqs.stats(getTenantId(req));
  }

  /**
   * The rounds one supplier was invited to.
   *
   * Mounted before `:id` on purpose — Nest matches routes in declaration order,
   * so `/supplier/:supplierId` has to be declared above `/rfqs/:id`.
   */
  @Get('supplier/:supplierId')
  @Roles(...VIEW_ROLES)
  @Permissions('rfqs.view')
  invitations(@Param('supplierId') supplierId: string, @Request() req) {
    return this.rfqs.invitationsForSupplier(supplierId, requireTenantId(req));
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('rfqs.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.rfqs.findOne(id, getTenantId(req));
  }

  /** The bid comparison, as data. */
  @Get(':id/comparison')
  @Roles(...VIEW_ROLES)
  @Permissions('rfqs.view')
  comparison(@Param('id') id: string, @Request() req) {
    return this.rfqs.comparison(id, getTenantId(req));
  }

  @Post()
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.create')
  create(@Body() dto: CreateRfqDto, @Request() req) {
    return this.rfqs.create(dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/invite')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  invite(
    @Param('id') id: string,
    @Body() dto: InviteSuppliersDto,
    @Request() req,
  ) {
    return this.rfqs.inviteSuppliers(id, dto, requireTenantId(req));
  }

  /**
   * Record a supplier's quotation.
   *
   * Called by staff on behalf of a supplier (a phone quote, an emailed PDF). A
   * public supplier portal is the natural follow-up; the shape of this endpoint
   * is already the one such a portal would need, since it takes only the RFQ id
   * and the supplier id and derives everything else from the round.
   */
  @Post(':id/quotes')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  recordQuote(
    @Param('id') id: string,
    @Body() dto: RecordQuoteDto,
    @Request() req,
  ) {
    return this.rfqs.recordQuote(id, dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/invitations/:supplierId/decline')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  decline(
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
    @Body() dto: DeclineInvitationDto,
    @Request() req,
  ) {
    return this.rfqs.declineInvitation(
      id,
      supplierId,
      dto,
      requireTenantId(req),
    );
  }

  @Post(':id/issue')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  issue(@Param('id') id: string, @Request() req) {
    return this.rfqs.issue(id, requireTenantId(req));
  }

  /**
   * Close the round without awarding it. Not a cancellation: no reason is
   * recorded, because no supplier is being told anything.
   */
  @Post(':id/close')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  close(@Param('id') id: string, @Request() req) {
    return this.rfqs.close(id, requireTenantId(req));
  }

  /** Reopen a closed round — the only way back from CLOSED. */
  @Post(':id/reopen')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  reopen(@Param('id') id: string, @Request() req) {
    return this.rfqs.reopen(id, requireTenantId(req));
  }

  @Post(':id/award')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  award(@Param('id') id: string, @Body() dto: AwardQuoteDto, @Request() req) {
    return this.rfqs.award(id, dto, requireTenantId(req));
  }

  @Post(':id/cancel')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  cancel(@Param('id') id: string, @Body() dto: CancelRfqDto, @Request() req) {
    return this.rfqs.cancel(id, dto, requireTenantId(req));
  }

  /** Shortlist or reject a quotation — a filter on the comparison, not a decision. */
  @Patch(':id/quotes/:quoteId/status')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('rfqs.update')
  setQuoteStatus(
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
    @Body() dto: SetQuoteStatusDto,
    @Request() req,
  ) {
    return this.rfqs.setQuoteStatus(
      id,
      quoteId,
      dto.status,
      requireTenantId(req),
    );
  }
}
