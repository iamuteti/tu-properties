import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OwnerStatementStatus, PayoutStatus } from '@prisma/client';
import { LandlordPayoutsService } from './landlord-payouts.service';
import { LandlordNotificationsService } from '../landlord-notifications.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Payout rules worth pinning:
 *   1. a payout starts PENDING — status is never set on create,
 *   2. it cannot be created against someone else's statement, or a void one,
 *   3. it cannot be created for more than the statement still owes,
 *   4. marking it PAID needs a reference and settles the statement when it covers it,
 *   5. marking it FAILED needs a reason.
 */
describe('LandlordPayoutsService', () => {
  let service: LandlordPayoutsService;
  let landlordNotifications: {
    announcePayoutPaid: jest.Mock;
  };
  let prisma: ReturnType<typeof mockPrisma>;

  const statement = {
    id: 'stm-1',
    statementNumber: 'OST-202609-0001',
    landlordId: 'land-1',
    organizationId: 'org-1',
    status: OwnerStatementStatus.ISSUED,
    netPayout: 33_900,
  };

  function mockPrisma() {
    const landlordPayout = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'po-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'po-1',
        amount: 20_000,
        status: PayoutStatus.PENDING,
      }),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'po-1', ...data })),
    };
    const ownerStatement = {
      findFirst: jest.fn().mockResolvedValue(statement),
    };
    const landlord = {
      findFirst: jest.fn().mockResolvedValue({ id: 'land-1' }),
    };

    return {
      landlordPayout,
      ownerStatement,
      landlord,
      $transaction: jest.fn(async (fn: any) =>
        typeof fn === 'function'
          ? fn({
              landlordPayout: {
                findMany: landlordPayout.findMany,
                update: landlordPayout.update,
              },
              ownerStatement: { update: jest.fn().mockResolvedValue({}) },
            })
          : fn,
      ),
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    landlordNotifications = {
      announcePayoutPaid: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandlordPayoutsService,
        { provide: PrismaService, useValue: prisma },
        // Best-effort delivery, swallowed by design, and asserted on directly so the
        // PENDING -> PAID wiring is pinned rather than assumed.
        {
          provide: LandlordNotificationsService,
          useValue: landlordNotifications,
        },
      ],
    }).compile();

    service = module.get(LandlordPayoutsService);
  });

  it('creates a payout in PENDING, ignoring any status in the body', async () => {
    await service.create(
      {
        landlordId: 'land-1',
        ownerStatementId: 'stm-1',
        amount: 20_000,
        method: 'BANK_TRANSFER',
        currency: 'KES',
        reference: 'BNK-1',
        scheduledFor: '2026-10-05',
        notes: undefined,
      },
      'org-1',
      'user-1',
    );

    const data = prisma.landlordPayout.create.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.amount).toBe(20_000);
    expect(data.createdBy).toBe('user-1');
    expect(data.scheduledFor).toEqual(new Date('2026-10-05'));
  });

  it('refuses a payout for more than the statement still owes', async () => {
    await expect(
      service.create(
        { landlordId: 'land-1', ownerStatementId: 'stm-1', amount: 40_000 },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.landlordPayout.create).not.toHaveBeenCalled();
  });

  it('refuses a payout against another landlord’s statement', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      ...statement,
      landlordId: 'land-2',
    });

    await expect(
      service.create(
        { landlordId: 'land-1', ownerStatementId: 'stm-1', amount: 5_000 },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a payout against a void statement', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      ...statement,
      status: OwnerStatementStatus.VOID,
    });

    await expect(
      service.create(
        { landlordId: 'land-1', ownerStatementId: 'stm-1', amount: 5_000 },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a payout for a landlord in another tenant', async () => {
    prisma.landlord.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ landlordId: 'land-x', amount: 5_000 }, 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks a payout paid with a reference and stamps paidAt', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      amount: 20_000,
      status: PayoutStatus.PROCESSING,
      reference: null,
      failureReason: null,
      ownerStatement: null,
    });

    await service.updateStatus(
      'po-1',
      { status: PayoutStatus.PAID, reference: 'BNK-77881' },
      'org-1',
    );

    const data = prisma.landlordPayout.update.mock.calls[0][0].data;
    expect(data.status).toBe(PayoutStatus.PAID);
    expect(data.reference).toBe('BNK-77881');
    expect(data.paidAt).toBeInstanceOf(Date);
  });

  // ── Module 17: the owner is told when their money actually leaves ───────────

  it('tells the owner when a payout crosses into PAID', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      landlordId: 'land-1',
      amount: 20_000,
      currency: 'KES',
      status: PayoutStatus.PROCESSING,
      reference: null,
      failureReason: null,
      ownerStatement: null,
    });

    await service.updateStatus(
      'po-1',
      { status: PayoutStatus.PAID, reference: 'BNK-77881' },
      'org-1',
    );

    expect(landlordNotifications.announcePayoutPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        landlordId: 'land-1',
        payoutId: 'po-1',
        amount: 20_000,
        bankReference: 'BNK-77881',
      }),
    );
  });

  it('does NOT re-tell the owner when an already-PAID payout is re-saved', async () => {
    // The edge, not the value. `updateStatus` accepts a DTO that may restate the
    // status a payout already holds, and a second "your money has been paid" email
    // for one payment is the kind of thing an owner stops trusting everything else
    // over. `dedupeKey` would also catch it — but a dedupe key that hides a duplicate
    // would equally hide a genuine second payment, so the state change is the guard.
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      landlordId: 'land-1',
      amount: 20_000,
      currency: 'KES',
      status: PayoutStatus.PAID,
      reference: 'BNK-77881',
      failureReason: null,
      ownerStatement: null,
    });

    await service.updateStatus(
      'po-1',
      { status: PayoutStatus.PAID, reference: 'BNK-77881' },
      'org-1',
    );

    expect(landlordNotifications.announcePayoutPaid).not.toHaveBeenCalled();
  });

  it('does not tell the owner about a payout that failed', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      landlordId: 'land-1',
      amount: 20_000,
      currency: 'KES',
      status: PayoutStatus.PENDING,
      reference: null,
      failureReason: null,
      ownerStatement: null,
    });

    await service.updateStatus(
      'po-1',
      { status: PayoutStatus.FAILED, failureReason: 'Account closed' },
      'org-1',
    );

    expect(landlordNotifications.announcePayoutPaid).not.toHaveBeenCalled();
  });

  it('refuses to mark a payout paid without a reference', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      amount: 20_000,
      status: PayoutStatus.PROCESSING,
      reference: null,
      failureReason: null,
      ownerStatement: null,
    });

    await expect(
      service.updateStatus('po-1', { status: PayoutStatus.PAID }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.landlordPayout.update).not.toHaveBeenCalled();
  });

  it('refuses to mark a payout failed without a reason', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      amount: 20_000,
      status: PayoutStatus.PROCESSING,
      reference: null,
      failureReason: null,
      ownerStatement: null,
    });

    await expect(
      service.updateStatus('po-1', { status: PayoutStatus.FAILED }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to skip backwards in the payout state machine', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      amount: 20_000,
      status: PayoutStatus.PROCESSING,
      reference: 'BNK-1',
      failureReason: null,
      ownerStatement: null,
    });

    await expect(
      service.updateStatus('po-1', { status: PayoutStatus.PENDING }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('settles the statement once the payouts cover its net amount', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue({
      id: 'po-1',
      amount: 33_900,
      status: PayoutStatus.PROCESSING,
      reference: 'BNK-1',
      failureReason: null,
      ownerStatement: statement,
    });
    // Nothing else is recorded against the statement, so this payout clears it.
    prisma.landlordPayout.findMany.mockResolvedValue([]);

    await service.updateStatus(
      'po-1',
      { status: PayoutStatus.PAID, reference: 'BNK-2' },
      'org-1',
    );

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('404s a payout belonging to another tenant', async () => {
    prisma.landlordPayout.findFirst.mockResolvedValue(null);

    await expect(service.findOne('po-x', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
