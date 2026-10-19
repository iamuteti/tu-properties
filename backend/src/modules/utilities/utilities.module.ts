import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { InvoicesModule } from '@/modules/finance/invoices/invoices.module';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';
import { UtilityPricingModule } from './utility-pricing.module';

/**
 * Module 14 - Utilities.
 *
 * **Two imports, and the direction of `InvoicesModule` is the point.**
 *
 * This module *writes into* Finance: a period's consumption becomes a real invoice
 * raised through `InvoicesService.create`, so that numbering, tax and the GL posting
 * happen exactly as they do for a rent bill. Writing `Invoice` rows directly would
 * have been shorter and would have produced a utility bill that skipped the tax
 * engine and the ledger - the same mistake this codebase has already paid for once
 * in the other direction. Finance knows nothing about utilities, so nothing in
 * Finance can start creating a meter reading by accident.
 *
 * The import is `InvoicesModule` and not the whole of `FinanceModule`, and the
 * reason is the other half of this module's story. When a property bundles metered
 * utilities onto the rent invoice, Finance's recurring run has to *price* a stored
 * charge - so Finance needs something from Utilities, and the dependency runs back
 * the other way for the first time. Two modules that need each other cannot both
 * reach for the other's root: `FinanceModule` contains the recurring run, and
 * `UtilitiesModule` containing Finance would close the loop.
 *
 * The way out is not a `forwardRef` but a leaf. Pricing a charge needs the database
 * and the pure rules in `meter-rates.ts` and nothing else, so it lives in
 * `UtilityPricingModule` - a module that sits *below* both Utilities and Finance
 * and is imported by each. `UtilitiesModule` takes the whole of `InvoicesModule`
 * (narrow, leaf-ish, and the one thing this module actually calls) and the pricing
 * module; Finance takes the pricing module. The graph stays a tree.
 *
 * `AuditModule` is the standing requirement. In practice the global
 * `AuditInterceptor` writes the trail for these tenant-scoped mutations, but
 * superseding a tariff and voiding a charge are exactly the actions that should be
 * asserted rather than assumed: both are decisions about money, and both leave a row
 * behind rather than erasing one.
 *
 * **Nothing is exported.** No other module needs to read a meter, and an exported
 * service is an invitation. The one thing Finance needs - the price of a charge -
 * is not this module's to give: it is `UtilityPricingService`, exported by its own
 * module, and it is a price rather than a doorway.
 *
 * The rules live in one pure file, `meter-rates.ts`, with no database and no Nest in
 * it: consumption including meter rollover, bulk apportionment, tariff resolution and
 * the money. The **database** carries the guarantee that a meter cannot be billed
 * twice for the same period - see the migrations.
 */
@Module({
  imports: [AuditModule, InvoicesModule, UtilityPricingModule],
  controllers: [UtilitiesController],
  providers: [UtilitiesService],
})
export class UtilitiesModule {}
