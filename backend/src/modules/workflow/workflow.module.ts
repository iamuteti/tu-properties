import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowDefinitionsController } from './workflow-definitions.controller';
import { WorkflowDelegationsController } from './workflow-delegations.controller';
import { WorkflowEscalationService } from './workflow-escalation.service';
import { WorkflowsService } from './workflows.service';
import { WorkflowHooksRegistry } from './workflow-hooks';

/**
 * Module 18 — Workflow Engine.
 *
 * `WorkflowHooksRegistry` is **exported**: modules that route a process through
 * the engine (Finance for refunds today, Procurement and Maintenance when they
 * land) import this module, register a completion handler and call
 * `WorkflowsService.start`. The dependency only ever points that way — the
 * engine never imports the things it approves.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    WorkflowsController,
    WorkflowDefinitionsController,
    WorkflowDelegationsController,
  ],
  providers: [
    WorkflowsService,
    WorkflowEscalationService,
    WorkflowHooksRegistry,
  ],
  exports: [WorkflowsService, WorkflowHooksRegistry],
})
export class WorkflowModule {}
