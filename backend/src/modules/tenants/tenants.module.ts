import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { UtilityPricingModule } from '@/modules/utilities/utility-pricing.module';

/**
 * Module 5 — Tenants.
 *
 * `UtilityPricingModule` is imported for one reason: the tenant's page shows what
 * they have been charged for their water and electricity, and a `UtilityCharge`
 * stores only the *inputs* to its price, so the price has to be recomputed from
 * the readings it names every time it is read. `UtilityPricingModule` is a leaf
 * that owns that arithmetic, and importing it here keeps the tenant page from
 * growing a second implementation of the rules.
 */
@Module({
  imports: [UtilityPricingModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
