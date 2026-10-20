import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { SecurityDepositsService } from './security-deposits.service';

/**
 * The register's own rules — the part that is new rather than delegated:
 *   1. a deposit is the agreement's, and a tenancy with no deposit is not a row,
 *   2. the disposition of the money is derived from the move-out, never stored,
 *   3. the refund arithmetic is the move-out's own `calculateDeposit`, so the
 *      two screens cannot disagree,
 *   4. the totals are per currency, because adding KES to USD is not a number.
 */
describe('SecurityDepositsService', () => {
  let service: SecurityDepositsService;

  const tenant = {
    id: 'tenant-1',
    code: 'T-1',
    surname: 'Achieng',
    otherNames: 'Grace',
    accountNumber: 'ACC-1',
  };

  const unit = {
    id: 'unit-1',
    name: 'Flat 1',
    code: 'U-1',
    property: { id: 'prop-1', name: 'Apartment', code: 'P-1' },
  };

  function agreement(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lease-1',
      code: 'RA-1',
      status: 'ACTIVE',
      agreementType: 'RENTAL',
      startDate: new Date('2026-01-01'),
      endDate: null,
      currency: 'KES',
      rentAmount: 50_000,
      securityDeposit: 50_000,
      depositRefunded: false,
      tenant,
      unit,
      moveOutRequests: [],
      ...overrides,
    };
  }

  /** The shape the service's first query is expected to carry. */
  interface AgreementQuery {
    where: { OR: Array<{ organizationId: string | null }> };
  }

  interface PrismaMock {
    agreement: { findMany: jest.Mock<Promise<unknown[]>, [unknown]> };
    invoice: { findMany: jest.Mock<Promise<unknown[]>, [unknown]> };
  }

  function mockPrisma(
    agreements: unknown[],
    invoices: unknown[] = [],
  ): PrismaMock {
    const agreementFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
    agreementFindMany.mockResolvedValue(agreements);
    const invoiceFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
    invoiceFindMany.mockResolvedValue(invoices);
    return {
      agreement: { findMany: agreementFindMany },
      invoice: { findMany: invoiceFindMany },
    };
  }

  async function build(prisma: PrismaMock) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityDepositsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<SecurityDepositsService>(SecurityDepositsService);
  }

  it('leaves out a tenancy that carries no deposit', async () => {
    await build(
      mockPrisma([
        agreement({ securityDeposit: null }),
        agreement({ id: 'lease-2', securityDeposit: 0 }),
      ]),
    );

    const result = await service.findAll('org-1');

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('reads a deposit that is simply held', async () => {
    await build(mockPrisma([agreement()]));

    const { data, summary } = await service.findAll('org-1');

    expect(data).toHaveLength(1);
    expect(data[0].disposition).toBe('HELD');
    expect(data[0].depositAmount).toBe(50_000);
    expect(data[0].refundDue).toBe(50_000);
    expect(data[0].netHeld).toBe(50_000);
    expect(summary).toEqual([
      {
        currency: 'KES',
        deposits: 50_000,
        refunded: 0,
        deductions: 0,
        netHeld: 50_000,
        received: 0,
        count: 1,
      },
    ]);
  });

  it('takes unpaid rent off the refund and carries the excess forward', async () => {
    await build(
      mockPrisma(
        [agreement({ securityDeposit: 20_000 })],
        [
          {
            agreementId: 'lease-1',
            amount: 15_000,
            payments: [{ amount: 5_000 }],
          },
        ],
      ),
    );

    const { data } = await service.findAll('org-1');

    expect(data[0].unpaidRent).toBe(10_000);
    expect(data[0].refundDue).toBe(10_000);
    expect(data[0].carriedForward).toBe(0);
  });

  it('carries forward what the deductions and the arrears exceed', async () => {
    await build(
      mockPrisma(
        [
          agreement({
            securityDeposit: 10_000,
            moveOutRequests: [
              {
                id: 'mo-1',
                status: 'COMPLETED',
                moveoutDate: new Date('2026-06-01'),
                depositRefunded: false,
                depositRefundAmount: null,
                refundedAt: null,
                deductions: [
                  {
                    category: 'DAMAGE',
                    description: 'Broken window',
                    amount: 12_000,
                  },
                ],
              },
            ],
          }),
        ],
        [{ agreementId: 'lease-1', amount: 5_000, payments: [] }],
      ),
    );

    const { data } = await service.findAll('org-1');

    expect(data[0].disposition).toBe('DEDUCTED');
    expect(data[0].deductionsTotal).toBe(12_000);
    expect(data[0].carriedForward).toBe(7_000);
    expect(data[0].refundDue).toBe(0);
  });

  it('calls a recorded deduction a part deduction until it is settled', async () => {
    await build(
      mockPrisma([
        agreement({
          securityDeposit: 50_000,
          moveOutRequests: [
            {
              id: 'mo-1',
              status: 'PENDING',
              moveoutDate: new Date('2026-06-01'),
              depositRefunded: false,
              depositRefundAmount: null,
              refundedAt: null,
              deductions: [
                {
                  category: 'CLEANING',
                  description: 'Cleaning',
                  amount: 5_000,
                },
              ],
            },
          ],
        }),
      ]),
    );

    const { data } = await service.findAll('org-1');

    expect(data[0].disposition).toBe('PART_DEDUCTED');
    expect(data[0].refundDue).toBe(45_000);
  });

  it('reports a refunded deposit as refunded, and keeps only the deductions', async () => {
    await build(
      mockPrisma([
        agreement({
          securityDeposit: 50_000,
          depositRefunded: true,
          moveOutRequests: [
            {
              id: 'mo-1',
              status: 'COMPLETED',
              moveoutDate: new Date('2026-06-01'),
              depositRefunded: true,
              depositRefundAmount: 45_000,
              refundedAt: new Date('2026-06-02'),
              deductions: [
                {
                  category: 'DAMAGE',
                  description: 'Broken window',
                  amount: 5_000,
                },
              ],
            },
          ],
        }),
      ]),
    );

    const { data, summary } = await service.findAll('org-1');

    expect(data[0].disposition).toBe('REFUNDED');
    expect(data[0].refundedAmount).toBe(45_000);
    expect(data[0].netHeld).toBe(5_000);
    expect(summary[0].refunded).toBe(45_000);
    expect(summary[0].netHeld).toBe(5_000);
  });

  it('filters the register by disposition', async () => {
    await build(
      mockPrisma([
        agreement(),
        agreement({
          id: 'lease-2',
          securityDeposit: 10_000,
          depositRefunded: true,
          moveOutRequests: [
            {
              id: 'mo-2',
              status: 'COMPLETED',
              moveoutDate: new Date('2026-06-01'),
              depositRefunded: true,
              depositRefundAmount: 10_000,
              refundedAt: new Date('2026-06-02'),
              deductions: [],
            },
          ],
        }),
      ]),
    );

    const held = await service.findAll('org-1', undefined, { status: 'HELD' });
    const refunded = await service.findAll('org-1', undefined, {
      status: 'REFUNDED',
    });

    expect(held.meta.total).toBe(1);
    expect(held.data[0].agreementId).toBe('lease-1');
    expect(refunded.meta.total).toBe(1);
    expect(refunded.data[0].agreementId).toBe('lease-2');
  });

  it('keeps the totals in one line per currency', async () => {
    await build(
      mockPrisma([
        agreement(),
        agreement({
          id: 'lease-2',
          currency: 'USD',
          securityDeposit: 1_000,
        }),
      ]),
    );

    const { summary } = await service.findAll('org-1');

    expect(summary.map((line) => line.currency)).toEqual(['KES', 'USD']);
    expect(summary[1].deposits).toBe(1_000);
  });

  it('scopes the register to the organization asking for it', async () => {
    const prisma = mockPrisma([agreement()]);
    await build(prisma);

    await service.findAll('org-1');

    const query = prisma.agreement.findMany.mock.calls[0][0] as AgreementQuery;
    expect(query.where.OR).toEqual([
      { organizationId: 'org-1' },
      { organizationId: null },
    ]);
  });
});
