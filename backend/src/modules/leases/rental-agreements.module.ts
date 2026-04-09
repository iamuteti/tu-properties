import { Module } from '@nestjs/common';
import { RentalAgreementsController } from './rental-agreements.controller';
import { RentalAgreementsService } from './rental-agreements.service';

@Module({
  controllers: [RentalAgreementsController],
  providers: [RentalAgreementsService],
})
export class RentalAgreementsModule {}
