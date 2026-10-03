import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InvoicesModule } from '@/modules/finance/invoices/invoices.module';

/**
 * Module 4 — Sales Management.
 *
 * Imports `InvoicesModule` because instalment billing reuses the finance
 * invoicing service instead of writing a parallel billing path: sale money has
 * to land in the same ledger and payment reconciliation as rent.
 */
@Module({
  imports: [InvoicesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
