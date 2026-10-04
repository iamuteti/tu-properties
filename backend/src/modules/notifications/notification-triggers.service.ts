import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { money } from './format';

const LEASE_EXPIRY_WARNINGS = [60, 30, 14, 7];
const RENT_DUE_WINDOW_DAYS = 7;
const OVERDUE_ESCALATION_DAYS = [1, 7, 30];

/** The request outcomes a resident can be told about. */
type RequestDecisionType = Extract<
  NotificationType,
  'REQUEST_APPROVED' | 'REQUEST_REJECTED' | 'REQUEST_WITHDRAWN'
>;

/**
 * Module 17 — Notifications: the scheduled triggers.
 *
 * Every trigger is idempotent through the notification `dedupeKey`, so these run
 * daily and a given lease is reminded once per milestone rather than once per
 * morning. The key includes the date or the milestone for exactly that reason:
 * `lease-expiring:{lease}:60` and `lease-expiring:{lease}:30` are different
 * messages, while the same key the next day is suppressed.
 *
 * The two triggers the leasing module left waiting are here — resident request
 * decisions are dispatched from `notifyRequestDecision` rather than from here,
 * since they are event-driven, not scheduled.
 */
@Injectable()
export class NotificationTriggersService {
  private readonly logger = new Logger(NotificationTriggersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Daily, early enough to be useful and late enough that yesterday's
   * postings are committed.
   */
  @Cron('0 15 6 * * *')
  async dailyReminders() {
    try {
      await this.runDailyReminders(new Date());
    } catch (error) {
      this.logger.error(
        `Daily reminders failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async runDailyReminders(onDate: Date = new Date()) {
    const organizations = await this.prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const summary = { leases: 0, due: 0, overdue: 0 };
    for (const organization of organizations) {
      summary.leases += await this.remindExpiringLeases(
        organization.id,
        onDate,
      );
      summary.due += await this.remindRentDue(organization.id, onDate);
      summary.overdue += await this.remindOverdueRent(organization.id, onDate);
    }

    this.logger.log(
      `Reminders for ${organizations.length} org(s): ${summary.leases} lease expiry, ${summary.due} rent due, ${summary.overdue} overdue`,
    );
    return summary;
  }

  /** A lease ending inside one of the warning windows, once per window. */
  private async remindExpiringLeases(organizationId: string, onDate: Date) {
    let sent = 0;

    for (const [index, days] of LEASE_EXPIRY_WARNINGS.entries()) {
      const target = new Date(onDate);
      target.setDate(target.getDate() + days);
      // The band a lease must be in for *this* milestone. Without a lower bound
      // every window fires at once: a lease 20 days from ending would get the
      // 60-day warning, the 30-day warning and the 14-day warning in the same
      // sweep, which is three messages saying the same thing.
      const lowerBound = LEASE_EXPIRY_WARNINGS[index + 1] ?? 0;

      const leases = await this.prisma.rentalAgreement.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          endDate: { not: null, lte: target },
        },
        select: {
          id: true,
          code: true,
          endDate: true,
          rentAmount: true,
          currency: true,
          tenantId: true,
          unit: {
            select: { name: true, property: { select: { name: true } } },
          },
        },
        take: 500,
      });

      for (const lease of leases) {
        if (!lease.endDate) continue;
        const remainingDays = Math.ceil(
          (lease.endDate.getTime() - onDate.getTime()) / (24 * 60 * 60 * 1000),
        );
        if (remainingDays > days || remainingDays <= lowerBound) continue;

        const place =
          lease.unit?.property?.name && lease.unit?.name
            ? `${lease.unit.property.name} ${lease.unit.name}`
            : 'your home';

        const results = await this.notifications.notify(
          {
            organizationId,
            type: NotificationType.LEASE_EXPIRING,
            priority:
              remainingDays <= 14
                ? NotificationPriority.CRITICAL
                : NotificationPriority.NORMAL,
            title: `Lease ending in ${remainingDays} day${remainingDays === 1 ? '' : 's'}`,
            body: `Your tenancy at ${place} ends on ${lease.endDate.toDateString()}. Contact the management office to renew, or to discuss moving out.`,
            entityType: 'RentalAgreement',
            entityId: lease.id,
            actionUrl: '/portal',
            channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
            dedupeKey: `lease-expiring:${lease.id}:${days}`,
          },
          { tenantId: lease.tenantId },
        );

        if (results.some((r) => r.status === 'SENT')) sent += 1;
      }
    }

    return sent;
  }

  /** Rent falling due soon, so a tenant is not surprised by a reminder. */
  private async remindRentDue(organizationId: string, onDate: Date) {
    const horizon = new Date(onDate);
    horizon.setDate(horizon.getDate() + RENT_DUE_WINDOW_DAYS);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        balanceAmount: { gt: 0 },
        dueDate: { gte: onDate, lte: horizon },
        rentalAgreement: { isNot: null },
      },
      select: {
        id: true,
        invoiceNumber: true,
        balanceAmount: true,
        currency: true,
        dueDate: true,
        rentalAgreement: { select: { tenantId: true } },
      },
      take: 1000,
    });

    let sent = 0;
    for (const invoice of invoices) {
      const tenantId = invoice.rentalAgreement?.tenantId;
      if (!tenantId) continue;

      const days = Math.ceil(
        (invoice.dueDate.getTime() - onDate.getTime()) / (24 * 60 * 60 * 1000),
      );

      const results = await this.notifications.notify(
        {
          organizationId,
          type: NotificationType.RENT_DUE,
          priority:
            days <= 3 ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
          title: `Rent of ${money(Number(invoice.balanceAmount))} due ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
          body: `Invoice ${invoice.invoiceNumber} for ${money(Number(invoice.balanceAmount))} falls due on ${invoice.dueDate.toDateString()}.`,
          entityType: 'Invoice',
          entityId: invoice.id,
          actionUrl: '/portal/invoices',
          channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
          // Once per invoice per due date, not once per day of the window.
          dedupeKey: `rent-due:${invoice.id}:${invoice.dueDate.toISOString().slice(0, 10)}`,
        },
        { tenantId },
      );

      if (results.some((r) => r.status === 'SENT')) sent += 1;
    }

    return sent;
  }

