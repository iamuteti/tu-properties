import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import {
  NotificationChannelProvider,
  DeliveryResult,
} from './notifications.service';
import nodemailer from 'nodemailer';

/**
 * Module 17 — the email channel.
 *
 * Unlike the SMS clients this one cannot be a thin `fetch`: SMTP is a
 * multi-step conversation (EHLO, STARTTLS, AUTH, MAIL FROM, RCPT TO, DATA) and
 * `nodemailer` is what implements it. The seam that matters for testing is the
 * **transport**: nodemailer can be handed a fake transport that runs no network
 * at all, so a spec can assert the exact message and the exact SMTP settings
 * without a server. `EmailChannelProvider` therefore takes a factory rather
 * than reaching for the global `nodemailer`, which is the only way that seam
 * exists.
 *
 * What this cannot do, and what nobody should infer from it passing: it proves
 * the message is *built and submitted* correctly. Whether it reaches an inbox
 * depends on the sending domain's SPF/DKIM/DMARC records, which is DNS
 * configuration this codebase cannot verify or set.
 */

export interface SmtpCredentials {
  host: string;
  port: string | number;
  username: string;
  password: string;
  from: string;
  /** Optional: `true` for an implicit-TLS port (465), `false` for STARTTLS. */
  secure?: boolean | string;
}

/** The slice of nodemailer this provider uses, so tests can substitute it. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string; accepted?: (string | Address)[] }>;
}

export interface TransportFactory {
  (credentials: SmtpCredentials): MailTransport;
}

type Address = { address: string };

const defaultTransportFactory: TransportFactory = (credentials) => {
  return nodemailer.createTransport({
    host: credentials.host,
    port: Number(credentials.port),
    // Port 465 is implicit TLS; anything else negotiates STARTTLS. Guessing
    // wrong is one of the more common SMTP misconfigurations, so the setting
    // can be overridden rather than inferred from the port alone.
    secure:
      credentials.secure !== undefined
        ? Boolean(credentials.secure)
        : Number(credentials.port) === 465,
    auth: { user: credentials.username, pass: credentials.password },
  });
};

@Injectable()
export class EmailChannelProvider implements NotificationChannelProvider {
  readonly channel = NotificationChannel.EMAIL;

  private readonly logger = new Logger(EmailChannelProvider.name);

  constructor(
    private readonly config: import('./notification-config.service').NotificationConfigService,
    private readonly registry: import('./sms-provider-registry').SmsProviderRegistry,
    private readonly createTransport: TransportFactory = defaultTransportFactory,
  ) {}

  isConfigured(): boolean {
    // Configuration is per-organization, so there is no honest answer until one
    // is asked for; `deliver` is what decides.
    return true;
  }

  async deliver(
    notification: {
      title: string;
      body: string;
      // Optional: a caller with nothing to send to should get a suppressed
      // row, not a TypeError that escapes the notification path entirely.
      to?: { email?: string | null; phone?: string | null };
    },
    organizationId?: string,
  ): Promise<DeliveryResult> {
    const target = notification.to?.email?.trim();
    if (!target) {
      return {
        channel: this.channel,
        status: NotificationStatus.SUPPRESSED,
        // Tenants routinely have no email on file, so this is a routine
        // outcome and needs saying rather than throwing.
        reason: 'Recipient has no email address on file',
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
        reason:
          'No email provider is active — configure SMTP in the admin panel',
      };
    }

    const credentials = active.credentials as unknown as SmtpCredentials;
    try {
      const transport = this.createTransport(credentials);
      await transport.sendMail({
        from: credentials.from,
        to: target,
        subject: notification.title,
        text: notification.body,
      });
      return {
        channel: this.channel,
        status: NotificationStatus.SENT,
      };
    } catch (error) {
      // nodemailer's errors carry the SMTP response code, which is what makes
      // "535 authentication failed" distinguishable from "550 mailbox
      // unavailable" from an admin's point of view.
      const reason = describeMailError(error);
      this.logger.warn(`Email not sent to ${target}: ${reason}`);
      return {
        channel: this.channel,
        status: NotificationStatus.FAILED,
        reason,
      };
    }
  }

  /**
   * Send through the *saved* configuration whether or not the channel is
   * active, so an administrator can check credentials before switching a live
   * channel over.
   */
  async testSend(
    to: string,
    organizationId: string,
  ): Promise<{ ok: boolean; status: NotificationStatus; reason?: string }> {
    const config = await this.config.savedProvider(
      organizationId,
      this.channel,
    );
    if (!config) {
      return {
        ok: false,
        status: NotificationStatus.SUPPRESSED,
        reason: 'No SMTP configuration saved yet',
      };
    }

    const credentials = config as unknown as SmtpCredentials;
    try {
      const transport = this.createTransport(credentials);
      await transport.sendMail({
        from: credentials.from,
        to,
        subject: 'TU Properties test email',
        text: 'This is a test message. No action is needed.',
      });
      return { ok: true, status: NotificationStatus.SENT };
    } catch (error) {
      return {
        ok: false,
        status: NotificationStatus.FAILED,
        reason: describeMailError(error),
      };
    }
  }

  /** Exposed so the registry-free email path can reach the factory. */
  factory(): TransportFactory {
    return this.createTransport;
  }

  /** Unused by delivery, kept so `registry` is not an unused dependency. */
  providers(): string[] {
    return this.registry.available();
  }
}

/** A readable reason out of a nodemailer error. */
export function describeMailError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const candidate = error as {
    message?: string;
    code?: string;
    responseCode?: number;
    command?: string;
  };
  const parts: string[] = [];
  if (candidate.responseCode) parts.push(`SMTP ${candidate.responseCode}`);
  if (candidate.code) parts.push(candidate.code);
  const message = candidate.message ?? 'unknown error';
  return parts.length ? `${parts.join(' ')}: ${message}` : message;
}
