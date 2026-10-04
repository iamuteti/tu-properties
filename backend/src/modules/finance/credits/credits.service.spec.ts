import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditStatus, InvoiceStatus } from '@prisma/client';
import { CreditsService } from './credits.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Credit rules worth pinning:
 *   1. a credit must belong to someone and be worth something,
 *   2. spending it goes oldest invoice first and stops when the money or the
 *      outstanding balance runs out,
 *   3. an explicit invoice list is honoured in the order given,
 *   4. a credit that has been spent cannot be voided,
 *   5. applying never lets an invoice go below zero.
 */
describe('CreditsService', () => {
  let service: CreditsService;
  let prisma: ReturnType<typeof mockPrisma>;

  const credit = {
    id: 'cr-1',
    amount: 5_000,
    appliedAmount: 0,
    tenantId: 'ten-1',
    landlordId: null,
    customerName: null,
    status: CreditStatus.OPEN,
  };

  const INVOICES = [
    {
      id: 'inv-old',
      totalAmount: 3_000,
      balanceAmount: 3_000,
      paidAmount: 0,
      status: InvoiceStatus.PENDING,
      dueDate: new Date('2026-01-01'),
    },
    {
      id: 'inv-new',
      totalAmount: 9_000,
      balanceAmount: 9_000,
      paidAmount: 0,
      status: InvoiceStatus.OVERDUE,
      dueDate: new Date('2026-06-01'),
    },
  ];

  function mockPrisma() {
    const invoicesFixture = INVOICES;

    const customerCredit = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'cr-new', ...data })),
      findFirst: jest.fn().mockResolvedValue(credit),
      findUnique: jest.fn().mockResolvedValue(credit),
      findMany: jest.fn().mockResolvedValue([credit]),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ ...credit, ...data })),
    };

    const invoice = {
      findMany: jest.fn().mockResolvedValue(invoicesFixture),
      update: jest.fn().mockImplementation(({ data }: any) => data),
    };

    const creditApplication = { create: jest.fn().mockResolvedValue({}) };

    const models = { customerCredit, invoice, creditApplication };

    return {
      ...models,
      $transaction: jest.fn((fn: any) => fn(models)),
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CreditsService);
  });

  it('refuses a credit with no amount', async () => {
    await expect(
      service.create({ tenantId: 'ten-1', amount: 0 }, 'org-1'),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('refuses a credit that belongs to nobody', async () => {
    await expect(service.create({ amount: 100 }, 'org-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('spends oldest invoice first and carries the rest to the next', async () => {
    const result = await service.applyToInvoices('cr-1', undefined, 'org-1');

    expect(prisma.invoice.update).toHaveBeenCalledTimes(2);
    expect(prisma.invoice.update.mock.calls[0][0]).toEqual({
      where: { id: 'inv-old' },
      data: {
        paidAmount: 3_000,
        balanceAmount: 0,
        status: InvoiceStatus.PAID,
      },
    });
    expect(prisma.invoice.update.mock.calls[1][0]).toEqual({
      where: { id: 'inv-new' },
      data: {
        paidAmount: 2_000,
        balanceAmount: 7_000,
        status: InvoiceStatus.PARTIALLY_PAID,
      },
    });
    expect(result.applications).toEqual([
      { invoiceId: 'inv-old', amount: 3_000 },
      { invoiceId: 'inv-new', amount: 2_000 },
    ]);
    expect(result.unapplied).toBe(0);
    expect(result.credit.status).toBe(CreditStatus.APPLIED);
  });

  it('honours an explicit invoice order and amount', async () => {
    // Returned newest-first; the caller's order must win over the returned order.
    prisma.invoice.findMany.mockResolvedValue([...INVOICES].reverse());
    const result = await service.applyToInvoices(
      'cr-1',
      { invoiceIds: ['inv-new', 'inv-old'], amount: 1_000 },
      'org-1',
    );
    expect(result.applications).toEqual([
      { invoiceId: 'inv-new', amount: 1_000 },
    ]);
  });

  it('refuses to apply a credit with nothing left', async () => {
    prisma.customerCredit.findFirst.mockResolvedValue({
      ...credit,
      amount: 1_000,
      appliedAmount: 1_000,
      status: CreditStatus.APPLIED,
    });
    await expect(
      service.applyToInvoices('cr-1', undefined, 'org-1'),
    ).rejects.toThrow(/nothing left to apply/i);
  });

  it('refuses to apply against invoices with no outstanding balance', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    await expect(
      service.applyToInvoices('cr-1', undefined, 'org-1'),
    ).rejects.toThrow(/no outstanding balance/i);
  });

  it('refuses to void a credit that has been spent', async () => {
    prisma.customerCredit.findUnique.mockResolvedValue({
      ...credit,
      appliedAmount: 2_000,
    });
    await expect(service.void('cr-1', 'org-1')).rejects.toThrow(
      /already been applied/i,
    );
  });

  it('reports a missing credit as 404, not an empty object', async () => {
    prisma.customerCredit.findFirst.mockResolvedValue(null);
    await expect(service.findOne('nope', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
