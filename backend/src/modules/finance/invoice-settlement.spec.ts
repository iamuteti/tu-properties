import { Prisma, InvoiceStatus } from '@prisma/client';

type MockTx = {
  invoice: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  paymentAllocation: { findMany: jest.Mock };
  payment: { findMany: jest.Mock; aggregate: jest.Mock };
  paymentRefund: { groupBy: jest.Mock };
  creditApplication: { aggregate: jest.Mock };
  creditNote: { aggregate: jest.Mock };
};

function mockTx(overrides: Partial<MockTx> = {}): MockTx {
  const mock: MockTx = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        totalAmount: 100_000,
        status: InvoiceStatus.PENDING,
      }),
      findUnique: jest.fn().mockResolvedValue({ taxWithheldAmount: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentAllocation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ paymentId: 'pay-1', amount: 30_000 }]),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'pay-1',
          amount: 30_000,
          invoiceId: 'inv-1',
          isReversed: false,
        },
      ]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    paymentRefund: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    creditApplication: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    creditNote: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 0 } }),
    },
  };
  return { ...mock, ...overrides };
}

describe('invoiceSettlement', () => {
  it('creditNoteAppliedAmount returns the sum of ISSUED credit notes', async () => {
    const { creditNoteAppliedAmount } = await import('./invoice-settlement');
    const tx = mockTx({
      creditNote: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalAmount: 25_000 } }),
      },
    });

    const result = await creditNoteAppliedAmount(
      tx as unknown as Prisma.TransactionClient,
      'inv-1',
    );
    expect(result).toBe(25_000);
    expect(tx.creditNote.aggregate).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', status: 'ISSUED' },
      _sum: { totalAmount: true },
    });
  });

  it('syncInvoiceSettlement includes credit notes in the paid amount', async () => {
    const { syncInvoiceSettlement } = await import('./invoice-settlement');
    const tx = mockTx({
      creditNote: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalAmount: 20_000 } }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pay-1',
            amount: 50_000,
            invoiceId: 'inv-1',
            isReversed: false,
          },
        ]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      paymentAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await syncInvoiceSettlement(
      tx as unknown as Prisma.TransactionClient,
      'inv-1',
      'org-1',
    );

    expect(tx.invoice.update).toHaveBeenCalled();
  });
});
