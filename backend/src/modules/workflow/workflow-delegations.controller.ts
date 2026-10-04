import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId } from '@/common/utils';
import { WorkflowsService } from './workflows.service';
import { CreateDelegationDto } from './dto/workflow.dto';

/**
 * Approval delegation (Module 18): "while I am away, this colleague decides what
 * is waiting on me".
 *
 * Self-service by design — no permission beyond being signed in, because the
 * only person who can sensibly delegate is the person whose approvals they are.
 * A delegation can only ever widen *their own* authority to a named colleague in
 * the same organization; it never grants a role or a level.
 */
@UseGuards(JwtAuthGuard)
@Controller('workflows/delegations')
export class WorkflowDelegationsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@Request() req) {
    const organizationId = requireTenantId(req);
    const userId = req?.user?.userId ?? req?.user?.id;
    return this.workflows.listDelegations(organizationId, userId);
  }

  @Post()
  create(@Body() dto: CreateDelegationDto, @Request() req) {
    const organizationId = requireTenantId(req);
    const fromUserId = req?.user?.userId ?? req?.user?.id;
    return this.workflows.createDelegation({
      organizationId,
      fromUserId,
      toUserId: dto.toUserId,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      reason: dto.reason,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const organizationId = requireTenantId(req);
    const userId = req?.user?.userId ?? req?.user?.id;
    return this.workflows.removeDelegation(id, organizationId, userId);
  }
}
