import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { FinanceModule } from '@/modules/finance/finance.module';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';

/**
 * Module 14 - Utilities.
 *
 * **Two imports, and the direction of `FinanceModule` is the point.**
 *
 * This module *writes into* Finance: a period's consumption becomes a real invoice
 * raised through `InvoicesService.create`, so that numbering, tax and the GL posting
 * happen exactly as they do for a rent bill. Writing `Invoice` rows directly would
 * have been shorter and would have produced a utility bill that skipped the tax
 * engine and the ledger - the same mistake this codebase has already paid for once
 * in the other direction. `FinanceModule` knows nothing about utilities, so nothing
 * in Finance can start creating a meter reading by accident.
 *
 * `AuditModule` is the standing requirement. In practice the global
 * `AuditInterceptor` writes the trail for these tenant-scoped mutations, but
 * superseding a tariff and voiding a charge are exactly the actions that should be
 * asserted rather than assumed: both are decisions about money, and both leave a row
 * behind rather than erasing one.
 *
 * **Nothing is exported.** No other module needs to read a meter, and an exported
 * service is an invitation. What might look like it wants to cross a boundary - the
 * recurring rent run noticing that a unit also has a water bill - is better as a
 * charge with an `invoiceId` on it, which Finance can already find.
 *
 * The rules live in one pure file, `meter-rates.ts`, with no database and no Nest in
 * it: consumption including meter rollover, bulk apportionment, tariff resolution and
 * the money. The **database** carries the guarantee that a meter cannot be billed
 * twice for the same period - see the migrations.
 */
@Module({
  imports: [AuditModule, FinanceModule],
  controllers: [UtilitiesController],
  providers: [UtilitiesService],
})
export class UtilitiesModule {}
