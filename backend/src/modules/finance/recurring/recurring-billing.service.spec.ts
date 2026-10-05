import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AgreementStatus, RecurringRunStatus } from '@prisma/client';
import {
  RecurringBillingService,
  billingPeriodOf,
} from './recurring-billing.service';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * The rule that matters most here: **a lease is billed once per period, ever.**
 * Everything else is detail, because a recurring job that bills twice destroys
 * trust in the whole system — so idempotency is enforced by a unique constraint
 * in the database and reported as *skipped*, never as an error to retry.
 */
describe('RecurringBillingService', () => {
  let service: RecurringBillingService;
  let prisma: ReturnType<typeof mockPrisma>;
  let invoices: { create: jest.Mock };

  const lease = {
    id: 'lease-1',
    rentAmount: 20_000,
    currency: 'KES',
    startDate: new Date('2025-01-01'),
    endDate: null,
    paymentDay: 1,
    escalationRate: null,
    escalationMonth: null,
    status: AgreementStatus.ACTIVE,
    organizationId: 'org-1',
    tenantId: 'ten-1',
    tenant: { surname: 'Otieno', otherNames: 'Grace' },
    unit: {
      name: 'A1',
      property: { name: 'Acacia Court' },
      serviceCharges: [],
    },
  };

  function mockPrisma() {
    const recurringBillingRun = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'run-1', ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'run-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    };

    const rentalAgreement = {
      findMany: jest.fn().mockResolvedValue([lease]),
    };

    const invoice = {
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };

    const models = { recurringBillingRun, rentalAgreement, invoice };
    return { ...models, $transaction: jest.fn((fn: any) => fn(models)) };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    invoices = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();
    service = module.get(RecurringBillingService);
  });

  it('names the period from a date', () => {
    expect(billingPeriodOf(new Date('2026-10-01'))).toBe('2026-10');
    expect(billingPeriodOf(new Date('2026-01-31'))).toBe('2026-01');
  });

  it('needs a tenant scope', async () => {
    await expect(service.runForOrganization(undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bills a due lease and tags the invoice with the period', async () => {
    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );

    expect(invoices.create).toHaveBeenCalledTimes(1);
    const payload = invoices.create.mock.calls[0][0];
    // The tag is what makes the next run a no-op, so it has to be on the
    // insert — not patched on afterwards.
    expect(payload.billingPeriod).toBe('2026-10');
    expect(payload.rentalAgreementId).toBe('lease-1');
    expect(payload.invoiceItems[0].lineTotal).toBe(20_000);
    expect(run).toMatchObject({
      invoicesCreated: 1,
      leasesSkipped: 0,
      leasesFailed: 0,
      status: RecurringRunStatus.COMPLETED,
    });
    expect(prisma.recurringBillingRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ billingPeriod: '2026-10' }),
      }),
    );
  });

  it('adds the unit service charges to the rent line', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([
      {
        ...lease,
        unit: {
          name: 'A1',
          property: { name: 'Acacia Court' },
          serviceCharges: [
            { serviceUtilityAmenity: 'Water', totalCost: 1_500 },
            { serviceUtilityAmenity: 'Refuse', totalCost: 0 },
          ],
        },
      },
    ]);

    await service.runForOrganization('org-1', new Date('2026-10-01'));
    const items = invoices.create.mock.calls[0][0].invoiceItems;
    // A zero-cost charge is not a line anyone should see on an invoice.
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ particular: 'Water', lineTotal: 1_500 });
    expect(invoices.create.mock.calls[0][0].amount).toBe(21_500);
  });

  it('records a duplicate as skipped rather than billing twice', async () => {
    // The database refusing the unique constraint is the idempotency guard.
    invoices.create.mockRejectedValueOnce(
      new Error(
        'Unique constraint failed on the fields: (`rentalAgreementId`,`billingPeriod`)',
      ),
    );

    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );
    expect(run).toMatchObject({
      invoicesCreated: 0,
      leasesSkipped: 1,
      leasesFailed: 0,
      status: RecurringRunStatus.COMPLETED,
    });
  });

  it('does not mistake an invoice-number collision for an already-billed lease', async () => {
    // Both are unique constraints, but only one means "do not bill again" — the
    // other is a real failure that must not be swallowed as a skip.
    invoices.create.mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`invoiceNumber`)'),
    );

    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );
    expect(run).toMatchObject({
      invoicesCreated: 0,
      leasesSkipped: 0,
      leasesFailed: 1,
    });
  });

  it('keeps going when one lease fails, and says so', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([lease]);
    invoices.create.mockRejectedValueOnce(new Error('rent is not a number'));

    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );
    expect(run).toMatchObject({
      invoicesCreated: 0,
      leasesFailed: 1,
      status: RecurringRunStatus.FAILED,
    });
    expect(run.errorMessage).toMatch(/failed/i);
  });

  it('skips a lease that has not started yet', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([
      { ...lease, startDate: new Date('2026-11-01') },
    ]);

    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );
    expect(invoices.create).not.toHaveBeenCalled();
    expect(run.leasesSkipped).toBe(1);
  });

  it('skips a lease that had already ended', async () => {
    prisma.rentalAgreement.findMany.mockResolvedValue([
      { ...lease, endDate: new Date('2026-06-30') },
    ]);
    const run = await service.runForOrganization(
      'org-1',
      new Date('2026-10-01'),
    );
    expect(run.leasesSkipped).toBe(1);
  });

  it('applies escalation only in its month, and only after a year', async () => {
    // Not yet a year in: no escalation.
    prisma.rentalAgreement.findMany.mockResolvedValue([
      {
        ...lease,
        startDate: new Date('2026-03-01'),
        escalationRate: 10,
        escalationMonth: 10,
      },
    ]);
    await service.runForOrganization('org-1', new Date('2026-10-01'));
    expect(invoices.create.mock.calls[0][0].invoiceItems[0].lineTotal).toBe(
      20_000,
    );

    // A year in: 10% on.
    invoices.create.mockClear();
    prisma.rentalAgreement.findMany.mockResolvedValue([
      { ...lease, escalationRate: 10, escalationMonth: 10 },
    ]);
    await service.runForOrganization('org-1', new Date('2026-10-01'));
    expect(invoices.create.mock.calls[0][0].invoiceItems[0].lineTotal).toBe(
      22_000,
    );

    // Wrong month: untouched.
    invoices.create.mockClear();
    await service.runForOrganization('org-1', new Date('2026-11-01'));
    expect(invoices.create.mock.calls[0][0].invoiceItems[0].lineTotal).toBe(
      20_000,
    );
  });
});
