import { Module } from '@nestjs/common';
import { RecurringBillingController } from './recurring-billing.controller';
import { RecurringBillingService } from './recurring-billing.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { UtilityPricingModule } from '@/modules/utilities/utility-pricing.module';

/**
 * Recurring rent billing.
 *
 * The rent invoice is raised through `InvoicesService`, the same seam a utility
 * bill and a supplier bill use, so the tax engine, the numbering and the GL
 * posting all behave identically whichever way a resident is charged.
 *
 * When a property bundles metered utilities onto the rent invoice, the run also
 * has to price the pending utility charges so their consumption can ride on the
 * same document. That price comes from `UtilityPricingModule` - a leaf that
 * depends on neither this module nor `UtilitiesModule`, which is what keeps the
 * dependency graph a tree: Utilities writes into Finance through `InvoicesModule`,
 * Finance reads a price back out of a module that sits below both.
 */
@Module({
  imports: [InvoicesModule, UtilityPricingModule],
  controllers: [RecurringBillingController],
  providers: [RecurringBillingService],
  exports: [RecurringBillingService],
})
export class RecurringBillingModule {}
