import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { FacilitiesNotificationsService } from './facilities-notifications.service';
import {
  FacilitiesController,
  FacilityBookingsController,
} from './facilities.controller';
import {
  VisitorsController,
  VisitorVisitsController,
  AccessCardsController,
} from './visitors.controller';
import { FacilitiesService } from './facilities.service';
import { VisitorsService } from './visitors.service';

/**
 * Module 13 — Facilities Management.
 *
 * **Two imports, and the directions are the point.**
 *
 * - `NotificationsModule` because an approved booking, an arriving visitor and an
 *   expiring fob are all facts somebody needs told. Facilities calls *out* to
 *   notifications; notifications knows nothing about facilities, so the reminder
 *   sweep cannot start sending about clubhouses the day somebody wires it up.
 * - `AuditModule` for the standing requirement. In practice the global
 *   `AuditInterceptor` writes the trail for every mutation here, since they are all
 *   tenant-scoped `POST`/`PATCH`/`DELETE` — but revoking an access card and barring
 *   a visitor are exactly the actions that should be asserted rather than assumed,
 *   and they have their own reasoned refusals attached.
 *
 * **Nothing is exported.** No other module needs to book a room, and an exported
 * service is an invitation. The one thing that might look like it wants to cross a
 * boundary — maintenance closing a facility during a repair — is better as a
 * booking on a closed facility than as a call into this service, so it stays here.
 *
 * The rules live in three pure files with no database and no Nest in them:
 * `booking-slots.ts` (when a facility is available and whether two slots collide),
 * `booking-lifecycle.ts` (the five booking states and the gates between them) and
 * `access-card-lifecycle.ts` (the five card states, and why a lost card is never
 * reactivated). The **database** carries the guarantee that no two bookings overlap,
 * as a GiST exclusion constraint — see the migration.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    /**
     * **ORDER IS LOAD-BEARING — read the note on `FacilitiesController` first.**
     *
     * These three are registered *before* `FacilitiesController` on purpose. That
     * controller has a `@Get(':id')` on the `facilities` prefix, and a one-segment
     * wildcard matches `bookings`, `visitors` and `access-cards` just as happily as
     * it matches a cuid. Registering it first made all three sub-resources 404 with
     * "Facility not found" — a failure that reads like a broken filter rather than a
     * broken route, which is exactly why it is written down here.
     *
     * Nest resolves in registration order, so moving `FacilitiesController` back to
     * the top of this array reintroduces the bug **silently**: the module still
     * boots, every unit test still passes, and three screens 404 at runtime.
     */
    FacilityBookingsController,
    VisitorsController,
    VisitorVisitsController,
    AccessCardsController,
    // …and therefore last.
    FacilitiesController,
  ],
  providers: [
    FacilitiesService,
    VisitorsService,
    FacilitiesNotificationsService,
  ],
})
export class FacilitiesModule {}
