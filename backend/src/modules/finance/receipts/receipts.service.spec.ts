import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';
import { ReceiptsService } from './receipts.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Capture rules worth pinning:
 *   1. a receipt is a *direct* receipt — money arrived — and never a deposit
 *      refund, which is the opposite event;
 *   2. money that bypassed the estate is collected for the owner, and the
 *      client does not get to say otherwise;
 *   3. the payments on a receipt add up to the amount received, or the receipt
 *      is refused rather than half-written;
 *   4. the method the receipt carries is the method the ledger is posted with,
 *      so a receipt can never say one thing while the books say another.
 */
describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let accounting: { postPaymentReceived: jest.Mock };

  const invoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-1',
    totalAmount: 10_000,
    paidAmount: 0,
    balanceAmount: 10_000,
    status: 'PENDING',
    agreementId: 'agr-1',
    taxWithheldAmount: 0,
  };

  function mockPrisma() {
    const receipt = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'rcp-1',
        ...data,
      })),
    };

    const payment = {
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: 'pay-1',
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
    };

    const models = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ten-1' }),
      },
      receipt,
      payment,
      paymentAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
        findMany: jest.fn().mockResolvedValue([]),
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
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        findUnique: jest.fn().mockResolvedValue({ taxWithheldAmount: 0 }),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };

    return { ...models, $transaction: jest.fn((fn: any) => fn(models)) };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    accounting = {
      postPaymentReceived: jest.fn().mockResolvedValue({ id: 'je-1' }),
    };
    const credits = { captureSurplus: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: CreditsService, useValue: credits },
      ],
    }).compile();
    service = module.get(ReceiptsService);
  });

  const capture = (overrides: any = {}) => ({
    receivedFrom: 'Odanga, Jane',
    paymentMethod: PaymentMethod.DIRECT_REMIT,
    amountReceived: 10_000,
    tenantId: 'ten-1',
    ...overrides,
  });

  it('records a receipt as money received, never as a deposit refund', async () => {
    await service.create(capture(), 'org-1');
    const { data } = prisma.receipt.create.mock.calls[0][0];
    expect(data.drtOrDrf).toBe('DirectReceipt');
  });

  it('records money that bypassed the estate as collected for the owner', async () => {
    await service.create(capture({ receiptTo: 'GeneralLedger' }), 'org-1');
    const { data } = prisma.receipt.create.mock.calls[0][0];
    // The client asked for the general ledger and was refused: money the payer
    // sent straight to the owner was collected for the owner.
    expect(data.receiptTo).toBe('Landlord');
    expect(data.paymentMethod).toBe('DIRECT_REMIT');
  });

  it('refuses a receipt whose payments do not add up to the amount received', async () => {
    await expect(
      service.create(
        capture({
          amountReceived: 10_000,
          payments: [
            {
              invoiceId: 'inv-1',
              amount: 4_000,
              paymentMethod: PaymentMethod.DIRECT_REMIT,
            },
          ],
        }),
        'org-1',
      ),
    ).rejects.toThrow();
    expect(prisma.receipt.create).not.toHaveBeenCalled();
  });

  it('posts the ledger with the method the receipt carries', async () => {
    await service.create(
      capture({
        payments: [
          {
            invoiceId: 'inv-1',
            amount: 10_000,
            paymentMethod: PaymentMethod.DIRECT_REMIT,
          },
        ],
      }),
      'org-1',
    );
    // The receipt and the ledger must agree. A receipt that says the money was
    // remitted straight to the owner, with a ledger that debited our cash box,
    // is the exact bug this method exists to prevent.
    expect(accounting.postPaymentReceived).toHaveBeenCalled();
    const [posted] = accounting.postPaymentReceived.mock.calls[0];
    expect(posted.paymentMethod).toBe('DIRECT_REMIT');
  });
});
