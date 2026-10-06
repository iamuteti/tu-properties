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
    contracts: unknown[] = [],
    recipients: { id: string }[] = [],
  ) {
    return {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      rentalAgreement: { findMany: jest.fn().mockResolvedValue(leases) },
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        // Module 15: the contract sweep resolves its staff audience before it looks
        // at any contract, so this has to answer even when there are no contracts.
        // Defaulting to no recipients is what keeps the lease and rent expectations in
        // this file unchanged - with nobody to tell, the sweep sends nothing.
        findMany: jest.fn().mockResolvedValue(recipients),
      },
      contract: { findMany: jest.fn().mockResolvedValue(contracts) },
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
    expect(summary).toEqual({ leases: 0, due: 0, overdue: 0, contracts: 0 });
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
    expect(sentTo(0).dedupeKey).toBe(sentTo(1).dedupeKey);
  });

  /**
   * What a `notify` call was asked for.
   *
   * `jest.Mock` types `calls` as `any[][]`, so `calls[0][0].type` is an unsafe chain
   * that reads `undefined` when the mock was never called - and a test asserting on a
   * field the mock was not given passes for the wrong reason. Typed at this one
   * boundary so a renamed notification field becomes a compile error.
   */
  interface NotifyCall {
    type: string;
    title: string;
    body: string;
    priority: string;
    dedupeKey: string;
  }

  const sentTo = (index: number): NotifyCall =>
    notifications.notify.mock.calls[index][0];
  const sentToUser = (index: number) =>
    notifications.notify.mock.calls[index][1] as {
      userId?: string;
      tenantId?: string;
    };

  /** The `where` a mocked Prisma call was given, typed at the same boundary. */
  interface QueryCall {
    where: {
      expiresAt: { gt: Date; lte: Date };
      renewals: unknown;
    };
  }
  const queriedWith = (mock: jest.Mock): QueryCall => mock.mock.calls[0][0];

  /**
   * Module 15 - the contract sweep. The rules worth pinning are the ones an
   * expiry-only reminder would get wrong: the notice deadline is its own alert, an
   * auto-renewing contract is only worth an alert when you want to *stop* it, and a
   * superseded contract is not news every morning.
   */
  describe('contract expiry', () => {
    const ON = new Date('2026-10-01T00:00:00.000Z');
    const day = 86_400_000;
    const inDays = (days: number) => new Date(ON.getTime() + days * day);

    function contract(over: Record<string, unknown> = {}) {
      return {
        id: 'contract-1',
        reference: 'CON-2026-0001',
        title: 'Supply agreement - Nairobi Water',
        type: 'VENDOR',
        expiresAt: inDays(60),
        noticeDays: 30,
        autoRenew: false,
        rentalAgreementId: null,
        rentalAgreement: null,
        ...over,
      };
    }

    async function sweep(
      contracts: Record<string, unknown>[],
      recipients: { id: string }[] = [{ id: 'user-1' }, { id: 'user-2' }],
    ) {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationTriggersService,
          {
            provide: PrismaService,
            useValue: mockPrisma([], [], contracts, recipients),
          },
          { provide: NotificationsService, useValue: notifications },
        ],
      }).compile();
      const local = module.get(NotificationTriggersService);
      const summary = await local.runDailyReminders(ON);
      return { summary, mock: notifications };
    }

    beforeEach(() => {
      notifications.notify = jest
        .fn()
        .mockResolvedValue([
          { channel: 'IN_APP', status: NotificationStatus.SENT },
        ]);
    });

    it('says nothing when the organization has nobody to tell', async () => {
      // Better a silent sweep than a reminder addressed to nobody.
      const { summary } = await sweep([contract()], []);
      expect(summary.contracts).toBe(0);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('alerts at the band, once per recipient', async () => {
      const { summary } = await sweep([contract({ expiresAt: inDays(60) })]);
      expect(summary.contracts).toBe(1);
      expect(notifications.notify).toHaveBeenCalledTimes(2);
      expect(sentToUser(0)).toEqual({ userId: 'user-1' });
    });

    it('uses CONTRACT_EXPIRING, addressed to a user rather than a tenant', async () => {
      // A different type from LEASE_EXPIRING because the audience is different: this
      // goes to staff who can still act, that one goes to the resident.
      await sweep([contract({ expiresAt: inDays(60) })]);
      expect(sentTo(0).type).toBe('CONTRACT_EXPIRING');
      expect(sentToUser(0).tenantId).toBeUndefined();
    });

    it('alerts at the notice deadline, not the expiry, when notice is longer', async () => {
      // 40 days left, 90 days' notice. Without folding noticeDays into the bands,
      // this would first surface at the generic 30-day band - by which point serving
      // notice was already impossible.
      const { summary } = await sweep([
        contract({ expiresAt: inDays(40), noticeDays: 90 }),
      ]);
      expect(summary.contracts).toBe(1);
      expect(sentTo(0).title).toContain('notice period has passed');
      expect(sentTo(0).priority).toBe('CRITICAL');
    });

    it('quantises upward, so a cron miss does not walk a contract past every band', async () => {
      // 58 days left: past the 60-day band's *upper* edge but still reported against
      // it, which is what makes a missed run still alert.
      const { summary } = await sweep([
        contract({ expiresAt: inDays(58), noticeDays: 30 }),
      ]);
      expect(summary.contracts).toBe(1);
    });

    it('is silent on an auto-renewing contract until notice is the issue', async () => {
      // It renews by itself; nagging about it trains people to ignore the report.
      const quiet = await sweep([
        contract({ expiresAt: inDays(60), autoRenew: true }),
      ]);
      expect(quiet.summary.contracts).toBe(0);

      const urgent = await sweep([
        contract({ expiresAt: inDays(40), noticeDays: 90, autoRenew: true }),
      ]);
      expect(urgent.summary.contracts).toBe(1);
      expect(sentTo(0).title).toContain('notice period');
    });

    it('dedupes per contract, per band, per day', async () => {
      await sweep([contract({ expiresAt: inDays(60) })]);
      const keys = [0, 1].map((index) => sentTo(index).dedupeKey);
      expect(new Set(keys).size).toBe(2);
      for (const key of keys) {
        expect(key).toContain('contract-1:60:2026-10-01:');
      }
    });

    it('reads the lease end date when the contract carries none', async () => {
      // `LEASE` contracts deliberately leave their own dates empty so the register does
      // not hold a second copy of the lease's term. If the sweep did not apply the same
      // fallback as the service, this contract would never be reported.
      const { summary } = await sweep([
        contract({
          type: 'LEASE',
          expiresAt: null,
          noticeDays: null,
          rentalAgreementId: 'lease-1',
          rentalAgreement: { endDate: inDays(20), noticePeriodDays: null },
        }),
      ]);
      expect(summary.contracts).toBe(1);
    });

    it('skips a contract with no end date anywhere', async () => {
      const { summary } = await sweep([
        contract({ type: 'COMPLIANCE', expiresAt: null }),
      ]);
      expect(summary.contracts).toBe(0);
    });

    it('never asks for a superseded contract', async () => {
      const local = mockPrisma([], [], [contract()], [{ id: 'user-1' }]);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationTriggersService,
          { provide: PrismaService, useValue: local },
          { provide: NotificationsService, useValue: notifications },
        ],
      }).compile();
      await module.get(NotificationTriggersService).runDailyReminders(ON);
      // The filter lives in the query, not in JS: a replaced contract that expired
      // three years ago must not be re-queried and re-filtered every single morning.
      expect(queriedWith(local.contract.findMany).where.renewals).toEqual({
        none: {},
      });
    });

    it('bounds the query on both sides', async () => {
      const local = mockPrisma([], [], [], [{ id: 'user-1' }]);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationTriggersService,
          { provide: PrismaService, useValue: local },
          { provide: NotificationsService, useValue: notifications },
        ],
      }).compile();
      await module.get(NotificationTriggersService).runDailyReminders(ON);
      const where = queriedWith(local.contract.findMany).where;
      expect(where.expiresAt.gt).toEqual(ON);
      expect(where.expiresAt.lte.getTime()).toBeGreaterThan(ON.getTime());
    });
  });
});
