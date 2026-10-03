import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { LandlordsController } from './landlords.controller';
import { LandlordsService } from './landlords.service';
import { LandlordChargesService } from './charges/landlord-charges.service';
import { LandlordPayoutsService } from './payouts/landlord-payouts.service';
import { LandlordPayoutsController } from './payouts/landlord-payouts.controller';
import { OwnerStatementsService } from './statements/owner-statements.service';
import { OwnerStatementsController } from './statements/owner-statements.controller';

/**
 * Landlord management (Module 6).
 *
 * One module for the whole owner-money surface: profiles, the charges levied on
 * them, the statements those charges roll into, and the payouts that settle
 * them. The landlord detail page needs all four, and they share the same
 * derivation rules, so they are wired together here rather than through four
 * modules that each import each other.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    LandlordsController,
    OwnerStatementsController,
    LandlordPayoutsController,
  ],
  providers: [
    LandlordsService,
    LandlordChargesService,
    OwnerStatementsService,
    LandlordPayoutsService,
  ],
})
export class LandlordsModule {}
