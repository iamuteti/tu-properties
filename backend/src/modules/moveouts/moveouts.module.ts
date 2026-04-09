import { Module } from '@nestjs/common';
import { MoveoutsController } from './moveouts.controller';
import { MoveoutsService } from './moveouts.service';

@Module({
  controllers: [MoveoutsController],
  providers: [MoveoutsService],
})
export class MoveoutsModule {}