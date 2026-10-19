import { Module } from '@nestjs/common';
import { UtilityPricingService } from './utility-pricing.service';

/**
 * The leaf of the utilities tree: pricing, and nothing else.
 *
 * It imports no other module on purpose. `UtilitiesModule` (which raises utility
 * invoices through Finance) and `RecurringBillingModule` (which prices a charge
 * onto a rent invoice) both need it, so it has to sit below both - a module that
 * sits below the two of them is a module neither of them has to wait for.
 */
@Module({
  providers: [UtilityPricingService],
  exports: [UtilityPricingService],
})
export class UtilityPricingModule {}
