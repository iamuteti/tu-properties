import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AccountingModule, CreditsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
