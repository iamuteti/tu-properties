import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AccountingModule, CreditsModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
