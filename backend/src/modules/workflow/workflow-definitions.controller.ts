import {
  Body,
  Controller,
  Delete,
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
import { requireTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDto,
} from './dto/workflow.dto';

/**
 * Approval policy configuration (Module 18).
 *
 * Reading a definition is `workflows.view`; changing one is `workflows.manage`,
 * which lands with administrators rather than with everybody who can approve —
 * deciding under a policy and rewriting the policy are different powers.
 */
@UseGuards(JwtAuthGuard)
@Controller('workflows/definitions')
export class WorkflowDefinitionsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @Permissions('workflows.view')
  list(@Request() req, @Query('entityType') entityType?: string) {
    return this.workflows.listDefinitions(requireTenantId(req), entityType);
  }

  /** Users and roles the editor may address a level to. */
  @Get('approver-options')
  @Permissions('workflows.view')
  approverOptions(@Request() req) {
    return this.workflows.approverOptions(requireTenantId(req));
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Permissions('workflows.create')
  async create(@Body() dto: CreateWorkflowDefinitionDto, @Request() req) {
    const actor = await this.workflows.actorFrom(req);
    return this.workflows.createDefinition(
      dto,
      requireTenantId(req),
      actor,
      req,
    );
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Permissions('workflows.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDefinitionDto,
    @Request() req,
  ) {
    const actor = await this.workflows.actorFrom(req);
    return this.workflows.updateDefinition(
      id,
      dto,
      requireTenantId(req),
      actor,
      req,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Permissions('workflows.delete')
  async remove(@Param('id') id: string, @Request() req) {
    const actor = await this.workflows.actorFrom(req);
    return this.workflows.removeDefinition(
      id,
      requireTenantId(req),
      actor,
      req,
    );
  }
}
