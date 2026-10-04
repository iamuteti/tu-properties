import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { NotificationConfigService } from './notification-config.service';
import { SmsProviderRegistry } from './sms-provider-registry';

type Tx = Prisma.TransactionClient;

export interface NotificationRecipient {
  userId?: string | null;
  tenantId?: string | null;
}

export interface NotificationRequest {
  organizationId?: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Both set when the message concerns something specific. */
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  priority?: NotificationPriority;
  /**
   * Stable key identifying "this exact message". A daily job that asks for
   * `lease-expiry:{leaseId}` every morning sends once: the second insert
   * violates the unique index and is reported as suppressed. Leave it null for
   * one-off messages.
   */
  dedupeKey?: string;
  /** Which channels to attempt. Defaults to in-app only. */
  channels?: NotificationChannel[];
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: NotificationStatus;
  reason?: string;
}

/**
 * A channel that can put a message somewhere.
 *
 * Channels are separate rows per message rather than columns on one row, so a
 * provider outage loses only that channel's delivery and the others still land.
 * A channel that cannot deliver says `SUPPRESSED` with a reason — "we chose not
 * to send this" is a different fact from "we tried and it failed", and an
 * operator reading a log needs to be able to tell them apart.
 */
export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;
  isConfigured(): boolean;
  deliver(
    notification: {
      title: string;
      body: string;
      to: { email?: string | null; phone?: string | null };
    },
    organizationId?: string,
  ): Promise<DeliveryResult>;
}

/**
 * In-app: the only channel that is always available, because it needs no
 * provider, no credentials and no consent. It "delivers" by being readable in
 * the notification list.
 */
@Injectable()
export class InAppChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.IN_APP;

  isConfigured(): boolean {
    return true;
  }

  // Nothing to await: the in-app channel "delivers" by being readable in the
  // notification list, which the row itself is.
  deliver(): Promise<DeliveryResult> {
    return Promise.resolve({
      channel: this.channel,
      status: NotificationStatus.SENT,
    });
  }
}

/**
 * Email and SMS placeholders.
 *
 * They report honestly that nothing is configured rather than pretending to
 * send: there is no SMTP server or SMS provider in this deployment, and a
 * message that silently vanishes into a stub is worse than one recorded as
 * suppressed. Wiring a real provider is a matter of implementing `deliver`
 * against the vendor's client and registering it in `NotificationsModule`.
 */
abstract class UnconfiguredChannelProvider implements NotificationChannelProvider {
  abstract readonly channel: NotificationChannel;

  protected readonly logger = new Logger(this.constructor.name);

  isConfigured(): boolean {
    return false;
  }

  deliver(notification: {
    title: string;
    to: { email?: string | null; phone?: string | null };
  }): Promise<DeliveryResult> {
    this.logger.warn(
      `${this.channel} is not configured — "${notification.title}" was not sent${
        notification.to.email ? ` to ${notification.to.email}` : ''
      }`,
    );
    return Promise.resolve({
      channel: this.channel,
      status: NotificationStatus.SUPPRESSED,
      reason: `No ${this.channel} provider is configured`,
    });
  }
}

@Injectable()
export class EmailChannelProvider extends UnconfiguredChannelProvider {
  readonly channel = NotificationChannel.EMAIL;
}

/**
 * SMS: routed to whichever provider the organization has made active.
 *
 * There is deliberately no "configured" here beyond having an active row: the
 * admin panel enforces one provider per channel, so this resolves a single
 * vendor and calls it. With nothing active the channel is SUPPRESSED with the
 * reason, which is the honest outcome — an SMS nobody set up did not fail, it
 * was never going to be sent.
 */
