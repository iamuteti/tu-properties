import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { RentalAgreementsModule } from '@/modules/leases/rental-agreements.module';
import { MoveoutsModule } from '@/modules/moveouts/moveouts.module';
import {
  PortalRequestsController,
  TenantRequestsController,
} from './tenant-requests.controller';
import { TenantRequestsService } from './tenant-requests.service';

/**
 * Resident requests.
 *
 * Imports the leasing and move-out modules because **approval delegates to
 * them** — a request a resident raised and one a manager made in the dashboard
 * go through the same services, gates and audit trail.
 */
@Module({
  imports: [RentalAgreementsModule, MoveoutsModule, AuditModule],
  controllers: [TenantRequestsController, PortalRequestsController],
  providers: [TenantRequestsService],
  exports: [TenantRequestsService],
})
export class TenantRequestsModule {}