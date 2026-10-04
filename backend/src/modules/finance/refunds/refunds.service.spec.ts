import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { RefundsService } from './refunds.service';
import { CreditsService } from '../credits/credits.service';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Refund rules worth pinning:
 *   1. a refund can never exceed what is still refundable on the payment,
 *   2. it issues a credit note (the doc's recommended pattern) and leaves the
 *      invoice re-derived from live payments minus refunds,
 *   3. cash actually leaves: the ledger is debited contra revenue,
 *   4. a reversed payment is not refundable — reverse the reversal instead,
 *   5. a refund of money that was never applied comes back as credit.
 */
describe('RefundsService', () => {
  let service: RefundsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: { postRefund: jest.Mock };

  const payment = {
    id: 'pay-1',
    amount: 10_000,
    currency: 'KES',
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    isReversed: false,
    invoiceId: 'inv-1',
    invoice: {
      id: 'inv-1',
      totalAmount: 10_000,
      status: InvoiceStatus.PAID,
      landlordId: null,
      rentalAgreement: { tenantId: 'ten-1' },
    },
  };

  function mockPrisma(refundedSoFar = 0) {
    const paymentRefund = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'rfd-1',
        processedAt: new Date(),
        ...data,
      })),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amount: refundedSoFar } }),
      groupBy: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockImplementation(() => ({
        id: 'rfd-1',
        creditNote: { id: 'cn-1', creditNoteNumber: 'RFD-1', lines: [] },
        payment,
      })),
      findFirst: jest.fn().mockResolvedValue({ id: 'rfd-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    };

    const creditNote = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'cn-1',
        ...data,
      })),
    };

    const invoice = {
      findFirst: jest.fn().mockResolvedValue({
        ...payment.invoice,
        taxWithheldAmount: 0,
      }),
      findUnique: jest.fn().mockResolvedValue({ taxWithheldAmount: 0 }),
      update: jest.fn().mockImplementation(({ data }: any) => data),
    };

    const models = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(payment),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'pay-1', amount: 10_000 }]),
      },
      paymentAllocation: {
        // Only part of the payment settled this invoice; the rest is credit.
        findMany: jest
          .fn()
          .mockResolvedValue([{ paymentId: 'pay-1', amount: 3_000 }]),
      },
      creditNote,
      paymentRefund,
      creditApplication: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      invoice,
    };

    return { ...models, $transaction: jest.fn((fn: any) => fn(models)) };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = { postRefund: jest.fn().mockResolvedValue({ id: 'je-1' }) };
    const credits = {
      captureSurplus: jest.fn().mockResolvedValue({ id: 'cr-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: CreditsService, useValue: credits },
      ],
    }).compile();
    service = module.get(RefundsService);
  });

  it('needs a reason', async () => {
    await expect(
      service.create(
        { paymentId: 'pay-1', amount: 100, reason: '  ' },
        'org-1',
      ),
    ).rejects.toThrow(/needs a reason/i);
  });

  it('needs a tenant scope', async () => {
    await expect(
      service.create({ paymentId: 'pay-1', amount: 100, reason: 'oops' }),
    ).rejects.toThrow(/tenant scope/i);
  });

  it('refuses more than is still refundable', async () => {
    prisma = mockPrisma(9_000);
    const scoped = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: CreditsService, useValue: { captureSurplus: jest.fn() } },
      ],
    }).compile();

    await expect(
      scoped
        .get(RefundsService)
        .create({ paymentId: 'pay-1', amount: 2_000, reason: 'oops' }, 'org-1'),
    ).rejects.toThrow(/still refundable/i);
  });

  it('issues a credit note and takes the cash back out of the ledger', async () => {
    await service.create(
      { paymentId: 'pay-1', amount: 4_000, reason: 'Overcharge' },
      'org-1',
    );

    expect(prisma.creditNote.create).toHaveBeenCalled();
    expect(prisma.paymentRefund.create).toHaveBeenCalled();
    expect(accounting.postRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4_000,
        fromAccountCode: '1010',
      }),
      'org-1',
      expect.anything(),
    );
    // Re-derived from the allocation (3,000), not from the payment amount
    // (10,000) — the difference is credit that never settled this invoice.
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          paidAmount: 3_000,
          balanceAmount: 7_000,
        }),
      }),
    );
  });

  it('refuses to refund a reversed payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...payment,
      isReversed: true,
    });
    await expect(
      service.create(
        { paymentId: 'pay-1', amount: 100, reason: 'oops' },
        'org-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports how much of a payment is still refundable', async () => {
    await expect(service.refundableAmount('pay-1', 'org-1')).resolves.toEqual({
      paymentAmount: 10_000,
      refunded: 0,
      refundable: 10_000,
    });
  });
});
