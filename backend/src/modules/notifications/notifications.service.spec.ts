import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import {
  InAppChannelProvider,
  NotificationsService,
  SmsChannelProvider,
} from './notifications.service';
import { EmailChannelProvider } from './email-provider';
import { NotificationConfigService } from './notification-config.service';
import { SmsProviderRegistry } from './sms-provider-registry';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Delivery rules worth pinning:
 *   1. one message to three channels is three rows, so a provider being down
 *      does not lose the others,
 *   2. an unconfigured channel reports SUPPRESSED with a reason — "we chose not
 *      to send" is not the same fact as "it failed",
 *   3. a critical alert ignores opt-outs,
 *   4. a duplicate dedupeKey is suppressed, and *reported* as suppressed.
 */
describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof mockPrisma>;

  function mockPrisma() {
    return {
      notification: {
        create: jest.fn().mockResolvedValue({ id: 'n-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'n-1', readAt: null }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'n-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        count: jest.fn().mockResolvedValue(2),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ data }: any) => data),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'a@b.co', phone: '0700' }),
      },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 't@b.co', phone: '0701' }),
      },
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        InAppChannelProvider,
        // The SMTP provider has its own spec; here a stub stands in so these
        // tests stay about routing and suppression, not about mail.
        {
          provide: EmailChannelProvider,
          useValue: {
            channel: 'EMAIL',
            isConfigured: () => false,
            deliver: () =>
              Promise.resolve({
                channel: 'EMAIL',
                status: NotificationStatus.SUPPRESSED,
                reason:
                  'No email provider is active — configure SMTP in the admin panel',
              }),
            testSend: () =>
              Promise.resolve({
                ok: false,
                status: NotificationStatus.SUPPRESSED,
              }),
          },
        },
        SmsChannelProvider,
        { provide: PrismaService, useValue: prisma },
        // SMS routes through whichever provider the organization has made
        // active; with nothing configured it is suppressed, which is what these
        // tests assert.
        {
          provide: NotificationConfigService,
          useValue: { activeProvider: jest.fn().mockResolvedValue(null) },
        },
        { provide: SmsProviderRegistry, useValue: { resolve: jest.fn() } },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('refuses a message with nobody to send it to', async () => {
    await expect(
      service.notify(
        { type: NotificationType.CUSTOM, title: 'x', body: 'y' },
        {},
      ),
    ).rejects.toThrow(/needs a userId or a tenantId/i);
  });

  it('records one row per channel', async () => {
    const results = await service.notify(
      {
        type: NotificationType.RENT_DUE,
        title: 'Rent due',
        body: 'Rent falls due tomorrow',
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
      },
      { tenantId: 'ten-1' },
    );

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(results.map((r) => [r.channel, r.status])).toEqual([
      [NotificationChannel.IN_APP, NotificationStatus.SENT],
      // SMS has no provider configured, and says so rather than pretending.
      [NotificationChannel.SMS, NotificationStatus.SUPPRESSED],
    ]);
  });

  it('explains why an unconfigured channel was not used', async () => {
    const [email] = await service.notify(
      {
        type: NotificationType.CUSTOM,
        title: 'Hi',
        body: 'There',
        channels: [NotificationChannel.EMAIL],
      },
      { userId: 'user-1' },
    );
    expect(email.status).toBe(NotificationStatus.SUPPRESSED);
    expect(email.reason).toMatch(/no email provider is configured/i);
  });

  it('resolves the recipient contact for the channel', async () => {
    await service.notify(
      {
        type: NotificationType.CUSTOM,
        title: 'Hi',
        body: 'There',
        channels: [NotificationChannel.EMAIL],
      },
      { userId: 'user-1' },
    );
    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('suppresses a duplicate and reports it as suppressed', async () => {
    prisma.notification.create.mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`dedupeKey`)'),
    );

    const results = await service.notify(
      {
        type: NotificationType.LEASE_EXPIRING,
        title: 'Lease ending',
        body: 'in 30 days',
        channels: [NotificationChannel.IN_APP],
        dedupeKey: 'lease-expiring:lease-1:30',
      },
      { tenantId: 'ten-1' },
    );

    // The caller must be able to tell "already sent" from "sent", or a daily
    // sweep reports every recipient as notified forever.
    expect(results[0].status).toBe(NotificationStatus.SUPPRESSED);
    expect(results[0].reason).toMatch(/already sent/i);
  });

  it('honours an opt-out for a normal alert', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      inApp: false,
      email: true,
      sms: true,
      push: true,
    });

    const results = await service.notify(
      {
        type: NotificationType.RENT_DUE,
        title: 'Rent due',
        body: 'soon',
        channels: [NotificationChannel.IN_APP],
      },
      { userId: 'user-1' },
    );

    expect(results[0].status).toBe(NotificationStatus.SUPPRESSED);
    expect(results[0].reason).toMatch(/opted out/i);
  });

  it('delivers a critical alert even to someone who opted out', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      inApp: false,
      email: false,
      sms: false,
      push: false,
    });

    const results = await service.notify(
      {
        type: NotificationType.RENT_OVERDUE,
        title: 'Rent overdue',
        body: 'by 30 days',
        priority: 'CRITICAL' as never,
        channels: [NotificationChannel.IN_APP],
      },
      { userId: 'user-1' },
    );

    expect(results[0].status).toBe(NotificationStatus.SENT);
  });

  it('treats a missing preference row as no opt-out', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    const results = await service.notify(
      {
        type: NotificationType.CUSTOM,
        title: 'Hi',
        body: 'There',
        channels: [NotificationChannel.IN_APP],
      },
      { userId: 'user-1' },
    );
    expect(results[0].status).toBe(NotificationStatus.SENT);
  });

  it('starts a delivered notification unread', async () => {
    await service.notify(
      {
        type: NotificationType.CUSTOM,
        title: 'Hi',
        body: 'There',
        channels: [NotificationChannel.IN_APP],
      },
      { userId: 'user-1' },
    );
    expect(prisma.notification.create.mock.calls[0][0].data.readAt).toBeNull();
  });

  it('marks all read for one user only', async () => {
    const result = await service.markAllRead('user-1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', readAt: null } }),
    );
    expect(result).toEqual({ marked: 3 });
  });
});
