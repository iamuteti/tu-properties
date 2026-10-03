import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommissionStatus, InstallmentStatus, SaleStage } from '@prisma/client';
import { SalesService } from './sales.service';
import { PrismaService } from '@/prisma/prisma.service';
import { InvoicesService } from '@/modules/finance/invoices/invoices.service';

/**
 * Sales rules worth pinning:
 *   1. tenant scoping on every read/write,
 *   2. one open sale per property,
 *   3. stage transitions go through the gates (never the generic PATCH),
 *   4. instalment billing reuses `InvoicesService` and links the invoice back,
 *   5. commission splits must reconcile, and settled commissions are protected,
 *   6. handover archives the property.
 */
describe('SalesService', () => {
  let service: SalesService;
  let invoices: { create: jest.Mock };

  const sale: any = {
    id: 'sale-1',
    organizationId: 'org-1',
    code: 'SALE-2026-0001',
    stage: SaleStage.QUOTATION,
    agreedPrice: 10_000_000,
    currency: 'KES',
    commissionRate: 3,
    propertyId: 'prop-1',
    buyerContactId: null,
    agentUserId: null,
    installments: [],
    commissions: [],
    property: {
      id: 'prop-1',
      name: 'Karen Apartments 100',
      landlordId: 'land-1',
    },
    buyerContact: null,
  };

  function mockPrisma() {
    const saleModel = {
      create: jest.fn().mockResolvedValue(sale),
      findMany: jest.fn().mockResolvedValue([sale]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(sale),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        stage: SaleStage.QUOTATION,
        installments: [],
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ ...sale, ...data })),
      delete: jest.fn().mockResolvedValue(sale),
    };
    const installmentModel = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'ins-1',
        invoiceId: null,
        status: InstallmentStatus.SCHEDULED,
        amount: 2_500_000,
        dueDate: new Date('2026-12-01'),
        description: 'Instalment 1',
      }),
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'ins-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    };
    const tx = { saleTransaction: saleModel };
    return {
      saleTransaction: saleModel,
      saleInstallment: installmentModel,
      commission: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: `comm-${data.agentUserId}`,
          ...data,
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'comm-1',
          status: CommissionStatus.PENDING,
          notes: null,
        }),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'comm-1', ...data })),
      },
      property: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'prop-1', name: 'Karen Apartments 100' }),
        update: jest.fn().mockResolvedValue({}),
      },
      contact: { findFirst: jest.fn().mockResolvedValue({ id: 'contact-1' }) },
      lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      },
      invoice: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
  }

  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    prisma = mockPrisma();
    invoices = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-1' }),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();
    service = moduleRef.get(SalesService);
  });

  describe('create', () => {
    beforeEach(() => {
      // No open sale on the property unless a test sets one.
      prisma.saleTransaction.findFirst.mockResolvedValue(null);
    });

    it('scopes the sale to the caller organization and snapshots the property title', async () => {
      await service.create(
        { propertyId: 'prop-1', askingPrice: 12_000_000 },
        'org-1',
      );

      expect(prisma.property.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1', organizationId: 'org-1' },
        }),
      );
      const args = prisma.saleTransaction.create.mock.calls[0][0];
      expect(args.data.organization).toEqual({ connect: { id: 'org-1' } });
      expect(args.data.propertyTitle).toBe('Karen Apartments 100');
      expect(args.data.quotationDate).toBeInstanceOf(Date);
    });

    it('refuses a property from another organization', async () => {
      prisma.property.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ propertyId: 'prop-x' }, 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a second open sale on the same property', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        code: 'SALE-2026-0007',
        stage: SaleStage.OFFER,
      });
      await expect(
        service.create({ propertyId: 'prop-1' }, 'org-1'),
      ).rejects.toThrow(/already has an open sale/i);
    });

    it('refuses a buyer contact from another organization', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          { propertyId: 'prop-1', buyerContactId: 'contact-x' },
          'org-1',
        ),
      ).rejects.toThrow(/not in your contacts directory/i);
    });
  });

  describe('findAll', () => {
    it('scopes to the caller organization', async () => {
      await service.findAll('org-1');
      expect(prisma.saleTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('filters by stage, property and agent', async () => {
      await service.findAll('org-1', undefined, {
        stage: 'OFFER',
        propertyId: 'prop-1',
        agentUserId: 'user-1',
      });
      const args = prisma.saleTransaction.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        stage: 'OFFER',
        propertyId: 'prop-1',
        agentUserId: 'user-1',
      });
    });

    it('ignores an unknown sortBy', async () => {
      await service.findAll('org-1', { sortBy: 'stage; DROP TABLE' });
      const args = prisma.saleTransaction.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('pipeline', () => {
    it('excludes handed-over and cancelled sales', async () => {
      await service.pipeline('org-1');
      const args = prisma.saleTransaction.findMany.mock.calls[0][0];
      expect(args.where.stage).toEqual({ notIn: ['HANDOVER', 'CANCELLED'] });
    });
  });

  describe('setStage', () => {
    it('stamps the stage date when moving forward', async () => {
      await service.setStage('sale-1', SaleStage.OFFER, 'org-1');
      const args = prisma.saleTransaction.update.mock.calls[0][0];
      expect(args.data.stage).toBe('OFFER');
      expect(args.data.offerDate).toBeInstanceOf(Date);
    });

    it('refuses to skip a stage', async () => {
      await expect(
        service.setStage('sale-1', SaleStage.AGREEMENT, 'org-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('requires a reason to cancel', async () => {
      await expect(
        service.setStage('sale-1', SaleStage.CANCELLED, 'org-1'),
      ).rejects.toThrow(/reason is required/i);
    });

    it('records the cancellation reason', async () => {
      await service.setStage(
        'sale-1',
        SaleStage.CANCELLED,
        'org-1',
        'Buyer walked away',
      );
      const args = prisma.saleTransaction.update.mock.calls[0][0];
      expect(args.data).toMatchObject({
        stage: 'CANCELLED',
        cancellationReason: 'Buyer walked away',
      });
    });

    it('archives the property on handover', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        ...sale,
        stage: SaleStage.PAYMENT,
        installments: [
          {
            amount: 10_000_000,
            status: InstallmentStatus.PAID,
            invoiceId: 'inv-1',
            invoice: { balanceAmount: 0, status: 'PAID' },
          },
        ],
      });

      await service.setStage('sale-1', SaleStage.HANDOVER, 'org-1');

      expect(prisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: 'ARCHIVED' },
      });
    });

    it('refuses handover with an uninvoiced balance', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        ...sale,
        stage: SaleStage.PAYMENT,
        installments: [
          {
            amount: 10_000_000,
            status: InstallmentStatus.SCHEDULED,
            invoiceId: null,
            invoice: null,
          },
        ],
      });

      await expect(
        service.setStage('sale-1', SaleStage.HANDOVER, 'org-1'),
      ).rejects.toThrow(/still outstanding/i);
    });
  });

  describe('installments', () => {
    it('requires an agreed price before planning', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        ...sale,
        agreedPrice: null,
      });
      await expect(
        service.createInstallmentPlan(
          'sale-1',
          { installments: 4, firstDueDate: '2026-12-01' },
          'org-1',
        ),
      ).rejects.toThrow(/agreed price/i);
    });

    it('splits the price across the plan and puts the rounding on the last row', async () => {
      prisma.saleInstallment.createMany.mockClear();

      await service.createInstallmentPlan(
        'sale-1',
        { installments: 3, firstDueDate: '2026-12-01' },
        'org-1',
      );

      const rows = prisma.saleInstallment.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(3);
      expect(rows.map((r: any) => r.amount)).toEqual([
        3_333_333.33, 3_333_333.33, 3_333_333.34,
      ]);
      const sum = rows.reduce((total: number, r: any) => total + r.amount, 0);
      expect(Math.round(sum * 100)).toBe(1_000_000_000);
    });

    it('refuses to re-plan a schedule that already has invoices', async () => {
      prisma.saleInstallment.count.mockResolvedValue(2);
      await expect(
        service.createInstallmentPlan(
          'sale-1',
          { installments: 3, firstDueDate: '2026-12-01' },
          'org-1',
        ),
      ).rejects.toThrow(/already has 2 invoice/i);
    });

    it('raises the invoice through InvoicesService and links it back', async () => {
      const invoice = await service.invoiceInstallment(
        'sale-1',
        'ins-1',
        undefined,
        undefined,
        'org-1',
      );

      expect(invoices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionClass: 'SALE',
          amount: 2_500_000,
          balanceAmount: 2_500_000,
        }),
        'org-1',
      );
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { saleTransactionId: 'sale-1' },
      });
      expect(prisma.saleInstallment.update).toHaveBeenCalledWith({
        where: { id: 'ins-1' },
        data: { invoiceId: 'inv-1', status: 'INVOICED' },
      });
      expect(invoice).toEqual({ id: 'inv-1', invoiceNumber: 'INV-1' });
    });

    it('refuses to invoice the same instalment twice', async () => {
      prisma.saleInstallment.findFirst.mockResolvedValue({
        id: 'ins-1',
        invoiceId: 'inv-existing',
        status: InstallmentStatus.INVOICED,
        amount: 100,
        dueDate: new Date(),
        description: 'Instalment 1',
      });

      await expect(
        service.invoiceInstallment(
          'sale-1',
          'ins-1',
          undefined,
          undefined,
          'org-1',
        ),
      ).rejects.toThrow(/already been raised/i);
    });

    it('refuses to mark an uninvoiced instalment as invoiced', async () => {
      await expect(
        service.setInstallmentStatus(
          'sale-1',
          'ins-1',
          InstallmentStatus.INVOICED,
          'org-1',
        ),
      ).rejects.toThrow(/raise the invoice first/i);
    });

    it('derives PAID from settled invoices on refresh', async () => {
      prisma.saleInstallment.findMany.mockResolvedValue([
        {
          id: 'ins-1',
          status: InstallmentStatus.INVOICED,
          paidAt: null,
          invoice: {
            amount: 5_000_000,
            balanceAmount: 5_000_000, // finance never decremented this column
            payments: [{ amount: 5_000_000 }],
          },
        },
      ]);

      const result = await service.refreshInstallmentStatus('sale-1', 'org-1');

      expect(result).toEqual({ updated: 1 });
      expect(prisma.saleInstallment.update).toHaveBeenCalledWith({
        where: { id: 'ins-1' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
    });

    it('keeps an instalment INVOICED while part-paid', async () => {
      prisma.saleInstallment.findMany.mockResolvedValue([
        {
          id: 'ins-1',
          status: InstallmentStatus.INVOICED,
          paidAt: null,
          invoice: {
            amount: 5_000_000,
            balanceAmount: 5_000_000,
            payments: [{ amount: 2_000_000 }],
          },
        },
      ]);

      const result = await service.refreshInstallmentStatus('sale-1', 'org-1');

      expect(result).toEqual({ updated: 0 });
      expect(prisma.saleInstallment.update).not.toHaveBeenCalled();
    });
  });

  describe('commissions', () => {
    it('creates one row per participant and reports the total', async () => {
      const result = await service.generateCommissions(
        'sale-1',
        {
          participants: [
            { agentUserId: 'user-1', splitPercentage: 70 },
            { agentUserId: 'user-2', splitPercentage: 30 },
          ],
        },
        'org-1',
      );

      expect(result.total).toBe(300_000);
      expect(prisma.commission.create).toHaveBeenCalledTimes(2);
      expect(prisma.commission.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            agentUserId: 'user-1',
            amount: 210_000,
            splitPercentage: 70,
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('falls back to the sale agent at 100%', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        ...sale,
        agentUserId: 'user-1',
      });

      await service.generateCommissions('sale-1', {}, 'org-1');

      expect(prisma.commission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentUserId: 'user-1',
            splitPercentage: 100,
          }),
        }),
      );
    });

    it('refuses when no agent is assigned and no split is given', async () => {
      await expect(
        service.generateCommissions('sale-1', {}, 'org-1'),
      ).rejects.toThrow(/assign an agent/i);
    });

    it('refuses a split that does not add up to 100%', async () => {
      await expect(
        service.generateCommissions(
          'sale-1',
          { participants: [{ agentUserId: 'user-1', splitPercentage: 50 }] },
          'org-1',
        ),
      ).rejects.toThrow(/add up to 100%/i);
    });

    it('refuses to re-split commissions that are already settled', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({
        ...sale,
        agentUserId: 'user-1',
      });
      prisma.commission.count.mockResolvedValue(1);
      await expect(
        service.generateCommissions('sale-1', {}, 'org-1'),
      ).rejects.toThrow(/already approved or paid/i);
      expect(prisma.commission.create).not.toHaveBeenCalled();
    });

    it('rejects an agent outside the organization', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
      await expect(
        service.generateCommissions(
          'sale-1',
          {
            participants: [
              { agentUserId: 'user-1', splitPercentage: 50 },
              { agentUserId: 'user-9', splitPercentage: 50 },
            ],
          },
          'org-1',
        ),
      ).rejects.toThrow(/not users in your organization/i);
    });

    it('refuses to pay a commission that was never approved', async () => {
      await expect(
        service.setCommissionStatus(
          'comm-1',
          CommissionStatus.PAID,
          'org-1',
          'user-1',
          { paidRef: 'MPESA-1' },
        ),
      ).rejects.toThrow(/approved before/i);
    });

    it('requires a payment reference when paying', async () => {
      prisma.commission.findFirst.mockResolvedValue({
        id: 'comm-1',
        status: CommissionStatus.APPROVED,
        notes: null,
      });
      await expect(
        service.setCommissionStatus(
          'comm-1',
          CommissionStatus.PAID,
          'org-1',
          'user-1',
        ),
      ).rejects.toThrow(/payment reference/i);
    });

    it('approves with the acting user stamped on the row', async () => {
      await service.setCommissionStatus(
        'comm-1',
        CommissionStatus.APPROVED,
        'org-1',
        'user-1',
      );
      const args = prisma.commission.update.mock.calls[0][0];
      expect(args.data).toMatchObject({
        status: 'APPROVED',
        approvedById: 'user-1',
      });
      expect(args.data.approvedAt).toBeInstanceOf(Date);
    });

    it('only allows a rejected commission back to pending', async () => {
      await expect(
        service.setCommissionStatus(
          'comm-1',
          CommissionStatus.PENDING,
          'org-1',
        ),
      ).rejects.toThrow(/only go back to pending after being rejected/i);
    });

    it('totals commissions per agent in the report', async () => {
      prisma.commission.findMany.mockResolvedValue([
        {
          id: 'c1',
          agentUserId: 'user-1',
          amount: 210_000,
          status: CommissionStatus.PAID,
          agent: { firstName: 'A', lastName: 'Agent', email: 'a@x.co' },
          saleTransaction: null,
          approvedBy: null,
        },
        {
          id: 'c2',
          agentUserId: 'user-1',
          amount: 90_000,
          status: CommissionStatus.PENDING,
          agent: { firstName: 'A', lastName: 'Agent', email: 'a@x.co' },
          saleTransaction: null,
          approvedBy: null,
        },
        {
          id: 'c3',
          agentUserId: 'user-2',
          amount: 150_000,
          status: CommissionStatus.APPROVED,
          agent: { firstName: 'B', lastName: 'Broker', email: 'b@x.co' },
          saleTransaction: null,
          approvedBy: null,
        },
      ]);

      const report = await service.commissionReport('org-1');

      expect(report.byAgent).toHaveLength(2);
      expect(report.byAgent[0]).toMatchObject({
        agentUserId: 'user-1',
        agentName: 'A Agent',
        total: 300_000,
        paid: 210_000,
        pending: 90_000,
        approved: 0,
        saleCount: 2,
      });
      expect(report.byAgent[1]).toMatchObject({
        agentUserId: 'user-2',
        total: 150_000,
      });
    });
  });

  describe('remove', () => {
    it('refuses a cross-tenant delete', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue(null);
      await expect(service.remove('sale-1', 'org-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.saleTransaction.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a completed sale', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({ id: 'sale-1' });
      prisma.saleTransaction.findUniqueOrThrow.mockResolvedValue({
        stage: SaleStage.HANDOVER,
        installments: [],
      });
      await expect(service.remove('sale-1', 'org-1')).rejects.toThrow(
        /completed sale cannot be deleted/i,
      );
    });

    it('refuses to delete a sale with invoices and suggests cancelling', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({ id: 'sale-1' });
      prisma.saleTransaction.findUniqueOrThrow.mockResolvedValue({
        stage: SaleStage.PAYMENT,
        installments: [{ invoiceId: 'inv-1' }, { invoiceId: null }],
      });
      await expect(service.remove('sale-1', 'org-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.saleTransaction.delete).not.toHaveBeenCalled();
    });

    it('deletes a fresh quotation', async () => {
      prisma.saleTransaction.findFirst.mockResolvedValue({ id: 'sale-1' });
      await service.remove('sale-1', 'org-1');
      expect(prisma.saleTransaction.delete).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
      });
    });
  });

  describe('export', () => {
    it('writes one row per sale with the commission earned', async () => {
      prisma.saleTransaction.findMany.mockResolvedValue([
        {
          ...sale,
          propertyTitle: 'Karen Apartments 100',
          property: { code: 'PR-100', name: 'Karen Apartments 100' },
          buyerContact: { firstName: 'Amina', lastName: 'Wanjiru' },
          agent: { firstName: 'John', lastName: 'Smith' },
          installments: [
            { amount: 5_000_000, status: InstallmentStatus.PAID },
            { amount: 5_000_000, status: InstallmentStatus.SCHEDULED },
          ],
          commissions: [{ amount: 210_000 }],
        },
      ]);

      const csv = await service.exportCsv('org-1');
      const lines = csv.trim().split('\r\n');

      expect(lines[0]).toContain('code,stage');
      expect(lines[1]).toContain('Amina Wanjiru');
      expect(lines[1]).toContain('210000');
      expect(lines[1]).toContain('5000000');
    });
  });
});
