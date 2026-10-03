import { Module } from '@nestjs/common';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

// Exported so the leases module can keep a unit's occupancy status in step
// with its rental agreements (Module 2 acceptance criteria: occupancy must
// reflect real lease state).
@Module({
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
