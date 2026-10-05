import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PurchaseCategory,
  PurchaseOrderStatus,
  PurchasePriority,
  PurchaseRequestStatus,
  QuoteStatus,
  RfqStatus,
  SupplierCategory,
  SupplierStatus,
} from '@prisma/client';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { RfqsService } from './rfqs.service';
import { ProcurementSuppliersService } from './suppliers.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GoodsReceiptStockInService } from '@/modules/inventory/goods-receipt-stock-in.service';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PayablesService } from '@/modules/finance/payables/payables.service';

/**
 * The parts of the procurement services that are rules rather than plumbing:
 * tenant scoping on every supplier and line reference, the gates at the
 * boundary, and the two places a refusal is better than a half-written record.
 *
 * The pure state machines and the bid comparison are tested directly in
 * `procurement-lifecycle.spec.ts` and `procurement-comparison.spec.ts`; what is
 * left to prove here is that the services actually consult them and scope their
 * queries.
 */
describe('Procurement services', () => {
  let requests: PurchaseRequestsService;
  let orders: PurchaseOrdersService;
  let rfqs: RfqsService;
  let suppliers: ProcurementSuppliersService;
  let prisma: ReturnType<typeof mockPrisma>;
  let payables: {
    createBill: jest.Mock;
    findSuppliers: jest.Mock;
    findSupplier: jest.Mock;
  };

  function request(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pr-1',
      organizationId: 'org-1',
      reference: 'PR-2026-0001',
      title: 'Lift ropes for Tamarind Court',
      description: null,
      category: PurchaseCategory.MAINTENANCE_PARTS,
      priority: PurchasePriority.NORMAL,
      status: PurchaseRequestStatus.DRAFT,
      department: 'Maintenance',
      currency: 'KES',
      estimatedAmount: null,
      neededBy: null,
      requestedById: 'user-1',
      requestedBy: { id: 'user-1', firstName: 'Sam', lastName: 'Otieno' },
      decidedBy: null,
      decidedById: null,
      decisionNote: null,
      rejectionReason: null,
      approvalRequestedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [
        {
          id: 'prl-1',
          description: 'Lift ropes, 6m',
          specification: null,
          quantity: 2,
          unitPrice: null,
          estimatedAmount: null,
          sortOrder: 0,
        },
      ],
      rfqs: [],
      orders: [],
      ...overrides,
    };
  }

  function rfq(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rfq-1',
      organizationId: 'org-1',
      reference: 'RFQ-2026-0001',
      title: 'Lift ropes, 6m',
      notes: null,
      status: RfqStatus.ISSUED,
      currency: 'KES',
      quotesDueAt: new Date(Date.now() + 7 * 86_400_000),
      issuedAt: new Date(),
      closedAt: null,
      awardedAt: null,
      awardedQuoteId: null,
      cancellationReason: null,
      raisedById: 'user-1',
      raisedBy: { id: 'user-1', firstName: 'Sam', lastName: 'Otieno' },
      purchaseRequestId: 'pr-1',
      purchaseRequest: {
        id: 'pr-1',
        reference: 'PR-2026-0001',
        title: 'Lift ropes for Tamarind Court',
        category: PurchaseCategory.MAINTENANCE_PARTS,
        estimatedAmount: 100000,
        currency: 'KES',
        lines: [
          {
            id: 'prl-1',
            description: 'Lift ropes, 6m',
            quantity: 2,
            estimatedAmount: 100000,
            sortOrder: 0,
          },
        ],
      },
      invitations: [
        {
          id: 'inv-1',
          supplierId: 'sup-1',
          status: 'QUOTED',
          invitedAt: new Date(),
          respondedAt: new Date(),
          declineReason: null,
          supplier: { id: 'sup-1', name: 'Lift Parts Ltd', code: 'SUP-0001' },
        },
        {
          id: 'inv-2',
          supplierId: 'sup-2',
          status: 'QUOTED',
          invitedAt: new Date(),
          respondedAt: new Date(),
          declineReason: null,
          supplier: { id: 'sup-2', name: 'Hoist Kenya', code: 'SUP-0002' },
        },
      ],
      quotes: [
        {
          id: 'q-1',
          supplierId: 'sup-1',
          status: QuoteStatus.SUBMITTED,
          totalAmount: 95000,
          currency: 'KES',
          leadTimeDays: 21,
          validUntil: new Date(Date.now() + 30 * 86_400_000),
          notes: null,
          submittedAt: new Date(),
          supplier: { id: 'sup-1', name: 'Lift Parts Ltd' },
          lines: [
            {
              id: 'ql-1',
              description: 'Lift ropes, 6m',
              quantity: 2,
              unitPrice: 47500,
              amount: 95000,
              purchaseRequestLineId: 'prl-1',
            },
          ],
        },
        {
          id: 'q-2',
          supplierId: 'sup-2',
          status: QuoteStatus.SUBMITTED,
          totalAmount: 120000,
          currency: 'KES',
          leadTimeDays: 7,
          validUntil: new Date(Date.now() + 30 * 86_400_000),
          notes: null,
          submittedAt: new Date(),
          supplier: { id: 'sup-2', name: 'Hoist Kenya' },
          lines: [
            {
              id: 'ql-2',
              description: 'Lift ropes, 6m',
              quantity: 2,
              unitPrice: 60000,
              amount: 120000,
              purchaseRequestLineId: 'prl-1',
            },
          ],
        },
      ],
      awardedQuote: null,
      orders: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function order(overrides: Record<string, unknown> = {}) {
    return {
      id: 'po-1',
      organizationId: 'org-1',
      reference: 'PO-2026-0001',
      supplierId: 'sup-1',
      status: PurchaseOrderStatus.ACCEPTED,
      category: PurchaseCategory.MAINTENANCE_PARTS,
      currency: 'KES',
      subtotal: 95000,
      taxAmount: 0,
      totalAmount: 95000,
      orderDate: new Date(),
      expectedDelivery: new Date(Date.now() + 7 * 86_400_000),
      deliveryAddress: 'Tamarind Court store',
      terms: null,
      notes: null,
      rfqId: 'rfq-1',
      quoteId: 'q-1',
      purchaseRequestId: 'pr-1',
      supplierBillId: null,
      sentAt: new Date(),
      acceptedAt: new Date(),
      receivedAt: null,
      closedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      raisedById: 'user-1',
      raisedBy: { id: 'user-1', firstName: 'Sam', lastName: 'Otieno' },
      supplier: { id: 'sup-1', code: 'SUP-0001', name: 'Lift Parts Ltd' },
      rfq: {
        id: 'rfq-1',
        reference: 'RFQ-2026-0001',
        status: RfqStatus.AWARDED,
      },
      quote: { id: 'q-1', totalAmount: 95000, leadTimeDays: 21 },
      purchaseRequest: {
        id: 'pr-1',
        reference: 'PR-2026-0001',
        title: 'Lift ropes',
        category: PurchaseCategory.MAINTENANCE_PARTS,
      },
      supplierBill: null,
      lines: [
        {
          id: 'pol-1',
          description: 'Lift ropes, 6m',
          specification: null,
          quantity: 2,
          unitPrice: 47500,
          amount: 95000,
          receivedQuantity: 0,
          sortOrder: 0,
        },
      ],
      deliveries: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function supplier(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sup-1',
      organizationId: 'org-1',
      code: 'SUP-0001',
      name: 'Lift Parts Ltd',
      status: SupplierStatus.ACTIVE,
      email: 'sales@liftparts.example',
      phone: '+254700000001',
      address: null,
      city: 'Nairobi',
      country: 'Kenya',
      taxPin: null,
      vatRegistered: true,
      paymentTermsDays: 30,
      bankName: null,
      bankBranch: null,
      accountName: null,
      accountNumber: null,
      notes: null,
      category: SupplierCategory.MECHANICAL,
      rating: 4,
      contractStartDate: null,
      contractEndDate: null,
      contractReference: null,
      bills: [],
      credits: [],
      ...overrides,
    };
  }

  function mockPrisma() {
    const requestRows: any[] = [request()];
    const rfqRows: any[] = [rfq()];
    const orderRows: any[] = [order()];
    const supplierRows: any[] = [
      supplier(),
      supplier({
        id: 'sup-2',
        code: 'SUP-0002',
        name: 'Hoist Kenya',
        category: SupplierCategory.MECHANICAL,
        bills: [],
      }),
      supplier({
        id: 'sup-archived',
        code: 'SUP-0003',
        name: 'Shut Down Ltd',
        status: SupplierStatus.ARCHIVED,
        bills: [],
      }),
    ];

    const matches = (
      row: Record<string, any>,
      where: Record<string, any> = {},
    ) =>
      Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        if (typeof value === 'object' && value !== null) {
          if ('connect' in value) return true;
          if (key === 'id' && 'in' in value)
            return (value as { in: string[] }).in.includes(row.id);
          return true;
        }
        return row[key] === value;
      });

    const collection = (
      rows: any[],
      model: string,
      defaults: () => any = () => ({}),
    ) => ({
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        ),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        ),
      findMany: jest
        .fn()
        .mockImplementation(({ where }: any = {}) =>
          Promise.resolve(
            where ? rows.filter((row) => matches(row, where)) : [...rows],
          ),
        ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const row = { id: `${model}-new`, ...defaults(), ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) return Promise.reject(new Error('no such row'));
        Object.assign(row, data);
        return Promise.resolve({ ...row });
      }),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(rows.length),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { quantity: 0, appliedAmount: 0, amount: 0 },
      }),
      groupBy: jest.fn().mockResolvedValue([]),
    });

    const requests = collection(requestRows, 'pr', () => request());
    const rfqs = collection(rfqRows, 'rfq', () => rfq());
    const orders = collection(orderRows, 'po', () => order());
    const suppliers = collection(supplierRows, 'sup', () => supplier());
    // The quotes are rows of their own, but seeded from the RFQ's own copies so
    // a test that edits `rfq.quotes[0].status` is editing the same fact.
    const quoteRows: any[] = rfqRows[0].quotes;

    const quotes = collection(quoteRows, 'q', () => ({
      ...rfqRows[0].quotes[0],
    }));

    return {
      purchaseRequest: requests,
      purchaseRequestLine: collection([], 'prl'),
      rfq: rfqs,
      rfqInvitation: collection([], 'inv'),
      rfqQuote: quotes,
      purchaseOrder: orders,
      purchaseOrderLine: collection([], 'pol'),
      goodsReceipt: collection([], 'gr'),
      goodsReceiptLine: collection([], 'grl'),
      supplier: suppliers,
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: any) =>
        typeof fn === 'function' ? fn(flatTx()) : undefined,
      ),
      __requestRows: requestRows,
      __rfqRows: rfqRows,
      __orderRows: orderRows,
      __supplierRows: supplierRows,
    };

    // The transaction handle the services pass around; the same in-memory models.
    function flatTx() {
      return {
        purchaseRequest: requests,
        purchaseRequestLine: {
          ...requests,
          findMany: jest.fn().mockResolvedValue([]),
        },
        rfq: rfqs,
        rfqQuote: quotes,
        rfqInvitation: { ...rfqs },
        purchaseOrder: orders,
        purchaseOrderLine: {
          ...orders,
          findMany: jest.fn().mockResolvedValue([]),
        },
        goodsReceipt: { ...orders },
        goodsReceiptLine: { ...orders },
        supplier: suppliers,
      };
    }
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    payables = {
      createBill: jest.fn().mockImplementation(async (data: any) => ({
        id: 'bill-1',
        billNumber: 'BILL-202610-0001',
        supplierId: data.supplierId,
        totalAmount: data.totalAmount,
        lines: data.lines,
      })),
      findSuppliers: jest
        .fn()
        .mockImplementation(async () =>
          prisma.__supplierRows.map((row) => ({ ...row })),
        ),
      findSupplier: jest.fn().mockImplementation(async (id: string) => {
        const row = prisma.__supplierRows.find(
          (candidate) => candidate.id === id,
        );
        return row ? { ...row } : null;
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseRequestsService,
        PurchaseOrdersService,
        RfqsService,
        ProcurementSuppliersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: PayablesService, useValue: payables },
        // Module 11's stock-in service, for real: `pendingStockIn` delegates to
        // it rather than reporting on the receipt rows itself, and a stub would
        // only prove the call happened.
        GoodsReceiptStockInService,
        {
          provide: NotificationsService,
          useValue: { notify: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    requests = moduleRef.get(PurchaseRequestsService);
    orders = moduleRef.get(PurchaseOrdersService);
    rfqs = moduleRef.get(RfqsService);
    suppliers = moduleRef.get(ProcurementSuppliersService);
  });

  // ==================================================================
  // Purchase requests — tenant scoping and the gates
  // ==================================================================

  it('404s a purchase request belonging to another organization', async () => {
    await expect(requests.findOne('pr-1', 'org-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to submit a request with no lines', async () => {
    prisma.__requestRows[0].lines = [];

    await expect(requests.submit('pr-1', {}, 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses to reject a request without a reason', async () => {
    prisma.__requestRows[0].status = PurchaseRequestStatus.PENDING;

    await expect(
      requests.reject('pr-1', { reason: '   ' }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records the rejection reason an approver typed', async () => {
    prisma.__requestRows[0].status = PurchaseRequestStatus.PENDING;

    const result = await requests.reject(
      'pr-1',
      { reason: 'We have six spare ropes in store.' },
      'org-1',
    );

    expect(result.status).toBe(PurchaseRequestStatus.REJECTED);
    expect(result.rejectionReason).toBe('We have six spare ropes in store.');
  });

  it('refuses to edit a request that has already been submitted', async () => {
    prisma.__requestRows[0].status = PurchaseRequestStatus.PENDING;

    await expect(
      requests.update('pr-1', { title: 'Something else' }, 'org-1'),
    ).rejects.toThrow(/can no longer be edited/i);
  });

  it('refuses to delete a request somebody may have acted on', async () => {
    prisma.__requestRows[0].status = PurchaseRequestStatus.APPROVED;

    await expect(requests.remove('pr-1', 'org-1')).rejects.toThrow(
      /cancel it instead of deleting/i,
    );
    expect(prisma.purchaseRequest.delete).not.toHaveBeenCalled();
  });

  it('allocates the next sequential PR reference', async () => {
    prisma.purchaseRequest.findFirst.mockResolvedValueOnce({
      reference: 'PR-2026-0007',
    } as never);

    await requests.create(
      {
        title: 'Lift ropes for Tamarind Court',
        category: PurchaseCategory.MAINTENANCE_PARTS,
        lines: [{ description: 'Lift ropes, 6m', quantity: 2 }],
        saveAsDraft: true,
      },
      'org-1',
    );

    expect(prisma.purchaseRequest.create.mock.calls[0][0].data.reference).toBe(
      'PR-2026-0008',
    );
  });

  it('derives the estimate from priced lines rather than trusting the header', async () => {
    await requests.create(
      {
        title: 'Lift ropes for Tamarind Court',
        category: PurchaseCategory.MAINTENANCE_PARTS,
        lines: [
          { description: 'Lift ropes, 6m', quantity: 2, unitPrice: 47500 },
          { description: 'Oil seals', quantity: 4, unitPrice: 2500 },
        ],
        saveAsDraft: true,
      },
      'org-1',
    );

    const data = prisma.purchaseRequest.create.mock.calls[0][0].data;
    expect(Number(data.estimatedAmount)).toBe(105000);
  });

  // ==================================================================
  // RFQs — competition, invitations, and the comparison
  // ==================================================================

  it('404s an RFQ belonging to another organization', async () => {
    await expect(rfqs.findOne('rfq-1', 'org-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('will not raise an RFQ against a request that is not approved', async () => {
    await expect(
      rfqs.create({ title: 'Lift ropes', purchaseRequestId: 'pr-1' }, 'org-1'),
    ).rejects.toThrow(/Only an approved request/i);
  });

  it('refuses to invite an archived supplier', async () => {
    await expect(
      rfqs.inviteSuppliers('rfq-1', { supplierIds: ['sup-archived'] }, 'org-1'),
    ).rejects.toThrow(/archived/i);
  });

  it('refuses to invite a supplier from another organization', async () => {
    // The query is scoped by organizationId, so a supplier belonging to another
    // tenant simply comes back missing — and a missing supplier is refused,
    // never quietly invited.
    prisma.supplier.findMany.mockResolvedValueOnce([
      supplier({ id: 'sup-1' }),
    ] as never);

    await expect(
      rfqs.inviteSuppliers(
        'rfq-1',
        { supplierIds: ['sup-1', 'sup-theirs'] },
        'org-1',
      ),
    ).rejects.toThrow(/does not exist in this organization/i);
  });

  it('refuses a quotation from a supplier who was never invited', async () => {
    await expect(
      rfqs.recordQuote(
        'rfq-1',
        {
          supplierId: 'sup-archived',
          lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a quotation that names a line from another request', async () => {
    // An invitation that has not been answered yet, so the run reaches the
    // line-id check rather than stopping at "already quoted".
    prisma.__rfqRows[0].invitations[0].status = 'INVITED';

    await expect(
      rfqs.recordQuote(
        'rfq-1',
        {
          supplierId: 'sup-1',
          lines: [
            {
              description: 'Lift ropes, 6m',
              quantity: 2,
              unitPrice: 47500,
              purchaseRequestLineId: 'prl-from-another-request',
            },
          ],
        },
        'org-1',
      ),
    ).rejects.toThrow(/not on this purchase request/i);
  });

  it('sums a quotation from its own lines and flags the cheapest', async () => {
    const comparison = await rfqs.comparison('rfq-1', 'org-1');

    expect(comparison.rows.map((row) => row.quoteId)).toEqual(['q-1', 'q-2']);
    expect(comparison.rows[0].cheapest).toBe(true);
    // Cheapest but slower: nothing is recommended, because that is a judgement.
    expect(comparison.recommendedQuoteId).toBeNull();
    expect(comparison.singleSource).toBe(false);
    expect(comparison.quotesReceived).toBe(2);
  });

  it('refuses a second award on the same RFQ', async () => {
    prisma.__rfqRows[0].status = RfqStatus.QUOTES_RECEIVED;
    prisma.__rfqRows[0].awardedQuoteId = 'q-1';
    prisma.__rfqRows[0].quotes[0].status = QuoteStatus.AWARDED;

    await expect(
      rfqs.award('rfq-1', { quoteId: 'q-2' }, 'org-1'),
    ).rejects.toThrow(/already been awarded/i);
  });

  it('awards a clean quotation and rejects the others', async () => {
    prisma.__rfqRows[0].status = RfqStatus.QUOTES_RECEIVED;

    await rfqs.award('rfq-1', { quoteId: 'q-1' }, 'org-1');

    expect(prisma.rfqQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'q-1' } }),
        data: { status: QuoteStatus.REJECTED },
      }),
    );
  });

  it('warns when only one supplier was invited', async () => {
    prisma.__rfqRows[0].invitations = [prisma.__rfqRows[0].invitations[0]];
    prisma.__rfqRows[0].quotes = [prisma.__rfqRows[0].quotes[0]];

    const result = await rfqs.findOne('rfq-1', 'org-1');

    expect(result.singleSource).toBe(true);
  });

  // ==================================================================
  // Purchase orders — receipts, bills, and the gates around them
  // ==================================================================

  it('404s a purchase order belonging to another organization', async () => {
    await expect(orders.findOne('po-1', 'org-other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to receive goods before the supplier has accepted', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.SENT;

    await expect(
      orders.receive(
        'po-1',
        { lines: [{ purchaseOrderLineId: 'pol-1', quantity: 1 }] },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to receive more than is outstanding', async () => {
    prisma.purchaseOrderLine.findMany.mockResolvedValueOnce([
      {
        id: 'pol-1',
        description: 'Lift ropes, 6m',
        quantity: 2,
        receivedQuantity: 1,
      },
    ] as never);

    await expect(
      orders.receive(
        'po-1',
        { lines: [{ purchaseOrderLineId: 'pol-1', quantity: 5 }] },
        'org-1',
      ),
    ).rejects.toThrow(/only has 1 outstanding/i);
  });

  it('refuses a receipt naming a line from another order', async () => {
    prisma.purchaseOrderLine.findMany.mockResolvedValueOnce([] as never);

    await expect(
      orders.receive(
        'po-1',
        { lines: [{ purchaseOrderLineId: 'pol-theirs', quantity: 1 }] },
        'org-1',
      ),
    ).rejects.toThrow(/not part of this purchase order/i);
  });

  it('refuses to cancel an order that already has goods against it', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    prisma.__orderRows[0].deliveries = [
      { id: 'gr-1', receivedAt: new Date(), lines: [] },
    ];

    await expect(
      orders.cancel('po-1', { reason: 'Changed our minds' }, 'org-1'),
    ).rejects.toThrow(/already been received/i);
  });

  it('refuses to bill an order where nothing has been received', async () => {
    await expect(
      orders.createBillForOrder('po-1', {}, 'org-1'),
    ).rejects.toThrow(/Record the goods arriving/i);
    expect(payables.createBill).not.toHaveBeenCalled();
  });

  it('refuses a second bill against the same order', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.RECEIVED;
    prisma.__orderRows[0].receivedAt = new Date();
    prisma.__orderRows[0].supplierBillId = 'bill-1';
    prisma.__orderRows[0].supplierBill = { id: 'bill-1', billNumber: 'BILL-1' };
    prisma.__orderRows[0].deliveries = [
      { id: 'gr-1', receivedAt: new Date(), lines: [] },
    ];
    prisma.__orderRows[0].lines[0].receivedQuantity = 2;

    await expect(
      orders.createBillForOrder('po-1', {}, 'org-1'),
    ).rejects.toThrow(/already been raised/i);
  });

  it('hands a received order to finance as a maintenance bill', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.RECEIVED;
    prisma.__orderRows[0].receivedAt = new Date();
    prisma.__orderRows[0].deliveries = [
      { id: 'gr-1', receivedAt: new Date(), lines: [] },
    ];
    prisma.__orderRows[0].lines[0].receivedQuantity = 2;

    await orders.createBillForOrder(
      'po-1',
      { supplierReference: 'LP-991' },
      'org-1',
      'user-1',
    );

    expect(payables.createBill).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'sup-1',
        supplierReference: 'LP-991',
        // The vocabulary bridge: a MAINTENANCE_PARTS purchase posts to the
        // repairs account, which is finance's mapping and not the requester's.
        category: 'MAINTENANCE',
        subtotal: 95000,
        createdBy: 'user-1',
      }),
      'org-1',
    );
  });

  it('bills only what arrived on a part delivery', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    prisma.__orderRows[0].deliveries = [
      { id: 'gr-1', receivedAt: new Date(), lines: [] },
    ];
    prisma.__orderRows[0].lines[0].receivedQuantity = 1;

    await orders.createBillForOrder('po-1', {}, 'org-1');

    const call = payables.createBill.mock.calls[0][0];
    expect(call.subtotal).toBe(47500);
    expect(call.lines[0].quantity).toBe(1);
    expect(call.lines[0].description).toContain('part received');
  });

  it('refuses to send an order with no lines', async () => {
    prisma.__orderRows[0].status = PurchaseOrderStatus.DRAFT;
    prisma.__orderRows[0].lines = [];

    await expect(orders.send('po-1', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses to edit the delivery date after the supplier has accepted', async () => {
    await expect(
      orders.update(
        'po-1',
        { expectedDelivery: new Date().toISOString() },
        'org-1',
      ),
    ).rejects.toThrow(/already been accepted/i);
  });

  it('reports overdue from the promised date rather than a stored flag', async () => {
    prisma.__orderRows[0].expectedDelivery = new Date(
      Date.now() - 10 * 86_400_000,
    );

    const result = await orders.findOne('po-1', 'org-1');

    expect(result.overdue).toBe(true);
    expect(result.daysOverdue).toBeGreaterThanOrEqual(10);
  });

  it('reports how much is still outstanding against the order', async () => {
    prisma.__orderRows[0].lines[0].receivedQuantity = 1;
    prisma.__orderRows[0].deliveries = [
      { id: 'gr-1', receivedAt: new Date(), lines: [] },
    ];

    const result = await orders.findOne('po-1', 'org-1');

    expect(Number(result.outstandingQuantity)).toBe(1);
    expect(Number(result.outstandingValue)).toBe(47500);
    expect(result.receivedPercent).toBe(50);
  });

  it('reports the receipt lines that still need booking onto a shelf', async () => {
    prisma.__orderRows[0].deliveries = [
      {
        id: 'gr-1',
        receivedAt: new Date(),
        deliveryNote: 'DN-88',
        lines: [
          {
            id: 'grl-1',
            purchaseOrderLineId: 'pol-1',
            quantity: 2,
            inventoryItemId: null,
            inventoryItem: null,
            stockMovement: null,
            purchaseOrderLine: {
              description: '20mm compression coupling',
              specification: null,
              unitPrice: 250,
              quantity: 4,
              receivedQuantity: 2,
            },
          },
        ],
      },
    ];

    const result = await orders.pendingStockIn('po-1', 'org-1');

    // The honest answer is now a list of decisions somebody has to make, rather
    // than "the inventory module does not exist yet" (master doc issue 81).
    expect(result.stockInModuleAvailable).toBe(true);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].goodsReceiptLineId).toBe('grl-1');
    expect(result.pending[0].description).toBe('20mm compression coupling');
    expect(result.pending[0].itemChosen).toBe(false);
  });

  // ==================================================================
  // Suppliers — performance is derived, never stored
  // ==================================================================

  it('excludes an archived supplier from the buyer-facing list', async () => {
    const list = await suppliers.findAll('org-1');

    expect(list.map((row) => row.id)).toEqual(['sup-1', 'sup-2']);
  });

  it('reports derived performance for a supplier', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValueOnce([
      {
        supplierId: 'sup-1',
        status: PurchaseOrderStatus.RECEIVED,
        totalAmount: 95000,
        orderDate: new Date(),
        expectedDelivery: new Date(Date.now() + 86_400_000),
        receivedAt: new Date(),
      },
    ] as never);
    prisma.rfqQuote.findMany.mockResolvedValueOnce([
      { supplierId: 'sup-1', status: QuoteStatus.AWARDED },
      { supplierId: 'sup-1', status: QuoteStatus.REJECTED },
    ] as never);

    const list = await suppliers.findAll('org-1');
    const liftParts = list.find((row) => row.id === 'sup-1');

    expect(liftParts!.performance.orders).toBe(1);
    expect(liftParts!.performance.onTimeRate).toBe(100);
    expect(liftParts!.performance.winRate).toBe(50);
  });

  it('does not claim a win rate for a supplier who has never quoted', async () => {
    const list = await suppliers.findAll('org-1');

    expect(list[0].performance.winRate).toBeNull();
    expect(list[0].performance.onTimeRate).toBeNull();
  });

  it('refuses a contract that ends before it starts', async () => {
    await expect(
      suppliers.update(
        'sup-1',
        {
          contractStartDate: '2026-06-01',
          contractEndDate: '2026-01-01',
        },
        'org-1',
      ),
    ).rejects.toThrow(/ends before it starts/i);
  });
});
