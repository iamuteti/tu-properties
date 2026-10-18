import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module';
import {
  AgreementTemplatesController,
  AgreementsController,
} from './agreements.controller';
import { AgreementTemplatesService } from './agreement-templates.service';
import { AgreementsService } from './agreements.service';

/**
 * Module 5 — Agreement & Tenancy.
 *
 * `UnitsModule` is imported because every lifecycle action has to leave the
 * unit's occupancy status in step (activate → occupied, terminate/expire →
 * vacant), which is the acceptance criterion for this module.
 */
@Module({
  imports: [UnitsModule],
  controllers: [AgreementsController, AgreementTemplatesController],
  providers: [AgreementsService, AgreementTemplatesService],
  exports: [AgreementsService, AgreementTemplatesService],
})
export class AgreementsModule {}