@Injectable()
export class SmsChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.SMS;

  constructor(
    private prisma: PrismaService,
    private readonly config: NotificationConfigService,
    private readonly providers: SmsProviderRegistry,
  ) {}

  /** Whether *any* organization has SMS set up — see `deliver` for the rest. */
  isConfigured(): boolean {
    return true;
  }

  async deliver(
    notification: {
      title: string;
      body: string;
      to: { email?: string | null; phone?: string | null };
    },
    organizationId?: string,
  ): Promise<DeliveryResult> {
    const target = notification.to.phone;
    if (!target) {
      return {
        channel: this.channel,
        status: NotificationStatus.SUPPRESSED,
        reason: 'Recipient has no phone number on file',
      };
    }

    const active = await this.config.activeProvider(
      organizationId,
      this.channel,
    );
    if (!active) {
      return {
        channel: this.channel,
        status: NotificationStatus.SUPPRESSED,
        reason: 'No SMS provider is active — configure one in the admin panel',
      };
    }

    const result = await this.providers
      .resolve(active.provider)
      .send(
        active.credentials as never,
        { to: target, body: notification.body },
        active.settings,
      );

    return {
      channel: this.channel,
      status: result.status,
      reason: result.reason,
    };
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly inApp: InAppChannelProvider,
    private readonly email: EmailChannelProvider,
    private readonly sms: SmsChannelProvider,
  ) {}

  /**
   * Queue and attempt one message.
   *
   * Idempotent on `dedupeKey`: a repeat is suppressed rather than delivered, so
   * a scheduled job can run every day without asking "did I already?" — the
   * database answers that. Returns one result per channel so a caller can tell
   * that the in-app copy landed while SMS is still unconfigured.
   */
  async notify(
    request: NotificationRequest,
    recipient: NotificationRecipient,
  ): Promise<DeliveryResult[]> {
    if (!recipient.userId && !recipient.tenantId) {
      throw new Error('A notification needs a userId or a tenantId recipient');
    }

    const channels = request.channels ?? [NotificationChannel.IN_APP];
    const priority = request.priority ?? NotificationPriority.NORMAL;
    const results: DeliveryResult[] = [];

    const contact = await this.contactFor(recipient);

    for (const channel of channels) {
      // A critical alert ignores opt-outs: being overcharged, or a lease ending,
      // is not something a tenant can consent to missing.
      if (
        !priorityIsCritical(priority) &&
        !(await this.wants(recipient, request.type, channel))
      ) {
        results.push({
          channel,
          status: NotificationStatus.SUPPRESSED,
          reason: 'Recipient opted out of this channel',
        });
        continue;
      }

      const provider = this.providerFor(channel);
      let outcome: DeliveryResult;
      if (!provider) {
        outcome = {
          channel,
          status: NotificationStatus.SUPPRESSED,
          reason: `No provider registered for ${channel}`,
        };
      } else if (!provider.isConfigured()) {
        outcome = {
          channel,
          status: NotificationStatus.SUPPRESSED,
          reason: `No ${channel} provider is configured`,
        };
      } else {
        outcome = await provider.deliver(
          {
            title: request.title,
            body: request.body,
            to: contact,
          },
          // Which provider is active is per-organization, so the channel has to
          // be told whose configuration to read.
          request.organizationId,
        );
      }

      results.push(outcome);
      const stored = await this.record(request, recipient, channel, outcome);

      // The unique index, not a check, is what stops a daily job repeating
      // itself. When it rejects the row the channel did *not* deliver, so the
      // result is corrected here — otherwise a sweep that sent nothing still
      // reports every recipient as sent, and the count is a lie.
      if (stored === 'duplicate') {
        results[results.length - 1] = {
          channel,
          status: NotificationStatus.SUPPRESSED,
          reason: 'Already sent for this key',
        };
      }
    }

    return results;
  }

  /**
   * Persist the attempt, so the list shows what happened even when suppressed.
   *
   * Returns 'duplicate' when the unique index rejected it — which is the dedupe
   * guard working, not a failure to report.
   */
  private async record(
    request: NotificationRequest,
    recipient: NotificationRecipient,
    channel: NotificationChannel,
    outcome: DeliveryResult,
  ): Promise<'stored' | 'duplicate'> {
    const now = new Date();
    try {
      await this.prisma.notification.create({
        data: {
          organizationId: request.organizationId ?? null,
          userId: recipient.userId ?? null,
          tenantId: recipient.tenantId ?? null,
          type: request.type,
          channel,
          priority: request.priority ?? NotificationPriority.NORMAL,
          title: request.title,
          body: request.body,
          actionUrl: request.actionUrl,
          entityType: request.entityType,
          entityId: request.entityId,
          dedupeKey: request.dedupeKey ?? null,
          status: outcome.status,
          sentAt: outcome.status === NotificationStatus.SENT ? now : null,
          failedAt: outcome.status === NotificationStatus.FAILED ? now : null,
          errorMessage: outcome.reason ?? null,
          // An in-app notification exists to be read, so a delivered one starts
          // unread; anything else has nothing to read.
          readAt: outcome.status === NotificationStatus.SENT ? null : now,
        },
      });
      return 'stored';
    } catch (error) {
      // The unique index on (organizationId, dedupeKey, channel) is the dedupe
      // guarantee. A violation is the mechanism working, not an error.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('dedupeKey')) throw error;
      this.logger.debug(
        `Suppressed duplicate notification (${request.dedupeKey ?? 'no key'} on ${channel})`,
      );
      return 'duplicate';
    }
  }

  private providerFor(
    channel: NotificationChannel,
  ): NotificationChannelProvider | null {
    switch (channel) {
      case NotificationChannel.IN_APP:
        return this.inApp;
      case NotificationChannel.EMAIL:
        return this.email;
      case NotificationChannel.SMS:
        return this.sms;
      default:
        return null;
    }
  }

  private async contactFor(recipient: NotificationRecipient) {
    if (recipient.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: recipient.userId },
        select: { email: true, phone: true },
      });
      return { email: user?.email ?? null, phone: user?.phone ?? null };
    }
    if (recipient.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: recipient.tenantId },
        select: { email: true, phone: true },
      });
      return { email: tenant?.email ?? null, phone: tenant?.phone ?? null };
    }
    return { email: null, phone: null };
  }

  /** No preference row means the channel is wanted — silence means no opt-out. */
  private async wants(
    recipient: NotificationRecipient,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    if (!recipient.userId) return true;
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: recipient.userId, type } },
    });
    if (!preference) return true;
    switch (channel) {
      case NotificationChannel.IN_APP:
        return preference.inApp;
      case NotificationChannel.EMAIL:
        return preference.email;
      case NotificationChannel.SMS:
        return preference.sms;
      case NotificationChannel.PUSH:
        return preference.push;
      default:
        return true;
    }
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  async listForUser(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly
          ? { readAt: null, status: NotificationStatus.SENT }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(options?.limit ?? 50, 200),
    });
  }

  /** For portal residents, who have no user account of their own. */
  async listForTenant(
    tenantId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.prisma.notification.findMany({
      where: {
        tenantId,
        ...(options?.unreadOnly
          ? { readAt: null, status: NotificationStatus.SENT }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(options?.limit ?? 50, 200),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, status: NotificationStatus.SENT },
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await requireRecord(
      this.prisma.notification.findFirst({
        where: { id, userId },
      }),
      'Notification',
    );
    if (notification.readAt) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: count };
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    });
  }

  async setPreference(
    userId: string,
    type: NotificationType,
    data: { inApp?: boolean; email?: boolean; sms?: boolean; push?: boolean },
    organizationId?: string,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        organizationId: organizationId ?? null,
        ...data,
      },
      update: data,
    });
  }
}

function priorityIsCritical(priority: NotificationPriority): boolean {
  return priority === NotificationPriority.CRITICAL;
}

/** Kept for symmetry with the channel providers when a real queue is added. */
export type NotificationTx = Tx;
