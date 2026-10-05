import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseRequestApprovalsService } from './purchase-request-approvals.service';
import {
  CancelPurchaseRequestDto,
  CreatePurchaseRequestDto,
  RejectPurchaseRequestDto,
  ReplacePurchaseRequestLinesDto,
  SubmitPurchaseRequestDto,
  UpdatePurchaseRequestDto,
} from './dto/procurement.dto';

/** Who may run the purchase cycle, as opposed to read about it. */
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
];

/**
 * Module 10 — purchase requests.
 *
 * Reads need `purchase_requests.view`; everything that changes one needs
 * `purchase_requests.update` and a procurement role. Status moves through the
 * action endpoints at the bottom — never through `PATCH /:id`, whose DTO has no
 * status field — so every transition runs the state machine in
 * `procurement-lifecycle.ts` and is audited with an actor.
 *
 * DTOs are imported as values, not types: `import type` erases the class from
 * Nest's `design:paramtypes`, the validation pipe is skipped and the raw body
 * reaches the service. That bug was found in Module 5 (master doc issue 52).
 */
@UseGuards(JwtAuthGuard)
@Controller('procurement/purchase-requests')
export class PurchaseRequestsController {
  constructor(
    private readonly requests: PurchaseRequestsService,
    private readonly approvals: PurchaseRequestApprovalsService,
  ) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_requests.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('requestedById') requestedById?: string,
    @Query('department') department?: string,
    @Query('open') open?: string,
    @Query('search') search?: string,
  ) {
    return this.requests.findAll(getTenantId(req), {
      status,
      category,
      priority,
      requestedById,
      department,
      open: open === 'true' ? true : undefined,
      search,
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_requests.view')
  stats(@Request() req) {
    return this.requests.stats(getTenantId(req));
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_requests.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="purchase-requests.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('open') open?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.requests.exportCsv(getTenantId(req), {
      status,
      category,
      open: open === 'true' ? true : undefined,
      search,
    });
    res.send(csv);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('purchase_requests.view')
  async findOne(@Param('id') id: string, @Request() req) {
    const organizationId = getTenantId(req);
    const [request, approval] = await Promise.all([
      this.requests.findOne(id, organizationId),
      this.approvals.trail(id, organizationId).catch(() => null),
    ]);

    return { ...request, approval };
  }

  @Post()
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.create')
  create(@Body() dto: CreatePurchaseRequestDto, @Request() req) {
    return this.requests.create(dto, requireTenantId(req), getUserId(req));
  }

  @Patch(':id')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseRequestDto,
    @Request() req,
  ) {
    return this.requests.update(id, dto, requireTenantId(req));
  }

  @Put(':id/lines')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  replaceLines(
    @Param('id') id: string,
    @Body() dto: ReplacePurchaseRequestLinesDto,
    @Request() req,
  ) {
    return this.requests.replaceLines(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.requests.remove(id, requireTenantId(req));
  }

  // ------------------------------------------------------------ transitions

  @Post(':id/submit')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitPurchaseRequestDto,
    @Request() req,
  ) {
    return this.requests.submit(id, dto, requireTenantId(req), getUserId(req));
  }

  /**
   * Approve directly.
   *
   * The no-policy path. Where the organization has configured a
   * PURCHASE_REQUEST policy the request goes through `request-approval` instead,
   * which routes through Module 18's engine and only reaches APPROVED once the
   * last level has agreed.
   */
  @Post(':id/approve')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  approve(@Param('id') id: string, @Request() req) {
    return this.requests.approve(id, requireTenantId(req), getUserId(req));
  }

  /**
   * Route a submitted request through the approval engine.
   *
   * With no policy configured the engine auto-approves and the request lands in
   * APPROVED straight away. With a policy it waits for the last approver — and
   * stays PENDING until then, which is what the detail screen shows.
   */
  @Post(':id/request-approval')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  async requestApproval(@Param('id') id: string, @Request() req) {
    const organizationId = requireTenantId(req);
    const approval = await this.approvals.request(
      id,
      organizationId,
      getUserId(req),
    );
    // Read *after* the decision: with no policy configured the handler has
    // already moved the request to APPROVED by this point, and a response that
    // still said PENDING would send the caller looking for an approval that has
    // already happened.
    const request = await this.requests.findOne(id, organizationId);

    return { approval, request };
  }

  @Post(':id/reject')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectPurchaseRequestDto,
    @Request() req,
  ) {
    return this.requests.reject(id, dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/cancel')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPurchaseRequestDto,
    @Request() req,
  ) {
    return this.requests.cancel(id, dto, requireTenantId(req), getUserId(req));
  }

  @Post(':id/reopen')
  @Roles(...PROCUREMENT_ROLES)
  @Permissions('purchase_requests.update')
  reopen(@Param('id') id: string, @Request() req) {
    return this.requests.reopen(id, requireTenantId(req), getUserId(req));
  }
}
