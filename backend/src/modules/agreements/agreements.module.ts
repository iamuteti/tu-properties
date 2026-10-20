import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module';
import { InvoicesModule } from '@/modules/finance/invoices/invoices.module';
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
 *
 * `InvoicesModule` is imported for one thing: a deposit is billed on its own
 * invoice when the agreement is raised, so it goes through the same seam a
 * utility bill and a rent bill use — the same numbering, the same tax
 * engine, the same ledger posting. Finance does not import this module, so
 * the dependency graph stays a tree.
 */
@Module({
  imports: [UnitsModule, InvoicesModule],
  controllers: [AgreementsController, AgreementTemplatesController],
  providers: [AgreementsService, AgreementTemplatesService],
  exports: [AgreementsService, AgreementTemplatesService],
})
export class AgreementsModule {}
