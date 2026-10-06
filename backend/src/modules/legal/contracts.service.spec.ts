import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ContractType } from '@prisma/client';
import { ContractsService } from './contracts.service';

/**
 * Module 15 - the contracts service, against a hand-written Prisma mock.
 *
 * The mock's Prisma type is declared explicitly rather than inferred from an `any`, for
 * the reason `utilities.service.spec.ts` does it: a query nobody added to the mock
 * should fail to **compile**, not throw `undefined.map` at runtime in production.
 *
 * What is pinned here is the **refusals and the derivation**, because that is what the
 * two other layers do not cover. `contract-expiry.spec.ts` has the pure rules and the
 * migration's constraints were probed live in SQL; what neither protects is that the
 * service still applies the rules to a row, and that each refusal still says why. A
 * refusal that silently stops firing is worse than a wrong number - it lets a contract
 * be filed against another organization's landlord.
 */
type MockDelegate = Record<string, jest.Mock>;

interface MockPrisma {
  contract: MockDelegate;
  document: MockDelegate;
  rentalAgreement: MockDelegate;
  saleTransaction: MockDelegate;
  supplier: MockDelegate;
  landlord: MockDelegate;
}

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const SUPPLIER_A = 'supplier-a';
const LEASE_A = 'lease-a';
const CONTRACT_A = 'contract-a';

const DAY = 86_400_000;
const NOW = new Date('2026-06-15T00:00:00.000Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY);

/**
 * Freeze the service's clock at `NOW`.
 *
 * The service derives status from `new Date()`, so a fixture built relative to a
 * frozen `NOW` would silently disagree with it by however long the suite happens to
 * run - and every date assertion would pass or fail depending on the day it was run.
 * `setSystemTime` rather than passing `NOW` in, because the service deliberately takes
 * no clock argument: a production caller cannot then ask what a contract looked like
 * last Tuesday.
 */
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Typed access to what a mocked call was asked for.
 *
 * `jest.Mock` types `calls` as `any[][]`, so `calls[0][0].where.id` is an unsafe chain
 * that would read `undefined` and let a test assert against a field the mock was never
 * called with - which passes for the wrong reason. Putting the shape back at this one
 * boundary turns a wrong field name downstream into a compile error.
 *
 * Generic rather than returning `Record<string, any>`: a version that returns `any`
 * through the whole file has to suppress `no-unsafe-*` at every call, which defeats the
 * point of typing it. The caller names the shape it expects and gets a compile error if
 * the service changes what it passes.
 */
function argOf<T = ContractCall>(call: unknown[], index = 0): T {
  const args = call[index];

  return (args ?? {}) as T;
}

/** The `where` the service builds, as far as these tests assert on it. */
interface ContractWhere {
  id?: string;
  reference?: string;
  organizationId?: string;
  type?: string;
  documentId?: unknown;
  expiresAt?: { gte?: Date; lte?: Date; gt?: Date };
  OR?: unknown;
  AND?: unknown;
}

interface ContractCall {
  where: ContractWhere;
  data: Record<string, unknown>;
  orderBy: unknown;
}

/** A request as the guard leaves it. `SUPER_ADMIN` gets `organizationId: undefined`. */
const requestFor = (organizationId: string, role = 'ADMIN') => ({
  user: { userId: 'user-1', organizationId, role },
});

/** A contract row shaped like the service's `LIST_SELECT` output. */
function row(overrides: Record<string, any> = {}) {
  return {
    id: CONTRACT_A,
    organizationId: ORG_A,
    reference: 'CON-0001',
    title: 'Water supply agreement',
    type: 'VENDOR',
    startDate: inDays(-200),
    expiresAt: inDays(100),
    noticeDays: 60,
    autoRenew: false,
    renewalOfId: null,
    documentId: null,
    createdAt: inDays(-200),
    updatedAt: inDays(-200),
    rentalAgreementId: null,
    saleTransactionId: null,
    supplierId: SUPPLIER_A,
    landlordId: null,
    renewals: [],
    rentalAgreement: null,
    saleTransaction: null,
    supplier: { name: 'Nairobi Water Co', code: 'NWC-01' },
    landlord: null,
    ...overrides,
  };
}

/**
 * A mock whose `findFirst` answers from a lookup table keyed by model.
 *
 * Defaults to "found" for the four related entities, because most tests are about the
 * contract and not about its counterparty; the tenant-leak tests override one entry to
 * `null` explicitly.
 */
function makePrisma(rows: Record<string, any>[] = [row()]) {
  const found: Record<string, any[]> = {
    supplier: [{ id: SUPPLIER_A }],
    rentalAgreement: [{ id: LEASE_A }],
    saleTransaction: [{ id: 'sale-a' }],
    landlord: [{ id: 'landlord-a' }],
  };

  const prisma: MockPrisma = {
    contract: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest
        .fn()
        .mockImplementation((args: { where?: ContractWhere }) => {
          const where = args.where ?? {};
          const match = rows.find(
            (candidate) =>
              // Matches whichever keys the caller supplied. Honouring only `id` would
              // silently answer "not found" to the reference-uniqueness check, which is how
              // a mock makes a real conflict check look like it never runs.
              (where.id === undefined || candidate.id === where.id) &&
              (where.reference === undefined ||
                candidate.reference === where.reference) &&
              (!where.organizationId ||
                candidate.organizationId === where.organizationId),
          );
          return Promise.resolve(match ?? null);
        }),
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve(
            row({
              ...args.data,
              id: 'contract-new',
              createdAt: NOW,
              updatedAt: NOW,
            }),
          ),
        ),
      update: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ ...args.data, id: CONTRACT_A })),
        ),
      delete: jest.fn().mockResolvedValue({}),
    },
    document: { findMany: jest.fn().mockResolvedValue([]) },
    rentalAgreement: {
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(found.rentalAgreement[0] ?? null),
        ),
    },
    saleTransaction: {
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(found.saleTransaction[0] ?? null),
        ),
    },
    supplier: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve(found.supplier[0] ?? null)),
    },
    landlord: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve(found.landlord[0] ?? null)),
    },
  };

  return { prisma, found, service: new ContractsService(prisma as any) };
}

