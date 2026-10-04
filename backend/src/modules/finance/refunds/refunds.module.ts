import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AccountingModule, CreditsModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
