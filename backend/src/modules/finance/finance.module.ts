import { Module } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { CreditsModule } from './credits/credits.module';
import { RefundsModule } from './refunds/refunds.module';
import { TaxModule } from './tax/tax.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    AccountingModule,
    CreditsModule,
    // Invoices need the tax engine to price themselves, so it goes first.
    TaxModule,
    InvoicesModule,
    ReceiptsModule,
    PaymentsModule,
    // Last: the refund service injects Accounting and Credits.
    RefundsModule,
  ],
  exports: [
    AccountingModule,
    CreditsModule,
    TaxModule,
    InvoicesModule,
    ReceiptsModule,
    PaymentsModule,
    RefundsModule,
  ],
})
export class FinanceModule {}
