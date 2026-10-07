import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { LandlordsController } from './landlords.controller';
import { LandlordsService } from './landlords.service';
import { LandlordChargesService } from './charges/landlord-charges.service';
import { LandlordPayoutsService } from './payouts/landlord-payouts.service';
import { LandlordPayoutsController } from './payouts/landlord-payouts.controller';
import { OwnerStatementsService } from './statements/owner-statements.service';
import { OwnerStatementsController } from './statements/owner-statements.controller';
import { LandlordNotificationsService } from './landlord-notifications.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

/**
 * Landlord management (Module 6).
 *
 * One module for the whole owner-money surface: profiles, the charges levied on
 * them, the statements those charges roll into, and the payouts that settle
 * them. The landlord detail page needs all four, and they share the same
 * derivation rules, so they are wired together here rather than through four
 * modules that each import each other.
 *
 * **Imports `NotificationsModule` one-directionally**, which is the rule issue 85
 * records: the module that owns the behaviour imports the other, and this one owns
 * "when does an owner hear about their money", so this is the arrow. Notifications
 * reads landlords through Prisma and imports nothing from here — which is what keeps
 * the two from becoming a circular dependency at boot, the failure that is expensive
 * to find and trivial to avoid by deciding the direction once.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
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
    LandlordNotificationsService,
  ],
})
export class LandlordsModule {}
