import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ManagementFeeType,
  OwnerStatementStatus,
  PayoutStatus,
} from '@prisma/client';
import { OwnerStatementsService } from './owner-statements.service';
import { LandlordNotificationsService } from '../landlord-notifications.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Owner statement rules worth pinning:
 *   1. money is derived from payments and charges, never accepted from the body,
 *   2. sale invoices are excluded from owner rent,
 *   3. a period that overlaps a live statement is refused (no double payout),
 *   4. generation claims the charges so the next statement cannot reuse them,
 *   5. an issued statement is frozen: void releases its charges, delete does not,
 *   6. a period that has not finished yet cannot be stated.
 */
describe('OwnerStatementsService', () => {
  let service: OwnerStatementsService;
  let landlordNotifications: {
    announceStatementIssued: jest.Mock;
  };

  const landlord = {
    id: 'land-1',
    code: 'LLD-001',
    name: 'Wanjiku Kamau',
    managementFeeType: ManagementFeeType.PERCENTAGE,
    managementFeeRate: 8,
    managementFeeAmount: 0,
  };

  const payment = {
    amount: 45_000,
    paymentDate: new Date('2026-09-05T09:00:00.000Z'),
    invoice: {
      invoiceNumber: 'INV-2026-1001',
      rentalAgreement: { unit: { property: { name: 'Tolo Towers' } } },
    },
  };

  const charge = {
    id: 'chg-1',
    category: 'REPAIR',
    description: 'Burst pipe in unit 4B',
    amount: 7_500,
    chargeDate: new Date('2026-09-08T00:00:00.000Z'),
    property: { name: 'Tolo Towers' },
  };

  function mockPrisma() {
    const ownerStatement = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'stm-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'stm-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({ id: 'stm-1' }),
    };
    const landlordCharge = {
      findMany: jest.fn().mockResolvedValue([charge]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const paymentModel = { findMany: jest.fn().mockResolvedValue([payment]) };
    const landlordModel = {
      findFirst: jest.fn().mockResolvedValue(landlord),
    };
    const payoutModel = { findMany: jest.fn().mockResolvedValue([]) };
    const organization = {
      findUnique: jest.fn().mockResolvedValue({ name: 'TU Properties' }),
    };

    const tx = {
      ownerStatement: {
        create: ownerStatement.create,
        findMany: ownerStatement.findMany,
        findFirst: ownerStatement.findFirst,
        count: ownerStatement.count,
        update: ownerStatement.update,
      },
      landlordCharge: {
        findMany: landlordCharge.findMany,
        updateMany: landlordCharge.updateMany,
      },
    };

    return {
      ownerStatement,
      landlordCharge,
      payment: paymentModel,
      landlord: landlordModel,
      landlordPayout: payoutModel,
      organization,
      $transaction: jest.fn(async (fn: any) =>
        typeof fn === 'function' ? fn(tx) : fn,
      ),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    landlordNotifications = {
      announceStatementIssued: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerStatementsService,
        { provide: PrismaService, useValue: prisma },
        // Telling the owner is Module 17's job and is best-effort — it swallows its
        // own failures by design, so a stubbed mock here is not hiding a code path
        // these tests would otherwise exercise. It is also asserted on directly, so
        // the wiring is pinned rather than assumed.
        {
          provide: LandlordNotificationsService,
          useValue: landlordNotifications,
        },
      ],
    }).compile();

    service = module.get(OwnerStatementsService);
  });

  it('derives income from payments and totals the statement', async () => {
    const preview = await service.preview(
      'land-1',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T23:59:59.999Z'),
      'org-1',
    );

    expect(preview.incomeLines).toEqual([
      {
        ref: 'INV-2026-1001',
        description: 'Rent collected',
        property: 'Tolo Towers',
        amount: 45_000,
        paymentDate: '2026-09-05',
      },
    ]);
    expect(preview.grossIncome).toBe(45_000);
    expect(preview.expenses).toBe(7_500);
    expect(preview.managementFee).toBe(3_600);
    expect(preview.netPayout).toBe(33_900);
  });

  it('asks the database only for this landlord and excludes sale invoices', async () => {
    await service.preview(
      'land-1',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T23:59:59.999Z'),
      'org-1',
    );

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where.invoice.saleTransactionId).toBeNull();
    expect(where.invoice.OR).toEqual([
      { landlordId: 'land-1' },
      {
        landlordId: null,
        rentalAgreement: { unit: { property: { landlordId: 'land-1' } } },
      },
    ]);
  });

  it('refuses a period that overlaps a live statement', async () => {
    prisma.ownerStatement.findMany.mockResolvedValue([
      {
        id: 'stm-existing',
        statementNumber: 'OST-202609-0001',
        periodStart: new Date('2026-09-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-30T23:59:59.999Z'),
        status: OwnerStatementStatus.ISSUED,
        netPayout: 33_900,
      },
    ]);

    await expect(
      service.generate(
        {
          landlordId: 'land-1',
          periodStart: '2026-09-15',
          periodEnd: '2026-09-20',
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.ownerStatement.create).not.toHaveBeenCalled();
  });

  it('generates a statement that claims the charges it used', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      statementNumber: 'OST-202609-0001',
      organizationId: 'org-1',
      landlordId: 'land-1',
      status: OwnerStatementStatus.DRAFT,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.999Z'),
      grossIncome: 45_000,
      expenses: 7_500,
      managementFee: 3_600,
      carriedForward: 0,
      netPayout: 33_900,
      currency: 'KES',
      notes: null,
      issuedAt: null,
      incomeLines: [],
      expenseLines: [],
      landlord,
      payouts: [],
      charges: [],
    });

    await service.generate(
      {
        landlordId: 'land-1',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      },
      'org-1',
      'user-1',
    );

    const created = prisma.ownerStatement.create.mock.calls[0][0].data;
    expect(created.netPayout).toBe(33_900);
    expect(created.landlordId).toBe('land-1');
    expect(created.generatedBy).toBe('user-1');
    expect(prisma.landlordCharge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['chg-1'] },
          ownerStatementId: null,
        }),
      }),
    );

    // Module 17: a **generated** statement is a DRAFT and the owner is not told.
    // Announcing it would tell an owner their period is ready while somebody is still
    // checking it, which is a false claim about their money. Asserted here rather than
    // in a test of its own because this is the only place `generate()` actually runs -
    // a separate test asserting an untouched mock was not called would pass forever.
    expect(
      landlordNotifications.announceStatementIssued,
    ).not.toHaveBeenCalled();
  });

  it('refuses a period that has not finished yet', async () => {
    const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await expect(
      service.previewFor('land-1', '2026-01-01', future, 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an inverted period', async () => {
    await expect(
      service.previewFor('land-1', '2026-09-30', '2026-09-01', 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('carries the unpaid balance of earlier statements forward', async () => {
    // `preview` asks for the carried-forward statements first, then the recent list.
    prisma.ownerStatement.findMany
      .mockResolvedValueOnce([
        {
          id: 'stm-1',
          status: OwnerStatementStatus.ISSUED,
          netPayout: 33_900,
          payouts: [
            { status: PayoutStatus.PAID, amount: 20_000 },
            { status: PayoutStatus.PENDING, amount: 5_000 },
          ],
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.landlordPayout.findMany.mockResolvedValue([]);

    const preview = await service.preview(
      'land-1',
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T23:59:59.999Z'),
      'org-1',
    );

    // 33,900 owed − 20,000 actually paid. The pending payout has not left yet.
    expect(preview.carriedForward).toBe(13_900);
  });

  it('issues a draft statement and stamps the date', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      status: OwnerStatementStatus.DRAFT,
      statementNumber: 'OST-202609-0001',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.999Z'),
      grossIncome: 0,
      expenses: 0,
      managementFee: 0,
      carriedForward: 0,
      netPayout: 0,
      currency: 'KES',
      notes: null,
      issuedAt: null,
      incomeLines: [],
      expenseLines: [],
      landlord,
      payouts: [],
      charges: [],
    });

    await service.issue('stm-1', 'org-1');

    expect(prisma.ownerStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OwnerStatementStatus.ISSUED }),
      }),
    );
  });

  // ── Module 17: the owner is told when a statement is issued ─────────────────

  it('tells the owner once the statement is issued', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      landlordId: 'land-1',
      status: OwnerStatementStatus.DRAFT,
      statementNumber: 'OST-202609-0001',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.999Z'),
      grossIncome: 0,
      expenses: 0,
      managementFee: 0,
      carriedForward: 0,
      netPayout: 45_000,
      currency: 'KES',
      notes: null,
      issuedAt: null,
      incomeLines: [],
      expenseLines: [],
      landlord,
      payouts: [],
      charges: [],
    });

    await service.issue('stm-1', 'org-1');

    // Read the mock's argument directly rather than through `expect.objectContaining`,
    // which returns `any` and adds one more `no-unsafe-assignment` to a file that
    // already carries seventeen. Reading the typed argument also *checks* the fields:
    // a renamed key here fails the test instead of silently matching `undefined`.
    expect(landlordNotifications.announceStatementIssued).toHaveBeenCalledTimes(
      1,
    );
    const [args] = landlordNotifications.announceStatementIssued.mock
      .calls[0] as [
      {
        landlordId: string;
        statementId: string;
        reference: string;
        netPayout: number;
        currency: string;
      },
    ];
    expect(args.landlordId).toBe('land-1');
    expect(args.statementId).toBe('stm-1');
    // `statementNumber`, not `reference` — the column is `statementNumber`, and this
    // is the value the owner is shown.
    expect(args.reference).toBe('OST-202609-0001');
    expect(args.netPayout).toBe(45_000);
    expect(args.currency).toBe('KES');
  });

  it('does not tell the owner again when an issued statement is re-issued', async () => {
    // `issue()` returns early for an already-ISSUED statement, so the message goes
    // out on the transition rather than on the call. Re-issuing is a normal thing for
    // an operator to do, and "your statement is ready" twice is the kind of message
    // that teaches a recipient to ignore the first one.
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      landlordId: 'land-1',
      status: OwnerStatementStatus.ISSUED,
      statementNumber: 'OST-202609-0001',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.999Z'),
      grossIncome: 0,
      expenses: 0,
      managementFee: 0,
      carriedForward: 0,
      netPayout: 45_000,
      currency: 'KES',
      notes: null,
      issuedAt: new Date(),
      incomeLines: [],
      expenseLines: [],
      landlord,
      payouts: [],
      charges: [],
    });

    await service.issue('stm-1', 'org-1');

    expect(
      landlordNotifications.announceStatementIssued,
    ).not.toHaveBeenCalled();
  });

  it('refuses to void a statement that has already been paid out', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      status: OwnerStatementStatus.ISSUED,
      notes: null,
      payouts: [{ id: 'po-1', status: PayoutStatus.PAID, amount: 33_900 }],
    });

    await expect(service.void('stm-1', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('releases a void statement’s charges back into the pool', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      status: OwnerStatementStatus.ISSUED,
      notes: 'September run',
      statementNumber: 'OST-202609-0001',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T23:59:59.999Z'),
      grossIncome: 0,
      expenses: 0,
      managementFee: 0,
      carriedForward: 0,
      netPayout: 0,
      currency: 'KES',
      issuedAt: null,
      incomeLines: [],
      expenseLines: [],
      landlord,
      payouts: [],
      charges: [],
    });

    await service.void('stm-1', 'org-1', 'Wrong period');

    expect(prisma.landlordCharge.updateMany).toHaveBeenCalledWith({
      where: { ownerStatementId: 'stm-1' },
      data: { ownerStatementId: null },
    });
  });

  it('refuses to delete anything but a draft', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue({
      id: 'stm-1',
      status: OwnerStatementStatus.ISSUED,
      payouts: [],
    });

    await expect(service.remove('stm-1', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.ownerStatement.delete).not.toHaveBeenCalled();
  });

  it('404s a statement belonging to another tenant', async () => {
    prisma.ownerStatement.findFirst.mockResolvedValue(null);

    await expect(service.findOne('stm-other', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a landlord belonging to another tenant', async () => {
    prisma.landlord.findFirst.mockResolvedValue(null);

    await expect(
      service.previewFor('land-x', '2026-09-01', '2026-09-30', 'org-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
