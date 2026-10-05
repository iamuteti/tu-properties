import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { MaintenanceNotificationsService } from './maintenance-notifications.service';
import { PmSchedulesController } from './pm-schedules.controller';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';
import { WorkOrderApprovalsService } from './work-order-approvals.service';
import {
  PortalMaintenanceController,
  WorkOrdersController,
} from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

/**
 * Module 9 — Maintenance.
 *
 * Exports `WorkOrdersService` because the resident request queue delegates to it:
 * approving a `MAINTENANT` request has to produce a real work order rather than
 * the `RECORDED_ONLY` note Module 5 left behind. The dependency points one way —
 * maintenance knows nothing about tenant requests.
 *
 * Imports `WorkflowModule` for the same reason refunds does: the approval gate on
 * an inspected work order is the engine's job, and the engine never imports the
 * module it approves.
 *
 * Imports `InventoryModule` (Module 11) so a job can consume stock from the
 * store. The movement is written by *inventory*, which owns the balance and the
 * rules about what may be issued; this module owns the work order and passes the
 * reference. Same one-directional shape as the tenant-request delegation above.
 */
@Module({
  imports: [AuditModule, NotificationsModule, WorkflowModule, InventoryModule],
  controllers: [
    WorkOrdersController,
    AssetsController,
    PmSchedulesController,
    PortalMaintenanceController,
  ],
  providers: [
    WorkOrdersService,
    WorkOrderApprovalsService,
    AssetsService,
    PreventiveMaintenanceService,
    MaintenanceNotificationsService,
  ],
  exports: [WorkOrdersService, AssetsService, PreventiveMaintenanceService],
})
export class MaintenanceModule {}
