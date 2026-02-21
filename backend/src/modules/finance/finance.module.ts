import { Module } from '@nestjs/common';
import { InvoicesModule } from './invoices/invoices.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [InvoicesModule, ReceiptsModule, PaymentsModule],
  exports: [InvoicesModule, ReceiptsModule, PaymentsModule],
})
export class FinanceModule {}
