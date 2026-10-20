import { Module } from '@nestjs/common';
import { SecurityDepositsController } from './security-deposits.controller';
import { SecurityDepositsService } from './security-deposits.service';

/**
 * The security-deposit register.
 *
 * Read-only, and it needs nothing from the leasing module: the deposit is a
 * column on the agreement, the deductions and the refund belong to the
 * move-out, and the arithmetic is imported from the move-out's own
 * `calculateDeposit` so the two screens cannot disagree about the same money.
 */
@Module({
  controllers: [SecurityDepositsController],
  providers: [SecurityDepositsService],
  exports: [SecurityDepositsService],
})
export class SecurityDepositsModule {}
