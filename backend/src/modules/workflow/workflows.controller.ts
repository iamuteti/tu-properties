import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId, requireTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { WorkflowsService } from './workflows.service';
import {
  CancelWorkflowDto,
  DecideWorkflowDto,
  WorkflowInstanceQueryDto,
} from './dto/workflow.dto';

/**
 * The approvals inbox and the decision endpoints (Module 18).
 *
 * There is deliberately **no** generic "start a workflow" endpoint. Starting a
 * request belongs to the module that owns the entity, because the caller
 * supplies the `context` its own approval conditions are evaluated against —
 * a public start endpoint would let anybody forge the threshold their approval
 * depends on. Other modules call `WorkflowsService.start` server-side.
 *
 * Reading the queue needs no special permission: seeing what is waiting on you
 * is implied by having an account. Deciding needs `workflows.decide`, which the
 * engine checks again per level (you may be allowed to decide *a* request and
 * not this one).
 */
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('inbox')
  async inbox(@Request() req) {
    const actor = await this.workflows.actorFrom(req);
    const organizationId = actor.organizationId ?? requireTenantId(req);
    return this.workflows.inbox(actor, organizationId);
  }

  @Get('instances')
  @Permissions('workflows.view')
  list(@Request() req, @Query() query: WorkflowInstanceQueryDto) {
    return this.workflows.listInstances(requireTenantId(req), query);
  }

  @Get('instances/:id')
  @Permissions('workflows.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.workflows.findInstance(id, getTenantId(req));
  }

  @Get('entity/:entityType/:entityId')
  @Permissions('workflows.view')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Request() req,
  ) {
    return this.workflows.findForEntity(
      entityType.toUpperCase(),
      entityId,
      getTenantId(req),
    );
  }

  /**
   * Record an approval decision.
   *
   * The role list has to include everybody an approval policy can name. It did
   * not: `MAINTENANCE_MANAGER`, `TECHNICIAN` and `PROCUREMENT_OFFICER` were
   * added to `UserRole` by Modules 9 and 10 (master doc issues 51/54/67) but
   * never added here, so a policy naming one of them as the approver produced
   * an approval nobody could ever act on — the same class of hole as a seeded
   * role with no enum value.
   *
   * Widening the *role* list is not the same as widening who may decide: the
   * engine still resolves the step's approvers and still refuses anybody who is
   * not one of them, including the person who started the request.
   */
  @Post('instances/:id/decision')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.PROPERTY_MANAGER,
    UserRole.LEASING_OFFICER,
    UserRole.MAINTENANCE_MANAGER,
    UserRole.PROCUREMENT_OFFICER,
    UserRole.TECHNICIAN,
  )
  @Permissions('workflows.update')
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideWorkflowDto,
    @Request() req,
  ) {
    const actor = await this.workflows.actorFrom(req);
    return this.workflows.act({
      instanceId: id,
      organizationId: getTenantId(req),
      decision: dto.decision,
      comment: dto.comment,
      actor,
      request: req,
    });
  }

  @Post('instances/:id/cancel')
  @Permissions('workflows.update')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelWorkflowDto,
    @Request() req,
  ) {
    const actor = await this.workflows.actorFrom(req);
    return this.workflows.cancel({
      instanceId: id,
      organizationId: getTenantId(req),
      reason: dto.reason,
      actor,
      request: req,
    });
  }
}
