import { Module } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    InvoicesModule,
    ReceiptsModule,
    PaymentsModule,
    // Imported after the invoice/receipt/payment modules: those inject
    // AccountingService for auto-posting and therefore need it exported.
    AccountingModule,
  ],
  exports: [InvoicesModule, ReceiptsModule, PaymentsModule, AccountingModule],
})
export class FinanceModule {}
