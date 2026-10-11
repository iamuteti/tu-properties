import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ReportsService } from './reports.service';

/**
 * Module 16 — the ROI export.
 *
 * The JSON report was verified live; what this pins is the file: month-grain rows
 * (not a one-row summary, per the module's own CSV rule), the four columns, and
 * that the export refuses a foreign landlord the same way the JSON route does —
 * the 404 must come from the shared `landlordRoi()` read, not from a second
 * scoping check somebody has to remember to keep in sync.
 */
describe('ReportsService.exportLandlordRoiCsv', () => {
  let service: ReportsService;
  let prisma: {
    landlord: { findFirst: jest.Mock };
    invoice: { aggregate: jest.Mock };
    landlordCharge: { aggregate: jest.Mock };
    $queryRaw: jest.Mock;
  };

  /** First argument of the i-th call, typed — `jest.Mock.calls` is `any[][]`. */
  function callArg<A>(mock: jest.Mock, i: number): A {
    expect(mock).toHaveBeenCalledTimes(i + 1);
    return (mock.mock.calls as unknown[][])[i][0] as A;
  }

  const req = { user: { organizationId: 'org-1', role: 'ADMIN' } };

  beforeEach(async () => {
    prisma = {
      landlord: { findFirst: jest.fn() },
      invoice: { aggregate: jest.fn() },
      landlordCharge: { aggregate: jest.fn() },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReportsService);

    prisma.landlord.findFirst.mockResolvedValue({
      id: 'll-1',
      name: 'Test Landlord',
    });
    prisma.invoice.aggregate.mockResolvedValue({
      _sum: { totalAmount: 1000 },
      _count: { _all: 4 },
    });
    prisma.landlordCharge.aggregate.mockResolvedValue({
      _sum: { amount: 200 },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ month: '2026-09', billed: 600 }])
      .mockResolvedValueOnce([{ month: '2026-09', expenses: 120 }]);
  });

  it('exports one row per month with billed, expenses and net', async () => {
    const csv = await service.exportLandlordRoiCsv(
      'll-1',
      { from: '2026-09-01', to: '2026-09-30' },
      req,
    );

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('month,billed,expenses,net');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-09,600,120,480');
  });

  it('404s for a landlord outside the caller’s organization', async () => {
    prisma.landlord.findFirst.mockResolvedValue(null);

    await expect(
      service.exportLandlordRoiCsv('someone-elses', {}, req),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes the invoice totals to the caller’s organization', async () => {
    await service.exportLandlordRoiCsv('ll-1', {}, req);

    const where = callArg<{ where: { organizationId?: string } }>(
      prisma.invoice.aggregate,
      0,
    ).where;
    expect(where.organizationId).toBe('org-1');
  });
});
