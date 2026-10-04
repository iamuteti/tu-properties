import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import {
  decryptCredentials,
  encryptCredentials,
  maskAll,
} from './credential-crypto';
import {
  isSmsProvider,
} from './sms-providers';
import { SmsProviderRegistry } from './sms-provider-registry';

/**
 * What each provider needs, and which fields are secret.
 *
 * Declared per provider rather than inferred at runtime so the admin panel can
 * render the right inputs and validate before anything is stored — a
 * credentials blob accepted as "whatever you sent" is how a typo in a field
 * name becomes a silent send failure weeks later.
 */
export const PROVIDER_SPECS: Record<
  string,
  {
    label: string;
    channel: NotificationChannel;
    fields: {
      name: string;
      label: string;
      secret: boolean;
      required: boolean;
    }[];
    docsUrl: string;
  }
> = {
  TWILIO: {
    label: 'Twilio',
    channel: NotificationChannel.SMS,
    fields: [
      {
        name: 'accountSid',
        label: 'Account SID',
        secret: false,
        required: true,
      },
      { name: 'authToken', label: 'Auth token', secret: true, required: true },
      { name: 'from', label: 'From number', secret: false, required: false },
    ],
    docsUrl: 'https://console.twilio.com/',
  },
  AFRICAS_TALKING: {
    label: "Africa's Talking",
    channel: NotificationChannel.SMS,
    fields: [
      { name: 'username', label: 'Username', secret: false, required: true },
      { name: 'apiKey', label: 'API key', secret: true, required: true },
      { name: 'from', label: 'Sender ID', secret: false, required: false },
    ],
    docsUrl: 'https://account.africastalking.com/',
  },
  SMTP: {
    label: 'SMTP (email)',
    channel: NotificationChannel.EMAIL,
    fields: [
      { name: 'host', label: 'Host', secret: false, required: true },
      { name: 'port', label: 'Port', secret: false, required: true },
      { name: 'username', label: 'Username', secret: false, required: true },
      { name: 'password', label: 'Password', secret: true, required: true },
      { name: 'from', label: 'From address', secret: false, required: true },
    ],
    docsUrl: 'https://example.com/smtp',
  },
};

export interface ResolvedProviderConfig {
  id: string;
  channel: NotificationChannel;
  provider: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
}

/**
 * Module 17 — provider configuration for the admin panel.
 *
 * **Only one provider is active per channel, and that is a property of the
 * schema rather than of a check**: there is one row per `(organizationId,
 * channel)`, so there is no second provider to activate. Storing credentials
 * rather than reading them from the environment is what lets an administrator
 * configure SMS without a deploy — and it is why they are encrypted at rest.
 */
@Injectable()
export class NotificationConfigService {
  constructor(
    private prisma: PrismaService,
    private readonly registry: SmsProviderRegistry,
  ) {}

  /** Provider catalogue, so the admin panel can render the right form. */
  catalogue() {
    return Object.entries(PROVIDER_SPECS).map(([id, spec]) => ({
      id,
      label: spec.label,
      channel: spec.channel,
      fields: spec.fields,
      docsUrl: spec.docsUrl,
    }));
  }

  /**
   * The current configuration for every channel, with credentials **masked**.
   * There is deliberately no endpoint that returns them in full — an admin can
   * replace a key but not read one back out.
   */
  async list(organizationId: string) {
    const rows = await this.prisma.notificationChannelConfig.findMany({
      where: { organizationId },
    });

    return Promise.all(
      (Object.values(NotificationChannel) as NotificationChannel[]).map(
        async (channel) => {
          const row = rows.find((item) => item.channel === channel);
          if (!row) {
            return {
              channel,
              configured: false,
              active: false,
              provider: null,
              maskedCredentials: null,
              settings: null,
              updatedAt: null,
            };
          }
          let credentials: Record<string, unknown> = {};
          try {
            credentials = decryptCredentials(row.credentialsEncrypted);
          } catch {
            // A key that cannot be decrypted — the encryption key changed, or
            // the row was tampered with — must not leak, and must not be
            // silently reported as configured-and-working.
            return {
              channel,
              configured: false,
              active: false,
              provider: row.provider,
              maskedCredentials: null,
              settings: null,
              updatedAt: row.updatedAt,
              error:
                'Stored credentials could not be decrypted — re-enter them',
            };
          }
          return {
            channel,
            configured: true,
            active: row.isActive,
            provider: row.provider,
            maskedCredentials: maskAll(row.provider, credentials),
            settings: (row.settings ?? {}) as Record<string, unknown>,
            updatedAt: row.updatedAt,
          };
        },
      ),
    );
  }

  /**
   * Store (or replace) a provider's configuration.
   *
   * Saving credentials does **not** activate them: an administrator should be
   * able to enter a key, test it, and only then switch the channel over. So
   * `activate` is a separate, explicit call.
   */
  async save(
    organizationId: string,
    input: {
      channel: NotificationChannel;
      provider: string;
      credentials: Record<string, unknown>;
      settings?: Record<string, unknown>;
      updatedBy?: string;
    },
  ) {
    const spec = PROVIDER_SPECS[input.provider];
    if (!spec) {
      throw new BadRequestException(
        `Unknown provider "${input.provider}". Known providers: ${Object.keys(PROVIDER_SPECS).join(', ')}`,
      );
    }
    if (spec.channel !== input.channel) {
      throw new BadRequestException(
        `${input.provider} is a ${spec.channel} provider and cannot be configured for ${input.channel}`,
      );
    }

    // Merge over what is already stored, so saving only the non-secret setting
    // does not wipe the secret one. Empty values are ignored for the same
    // reason: the admin panel shows masked credentials, and an empty field
    // means "unchanged", not "cleared".
    const existing = await this.prisma.notificationChannelConfig.findUnique({
      where: {
        organizationId_channel: {
          organizationId,
          channel: input.channel,
        },
      },
    });

    let merged: Record<string, unknown> = {};
    if (existing) {
      try {
        merged = decryptCredentials(existing.credentialsEncrypted);
      } catch {
        // Undecryptable: start from empty so the admin must re-enter a secret,
        // rather than carrying a value we cannot actually use.
        merged = {};
      }
    }
    for (const [key, value] of Object.entries(input.credentials ?? {})) {
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        merged[key] = String(value).trim();
      }
    }

