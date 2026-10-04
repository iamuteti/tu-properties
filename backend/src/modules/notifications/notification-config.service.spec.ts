/* eslint-disable @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationConfigService } from './notification-config.service';
import { SmsProviderRegistry } from './sms-provider-registry';
import { EmailChannelProvider } from './email-provider';
import {
  decryptCredentials,
  maskCredential,
  encryptCredentials,
} from './credential-crypto';
import { PrismaService } from '@/prisma/prisma.service';

const KEY = 'dummy-test-key-not-a-real-secret';
process.env.NOTIFICATION_CREDENTIALS_KEY = KEY;

/**
 * Configuration rules worth pinning:
 *   1. **only one provider per channel, ever** — enforced by the unique
 *      `(organizationId, channel)` row, not by a check that can be raced,
 *   2. credentials are stored encrypted and never returned in full,
 *   3. saving credentials does not activate them: an admin enters a key, tests
 *      it, then switches over, so a half-typed SID cannot break a live channel,
 *   4. a provider that is not implemented cannot be activated,
 *   5. undecryptable credentials deactivate the channel rather than reporting
 *      "active" for something that cannot send.
 */
describe('NotificationConfigService', () => {
  let service: NotificationConfigService;
  let prisma: ReturnType<typeof mockPrisma>;

  const dummyTwilio = {
    accountSid: 'ACdummysid0000000000000000000000',
    authToken: 'dummy_auth_token_0000000000000000',
  };

  function mockPrisma() {
    const rows = new Map<string, Record<string, unknown>>();
    const key = (organizationId: string, channel: string) =>
      `${organizationId}:${channel}`;

    return {
      rows,
      notificationChannelConfig: {
        findMany: jest.fn(async ({ where }: never) => {
          const { organizationId } = where as unknown as {
            organizationId: string;
          };
          return [...rows.values()].filter(
            (row) => row.organizationId === organizationId,
          );
        }),
        findUnique: jest.fn(async ({ where }: never) => {
          const { organizationId_channel: scope } = where as unknown as {
            organizationId_channel: {
              organizationId: string;
              channel: NotificationChannel;
            };
          };
          return rows.get(key(scope.organizationId, scope.channel)) ?? null;
        }),
        create: jest.fn(async ({ data }: never) => {
          const payload = data as Record<string, unknown>;
          const row = { id: 'cfg-1', ...payload };
          rows.set(
            key(String(payload.organizationId), String(payload.channel)),
            row,
          );
          return row;
        }),
        update: jest.fn(async ({ where, data }: never) => {
          const scope = where as unknown as {
            id?: string;
            organizationId_channel?: {
              organizationId: string;
              channel: NotificationChannel;
            };
          };
          // Updated by scope when an admin changes a channel, and by id when
          // the delivery path deactivates one it cannot decrypt.
          const existing = scope.id
            ? [...rows.values()].find((row) => row.id === scope.id)!
            : rows.get(
                key(
                  scope.organizationId_channel!.organizationId,
                  scope.organizationId_channel!.channel,
                ),
              )!;
          const channelKey = key(
            String(existing.organizationId),
            String(existing.channel),
          );
          const row = { ...existing, ...(data as Record<string, unknown>) };
          rows.delete(channelKey);
          rows.set(channelKey, row);
          return row;
        }),
        upsert: jest.fn(async ({ where, create, update }: never) => {
          const { organizationId_channel: scope } = where as unknown as {
            organizationId_channel: {
              organizationId: string;
              channel: NotificationChannel;
            };
          };
          const existing = rows.get(key(scope.organizationId, scope.channel));
          const row = existing
            ? { ...existing, ...(update as Record<string, unknown>) }
            : { id: 'cfg-1', ...(create as Record<string, unknown>) };
          rows.set(key(scope.organizationId, scope.channel), row);
          return row;
        }),
      },
    };
  }

  beforeEach(async () => {
    process.env.NOTIFICATION_CREDENTIALS_KEY = KEY;
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationConfigService,
        { provide: PrismaService, useValue: prisma },
        // The test-send path resolves a vendor client; these tests never send,
        // so the real registry is fine and nothing needs stubbing.
        {
          provide: SmsProviderRegistry,
          useFactory: () => new SmsProviderRegistry(),
        },
        // Test sends are exercised in the provider's own spec; here a stub
        // keeps these tests about storage, masking and activation.
        { provide: EmailChannelProvider, useValue: { testSend: jest.fn() } },
      ],
    }).compile();
    service = module.get(NotificationConfigService);
  });

  describe('credential storage', () => {
    it('round-trips credentials', () => {
      const encrypted = encryptCredentials(dummyTwilio, KEY);
      expect(encrypted).not.toContain('ACdummysid');
      expect(decryptCredentials(encrypted, KEY)).toEqual(dummyTwilio);
    });

    it('refuses to decrypt with the wrong key', () => {
      const encrypted = encryptCredentials(dummyTwilio, KEY);
      expect(() => decryptCredentials(encrypted, 'a-different-key')).toThrow();
    });

    it('rejects tampered ciphertext', () => {
      const encrypted = encryptCredentials(dummyTwilio, KEY);
      const parts = encrypted.split(':');
      parts[3] = Buffer.from('{"tampered":true}').toString('base64');
      expect(() => decryptCredentials(parts.join(':'), KEY)).toThrow();
    });

    it('masks a secret without disclosing it', () => {
      const masked = maskCredential('ACdummysid0000000000000000000000');
      expect(masked.startsWith('AC')).toBe(true);
      expect(masked.endsWith('00')).toBe(true);
      expect(masked).not.toContain('dummysid');
    });

    it('explains itself when no encryption key is set', () => {
      delete process.env.NOTIFICATION_CREDENTIALS_KEY;
      expect(() => encryptCredentials(dummyTwilio)).toThrow(
        /NOTIFICATION_CREDENTIALS_KEY/,
      );
      process.env.NOTIFICATION_CREDENTIALS_KEY = KEY;
    });
  });

  describe('saving', () => {
    it('rejects an unknown provider', async () => {
      await expect(
        service.save('org-1', {
          channel: NotificationChannel.SMS,
          provider: 'CARRIER_PIGEON',
          credentials: dummyTwilio,
        }),
      ).rejects.toThrow(/unknown provider/i);
    });

    it('rejects an SMS provider configured for email', async () => {
      await expect(
        service.save('org-1', {
          channel: NotificationChannel.EMAIL,
          provider: 'TWILIO',
          credentials: dummyTwilio,
        }),
      ).rejects.toThrow(/cannot be configured for EMAIL/i);
    });

    it('requires the fields the provider needs', async () => {
      await expect(
        service.save('org-1', {
          channel: NotificationChannel.SMS,
          provider: 'TWILIO',
          credentials: { accountSid: dummyTwilio.accountSid },
        }),
      ).rejects.toThrow(/Auth token/);
    });

    it('stores encrypted and does not activate', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });

      const row = prisma.rows.get('org-1:SMS')!;
      expect(row.credentialsEncrypted).not.toContain('ACdummysid');
      expect(
        decryptCredentials(row.credentialsEncrypted as string, KEY),
      ).toEqual(dummyTwilio);
      // Deliberately inactive: the admin tests it, then activates.
      expect(row.isActive).toBe(false);
    });

    it('keeps an existing secret when only settings are saved', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: { from: 'TUHAME' },
      });

      const row = prisma.rows.get('org-1:SMS')!;
      const merged = decryptCredentials(
        row.credentialsEncrypted as string,
        KEY,
      );
      // The masked field came back empty, which means "unchanged" — the token
      // must survive rather than being wiped by a blank input.
      expect(merged.authToken).toBe(dummyTwilio.authToken);
      expect(merged.from).toBe('TUHAME');
    });

    it('never returns credentials in full', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
        updatedBy: 'admin-1',
      });
      await service.activate('org-1', NotificationChannel.SMS);

      const channels = await service.list('org-1');
      const sms = channels.find(
        (entry) => entry.channel === NotificationChannel.SMS,
      )!;
      expect(sms.active).toBe(true);
      expect(sms.maskedCredentials?.authToken).not.toBe(dummyTwilio.authToken);
      expect(sms.maskedCredentials?.accountSid).not.toBe(
        dummyTwilio.accountSid,
      );
    });
  });

  describe('one provider at a time', () => {
    it('has exactly one row per channel, so switching is an update', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'AFRICAS_TALKING',
        credentials: { apiKey: 'dummy_api_key', username: 'sandbox' },
      });
      await service.activate('org-1', NotificationChannel.SMS);

      const rows = [...prisma.rows.values()].filter(
        (row) => row.channel === NotificationChannel.SMS,
      );
      // Africa's Talking replaced Twilio rather than being added alongside it.
      expect(rows).toHaveLength(1);
      expect(rows[0].provider).toBe('AFRICAS_TALKING');
      expect(rows[0].isActive).toBe(true);
    });

    it('keeps each organization separate', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      await service.save('org-2', {
        channel: NotificationChannel.SMS,
        provider: 'AFRICAS_TALKING',
        credentials: { apiKey: 'dummy', username: 'other' },
      });
      expect(prisma.rows.size).toBe(2);
    });

    it('activates SMTP now that it has a client behind it', async () => {
      // Email was refused at activation for a while. That was a missing mail
      // client, not a design decision, and it is now implemented.
      await service.save('org-1', {
        channel: NotificationChannel.EMAIL,
        provider: 'SMTP',
        credentials: {
          host: 'smtp.example.com',
          port: '587',
          username: 'user',
          password: 'dummy',
          from: 'noreply@example.com',
        },
      });
      const activated = await service.activate(
        'org-1',
        NotificationChannel.EMAIL,
      );
      expect(activated.isActive).toBe(true);
    });

    it('refuses to activate a provider that is not implemented', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      // A row naming a vendor nobody has written a client for cannot be
      // switched on, however plausible the name.
      const row = prisma.rows.get(`org-1:${NotificationChannel.SMS}`)!;
      row.provider = 'CARRIER_PIGEON';
      await expect(
        service.activate('org-1', NotificationChannel.SMS),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to activate undecryptable credentials', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      const row = prisma.rows.get('org-1:SMS')!;
      row.credentialsEncrypted = 'v1:aaaa:bbbb:cccc';

      await expect(
        service.activate('org-1', NotificationChannel.SMS),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deactivates a channel whose credentials stopped decrypting', async () => {
      await service.save('org-1', {
        channel: NotificationChannel.SMS,
        provider: 'TWILIO',
        credentials: dummyTwilio,
      });
      await service.activate('org-1', NotificationChannel.SMS);
      const row = prisma.rows.get('org-1:SMS')!;
      row.credentialsEncrypted = 'v1:aaaa:bbbb:cccc';

      expect(
        await service.activeProvider('org-1', NotificationChannel.SMS),
      ).toBeNull();
      // Silently reporting "active" for something that cannot send is the worse
      // failure, so the channel is switched off and the delivery is suppressed.
      expect(prisma.rows.get('org-1:SMS')!.isActive).toBe(false);
    });

    it('reports an unconfigured channel honestly', async () => {
      const channels = await service.list('org-1');
      const sms = channels.find(
        (entry) => entry.channel === NotificationChannel.SMS,
      )!;
      expect(sms).toMatchObject({ configured: false, active: false });
    });
  });

  describe('catalogue', () => {
    it('lists both SMS providers with their fields', () => {
      const catalogue = service.catalogue();
      const twilio = catalogue.find((entry) => entry.id === 'TWILIO');
      expect(twilio?.fields.map((field) => field.name)).toContain('authToken');
      expect(
        twilio?.fields.find((field) => field.name === 'authToken')?.secret,
      ).toBe(true);

      const africa = catalogue.find((entry) => entry.id === 'AFRICAS_TALKING');
      expect(africa?.fields.map((field) => field.name)).toContain('apiKey');
    });

    it('resolves only implemented providers', () => {
      const registry = new SmsProviderRegistry();
      expect((registry.resolve('TWILIO') as unknown as { id: string }).id).toBe(
        'TWILIO',
      );
      expect(
        (registry.resolve('AFRICAS_TALKING') as unknown as { id: string }).id,
      ).toBe('AFRICAS_TALKING');
      expect(() => registry.resolve('CARRIER_PIGEON')).toThrow(
        /not implemented/i,
      );
    });
  });
});
