import { Module } from '@nestjs/common';
import { RentalAgreementsController } from './rental-agreements.controller';
import { RentalAgreementsService } from './rental-agreements.service';
import { UnitsModule } from '@/modules/units/units.module';

@Module({
  imports: [UnitsModule],
  controllers: [RentalAgreementsController],
  providers: [RentalAgreementsService],
})
export class RentalAgreementsModule {}
