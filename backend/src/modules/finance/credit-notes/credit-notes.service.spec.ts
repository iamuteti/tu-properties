import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreditNotesService } from './credit-notes.service';

function mockPrisma() {
  const creditNote = {
    create: jest.fn().mockImplementation(({ data }: any) => ({
      id: 'cn-1',
      creditNoteNumber: 'CN-202601-0001',
      ...data,
    })),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'cn-1', status: 'VOID' }),
    update: jest.fn().mockImplementation(({ data }: any) => data),
    count: jest.fn().mockResolvedValue(0),
  };
  const invoice = {
    findFirst: jest.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-202601-0001',
      totalAmount: 100_000,
      balanceAmount: 50_000,
      currency: 'KES',
    }),
    findUnique: jest.fn().mockResolvedValue({ taxWithheldAmount: 0 }),
    update: jest.fn().mockImplementation(({ data }: any) => data),
  };
  const paymentRefund = {
    findFirst: jest.fn().mockResolvedValue(null),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  };
  const paymentAllocation = {
    findMany: jest.fn().mockResolvedValue([]),
  };
  const payment = {
    findMany: jest.fn().mockResolvedValue([]),
  };
  const creditApplication = {
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  };
  const models = {
    creditNote,
    invoice,
    paymentRefund,
    paymentAllocation,
    payment,
    creditApplication,
  };
  return {
    ...models,
    $transaction: jest.fn((fn: any) => fn(models)),
  };
}

describe('CreditNotesService', () => {
  let service: CreditNotesService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: { postEntry: jest.Mock };

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = { postEntry: jest.fn().mockResolvedValue({ id: 'je-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
      ],
    }).compile();

    service = module.get(CreditNotesService);
  });

  it('refuses a zero-amount credit note', async () => {
    await expect(
      service.create({
        invoiceId: 'inv-1',
        reason: 'test',
        organizationId: 'org-1',
        lines: [{ description: 'test', amount: 0 }],
      }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('refuses a credit note larger than the invoice balance', async () => {
    await expect(
      service.create({
        invoiceId: 'inv-1',
        reason: 'over-the-top',
        organizationId: 'org-1',
        lines: [{ description: 'too much', amount: 100_000 }],
      }),
    ).rejects.toThrow(/exceeds the.*outstanding balance/i);
  });

  it('issues a credit note within the balance and posts contra-revenue', async () => {
    await service.create({
      invoiceId: 'inv-1',
      reason: 'billing error',
      notes: 'double-charged',
      organizationId: 'org-1',
      actorId: 'user-1',
      lines: [{ description: 'overcharge', amount: 25_000 }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ISSUED',
          invoiceId: 'inv-1',
          organizationId: 'org-1',
          totalAmount: 25_000,
        }),
      }),
    );

    expect(accounting.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'CREDIT_NOTE',
        lines: expect.arrayContaining([
          expect.objectContaining({ accountCode: '1200', credit: 25_000 }),
          expect.objectContaining({ accountCode: '4290', debit: 25_000 }),
        ]),
      }),
      'org-1',
      expect.anything(),
    );
  });

  it('voids a credit note and posts a reversing entry', async () => {
    prisma.creditNote.findFirst.mockResolvedValue({
      id: 'cn-1',
      creditNoteNumber: 'CN-202601-0001',
      status: 'ISSUED',
      totalAmount: 25_000,
      invoiceId: 'inv-1',
      invoice: { id: 'inv-1', invoiceNumber: 'INV-202601-0001' },
    });

    await service.void('cn-1', 'write-off reversal', 'org-1', 'user-1');

    expect(prisma.creditNote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'VOID' },
      }),
    );

    expect(accounting.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountCode: '1200', debit: 25_000 }),
          expect.objectContaining({ accountCode: '4290', credit: 25_000 }),
        ]),
      }),
      'org-1',
      expect.anything(),
    );
  });
});
