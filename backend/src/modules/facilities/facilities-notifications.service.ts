import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

interface BookingNotificationSubject {
  id: string;
  organizationId: string;
  reference: string;
  bookedForName: string;
  status: string;
  facility?: { name?: string | null } | null;
  tenantId?: string | null;
  /** Whoever pressed the button. Excluded from the approval nudge. */
  bookedByUserId?: string | null;
  decisionNote?: string | null;
}

interface CardNotificationSubject {
  id: string;
  organizationId: string;
  cardNumber: string;
  holderName: string;
  type: string;
  expiresAt: Date | null;
}

interface VisitNotificationSubject {
  id: string;
  organizationId: string;
  visitorName: string;
  hostName: string;
  propertyName?: string | null;
  purpose?: string | null;
  expectedOutAt: Date | null;
}

/**
 * Module 13 — who hears about a booking, a card and a visitor, and when.
 *
 * Isolated into its own service for the same reason `maintenance-notifications.service.ts`
 * exists: the facilities services stay about facilities rather than about channel
 * selection, and this is the one place in the module where a failure is *expected*
 * to be swallowed. Every method catches. An approved clubhouse booking must not be
 * reported as failed because a notification row could not be written, and the person
 * who booked it has a screen that lists it anyway.
 *
 * All sends are idempotent through the notification `dedupeKey`, so a retried
 * transition does not produce a second "you're in" message.
 */
