import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JournalEntrySource } from '@prisma/client';
import { AccountingService } from './accounting.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Ledger rules worth pinning:
 *   1. an entry that does not balance is never written,
 *   2. a line is a debit or a credit, never both and never neither,
 *   3. amounts are positive — the side is what carries direction,
 *   4. auto-posting resolves system accounts by code and refuses to post to an
 *      account that does not exist for the organization,
 *   5. a reversal flips the sides of the original and marks it REVERSED
 *      instead of deleting it.
 */
describe('AccountingService', () => {
  let service: AccountingService;
  let prisma: ReturnType<typeof mockPrisma>;

  const org = { id: 'org-1' };

  function mockPrisma() {
    const accounts = [
      { id: 'acc-ar', code: '1200', name: 'Accounts Receivable', isPostable: true, normalBalance: 'DEBIT' },
      { id: 'acc-rent', code: '4000', name: 'Rent Income', isPostable: true, normalBalance: 'CREDIT' },
      { id: 'acc-vat', code: '2100', name: 'VAT Payable', isPostable: true, normalBalance: 'CREDIT' },
      { id: 'acc-cash', code: '1000', name: 'Cash on Hand', isPostable: true, normalBalance: 'DEBIT' },
      { id: 'acc-hdr', code: '1001', name: 'Current Assets', isPostable: false, normalBalance: 'DEBIT' },
      { id: 'acc-mpesa', code: '1100', name: 'M-Pesa / Mobile Money', isPostable: true, normalBalance: 'DEBIT' },
      { id: 'acc-held', code: '2500', name: 'Rent Collected on Behalf of Landlords', isPostable: true, normalBalance: 'CREDIT' },
    ];

    const account = {
      count: jest.fn().mockResolvedValue(accounts.length),
      createMany: jest.fn().mockResolvedValue({ count: accounts.length }),
      findMany: jest.fn().mockResolvedValue(accounts),
      findFirst: jest.fn(async ({ where }: any) =>
        accounts.find(
          (a) =>
            a.id === where.id ||
            (where.code !== undefined &&
              a.code === where.code &&
              (where.organizationId === undefined ||
                where.organizationId === org.id)),
        ) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: any) =>
        accounts.find((a) => a.id === where.id) ?? null,
      ),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...data })),
      delete: jest.fn().mockImplementation(({ where }: any) => ({ id: where.id })),
    };

    const journalLine = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    const journalEntry = {
      create: jest.fn().mockImplementation(({ data, include }: any) => ({
        id: 'je-1',
        ...data,
        ...(include ? { lines: [] } : {}),
      })),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }: any) => ({ id: 'je-1', ...data })),
    };

    return { account, journalEntry, journalLine };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AccountingService);
  });

  it('refuses to post an entry whose debits and credits differ', async () => {
    await expect(
      service.postEntry(
        {
          lines: [
            { accountCode: '1200', debit: 1000 },
            { accountCode: '4000', credit: 900 },
          ],
        },
        org.id,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('refuses a line that is both a debit and a credit', async () => {
    await expect(
      service.postEntry(
        {
          lines: [
            { accountCode: '1200', debit: 100, credit: 100 },
            { accountCode: '4000', credit: 100 },
          ],
        },
        org.id,
      ),
    ).rejects.toThrow(/either a debit or a credit/i);
  });

  it('refuses negative amounts — the side carries direction', async () => {
    await expect(
      service.postEntry(
        {
          lines: [
            { accountCode: '1200', debit: -100 },
            { accountCode: '4000', credit: -100 },
          ],
        },
        org.id,
      ),
    ).rejects.toThrow(/positive/i);
  });

  it('refuses posting to a header account', async () => {
    await expect(
      service.postEntry(
        {
          lines: [
            { accountCode: '1001', debit: 100 },
            { accountCode: '4000', credit: 100 },
          ],
        },
        org.id,
      ),
    ).rejects.toThrow(/header account/i);
  });

  it('requires a tenant scope', async () => {
    await expect(
      service.postEntry({
        lines: [
          { accountCode: '1200', debit: 100 },
          { accountCode: '4000', credit: 100 },
        ],
      }),
    ).rejects.toThrow(/tenant scope/i);
  });

  it('posts an invoice as debit AR for the total, credit VAT, credit net revenue', async () => {
    await service.postInvoiceIssued(
      {
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-1',
        issueDate: new Date('2026-10-01'),
        totalAmount: 1180,
        vatAmount: 180,
        netAmount: 1000,
      },
      org.id,
    );

    expect(prisma.journalEntry.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.journalEntry.create.mock.calls[0][0];
    expect(data.source).toBe(JournalEntrySource.INVOICE);
    const posted = data.lines.create.map((line: any) => [
      line.account.connect.id,
      Number(line.debit),
      Number(line.credit),
    ]);
    expect(posted).toEqual([
      ['acc-ar', 1180, 0],
      ['acc-vat', 0, 180],
      ['acc-rent', 0, 1000],
    ]);
  });

  it('does not post a cancelled invoice', async () => {
    await service.postInvoiceIssued(
      {
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-2',
        issueDate: new Date(),
        totalAmount: 1000,
        status: 'CANCELLED',
      },
      org.id,
    );
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('posts a payment as debit cash, credit AR', async () => {
    await service.postPaymentReceived(
      {
        amount: 500,
        paymentDate: new Date('2026-10-02'),
        paymentMethod: 'CASH',
        description: 'Receipt REC-1',
      },
      org.id,
    );
    const { data } = prisma.journalEntry.create.mock.calls[0][0];
    const posted = data.lines.create.map((line: any) => [
      line.account.connect.id,
      Number(line.debit),
      Number(line.credit),
    ]);
    expect(posted).toEqual([
      ['acc-cash', 500, 0],
      ['acc-ar', 0, 500],
    ]);
  });

  it('holds money collected for an owner in a liability, not income', async () => {
    await service.postPaymentReceived(
      {
        amount: 500,
        paymentDate: new Date(),
        paymentMethod: 'MPESA',
        description: 'Owner rent',
        onBehalfOfLandlord: true,
      },
      org.id,
    );
    const { data } = prisma.journalEntry.create.mock.calls[0][0];
    const posted = data.lines.create.map((line: any) => [
      line.account.connect.id,
      Number(line.debit),
      Number(line.credit),
    ]);
    // Debited the mobile money account; credited "rent collected on behalf of
    // landlords" (2500) — not rent income.
    expect(posted).toEqual([
      ['acc-mpesa', 500, 0],
      ['acc-held', 0, 500],
    ]);
  });
});
