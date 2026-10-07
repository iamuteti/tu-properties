import { Test, type TestingModule } from '@nestjs/testing';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { LandlordNotificationsService } from './landlord-notifications.service';

/**
 * Module 17's landlord triggers.
 *
 * Four things are worth pinning here, and three of them are about *not* doing something:
 *
 * 1. An owner statement and an owner payout are both addressed by `landlordId`.
 * 2. **`IN_APP` is deliberately absent.** A landlord has no login, so an in-app row
 *    would sit unread in a list nobody can open — which makes the one screen an
 *    administrator does check look busy rather than making the owner informed.
 * 3. **Every method swallows its own failure.** Issuing a statement is the accounting
 *    department's work; failing it because a mail server was slow would be worse than
 *    an owner who finds out by looking.
 * 4. A landlord in another organization is **not** notified, even with a valid id —
 *    the lookup is tenant-scoped, so the addressing cannot cross a tenant line.
 */
describe('LandlordNotificationsService', () => {
  let service: LandlordNotificationsService;
  let prisma: {
    landlord: { findFirst: jest.Mock };
  };
  let notifications: { notify: jest.Mock };

  /**
   * The arguments of the single `notify()` call, typed.
   *
   * Reading `mock.calls[0][0].body` directly is `any` all the way down, which is
   * seven `no-unsafe-*` errors and — worse — no check that the object has a `body` at
   * all. Narrowing once here means every assertion below is checked against the shape
   * the service actually sends, so renaming a field breaks the test rather than
   * silently matching `undefined`.
   */
  interface SentRequest {
    type: NotificationType;
    title: string;
    body: string;
    priority: NotificationPriority;
    channels?: NotificationChannel[];
  }
  const sent = (): {
    request: SentRequest;
    recipient: { landlordId?: string };
  } => {
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    const [request, recipient] = notifications.notify.mock.calls[0] as [
      SentRequest,
      { landlordId?: string },
    ];
    return { request, recipient };
  };

  beforeEach(async () => {
    prisma = {
      landlord: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'land-1', email: 'o@b.co' }),
      },
    };
    notifications = { notify: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandlordNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(LandlordNotificationsService);
  });

  const statement = {
    organizationId: 'org-1',
    landlordId: 'land-1',
    statementId: 'ost-1',
    reference: 'OST-202609-0001',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    netPayout: 123_456,
    currency: 'KES',
  };

  describe('a statement being issued', () => {
    it('addresses the owner by landlordId, not by a user', async () => {
      await service.announceStatementIssued(statement);

      const { request, recipient } = sent();
      expect(request.type).toBe(NotificationType.OWNER_STATEMENT_READY);
      expect(recipient.landlordId).toBe('land-1');
    });

    it('goes to email and SMS but not to the in-app bell', async () => {
      await service.announceStatementIssued(statement);

      const { request } = sent();
      // Absent channels would mean the service is relying on the default, which is
      // IN_APP - exactly the channel an owner cannot open. Asserted explicitly rather
      // than defaulted, because the default is the thing that must not happen here.
      expect(request.channels).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
      ]);
      expect(request.channels).not.toContain(NotificationChannel.IN_APP);
    });

    it('is NORMAL, because a bill is not an emergency', async () => {
      // CRITICAL bypasses opt-outs, and that lane belongs to being overcharged or
      // losing a tenancy - not to a monthly statement.
      await service.announceStatementIssued(statement);
      expect(sent().request.priority).toBe(NotificationPriority.NORMAL);
    });

    it('quotes the period and the figure', async () => {
      await service.announceStatementIssued(statement);

      const { request } = sent();
      expect(request.body).toContain('2026-09-01 to 2026-09-30');
      expect(request.body).toContain('123456 KES');
    });

    it('says nothing to a landlord who is not in this organization', async () => {
      prisma.landlord.findFirst.mockResolvedValue(null);

      await service.announceStatementIssued(statement);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('scopes the lookup, so a cross-tenant id cannot be reached', async () => {
      await service.announceStatementIssued(statement);
      expect(prisma.landlord.findFirst).toHaveBeenCalledWith({
        where: { id: 'land-1', organizationId: 'org-1' },
        select: { id: true, email: true },
      });
    });

    it('swallows a dispatch failure rather than failing the issue', async () => {
      notifications.notify.mockRejectedValue(new Error('SMTP timeout'));

      // The bug this guards against is the exception escaping into the caller, where
      // it would roll back or 500 a statement that was already issued.
      await expect(
        service.announceStatementIssued(statement),
      ).resolves.toBeUndefined();
    });
  });

  describe('a payout being paid', () => {
    const payout = {
      organizationId: 'org-1',
      landlordId: 'land-1',
      payoutId: 'po-1',
      reference: 'PAY-2026-0001',
      amount: 500_000,
      currency: 'KES',
      bankReference: 'BNK-99887',
    };

    it('addresses the owner and carries the bank reference', async () => {
      await service.announcePayoutPaid(payout);

      const { request, recipient } = sent();
      expect(request.type).toBe(NotificationType.PAYOUT_PAID);
      expect(request.body).toContain('BNK-99887');
      expect(recipient.landlordId).toBe('land-1');
    });

    it('leads the title with the figure, not an internal row id', async () => {
      // `LandlordPayout` has no payout number, and its `reference` column is the *bank*
      // reference. The first version of this message put the cuid in the subject line,
      // which is an internal row id addressed to a person.
      await service.announcePayoutPaid(payout);

      const { request } = sent();
      expect(request.title).toContain('500000 KES');
      expect(request.title).not.toContain('po-1');
    });

    it('still sends without a bank reference, and says so', async () => {
      // A payout marked PAID requires a reference server-side, so this is a defensive
      // path — but it must not silently produce a message with a hole in it.
      await service.announcePayoutPaid({ ...payout, bankReference: null });

      expect(sent().request.body).toContain('Contact your property manager');
    });

    it('swallows a dispatch failure', async () => {
      notifications.notify.mockRejectedValue(new Error('vendor 503'));
      await expect(service.announcePayoutPaid(payout)).resolves.toBeUndefined();
    });
  });
});