@Injectable()
export class FacilitiesNotificationsService {
  private readonly logger = new Logger(FacilitiesNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * A booking is waiting for somebody to decide.
   *
   * Goes to the people who decide bookings in this organization — the roles holding
   * `facility_bookings.decide`, which is a deliberately narrower list than the one
   * that may *book*. Broadcasting to everyone who can see the diary would train
   * people to ignore it, and a leasing officer who cannot approve would only be
   * told about a queue they cannot act on.
   */
  async announceBookingAwaitingApproval(booking: BookingNotificationSubject) {
    await this.safely(`approval of ${booking.reference}`, async () => {
      const recipients = await this.prisma.user.findMany({
        where: {
          organizationId: booking.organizationId,
          isActive: true,
          portalTenantId: null,
          role: {
            in: [
              UserRole.MAINTENANCE_MANAGER,
              UserRole.PROPERTY_MANAGER,
              UserRole.ADMIN,
            ],
          },
          // Whoever raised it already knows, and the lifecycle refuses to let them
          // approve it anyway — telling them would be a notification to somebody
          // who cannot act on it.
          ...(booking.bookedByUserId
            ? { id: { not: booking.bookedByUserId } }
            : {}),
        },
        select: { id: true },
        take: 25,
      });

      for (const recipient of recipients) {
        await this.notifications.notify(
          {
            organizationId: booking.organizationId,
            type: NotificationType.FACILITY_BOOKING_DECIDED,
            priority: NotificationPriority.HIGH,
            title: `Booking to approve: ${booking.facility?.name ?? 'a facility'}`,
            body: `${booking.reference} — ${booking.bookedForName}. Open it to approve or decline.`,
            entityType: 'FacilityBooking',
            entityId: booking.id,
            actionUrl: `/facilities/bookings/${booking.id}`,
            channels: [NotificationChannel.IN_APP],
            dedupeKey: `facility-booking-awaiting:${booking.id}`,
          },
          { userId: recipient.id },
        );
      }
    });
  }

  /**
   * The booking's own copy of a decision.
   *
   * Reached through the tenant record, which resolves to their portal login when
   * they have one — the same fallback Module 9 uses for maintenance. A resident who
   * asked for the clubhouse and heard nothing is the failure this exists to prevent,
   * so both outcomes are sent and the decline carries the note, because that note is
   * the only thing they will be told.
   */
  async announceBookingDecision(booking: BookingNotificationSubject) {
    const approved = booking.status === 'CONFIRMED';
    await this.safely(`decision on ${booking.reference}`, async () => {
      const portalUser = await this.portalUserFor(
        booking.organizationId,
        booking.tenantId,
      );

      // `notify` refuses a recipient that is neither a user nor a tenant, so a
      // staff-made booking with no resident attached is resolved to the person who
      // raised it. That is the right default: they are the one waiting to hear.
      const recipient = portalUser
        ? { userId: portalUser }
        : booking.tenantId
          ? { tenantId: booking.tenantId }
          : booking.bookedByUserId
            ? { userId: booking.bookedByUserId }
            : null;

      if (!recipient) return;

      const note = booking.decisionNote?.trim();
      await this.notifications.notify(
        {
          organizationId: booking.organizationId,
          type: NotificationType.FACILITY_BOOKING_DECIDED,
          priority: approved
            ? NotificationPriority.NORMAL
            : NotificationPriority.HIGH,
          title: approved
            ? `${booking.facility?.name ?? 'Your booking'} is confirmed`
            : `${booking.facility?.name ?? 'Your booking'} was declined`,
          body: approved
            ? `${booking.reference} is held for ${booking.bookedForName}.`
            : `${booking.reference} for ${booking.bookedForName}.${note ? ` ${note}` : ''}`,
          entityType: 'FacilityBooking',
          entityId: booking.id,
          actionUrl: `/facilities/bookings/${booking.id}`,
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          dedupeKey: `facility-booking-decided:${booking.id}:${booking.status}`,
        },
        recipient,
      );
    });
  }

  /**
   * A visitor has arrived.
   *
   * Addressed to the office rather than the resident: a resident does not need to
   * know that somebody called for them, but the person staffing the desk does. Goes
   * to the gate roles only — the same narrow list that can read the visitor log —
   * because a "visitor at the gate" notification is the fastest possible way to leak
   * the existence of the visitor register to somebody who should not have it.
   */
  async announceVisitorArrival(visit: VisitNotificationSubject) {
    await this.safely(`arrival of ${visit.visitorName}`, async () => {
      const recipients = await this.prisma.user.findMany({
        where: {
          organizationId: visit.organizationId,
          isActive: true,
          portalTenantId: null,
          role: {
            in: [
              UserRole.ADMIN,
              UserRole.PROPERTY_MANAGER,
              UserRole.MAINTENANCE_MANAGER,
            ],
          },
        },
        select: { id: true },
        take: 15,
      });

      for (const recipient of recipients) {
        await this.notifications.notify(
          {
            organizationId: visit.organizationId,
            type: NotificationType.VISITOR_ARRIVAL,
            priority: NotificationPriority.NORMAL,
            title: `Visitor arrived: ${visit.visitorName}`,
            body: `Here to see ${visit.hostName}${visit.propertyName ? ` at ${visit.propertyName}` : ''}${visit.purpose ? ` — ${visit.purpose}` : ''}.${
              visit.expectedOutAt
                ? ` Expected to leave by ${visit.expectedOutAt.toISOString().slice(11, 16)}.`
                : ''
            }`,
            entityType: 'VisitorVisit',
            entityId: visit.id,
            actionUrl: `/facilities/visits/${visit.id}`,
            channels: [NotificationChannel.IN_APP],
            dedupeKey: `facility-visitor-arrival:${visit.id}`,
          },
          { userId: recipient.id },
        );
      }
    });
  }

  /**
   * An access card is about to expire.
   *
   * A renewal nudge rather than a decision, so it is low priority and reaches only
   * the roles that can actually issue a replacement — telling a technician their own
   * fob expires next month is not useful when they cannot issue a new one.
   */
  async announceCardExpiring(card: CardNotificationSubject) {
    await this.safely(`expiry of card ${card.cardNumber}`, async () => {
      const recipients = await this.prisma.user.findMany({
        where: {
          organizationId: card.organizationId,
          isActive: true,
          portalTenantId: null,
          role: { in: [UserRole.ADMIN, UserRole.PROPERTY_MANAGER] },
        },
        select: { id: true },
        take: 15,
      });

      const days = card.expiresAt
        ? Math.ceil((card.expiresAt.getTime() - Date.now()) / 86400000)
        : null;

      for (const recipient of recipients) {
        await this.notifications.notify(
          {
            organizationId: card.organizationId,
            type: NotificationType.ACCESS_CARD_EXPIRING,
            priority: NotificationPriority.LOW,
            title: `Card ${card.cardNumber} expires${days != null ? ` in ${days} day${days === 1 ? '' : 's'}` : ''}`,
            body: `${card.holderName} — ${card.type.replace(/_/g, ' ').toLowerCase()} access. Issue a replacement or extend it.`,
            entityType: 'AccessCard',
            entityId: card.id,
            actionUrl: `/facilities/access-cards/${card.id}`,
            channels: [NotificationChannel.IN_APP],
            dedupeKey: `facility-card-expiring:${card.id}:${card.expiresAt?.toISOString().slice(0, 10) ?? 'none'}`,
          },
          { userId: recipient.id },
        );
      }
    });
  }

  /**
   * A resident's own renewal nudge.
   *
   * Separate from the office one because the recipient is different and the channel
   * is different: a resident who is not told their fob stops working on Friday
   * cannot fix it, and the person who can fix it does not know it is coming.
   */
  async announceCardExpiringToHolder(
    card: CardNotificationSubject & { tenantId?: string | null },
  ) {
    if (!card.tenantId) return;

    await this.safely(`holder expiry of card ${card.cardNumber}`, async () => {
      const portalUser = await this.portalUserFor(
        card.organizationId,
        card.tenantId,
      );
      if (!portalUser) return;

      await this.notifications.notify(
        {
          organizationId: card.organizationId,
          type: NotificationType.ACCESS_CARD_EXPIRING,
          priority: NotificationPriority.HIGH,
          title: `Your access card ${card.cardNumber} is expiring`,
          body: 'Contact the office to have it extended or replaced before it stops working.',
          entityType: 'AccessCard',
          entityId: card.id,
          actionUrl: '/facilities/access-cards',
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          dedupeKey: `facility-card-holder-expiring:${card.id}:${card.expiresAt?.toISOString().slice(0, 10) ?? 'none'}`,
        },
        { userId: portalUser },
      );
    });
  }

  /**
   * Never let delivery break the operation it is reporting on.
   *
   * Logged, not swallowed silently: a run of failures is a broken provider, and that
   * is worth seeing in the logs.
   */
  private async safely(what: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `Could not send facilities notification for ${what}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The portal login behind a tenant, if there is one.
   *
   * A resident without a portal login gets nothing from the portal path, which is
   * why every call site that uses this has a tenant-record fallback rather than
   * relying on a login existing.
   */
  private async portalUserFor(
    organizationId: string,
    tenantId: string | null | undefined,
  ): Promise<string | null> {
    if (!tenantId) return null;
    const portalUser = await this.prisma.user.findFirst({
      where: { portalTenantId: tenantId, organizationId, isActive: true },
      select: { id: true },
    });
    return portalUser?.id ?? null;
  }
}