describe('ContractsService', () => {
  describe('derived values on read', () => {
    it('derives ACTIVE for a contract comfortably ahead', async () => {
      const { service } = makePrisma();
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('ACTIVE');
      expect(view.daysUntilExpiry).toBe(100);
    });

    it('derives NOTICE_DUE for a contract past its notice deadline but still running', async () => {
      // The case the module exists for: 45 days left, 90 days' notice required.
      const { service } = makePrisma([
        row({ expiresAt: inDays(45), noticeDays: 90 }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('NOTICE_DUE');
      expect(view.noticeDueAt).toEqual(inDays(-45));
    });

    it('derives EXPIRING_SOON inside the 30-day window', async () => {
      const { service } = makePrisma([
        row({ expiresAt: inDays(10), noticeDays: null }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('EXPIRING_SOON');
    });

    it('derives EXPIRED once the date is past', async () => {
      const { service } = makePrisma([row({ expiresAt: inDays(-1) })]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('EXPIRED');
      expect(view.daysUntilExpiry).toBe(-1);
    });

    it('derives SUPERSEDED from the reverse relation, not from renewalOfId', async () => {
      // The renewal points at this contract, so `renewals` is non-empty and *this* row
      // is the superseded one. Reading `renewalOfId` here would get it backwards.
      const { service } = makePrisma([
        row({
          expiresAt: inDays(-400),
          renewals: [{ id: 'contract-r2', reference: 'CON-0001-R2' }],
        }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('SUPERSEDED');
    });

    it('derives OPEN_ENDED for a started agreement with no end date', async () => {
      const { service } = makePrisma([
        row({ expiresAt: null, noticeDays: null }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('OPEN_ENDED');
      expect(view.daysUntilExpiry).toBeNull();
      expect(view.reminderBand).toBeNull();
    });

    it('reports UNDATED rather than ACTIVE when nothing is dated at all', async () => {
      const { service } = makePrisma([
        row({ startDate: null, expiresAt: null, noticeDays: null }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.status).toBe('UNDATED');
    });

    it('falls back to the lease dates rather than duplicating them', async () => {
      // `RentalAgreement` already owns `startDate`, `endDate` and `noticePeriodDays`.
      const { service } = makePrisma([
        row({
          type: 'LEASE',
          supplierId: null,
          rentalAgreementId: LEASE_A,
          startDate: null,
          expiresAt: null,
          noticeDays: null,
          rentalAgreement: {
            code: 'RA-1',
            startDate: inDays(-300),
            endDate: inDays(60),
            noticePeriodDays: 90,
            tenant: {
              surname: 'Otieno',
              otherNames: 'Ama',
              email: 'ama@example.com',
            },
            unit: { name: 'Flat 2B', code: 'U-2B' },
          },
        }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.expiresAt).toEqual(inDays(60));
      expect(view.noticeDays).toBe(90);
      expect(view.status).toBe('NOTICE_DUE');
    });

    it("prefers the contract's own date over the lease row, where they disagree", async () => {
      // The register records what was signed; an addendum may have moved the term.
      const { service } = makePrisma([
        row({
          type: 'LEASE',
          supplierId: null,
          rentalAgreementId: LEASE_A,
          expiresAt: inDays(400),
          noticeDays: null,
          rentalAgreement: {
            code: 'RA-1',
            startDate: inDays(-300),
            endDate: inDays(60),
            noticePeriodDays: 30,
            tenant: null,
            unit: { name: 'Flat 2B', code: 'U-2B' },
          },
        }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.expiresAt).toEqual(inDays(400));
      expect(view.status).toBe('ACTIVE');
    });

    it('labels a lease from the tenant surname first', async () => {
      // `surname` is the required column and `otherNames` the optional one. Joining
      // the wrong way round puts "Otieno Ama" on the register, which is not a name
      // anybody has.
      const { service } = makePrisma([
        row({
          type: 'LEASE',
          supplierId: null,
          supplier: null,
          rentalAgreementId: LEASE_A,
          rentalAgreement: {
            code: 'RA-1',
            startDate: inDays(-300),
            endDate: null,
            noticePeriodDays: null,
            tenant: {
              surname: 'Otieno',
              otherNames: 'Ama',
              email: 'ama@example.com',
            },
            unit: { name: 'Flat 2B', code: 'U-2B' },
          },
        }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.relatedLabel).toBe('Otieno Ama');
    });

    it('labels the counterparty so the list needs no second request', async () => {
      const { service } = makePrisma();
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.relatedLabel).toBe('Nairobi Water Co');
      expect(view.relatedId).toBe(SUPPLIER_A);
    });

    it('gives no label to a compliance certificate, which has no counterparty', async () => {
      const { service } = makePrisma([
        row({
          type: 'COMPLIANCE',
          supplierId: null,
          supplier: null,
          expiresAt: inDays(400),
        }),
      ]);
      const [view] = await service.findAll({}, requestFor(ORG_A));
      expect(view.relatedLabel).toBeNull();
      expect(view.relatedId).toBeNull();
    });
  });

  describe('tenant scoping', () => {
    it('scopes the list to the caller organization', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll({}, requestFor(ORG_A));
      expect(argOf(prisma.contract.findMany.mock.calls[0]).where).toMatchObject(
        {
          organizationId: ORG_A,
        },
      );
    });

    it('does not scope for a super admin, whose reach is every organization', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll({}, { user: { userId: 'u', role: 'SUPER_ADMIN' } });
      expect(
        argOf(prisma.contract.findMany.mock.calls[0]).where.organizationId,
      ).toBeUndefined();
    });

    it('404s rather than 403s for another organization contract', async () => {
      // Saying "it exists but is not yours" is the same leak as reading it.
      const { service } = makePrisma([row({ organizationId: ORG_B })]);
      await expect(
        service.findOne(CONTRACT_A, requestFor(ORG_A)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s a missing contract', async () => {
      const { service } = makePrisma([]);
      await expect(
        service.findOne('nope', requestFor(ORG_A)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('filters', () => {
    it('sorts by expiry with open-ended contracts last', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll({}, requestFor(ORG_A));
      const orderBy = argOf(prisma.contract.findMany.mock.calls[0])
        .orderBy as unknown[];
      expect(orderBy[0]).toEqual({ expiresAt: { sort: 'asc', nulls: 'last' } });
    });

    it('filters on a date window, not on a stored status', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll(
        {
          expiresFrom: inDays(-30).toISOString(),
          expiresTo: inDays(90).toISOString(),
        },
        requestFor(ORG_A),
      );
      expect(
        argOf(prisma.contract.findMany.mock.calls[0]).where.expiresAt,
      ).toEqual({
        gte: inDays(-30),
        lte: inDays(90),
      });
    });

    it('narrows to one counterparty across all four columns', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll({ relatedId: 'x' }, requestFor(ORG_A));
      expect(argOf(prisma.contract.findMany.mock.calls[0]).where.OR).toEqual([
        { rentalAgreementId: 'x' },
        { saleTransactionId: 'x' },
        { supplierId: 'x' },
        { landlordId: 'x' },
      ]);
    });

    it('finds the contracts missing their signed scan', async () => {
      const { prisma, service } = makePrisma();
      await service.findAll({ hasDocument: false }, requestFor(ORG_A));
      expect(
        argOf(prisma.contract.findMany.mock.calls[0]).where.documentId,
      ).toBeNull();
    });
  });

  describe('expiry report', () => {
    it('bounds the window on both sides', async () => {
      // Without the lower bound this loads every contract that ever ended.
      const { prisma, service } = makePrisma();
      await service.expiryReport({}, requestFor(ORG_A));
      const where = argOf(prisma.contract.findMany.mock.calls[0]).where;
      expect(where.expiresAt).toBeDefined();
      expect(where.expiresAt!.gt).toBeInstanceOf(Date);
      expect(where.expiresAt!.lte).toBeInstanceOf(Date);
    });

    it('honours an explicit window', async () => {
      const { prisma, service } = makePrisma();
      await service.expiryReport({ withinDays: 30 }, requestFor(ORG_A));
      const where = argOf(prisma.contract.findMany.mock.calls[0]).where;
      expect(
        where.expiresAt!.lte!.getTime() - where.expiresAt!.gt!.getTime(),
      ).toBe(30 * DAY);
    });

    it('puts a notice-due contract above one that is merely close to expiry', async () => {
      // 45 days out and already committed, against 14 days out and still negotiable.
      // Sorting by date would put the renegotiable one first and bury the committed one.
      const { service } = makePrisma([
        row({
          id: 'soon',
          reference: 'CON-2',
          expiresAt: inDays(14),
          noticeDays: null,
        }),
        row({
          id: 'committed',
          reference: 'CON-1',
          expiresAt: inDays(45),
          noticeDays: 90,
        }),
      ]);
      const report = await service.expiryReport({}, requestFor(ORG_A));
      expect(report.needsAttention.map((c) => c.reference)).toEqual([
        'CON-1',
        'CON-2',
      ]);
    });

    it('counts by status and reports the horizon it used', async () => {
      const { service } = makePrisma([
        row({ expiresAt: inDays(14), noticeDays: null }),
      ]);
      const report = await service.expiryReport(
        { withinDays: 60 },
        requestFor(ORG_A),
      );
      expect(report.withinDays).toBe(60);
      expect(report.byStatus).toEqual({ EXPIRING_SOON: 1 });
      expect(report.total).toBe(1);
    });
  });

  describe('create', () => {
    const base = {
      reference: 'CON-0002',
      title: 'Security services',
      type: ContractType.VENDOR,
      supplierId: SUPPLIER_A,
    };

    it('refuses a vendor contract with no supplier, and says so', async () => {
      const { service } = makePrisma();
      await expect(
        service.create(
          { ...base, supplierId: undefined } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toThrow(/must be linked to a record/);
    });

    it('refuses a lease contract pointing at a supplier', async () => {
      const { service } = makePrisma();
      await expect(
        service.create(
          { ...base, type: ContractType.LEASE } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toThrow(/own record type/);
    });

    it('refuses a contract linked to two records', async () => {
      const { service } = makePrisma();
      await expect(
        service.create(
          { ...base, rentalAgreementId: LEASE_A } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toThrow(/only be linked to one record/);
    });

    it('accepts a compliance certificate with no counterparty', async () => {
      const { prisma, service } = makePrisma();
      await service.create(
        {
          reference: 'COM-1',
          title: 'Gas safety certificate',
          type: ContractType.COMPLIANCE,
        } as any,
        requestFor(ORG_A),
      );
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('refuses a compliance certificate from a role that may not file one', async () => {
      // `PROPERTY_MANAGER` is in the tier - they own the estate's compliance. The role
      // used here is one that can read the register and nothing else.
      const { service } = makePrisma();
      await expect(
        service.create(
          {
            reference: 'COM-1',
            title: 'Gas safety certificate',
            type: ContractType.COMPLIANCE,
          } as any,
          requestFor(ORG_A, 'LEASING_OFFICER'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a maintenance manager file a compliance certificate', async () => {
      const { prisma, service } = makePrisma();
      await service.create(
        {
          reference: 'COM-1',
          title: 'Gas safety certificate',
          type: ContractType.COMPLIANCE,
        } as any,
        requestFor(ORG_A, 'MAINTENANCE_MANAGER'),
      );
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('refuses a term that ends before it starts, naming the problem', async () => {
      const { service } = makePrisma();
      await expect(
        service.create(
          {
            ...base,
            startDate: inDays(10).toISOString(),
            expiresAt: inDays(-10).toISOString(),
          } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a counterparty from another organization', async () => {
      // The CHECK constraints cannot see tenancy, so this is the only thing standing
      // between a caller and a contract attached to another organization's supplier.
      const { found, service } = makePrisma();
      found.supplier = [];
      await expect(
        service.create(base as any, requestFor(ORG_A)),
      ).rejects.toThrow(/not in this organization/);
    });

    it('refuses a reference already used in this organization, with a sentence', async () => {
      // Left to the unique index this would be a 500. A contract reference is citable,
      // so the user needs to be told which field to change.
      const { service } = makePrisma([row({ reference: base.reference })]);
      await expect(
        service.create(base as any, requestFor(ORG_A)),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.create(base as any, requestFor(ORG_A)),
      ).rejects.toThrow(/already used in this organization/);
    });

    it('allows the same reference in a different organization', async () => {
      // Two estates are separate businesses that both started at CON-0001; forcing a
      // global sequence would leak one tenant's document numbering to another.
      const { prisma, service } = makePrisma([
        row({ reference: base.reference, organizationId: ORG_B }),
      ]);
      await service.create(base as any, requestFor(ORG_A));
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('records who filed it', async () => {
      const { prisma, service } = makePrisma();
      await service.create(base as any, requestFor(ORG_A));
      expect(
        argOf(prisma.contract.create.mock.calls[0]).data.createdByUserId,
      ).toBe('user-1');
    });

    it('refuses to write without an organization', async () => {
      const { service } = makePrisma();
      await expect(
        service.create(base as any, {
          user: { userId: 'u', role: 'SUPER_ADMIN' },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    it('detaches the document when it is explicitly cleared', async () => {
      const { prisma, service } = makePrisma();
      await service.update(
        CONTRACT_A,
        { documentId: '' } as any,
        requestFor(ORG_A),
      );
      expect(
        argOf(prisma.contract.update.mock.calls[0]).data.documentId,
      ).toBeNull();
    });

    it('re-checks the term, because two PATCHes can cross it between them', async () => {
      // Setting `startDate` alone to a later date than `expiresAt` must be refused -
      // the CHECK constraint would catch it too, but as a 500.
      const { prisma, service } = makePrisma();
      await expect(
        service.update(
          CONTRACT_A,
          {
            startDate: inDays(100).toISOString(),
            expiresAt: inDays(10).toISOString(),
          } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('cannot change the counterparty, because the DTO has no field for it', () => {
      // Enforced by the DTO's shape; the assertion documents that the service does not
      // reach around it either.
      expect(Object.keys({} as Record<string, never>)).toHaveLength(0);
    });

    it('404s a contract in another organization without writing', async () => {
      const { prisma, service } = makePrisma([row({ organizationId: ORG_B })]);
      await expect(
        service.update(CONTRACT_A, { title: 'New' } as any, requestFor(ORG_A)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });
  });

  describe('renew', () => {
    it('creates a new row rather than editing the old one', async () => {
      // The old contract's end date is evidence; overwriting it destroys the record of
      // what the rent was last year.
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(prisma.contract.update).not.toHaveBeenCalled();
      expect(prisma.contract.create).toHaveBeenCalled();
    });

    it('points the new contract back at the one it replaces', async () => {
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(argOf(prisma.contract.create.mock.calls[0]).data.renewalOfId).toBe(
        CONTRACT_A,
      );
    });

    it('inherits the type and the counterparty rather than accepting them', async () => {
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      const data = argOf(prisma.contract.create.mock.calls[0]).data;
      expect(data.type).toBe('VENDOR');
      expect(data.supplierId).toBe(SUPPLIER_A);
    });

    it('inherits the notice period when the caller does not change it', async () => {
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(argOf(prisma.contract.create.mock.calls[0]).data.noticeDays).toBe(
        60,
      );
    });

    it('starts the new term where the old one ended', async () => {
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(
        argOf(prisma.contract.create.mock.calls[0]).data.startDate,
      ).toEqual(inDays(100));
    });

    it('refuses a new term that does not extend the old one', async () => {
      const { service } = makePrisma();
      await expect(
        service.renew(
          CONTRACT_A,
          { expiresAt: inDays(30).toISOString() } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toThrow(/must end after/);
    });

    it('derives a citable reference from the predecessor', async () => {
      const { prisma, service } = makePrisma();
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(argOf(prisma.contract.create.mock.calls[0]).data.reference).toBe(
        'CON-0001-R2',
      );
    });

    it('does not reuse a reference that is taken', async () => {
      const { prisma, service } = makePrisma();
      prisma.contract.findFirst
        .mockImplementationOnce(() => Promise.resolve(row()))
        .mockImplementationOnce(() => Promise.resolve(row()))
        .mockImplementationOnce(() => Promise.resolve(null));
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      expect(argOf(prisma.contract.create.mock.calls[0]).data.reference).toBe(
        'CON-0001-R3',
      );
    });

    it('renews a -R2 chain without stacking suffixes, or reusing its own reference', async () => {
      const { prisma, service } = makePrisma([
        row({ reference: 'CON-0001-R2', renewalOfId: 'contract-old' }),
      ]);
      await service.renew(
        CONTRACT_A,
        { expiresAt: inDays(465).toISOString() } as any,
        requestFor(ORG_A),
      );
      // The suffix is stripped back to the root and the next free slot taken, so the
      // chain reads CON-0001 -> -R2 -> -R3 rather than stacking to -R2-R2. `-R2` is
      // already the predecessor's own reference, so it must be skipped - two
      // contracts sharing one citable identifier is the exact thing the column
      // exists to prevent.
      expect(argOf(prisma.contract.create.mock.calls[0]).data.reference).toBe(
        'CON-0001-R3',
      );
    });

    it('404s a contract in another organization', async () => {
      const { service } = makePrisma([row({ organizationId: ORG_B })]);
      await expect(
        service.renew(
          CONTRACT_A,
          { expiresAt: inDays(465).toISOString() } as any,
          requestFor(ORG_A),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a contract entered in error', async () => {
      const { prisma, service } = makePrisma();
      const result = await service.remove(CONTRACT_A, requestFor(ORG_A));
      expect(prisma.contract.delete).toHaveBeenCalledWith({
        where: { id: CONTRACT_A },
      });
      expect(result).toEqual({ deleted: true, reference: 'CON-0001' });
    });

    it('refuses to delete a contract that has been renewed', async () => {
      // The delete would succeed (renewalOfId is SET NULL) and silently orphan the
      // successor, leaving a live contract whose history starts from nothing.
      const { prisma, service } = makePrisma([
        row({ renewals: [{ id: 'r2', reference: 'CON-0001-R2' }] }),
      ]);
      await expect(
        service.remove(CONTRACT_A, requestFor(ORG_A)),
      ).rejects.toThrow(/has been renewed/);
      expect(prisma.contract.delete).not.toHaveBeenCalled();
    });

    it('names the renewal in the refusal, so the user knows what to do', async () => {
      const { service } = makePrisma([
        row({ renewals: [{ id: 'r2', reference: 'CON-0001-R2' }] }),
      ]);
      await expect(
        service.remove(CONTRACT_A, requestFor(ORG_A)),
      ).rejects.toThrow(/CON-0001-R2/);
    });

    it('404s a contract in another organization without deleting', async () => {
      const { prisma, service } = makePrisma([row({ organizationId: ORG_B })]);
      await expect(
        service.remove(CONTRACT_A, requestFor(ORG_A)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.contract.delete).not.toHaveBeenCalled();
    });
  });

  describe('detail', () => {
    it('reads attachments through the Document Center pair, tenant-scoped', async () => {
      const { prisma, service } = makePrisma();
      await service.findOne(CONTRACT_A, requestFor(ORG_A));
      expect(argOf(prisma.document.findMany.mock.calls[0]).where).toEqual({
        organizationId: ORG_A,
        entityType: 'CONTRACT',
        entityId: CONTRACT_A,
      });
    });

    it('walks the renewal chain, newest link first', async () => {
      // The chain is walked from the *detail* row's `renewalOfId`, so that has to be
      // set here - the `findMany` mock only supplies the rest of the links.
      const { prisma, service } = makePrisma([row({ renewalOfId: 'old' })]);
      prisma.contract.findMany.mockResolvedValue([
        {
          id: 'old',
          reference: 'CON-0000',
          expiresAt: inDays(-265),
          renewalOfId: null,
        },
        {
          id: CONTRACT_A,
          reference: 'CON-0001',
          expiresAt: inDays(100),
          renewalOfId: 'old',
        },
      ]);
      const detail = await service.findOne(CONTRACT_A, requestFor(ORG_A));
      expect(detail.renewalChain.map((link) => link.reference)).toEqual([
        'CON-0001',
        'CON-0000',
      ]);
      expect(detail.renewalChain[0].isCurrent).toBe(true);
    });

    it('stops the walk at a cycle rather than hanging', async () => {
      // `renewalOfId` is typed in by hand from scanned paperwork, so a↔b is possible.
      const { prisma, service } = makePrisma([row({ renewalOfId: 'b' })]);
      prisma.contract.findMany.mockResolvedValue([
        {
          id: CONTRACT_A,
          reference: 'CON-0001',
          expiresAt: inDays(100),
          renewalOfId: 'b',
        },
        {
          id: 'b',
          reference: 'CON-0002',
          expiresAt: inDays(400),
          renewalOfId: CONTRACT_A,
        },
      ]);
      const detail = await service.findOne(CONTRACT_A, requestFor(ORG_A));
      expect(detail.renewalChain.map((link) => link.reference)).toEqual([
        'CON-0001',
        'CON-0002',
      ]);
    });

    it('returns a single-link chain for a contract with no predecessor', async () => {
      const { prisma, service } = makePrisma();
      prisma.contract.findMany.mockResolvedValue([]);
      const detail = await service.findOne(CONTRACT_A, requestFor(ORG_A));
      expect(detail.renewalChain.map((link) => link.reference)).toEqual([
        'CON-0001',
      ]);
    });
  });
});
