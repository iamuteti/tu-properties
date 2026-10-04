import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { UsersModule } from '@/modules/users/users.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [UsersModule, AccountingModule, CreditsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