    const missing = spec.fields
      .filter((field) => field.required)
      .filter((field) => !merged[field.name])
      .map((field) => field.label);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required for ${spec.label}: ${missing.join(', ')}`,
      );
    }

    const settings = {
      ...((existing?.settings as object) ?? {}),
      ...(input.settings ?? {}),
    };
    // A sender configured in either place should win once, so a message does
    // not go out with no sender when the vendor requires one.
    if (merged.from && !settings.from) settings.from = merged.from;

    return this.prisma.notificationChannelConfig.upsert({
      where: {
        organizationId_channel: { organizationId, channel: input.channel },
      },
      create: {
        organizationId,
        channel: input.channel,
        provider: input.provider,
        credentialsEncrypted: encryptCredentials(merged),
        settings: settings as never,
        isActive: false,
        updatedBy: input.updatedBy,
      },
      update: {
        provider: input.provider,
        credentialsEncrypted: encryptCredentials(merged),
        settings: settings as never,
        updatedBy: input.updatedBy,
      },
    });
  }

  /**
   * Switch a channel onto its configured provider.
   *
   * Since there is one row per channel this cannot leave two providers active —
   * but it does deactivate the channel when the provider is missing or its
   * credentials are unreadable, because "active" that cannot send is worse than
   * "not active" that says so.
   */
  async activate(
    organizationId: string,
    channel: NotificationChannel,
    updatedBy?: string,
  ) {
    const config = await requireRecord(
      this.prisma.notificationChannelConfig.findUnique({
        where: { organizationId_channel: { organizationId, channel } },
      }),
      'Channel configuration',
    );

    // SMTP is catalogued so the admin panel can describe it, but there is no
    // mail client behind it — activating it would report a working channel that
    // sends nothing.
    if (!isSmsProvider(config.provider)) {
      throw new BadRequestException(
        `Provider "${config.provider}" is not implemented and cannot be activated`,
      );
    }
    try {
      decryptCredentials(config.credentialsEncrypted);
    } catch {
      throw new ForbiddenException(
        'Stored credentials could not be decrypted — re-enter them before activating',
      );
    }

    return this.prisma.notificationChannelConfig.update({
      where: {
        organizationId_channel: { organizationId, channel },
      },
      data: { isActive: true, updatedBy },
    });
  }

  async deactivate(
    organizationId: string,
    channel: NotificationChannel,
    updatedBy?: string,
  ) {
    return this.prisma.notificationChannelConfig.update({
      where: { organizationId_channel: { organizationId, channel } },
      data: { isActive: false, updatedBy },
    });
  }

  /**
 * Send a test message through the **saved** configuration, active or not.
 *
 * Testing before activating is the whole reason saving does not activate: an
 * administrator with a freshly typed key needs to know it works before the
 * channel is switched over. With dummy credentials this fails, and reports the
 * vendor's own reason — which is exactly the feedback worth having.
 */
  async testSend(
    organizationId: string,
    channel: NotificationChannel,
    to: string,
  ) {
    if (!to?.trim()) {
      throw new BadRequestException('A test send needs a destination number');
    }
    const config = await this.prisma.notificationChannelConfig.findUnique({
      where: { organizationId_channel: { organizationId, channel } },
    });
    if (!config) {
      throw new NotFoundException(
        'This channel has no provider configured yet',
      );
    }
    if (!isSmsProvider(config.provider)) {
      throw new BadRequestException(
        `${config.provider} is not implemented, so a test send is not possible`,
      );
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = decryptCredentials(config.credentialsEncrypted);
    } catch {
      throw new ForbiddenException(
        'Stored credentials could not be decrypted — re-enter them before testing',
      );
    }

    const result = await this.registry
      .resolve(config.provider)
      .send(credentials as never, {
        to: to.trim(),
        body: 'TU Properties test message — no action needed.',
        sender: (config.settings as { from?: string } | null)?.from ?? null,
      }, (config.settings ?? {}) as Record<string, unknown>);

    return {
      ok: result.status === 'SENT',
      status: result.status,
      reason: result.reason,
      externalId: result.externalId,
    };
  }

  /** What the delivery path uses: the active provider, or null. */
  async activeProvider(
    organizationId: string | undefined,
    channel: NotificationChannel,
  ): Promise<ResolvedProviderConfig | null> {
    if (!organizationId) return null;
    const row = await this.prisma.notificationChannelConfig.findUnique({
      where: { organizationId_channel: { organizationId, channel } },
    });
    if (!row?.isActive) return null;

    try {
      return {
        id: row.id,
        channel: row.channel,
        provider: row.provider,
        credentials: decryptCredentials(row.credentialsEncrypted),
        settings: (row.settings ?? {}) as Record<string, unknown>,
      };
    } catch {
      await this.prisma.notificationChannelConfig
        .update({ where: { id: row.id }, data: { isActive: false } })
        .catch(() => undefined);
      return null;
    }
  }
}
