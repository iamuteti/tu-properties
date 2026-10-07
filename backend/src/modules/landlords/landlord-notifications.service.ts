import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

/**
 * Module 17 — who hears about an owner's statement and an owner's payout.
 *
 * Isolated into its own service for the same reason `maintenance-notifications.service.ts`
 * and `facilities-notifications.service.ts` each exist: the landlords services stay about
 * landlords, and this is the one place in the module where a failure is *expected* to be
 * swallowed. Every method catches. Issuing a statement is the accounting department's
 * work and the statement is on screen whether or not a message reached anybody; failing
 * the issue because a notification row could not be written would be worse than an owner
 * who has to open their portal and look.
 */
@Injectable()
export class LandlordNotificationsService {
  private readonly logger = new Logger(LandlordNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Channels an owner is reached on: email and SMS, and **deliberately not `IN_APP`**.
   *
   * In-app notifications are read out of a signed-in user's own list, and a landlord has
   * no login — the owner portal is Phase 2 (issue 64). Writing an unread in-app row for
   * an owner would put a message in a list nobody can open, which is worse than not
   * sending it: it makes the channel look busy on the one screen an administrator does
   * check. When the portal lands, `IN_APP` comes back here and nowhere else needs to know.
   */
  private static readonly OWNER_CHANNELS = [
    NotificationChannel.EMAIL,
    NotificationChannel.SMS,
  ];

  /**
   * A statement has been issued and the owner can read it.
   *
   * Fires on `issue()` rather than on `generate()`, because a generated statement is a
   * draft: it may never be issued, and telling an owner their period is ready when it is
   * still being checked would be a false claim about their money.
   *
   * `dedupeKey` is per statement, so re-issuing a statement that is already ISSUED (which
   * `issue()` permits and returns early) does not produce a second email.
   */
  async announceStatementIssued(args: {
    organizationId: string;
    landlordId: string;
    statementId: string;
    reference: string;
    periodStart: Date;
    periodEnd: Date;
    netPayout: number;
    currency: string;
  }): Promise<void> {
    try {
      const landlord = await this.prisma.landlord.findFirst({
        where: { id: args.landlordId, organizationId: args.organizationId },
        select: { id: true, email: true },
      });
      // Silently. A landlord with no email still gets the statement; they just do not
      // get told about it by mail, and a failure here is not the statement's problem.
      if (!landlord) return;

      const period = `${args.periodStart.toISOString().slice(0, 10)} to ${args.periodEnd
        .toISOString()
        .slice(0, 10)}`;

      await this.notifications.notify(
        {
          organizationId: args.organizationId,
          type: NotificationType.OWNER_STATEMENT_READY,
          title: `Your owner statement ${args.reference} is ready`,
          body:
            `Statement ${args.reference} covering ${period} has been issued.\n\n` +
            `Net payable: ${args.netPayout} ${args.currency}.\n\n` +
            `Sign in to your owner portal to read and download it.`,
          entityType: 'OwnerStatement',
          entityId: args.statementId,
          actionUrl: `/owner-statements/${args.statementId}`,
          // Normal, not CRITICAL: an owner statement is a bill, not an emergency, and
          // escalating it would spend the CRITICAL lane that bypasses opt-outs.
          priority: NotificationPriority.NORMAL,
          channels: LandlordNotificationsService.OWNER_CHANNELS,
        },
        { landlordId: landlord.id },
      );
    } catch (err) {
      this.logger.warn(
        `Statement ${args.statementId} issued but the owner was not notified: ${
          (err as Error).message
        }`,
      );
    }
  }

  /**
   * An owner's money has actually left.
   *
   * Fires on the `PAID` transition rather than on creation, because a payout that has
   * been raised is an intention and a payout that has been marked paid is a fact — and
   * this is the message an owner acts on.
   *
   * Note the failure is swallowed here for the same reason as the statement: the payout
   * is recorded and the bank reference is on it either way.
   */
  async announcePayoutPaid(args: {
    organizationId: string;
    landlordId: string;
    payoutId: string;
    amount: number;
    currency: string;
    /** The bank transfer or cheque reference — the row's `reference` column. */
    bankReference?: string | null;
    /** `OST-YYYYMM-NNNN` of the statement this settles, when there is one. */
    statementNumber?: string | null;
  }): Promise<void> {
    try {
      const landlord = await this.prisma.landlord.findFirst({
        where: { id: args.landlordId, organizationId: args.organizationId },
        select: { id: true },
      });
      if (!landlord) return;

      const money = `${args.amount} ${args.currency}`;

      /**
       * The title leads with **the figure, not an identifier**.
       *
       * `LandlordPayout` has no payout number — its `reference` column is the *bank*
       * transfer or cheque reference, which is the one thing the owner is least likely
       * to recognise as "about". The only other identifier is the cuid, so the first
       * version of this message read "Payout cmuxt37b6128pn1i09xm7lnnb has been paid",
       * which is an internal row id in a sentence addressed to a person. The bank
       * reference still appears in the body, where it belongs: it is what they need in
       * order to reconcile, and it is not what they need in order to know what happened.
       */
      const statement = args.statementNumber
        ? `against statement ${args.statementNumber}`
        : '';

      await this.notifications.notify(
        {
          organizationId: args.organizationId,
          type: NotificationType.PAYOUT_PAID,
          title: `Your payout of ${money} has been paid`,
          body:
            `A payout of ${money}${statement} has been paid to your account.\n\n` +
            (args.bankReference
              ? `Payment reference: ${args.bankReference}.`
              : 'Contact your property manager for the payment reference.'),
          entityType: 'LandlordPayout',
          entityId: args.payoutId,
          actionUrl: `/owner-payouts/${args.payoutId}`,
          priority: NotificationPriority.NORMAL,
          channels: LandlordNotificationsService.OWNER_CHANNELS,
        },
        { landlordId: landlord.id },
      );
    } catch (err) {
      this.logger.warn(
        `Payout ${args.payoutId} paid but the owner was not notified: ${
          (err as Error).message
        }`,
      );
    }
  }
}
