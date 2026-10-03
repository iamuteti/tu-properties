import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module';
import {
  LeaseTemplatesController,
  RentalAgreementsController,
} from './rental-agreements.controller';
import { LeaseTemplatesService } from './lease-templates.service';
import { RentalAgreementsService } from './rental-agreements.service';

/**
 * Module 5 — Lease & Tenancy.
 *
 * `UnitsModule` is imported because every lifecycle action has to leave the
 * unit's occupancy status in step (activate → occupied, terminate/expire →
 * vacant), which is the acceptance criterion for this module.
 */
@Module({
  imports: [UnitsModule],
  controllers: [RentalAgreementsController, LeaseTemplatesController],
  providers: [RentalAgreementsService, LeaseTemplatesService],
  exports: [RentalAgreementsService, LeaseTemplatesService],
})
export class RentalAgreementsModule {}