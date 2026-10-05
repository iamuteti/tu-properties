import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { RentalAgreementsModule } from '@/modules/leases/rental-agreements.module';
import { MoveoutsModule } from '@/modules/moveouts/moveouts.module';
import { MaintenanceModule } from '@/modules/maintenance/maintenance.module';
import {
  PortalRequestsController,
  TenantRequestsController,
} from './tenant-requests.controller';
import { TenantRequestsService } from './tenant-requests.service';

/**
 * Resident requests.
 *
 * Imports the leasing, move-out and maintenance modules because **approval
 * delegates to them** — a request a resident raised and one a manager made in
 * the dashboard go through the same services, gates and audit trail. Module 9
 * gave `MAINTENANT` its delegate; `PAYMENT_PLAN` and `LEASE_AMENDMENT` are
 * still recorded as `RECORDED_ONLY`.
 */
@Module({
  imports: [
    RentalAgreementsModule,
    MoveoutsModule,
    MaintenanceModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [TenantRequestsController, PortalRequestsController],
  providers: [TenantRequestsService],
  exports: [TenantRequestsService],
})
export class TenantRequestsModule {}
