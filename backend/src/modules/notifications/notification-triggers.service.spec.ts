import { Test, TestingModule } from '@nestjs/testing';
import { NotificationStatus } from '@prisma/client';
import { NotificationTriggersService } from './notification-triggers.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Trigger rules worth pinning:
 *   1. the expiry window must only fire when we are actually *inside* it —
 *      otherwise the 60-day warning goes out on day one,
 *   2. overdue reminders escalate at milestones rather than daily, because a
 *      tenant told about arrears every morning stops reading any of it,
 *   3. a day with nothing due sends nothing.
 */
describe('NotificationTriggersService', () => {
  let service: NotificationTriggersService;
  let prisma: ReturnType<typeof mockPrisma>;
  let notifications: { notify: jest.Mock };

  function lease(endDate: Date | null) {
    return {
      id: 'lease-1',
      code: 'L-1',
      endDate,
      rentAmount: 20_000,
      currency: 'KES',
      tenantId: 'ten-1',
      unit: { name: 'A1', property: { name: 'Acacia Court' } },
    };
  }

  function mockPrisma(
    leases: ReturnType<typeof lease>[] = [],
    invoices: unknown[] = [],
  ) {
    return {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      rentalAgreement: { findMany: jest.fn().mockResolvedValue(leases) },
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    notifications = {
      notify: jest
        .fn()
        .mockResolvedValue([
          { channel: 'IN_APP', status: NotificationStatus.SENT },
        ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTriggersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(NotificationTriggersService);
  });

  it('sends nothing on a day with nothing due', async () => {
    const summary = await service.runDailyReminders(new Date('2026-10-01'));
    expect(summary).toEqual({ leases: 0, due: 0, overdue: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('reminds about a lease ending inside the window', async () => {
    const in20Days = new Date('2026-10-21');
    prisma.rentalAgreement.findMany.mockResolvedValue([lease(in20Days)]);

    const summary = await service.runDailyReminders(new Date('2026-10-01'));
    expect(summary.leases).toBeGreaterThan(0);

    const reminder = notifications.notify.mock.calls
      .map((call) => call[0])
      .find((request) => request.type === 'LEASE_EXPIRING');
    expect(reminder.title).toMatch(/ending in 20 days/i);
    expect(reminder.dedupeKey).toMatch(/lease-expiring:lease-1:30$/);
  });

  it('does not send the 60-day warning for a lease 20 days out', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([
      lease(new Date('2026-10-21')),
    ]);
    await service.runDailyReminders(new Date('2026-10-01'));

    const keys = notifications.notify.mock.calls.map(
      (call) => call[0].dedupeKey,
    );
    // 20 days is inside the 30- and 14-day windows, not the 60-day one.
    expect(keys).toContain('lease-expiring:lease-1:30');
    expect(keys).not.toContain('lease-expiring:lease-1:60');
  });

  it('marks a lease within 14 days as critical', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([
      lease(new Date('2026-10-05')),
    ]);
    await service.runDailyReminders(new Date('2026-10-01'));

    const reminder = notifications.notify.mock.calls
      .map((call) => call[0])
      .find((request) => request.type === 'LEASE_EXPIRING');
    expect(reminder.priority).toBe('CRITICAL');
  });

  it('escalates overdue rent at milestones, not daily', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-1',
        balanceAmount: 5_000,
        dueDate: new Date('2026-09-24'),
        rentalAgreement: { tenantId: 'ten-1' },
      },
    ]);

    await service.runDailyReminders(new Date('2026-10-01'));
    const keys = notifications.notify.mock.calls
      .map((call) => call[0].dedupeKey)
      .filter((key: string) => key?.startsWith('rent-overdue'));
    // 7 days past due crosses the 7-day milestone; the 1- and 30-day ones do not.
    expect(keys).toContain('rent-overdue:inv-1:7');
    expect(keys).not.toContain('rent-overdue:inv-1:1');
  });

  it('addresses a request decision to the portal login when there is one', async () => {
    await service.notifyRequestDecision({
      organizationId: 'org-1',
      tenantId: 'ten-1',
      type: 'REQUEST_APPROVED' as never,
      requestId: 'req-1',
      decisionNote: 'Renewed for another year.',
    });

    const [request, recipient] = notifications.notify.mock.calls[0];
    expect(recipient).toEqual({ userId: 'user-1' });
    expect(request.title).toMatch(/approved/i);
    expect(request.body).toBe('Renewed for another year.');
    expect(request.dedupeKey).toBe('request-decision:req-1:REQUEST_APPROVED');
  });

  it('falls back to the tenant record when there is no portal login', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await service.notifyRequestDecision({
      organizationId: 'org-1',
      tenantId: 'ten-1',
      type: 'REQUEST_REJECTED' as never,
      requestId: 'req-2',
    });
    const [, recipient] = notifications.notify.mock.calls[0];
    expect(recipient).toEqual({ tenantId: 'ten-1' });
  });

  it('deduplicates a decision per outcome', async () => {
    await service.notifyRequestDecision({
      organizationId: 'org-1',
      tenantId: 'ten-1',
      type: 'REQUEST_APPROVED' as never,
      requestId: 'req-3',
    });
    await service.notifyRequestDecision({
      organizationId: 'org-1',
      tenantId: 'ten-1',
      type: 'REQUEST_APPROVED' as never,
      requestId: 'req-3',
    });
    // The same key both times — the unique index suppresses the second.
    expect(notifications.notify.mock.calls[0][0].dedupeKey).toBe(
      notifications.notify.mock.calls[1][0].dedupeKey,
    );
  });
});
