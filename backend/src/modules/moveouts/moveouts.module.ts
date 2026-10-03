import { Module } from '@nestjs/common';
import { UnitsModule } from '@/modules/units/units.module';
import { MoveoutsController } from './moveouts.controller';
import { MoveoutsService } from './moveouts.service';

/**
 * Module 5 — move-outs.
 *
 * Imports `UnitsModule` because an approved move-out terminates the lease and
 * has to leave the unit's occupancy status in step (the same sync the leases
 * module uses).
 */
@Module({
  imports: [UnitsModule],
  controllers: [MoveoutsController],
  providers: [MoveoutsService],
  exports: [MoveoutsService],
})
export class MoveoutsModule {}