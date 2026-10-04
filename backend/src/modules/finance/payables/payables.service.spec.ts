import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BillStatus } from '@prisma/client';
import { PayablesService } from './payables.service';
import { AccountingService } from '../accounting/accounting.service';
import { TaxService } from '../tax/tax.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Payables rules worth pinning:
 *   1. a bill posts to the expense account its category maps to, and its input
 *      tax goes to a recoverable asset rather than into expense,
 *   2. a bill only absorbs what it still owes — the surplus becomes supplier
 *      credit, not a negative balance and not a lost payment,
 *   3. a paid bill cannot be voided; the payment must be reversed first,
 *   4. reversing an overpaying payment voids the credit it created, because
 *      the money is going back,
 *   5. applying credit moves no cash,
 *   6. aging buckets by days past due, which is the reason AP is tracked.
 */
describe('PayablesService', () => {
  let service: PayablesService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: Record<string, jest.Mock>;

  const bill = {
    id: 'bill-1',
    billNumber: 'BILL-1',
    supplierId: 'sup-1',
    subtotal: 30_000,
    taxAmount: 4_800,
    totalAmount: 34_800,
    paidAmount: 0,
    balanceAmount: 34_800,
    status: BillStatus.OPEN,
    currency: 'KES',
    billDate: new Date('2026-10-01'),
    lines: [
      {
        description: 'Shower valves',
        amount: 30_000,
        expenseAccountCode: null,
      },
    ],
  };

  function mockPrisma() {
    const supplierBill = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'bill-new',
        ...data,
        lines: data.lines?.create ?? [],
      })),
      findFirst: jest.fn().mockResolvedValue(bill),
      findMany: jest.fn().mockResolvedValue([bill]),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...bill, ...data })),
      count: jest.fn().mockResolvedValue(0),
    };

    const supplier = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'sup-new', ...data })),
      findFirst: jest.fn().mockResolvedValue({
        id: 'sup-1',
        name: 'Bright Repairs',
        status: 'ACTIVE',
        paymentTermsDays: 14,
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'sup-1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    };

    const billPayment = {
      create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'pay-new', ...data })),
      findFirst: jest
        .fn()
        .mockResolvedValue({ ...bill, billPaymentAmount: 0, isReversed: false }),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { appliedAmount: 0 } }),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'pay-new', ...data })),
    };

    const supplierCredit = {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'cr-new', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'cr-1', ...data })),
    };

    const models = {
      supplier,
      supplierBill,
      supplierBillLine: { create: jest.fn() },
      billPayment,
      supplierCredit,
      supplierCreditApplication: {
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    };

    return { ...models, $transaction: jest.fn((fn: any) => fn(models)) };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = {
      postBillAccepted: jest.fn().mockResolvedValue({ id: 'je-1' }),
      postBillPaid: jest.fn().mockResolvedValue({ id: 'je-2' }),
      reverseEntriesForSource: jest.fn().mockResolvedValue([]),
    };
    const tax = {
      // No configured rules: the bill's own supplied figures stand.
      computeFor: jest.fn().mockResolvedValue({
        netAmount: 30_000,
        chargedTax: 0,
        withheldTax: 0,
        totalAmount: 30_000,
        summary: [],
        jurisdiction: '',
        rules: [],
        lines: [],
        totalsMatchStatedAmounts: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayablesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: TaxService, useValue: tax },
      ],
    }).compile();
    service = module.get(PayablesService);
  });

  it('needs a tenant scope', async () => {
    await expect(
      service.createBill({
        supplierId: 'sup-1',
        lines: [{ description: 'x', unitPrice: 100 }],
      }),
    ).rejects.toThrow(/tenant scope/i);
  });

  it('needs at least one line', async () => {
    await expect(
      service.createBill({ supplierId: 'sup-1', lines: [] }, 'org-1'),
    ).rejects.toThrow(/at least one line/i);
  });

  it('posts the expense to the category account and input tax to recoverable', async () => {
    await service.createBill(
      {
        supplierId: 'sup-1',
        category: 'MAINTENANCE',
        taxAmount: 4_800,
        subtotal: 30_000,
        totalAmount: 34_800,
        lines: [{ description: 'Shower valves', quantity: 2, unitPrice: 15_000 }],
      },
      'org-1',
    );

    expect(accounting.postBillAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 34_800,
        taxAmount: 4_800,
        expenses: [{ accountCode: '5010', amount: 30_000 }],
      }),
      'org-1',
      expect.anything(),
    );
  });

  it('refuses a bill whose lines and tax do not add up', async () => {
    await expect(
      service.createBill(
        {
          supplierId: 'sup-1',
          subtotal: 30_000,
          taxAmount: 4_800,
          totalAmount: 40_000,
          lines: [{ description: 'x', unitPrice: 30_000 }],
        },
        'org-1',
      ),
    ).rejects.toThrow(/does not add up/i);
  });

  it('refuses to pay a void bill', async () => {
    prisma.supplierBill.findFirst.mockResolvedValue({
      ...bill,
      status: BillStatus.VOID,
    });
    await expect(
      service.createPayment({ billId: 'bill-1', amount: 100 }, 'org-1'),
    ).rejects.toThrow(/void/i);
  });

  it('refuses a payment of nothing', async () => {
    await expect(
      service.createPayment({ billId: 'bill-1', amount: 0 }, 'org-1'),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('refuses to void a bill that has payments', async () => {
    prisma.supplierBill.findFirst.mockResolvedValue({
      ...bill,
      payments: [{ id: 'pay-1' }],
    });
    await expect(service.voidBill('bill-1', 'org-1', 'tester')).rejects.toThrow(
      /reverse the payment first/i,
    );
  });

  it('reverses the entry when a bill is voided', async () => {
    prisma.supplierBill.findFirst.mockResolvedValue({
      ...bill,
      payments: [],
    });
    await service.voidBill('bill-1', 'org-1', 'tester');
    expect(accounting.reverseEntriesForSource).toHaveBeenCalledWith(
      'bill-1',
      'org-1',
      'tester',
      expect.anything(),
    );
    expect(prisma.supplierBill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BillStatus.VOID }),
      }),
    );
  });

  it('archives a supplier that still has bills rather than deleting it', async () => {
    prisma.supplierBill.count.mockResolvedValue(3);
    await service.deleteSupplier('sup-1', 'org-1');
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ARCHIVED' } }),
    );
    expect(prisma.supplier.delete).not.toHaveBeenCalled();
  });

  it('buckets what we owe by days past due', async () => {
    const asOf = new Date('2026-10-20');
    prisma.supplierBill.findMany.mockResolvedValue([
      { ...bill, balanceAmount: 1_000, dueDate: new Date('2026-10-25'), supplierId: 'sup-1', supplier: { id: 'sup-1', name: 'A' } },
      { ...bill, balanceAmount: 2_000, dueDate: new Date('2026-10-05'), supplierId: 'sup-1', supplier: { id: 'sup-1', name: 'A' } },
      { ...bill, balanceAmount: 4_000, dueDate: new Date('2026-07-01'), supplierId: 'sup-2', supplier: { id: 'sup-2', name: 'B' } },
    ]);

    const aging = await service.aging('org-1', asOf);
    expect(aging.buckets.current).toBe(1_000);
    expect(aging.buckets.days1to30).toBe(2_000);
    expect(aging.buckets.over90).toBe(4_000);
    expect(aging.buckets.total).toBe(7_000);
    expect(aging.bySupplier[0].supplierName).toBe('B');
  });

  it('refuses an allocation with nothing left to apply', async () => {
    prisma.billPayment.findFirst.mockResolvedValue({
      id: 'pay-1',
      amount: 5_000,
      appliedAmount: 5_000,
      isReversed: false,
      bill: { supplierId: 'sup-1' },
    });
    await expect(
      service.allocatePayment('pay-1', undefined, 'org-1'),
    ).rejects.toThrow(/already fully allocated/i);
  });

  it('refuses to reverse a reversed payment', async () => {
    prisma.billPayment.findFirst.mockResolvedValue({
      id: 'pay-1',
      isReversed: true,
      billId: 'bill-1',
      bill: bill,
    });
    await expect(service.reversePayment('pay-1', 'org-1', 'x')).rejects.toThrow(
      BadRequestException,
    );
  });
});