  /**
   * Overdue rent. Escalating rather than daily: the same tenant hearing about
   * arrears every morning for a month stops reading any of it.
   */
  private async remindOverdueRent(organizationId: string, onDate: Date) {
    let sent = 0;

    for (const [index, days] of OVERDUE_ESCALATION_DAYS.entries()) {
      // The band a bill must be in for *this* escalation. The same lower-bound
      // reasoning as lease expiry: without it a 40-day-overdue bill fires all
      // three milestones in one sweep.
      const upperBound = OVERDUE_ESCALATION_DAYS[index + 1];

      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
          balanceAmount: { gt: 0 },
          dueDate: { lte: new Date(onDate.getTime() - days * 86400000) },
          rentalAgreement: { isNot: null },
        },
        select: {
          id: true,
          invoiceNumber: true,
          balanceAmount: true,
          dueDate: true,
          rentalAgreement: { select: { tenantId: true } },
        },
        take: 1000,
      });

      for (const invoice of invoices) {
        const tenantId = invoice.rentalAgreement?.tenantId;
        if (!tenantId) continue;

        const overdueDays = Math.floor(
          (onDate.getTime() - invoice.dueDate.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        if (overdueDays < days) continue;
        if (upperBound !== undefined && overdueDays >= upperBound) continue;

        const results = await this.notifications.notify(
          {
            organizationId,
            type: NotificationType.RENT_OVERDUE,
            priority:
              days >= 7
                ? NotificationPriority.CRITICAL
                : NotificationPriority.HIGH,
            title: `Rent overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
            body: `Invoice ${invoice.invoiceNumber} for ${money(Number(invoice.balanceAmount))} was due on ${invoice.dueDate.toDateString()}. Please arrange payment, or contact us if you need to discuss it.`,
            entityType: 'Invoice',
            entityId: invoice.id,
            actionUrl: '/portal/invoices',
            channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
            dedupeKey: `rent-overdue:${invoice.id}:${days}`,
          },
          { tenantId },
        );

        if (results.some((r) => r.status === 'SENT')) sent += 1;
      }
    }

    return sent;
  }

  /**
   * Event-driven half: what happened to a resident's request.
   *
   * The leasing module already audits each transition and the resident is
   * reached through `User.portalTenantId` — this is the delivery that was left
   * out. Falls back to the tenant record so a resident without a portal login
   * still hears the outcome.
   */
  async notifyRequestDecision(args: {
    organizationId?: string;
    tenantId: string;
    type: RequestDecisionType;
    requestId: string;
    decisionNote?: string | null;
  }) {
    const titles: Record<string, string> = {
      [NotificationType.REQUEST_APPROVED]: 'Your request was approved',
      [NotificationType.REQUEST_REJECTED]: 'Your request was declined',
      [NotificationType.REQUEST_WITHDRAWN]: 'Your request was withdrawn',
    };

    const portalUser = await this.prisma.user.findFirst({
      where: { portalTenantId: args.tenantId, isActive: true },
      select: { id: true },
    });

    return this.notifications.notify(
      {
        organizationId: args.organizationId,
        type: args.type,
        // A declined or approved request is the whole reason the resident wrote
        // in, so it must not be quietly droppable.
        priority: NotificationPriority.HIGH,
        title: titles[args.type] ?? 'Your request was updated',
        body:
          args.decisionNote?.trim() ||
          'The management office has updated your request. Sign in to see the detail.',
        entityType: 'TenantRequest',
        entityId: args.requestId,
        actionUrl: '/portal/requests',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        dedupeKey: `request-decision:${args.requestId}:${args.type}`,
      },
      portalUser ? { userId: portalUser.id } : { tenantId: args.tenantId },
    );
  }
}

/** Kept separate so `notifications.service` can use it without a cycle. */
export const notificationWhereFor = (
  userId: string,
): Prisma.NotificationWhereInput => ({
  userId,
  readAt: null,
});
