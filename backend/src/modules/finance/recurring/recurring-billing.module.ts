import { Module } from '@nestjs/common';
import { RecurringBillingController } from './recurring-billing.controller';
import { RecurringBillingService } from './recurring-billing.service';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [InvoicesModule],
  controllers: [RecurringBillingController],
  providers: [RecurringBillingService],
  exports: [RecurringBillingService],
})
export class RecurringBillingModule {}
