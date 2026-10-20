import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module';
import { AccountingModule } from '@/modules/finance/accounting/accounting.module';
import { MoveoutsController } from './moveouts.controller';
import { MoveoutsService } from './moveouts.service';

/**
 * Module 5 — move-outs.
 *
 * Imports `UnitsModule` because an approved move-out terminates the lease and
 * has to leave the unit's occupancy status in step (the same sync the leases
 * module uses).
 *
 * Imports `AccountingModule` because the refund is where the deposit money
 * actually leaves the estate: the liability falls, the cash goes out, and what
 * the claims took is recorded. Without that the balance sheet keeps claiming
 * the estate is holding a deposit it has already given back.
 */
@Module({
  imports: [UnitsModule, AccountingModule],
  controllers: [MoveoutsController],
  providers: [MoveoutsService],
  exports: [MoveoutsService],
})
export class MoveoutsModule {}
