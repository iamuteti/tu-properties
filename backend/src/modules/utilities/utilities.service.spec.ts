import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApportionmentMethod,
  MeterReadingSource,
  MeterScope,
  UtilityChargeStatus,
  UtilityType,
  VacancyPolicy,
} from '@prisma/client';
import { UtilitiesService } from './utilities.service';

/**
 * Module 14 — the utilities service, against a hand-written Prisma mock.
 *
 * The mock's Prisma type is declared explicitly rather than inferred from an `any`,
 * for the reason `facilities.service.spec.ts` does it: a new query that nobody added
 * to the mock should fail to **compile**, not throw `undefined.map` at runtime in
 * production.
 *
 * What is being pinned here is overwhelmingly the *refusals*. The arithmetic already
 * has 43 tests in `meter-rates.spec.ts`, and the end-to-end path has 59 live
 * assertions; what neither of those protects is the thing this file exists for — that
 * each of these refusals still says why, and still fires. A refusal that silently
 * stops firing is worse than a wrong number, because it lets a double bill through.
 */
type MockDelegate = Record<string, jest.Mock>;

interface MockPrisma {
  utilityMeter: MockDelegate;
  meterReading: MockDelegate;
  utilityRate: MockDelegate;
  utilityCharge: MockDelegate;
  invoice: MockDelegate;
  organization: MockDelegate;
  property: MockDelegate;
  unit: MockDelegate;
  rentalAgreement: MockDelegate;
  $transaction: jest.Mock;
}

const ORG_A = 'org-a';
const PROPERTY_A = 'prop-a';
const UNIT_A = 'unit-a';
const METER_A = 'meter-a';
const LEASE_A = 'lease-a';

/**
 * Typed access to what a mocked call was asked for.
 *
 * `jest.Mock` types `calls` as `any[][]`, so `calls[0][0].where.id` is an unsafe chain
 * that would read `undefined` and then let a test assert against a field the mock was
 * never called with — which passes for the wrong reason. Putting the shape back at
 * this one boundary turns a wrong field name downstream into a compile error.
 */
function callArg<T>(mock: jest.Mock, index = 0): T {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const call = mock.mock.calls[index];
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  expect(call).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (call?.[0] ?? {}) as T;
}

/**
 * A stand-in for Prisma's `Decimal`.
 *
 * The service reads these with `Number(x)`, so the mock has to answer to *both*
 * `toNumber()` and JavaScript's numeric coercion — `Number()` tries `valueOf` and
 * then `toString`, and an object with neither returns `NaN`. A mock that quietly
 * produces `NaN` would make every money assertion pass or fail for the wrong reason,
 * so all three are defined.
 */
function dec(n: number | string) {
  return {
    toNumber: () => Number(n),
    valueOf: () => Number(n),
    toString: () => String(n),
  } as never;
}

function meterRow(over: Record<string, unknown> = {}) {
  return {
    id: METER_A,
    organizationId: ORG_A,
    propertyId: PROPERTY_A,
    unitId: UNIT_A,
    type: UtilityType.WATER,
    meterNumber: 'WTR-001',
    serialNumber: null,
    source: 'MANUAL',
    scope: MeterScope.SUBMETER,
    apportionmentMethod: null,
    apportionmentWeights: null,
    digits: null,
    digitWrapAt: null,
    lastBilledThrough: null,
    status: 'ACTIVE',
    readingSetup: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    property: { id: PROPERTY_A, name: 'Riverside' },
    unit: { id: UNIT_A, code: 'A-101', name: 'Flat 101', areaSqFt: dec(1200) },
    ...over,
  };
}

function readingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'read-a',
    organizationId: ORG_A,
    meterId: METER_A,
    readingDate: new Date('2026-08-01T00:00:00Z'),
    reading: dec(4000),
    source: 'MANUAL',
    note: null,
    recordedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function rateRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rate-a',
    organizationId: ORG_A,
    meterId: METER_A,
    propertyId: null,
    type: UtilityType.WATER,
    currency: 'KES',
    ratePerUnit: dec('55.5'),
    standingCharge: dec(0),
    prorateStandingCharge: false,
    purchaseCurrency: 'KES',
    spotRate: null,
    vatRate: dec(16),
    incomeAccount: '4000',
    revenueExpenseItem: '3',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function buildService() {
  const prisma: MockPrisma = {
    utilityMeter: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    meterReading: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    utilityRate: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    utilityCharge: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'charge-a' }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    invoice: { findFirst: jest.fn() },
    // The vacancy policy lives on the organization: a commercial decision about who
    // carries a vacant unit's water belongs to the landlord, not to this module.
    // Null here means "nobody has decided".
    organization: {
      findUnique: jest.fn().mockResolvedValue({ vacancyPolicy: null }),
    },
    property: { findFirst: jest.fn().mockResolvedValue({ id: PROPERTY_A }) },
    unit: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: UNIT_A }),
    },
    rentalAgreement: {
      findFirst: jest.fn().mockResolvedValue({ id: LEASE_A }),
      // One query for every tenancy in the property, which is how OCCUPANCY gets
      // every unit's occupancy in one round trip instead of one query per unit.
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(
    async (fn: (tx: MockPrisma) => Promise<unknown>) => fn(prisma),
  );

  const invoicesService = {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'inv-a', invoiceNumber: 'INV-0001' }),
  };

  const service = new UtilitiesService(
    prisma as never,
    invoicesService as never,
  );
  return { service, prisma, invoicesService };
}

/**
 * A jest matcher, typed.
 *
 * `expect.objectContaining` and `expect.anything()` are declared as returning `any`,
 * so nesting them inside `toHaveBeenCalledWith` produces an `any` assignment that
 * `no-unsafe-assignment` rejects. Wrapping them once here keeps the noise at a single
 * boundary instead of disabling the rule for the file - the same trade `callArg`
 * makes at the other end.
 */
const objectContaining = (expected: Record<string, unknown>): unknown =>
  expect.objectContaining(expected);
const anything = (): unknown => expect.anything();

describe('UtilitiesService — tenant scoping', () => {
  it('scopes a read-by-id to the caller organization', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());

    await service.findOneMeter(ORG_A, METER_A);

    expect(prisma.utilityMeter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: METER_A, organizationId: ORG_A },
      }),
    );
  });

  it("404s rather than returning null when the meter is not the caller's", async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(null);

    await expect(service.findOneMeter(ORG_A, METER_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes the meter list to the caller organization', async () => {
    const { service, prisma } = buildService();

    await service.findAllMeters(ORG_A, {});

    expect(
      callArg<{ where: Record<string, unknown> }>(prisma.utilityMeter.findMany)
        .where,
    ).toMatchObject({
      organizationId: ORG_A,
    });
  });

  it('scopes the reading and charge lists too', async () => {
    const { service, prisma } = buildService();

    await service.findAllReadings(ORG_A, {});
    await service.findAllCharges(ORG_A, {});

    expect(
      callArg<{ where: Record<string, unknown> }>(prisma.meterReading.findMany)
        .where,
    ).toMatchObject({ organizationId: ORG_A });
    expect(
      callArg<{ where: Record<string, unknown> }>(prisma.utilityCharge.findMany)
        .where,
    ).toMatchObject({ organizationId: ORG_A });
  });

  it('refuses a meter on a unit belonging to a different property', async () => {
    // `Unit` has no `organizationId` (master doc issue 25), so this is the check that
    // stops a meter being attached to another estate's unit.
    const { service, prisma } = buildService();
    prisma.unit.findFirst.mockResolvedValue(null);

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-9',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UtilitiesService — meter registration refusals', () => {
  it('refuses a bulk meter with no apportionment method, and will not pick one', async () => {
    const { service, prisma } = buildService();

    const promise = service.createMeter(ORG_A, {
      propertyId: PROPERTY_A,
      type: UtilityType.WATER,
      meterNumber: 'WTR-BULK',
      scope: MeterScope.BULK,
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(/will not pick one/);
    expect(prisma.utilityMeter.create).not.toHaveBeenCalled();
  });

  it('refuses a bulk meter carrying a unitId', async () => {
    const { service } = buildService();

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-X',
        scope: MeterScope.BULK,
        apportionmentMethod: ApportionmentMethod.AREA,
      }),
    ).rejects.toThrow(/cannot be attached to one/);
  });

  it('refuses a sub-meter carrying an apportionment method', async () => {
    const { service } = buildService();

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-Y',
        scope: MeterScope.SUBMETER,
        apportionmentMethod: ApportionmentMethod.AREA,
      }),
    ).rejects.toThrow(/nothing to divide/);
  });

  it('refuses a negotiated split with no weights', async () => {
    const { service } = buildService();

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-M',
        scope: MeterScope.BULK,
        apportionmentMethod: ApportionmentMethod.MANUAL,
      }),
    ).rejects.toThrow(/has to record the split/);
  });

  it('refuses a digit count with no wrap point', async () => {
    const { service } = buildService();

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-R1',
        digits: 5,
      }),
    ).rejects.toThrow(/both a digit count and a wrap point/);
  });

  it('names the correct wrap point when the one given is wrong', async () => {
    const { service } = buildService();

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-R2',
        digits: 5,
        digitWrapAt: 500000,
      }),
    ).rejects.toThrow(/wraps at 100000/);
  });

  it('refuses a duplicate meter number for the same utility, naming why', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue({ id: 'meter-existing' });

    await expect(
      service.createMeter(ORG_A, {
        propertyId: PROPERTY_A,
        unitId: UNIT_A,
        type: UtilityType.WATER,
        meterNumber: 'WTR-001',
      }),
    ).rejects.toThrow(/double what it is/);
  });

  it('accepts the same number under a different utility type', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(null);
    prisma.utilityMeter.create.mockResolvedValue(meterRow());

    await service.createMeter(ORG_A, {
      propertyId: PROPERTY_A,
      unitId: UNIT_A,
      type: UtilityType.ELECTRICITY,
      meterNumber: 'WTR-001',
    });

    expect(prisma.utilityMeter.create).toHaveBeenCalled();
  });

  it('never writes status from a create', async () => {
    // `status` is not in any DTO; the only way to retire a meter is the named action.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(null);
    prisma.utilityMeter.create.mockResolvedValue(meterRow());

    await service.createMeter(ORG_A, {
      propertyId: PROPERTY_A,
      unitId: UNIT_A,
      type: UtilityType.WATER,
      meterNumber: 'WTR-1',
    });

    expect(
      Object.keys(
        callArg<{ data: Record<string, unknown> }>(prisma.utilityMeter.create)
          .data,
      ),
    ).not.toContain('status');
  });
});

describe('UtilitiesService — readings', () => {
  it('refuses a second reading on the same day and says to correct rather than add', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.findUnique.mockResolvedValue({ id: 'read-existing' });

    const promise = service.createReading(ORG_A, {
      meterId: METER_A,
      readingDate: '2026-08-01',
      reading: 4000,
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(
      /Correct that reading rather than adding/,
    );
  });

  it('refuses a reading on a retired meter', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({ status: 'RETIRED' }),
    );

    await expect(
      service.createReading(ORG_A, {
        meterId: METER_A,
        readingDate: '2026-08-01',
        reading: 1,
      }),
    ).rejects.toThrow(/no longer read/);
  });

  it('refuses an estimate that does not say where the figure came from', async () => {
    // An un-auditable estimate on a resident's bill is worse than an obvious fudge,
    // because nothing about it invites a question.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());

    const promise = service.createReading(ORG_A, {
      meterId: METER_A,
      readingDate: '2026-08-01',
      reading: 4100,
      source: MeterReadingSource.ESTIMATED,
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(
      /needs to say where the figure came from/,
    );
    expect(prisma.meterReading.create).not.toHaveBeenCalled();
  });

  it('accepts an estimate that names its basis, and records who estimated it', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.create.mockResolvedValue(readingRow());

    await service.createReading(
      ORG_A,
      {
        meterId: METER_A,
        readingDate: '2026-08-01',
        reading: 4100,
        source: MeterReadingSource.ESTIMATED,
        estimationMethod: 'Average of the last three months',
      },
      'user-1',
    );

    expect(prisma.meterReading.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          estimationMethod: 'Average of the last three months',
          estimatedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('refuses an estimate that points at a reading on another meter', async () => {
    // "Assumed from reading X" names nothing a reader can go and look at if X is not
    // on this meter.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.findFirst.mockResolvedValue(null);

    await expect(
      service.createReading(ORG_A, {
        meterId: METER_A,
        readingDate: '2026-08-01',
        reading: 4100,
        source: MeterReadingSource.ESTIMATED,
        estimatedFromReadingId: 'read-other',
      }),
    ).rejects.toThrow(/not on this meter/);
  });

  it('does not attach estimator provenance to a reading that was actually measured', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.create.mockResolvedValue(readingRow());

    await service.createReading(
      ORG_A,
      { meterId: METER_A, readingDate: '2026-08-01', reading: 4100 },
      'user-1',
    );

    expect(
      callArg<{ data: Record<string, unknown> }>(prisma.meterReading.create)
        .data.estimatedByUserId,
    ).toBeNull();
  });

  it('refuses to edit a reading that has already been billed', async () => {
    const { service, prisma } = buildService();
    prisma.meterReading.findFirst.mockResolvedValue(readingRow());
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.utilityCharge.count.mockResolvedValue(1);

    const promise = service.updateReading(ORG_A, 'read-a', { reading: 9999 });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(/disagree/);
    expect(prisma.meterReading.update).not.toHaveBeenCalled();
  });

  it('allows editing a reading that has not been billed', async () => {
    const { service, prisma } = buildService();
    prisma.meterReading.findFirst.mockResolvedValue(readingRow());
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.utilityCharge.count.mockResolvedValue(0);
    prisma.meterReading.update.mockResolvedValue(
      readingRow({ reading: dec(9999) }),
    );

    await service.updateReading(ORG_A, 'read-a', { reading: 9999 });

    expect(prisma.meterReading.update).toHaveBeenCalled();
  });

  it('reports per-row outcomes from a bulk paste rather than failing wholesale', async () => {
    // A clipboard of forty meters failing entirely because one number was mistyped is
    // not a useful result, and the caller needs to know which row to fix.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'clash' });
    prisma.meterReading.create.mockResolvedValue(readingRow());

    const result = await service.createReadingsBulk(ORG_A, [
      { meterId: METER_A, readingDate: '2026-08-01', reading: 4000 },
      { meterId: METER_A, readingDate: '2026-08-02', reading: 4100 },
    ]);

    expect(result.created).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].readingDate).toBe('2026-08-02');
    expect(result.failed[0].message).toMatch(/Correct that reading/);
  });
});

describe('UtilitiesService — tariffs', () => {
  it('refuses a second open tariff for the same scope', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.utilityRate.findFirst.mockResolvedValue({ id: 'rate-open' });

    const promise = service.createRate(ORG_A, {
      type: UtilityType.WATER,
      ratePerUnit: 60,
      validFrom: '2026-02-01',
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(/Supersede it instead/);
  });

  it('supersedes rather than edits: closes the old window and opens a new row', async () => {
    const { service, prisma } = buildService();
    prisma.utilityRate.findFirst.mockResolvedValue(rateRow());
    prisma.utilityRate.create.mockResolvedValue(
      rateRow({ ratePerUnit: dec(60) }),
    );

    await service.supersedeRate(ORG_A, 'rate-a', 60, '2026-04-01');

    expect(prisma.utilityRate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rate-a' },
        data: { validTo: new Date('2026-04-01') },
      }),
    );
    expect(prisma.utilityRate.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          ratePerUnit: anything(),
          validFrom: new Date('2026-04-01'),
        }),
      }),
    );
    // The old row must not have had its rate rewritten.
    expect(prisma.utilityRate.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: objectContaining({ ratePerUnit: anything() }),
      }),
    );
  });

  it('refuses a tariff that stops applying before it started', async () => {
    const { service, prisma } = buildService();
    prisma.utilityRate.findFirst.mockResolvedValue(
      rateRow({ validFrom: new Date('2026-04-01T00:00:00Z') }),
    );

    await expect(
      service.supersedeRate(ORG_A, 'rate-a', 60, '2026-01-01'),
    ).rejects.toThrow(/before it started/);
  });

  it('refuses a spot rate with no second currency to convert from', async () => {
    const { service } = buildService();

    await expect(
      service.createRate(ORG_A, {
        type: UtilityType.WATER,
        ratePerUnit: 10,
        validFrom: '2026-01-01',
        spotRate: 130,
      }),
    ).rejects.toThrow(/different currency/);
  });
});

describe('UtilitiesService — billing', () => {
  /** Wire a meter with two readings bracketing August 2026. */
  function augustPrisma() {
    const built = buildService();
    const { prisma } = built;

    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_A });
    prisma.rentalAgreement.findFirst.mockResolvedValue({ id: LEASE_A });

    // `readingsBracketing` runs two `findFirst`s: the opening (at or before 1 Aug)
    // and the closing (at or before 1 Sep).
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(
        readingRow({
          id: 'open',
          readingDate: new Date('2026-08-01T00:00:00Z'),
          reading: dec(4000),
        }),
      )
      .mockResolvedValueOnce(
        readingRow({
          id: 'close',
          readingDate: new Date('2026-09-01T00:00:00Z'),
          reading: dec(4150),
        }),
      );

    return built;
  }

  it('refuses to price a period with no opening reading', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.findFirst.mockResolvedValue(null);

    const promise = service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(/difference between two readings/);
  });

  it('refuses when the only reading serves as both ends of the window', async () => {
    // Inclusive bounds mean one lone reading brackets nothing, and billing it would
    // raise a nil invoice that looks like a real one.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    const single = readingRow({
      id: 'only',
      readingDate: new Date('2026-08-15T00:00:00Z'),
    });
    prisma.meterReading.findFirst.mockResolvedValue(single);

    await expect(
      service.billPeriod(ORG_A, { meterId: METER_A, billingPeriod: '2026-08' }),
    ).rejects.toThrow(/nothing in 2026-08 has actually been measured/);
  });

  it('refuses when no tariff is in force, naming the period and the volume', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4150) }));
    prisma.utilityRate.findMany.mockResolvedValue([]);
    prisma.rentalAgreement.findFirst.mockResolvedValue({ id: LEASE_A });

    await expect(
      service.billPeriod(ORG_A, { meterId: METER_A, billingPeriod: '2026-08' }),
    ).rejects.toThrow(/150 units of water cannot be priced/);
  });

  it('prices a period from the reading delta and the tariff in force', async () => {
    const { service, prisma } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);

    const result = await service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.meterConsumption).toBe(150);
    expect(result.rolledOver).toBe(false);
    expect(prisma.utilityCharge.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          billingPeriod: '2026-08',
          ratePerUnit: anything(),
          // A sub-meter bills one unit, undivided.
          allocationShare: anything(),
        }),
      }),
    );
  });

  it('refuses a second charge for the same meter, unit and period, naming the one that exists', async () => {
    // The unique index is what makes this impossible under concurrency; this check
    // exists so the refusal can explain rather than cite a constraint name.
    const { service, prisma } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue({
      id: 'charge-existing',
      status: UtilityChargeStatus.INVOICED,
      invoiceId: 'inv-x',
    });

    const promise = service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(
      /already been charged \(invoiced, on an invoice\)/,
    );
    expect(prisma.utilityCharge.create).not.toHaveBeenCalled();
  });

  it('raises the invoice through InvoicesService, classified UTILITY and with no billingPeriod', async () => {
    // The last clause is the load-bearing one: setting `billingPeriod` would make the
    // recurring rent run skip this month and the resident never be billed rent.
    const { service, prisma, invoicesService } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);
    prisma.utilityCharge.findMany.mockResolvedValue([
      {
        id: 'charge-a',
        rentalAgreementId: LEASE_A,
        currency: 'KES',
        ratePerUnit: dec('55.5'),
        vatRate: dec(16),
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        billingPeriod: '2026-08',
        allocationShare: dec(1),
        fromReadingId: 'open',
        toReadingId: 'close',
        meterId: METER_A,
        meter: { id: METER_A, meterNumber: 'WTR-001', type: UtilityType.WATER },
        unit: { id: UNIT_A, code: 'A-101', name: 'Flat 101' },
      },
    ]);
    prisma.rentalAgreement.findUnique.mockResolvedValue({
      id: LEASE_A,
      tenant: { surname: 'Otieno', otherNames: 'A' },
    });
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4150) }));

    const result = await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(invoicesService.create).toHaveBeenCalledTimes(1);
    // `InvoicesService.create(payload, tenantId)` - the payload is the *first*
    // argument, not a `data` property of it.
    const arg = callArg<Record<string, unknown>>(invoicesService.create);
    expect(arg).toMatchObject({
      transactionClass: 'UTILITY',
      rentalAgreementId: LEASE_A,
    });
    expect(arg).not.toHaveProperty('billingPeriod');
    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].total).toBe(9657);
  });

  it('marks the charge INVOICED and links it back to the invoice', async () => {
    const { service, prisma } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);
    prisma.utilityCharge.findMany.mockResolvedValue([
      {
        id: 'charge-a',
        rentalAgreementId: LEASE_A,
        currency: 'KES',
        ratePerUnit: dec('55.5'),
        vatRate: dec(16),
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        billingPeriod: '2026-08',
        allocationShare: dec(1),
        fromReadingId: 'open',
        toReadingId: 'close',
        meterId: METER_A,
        meter: { id: METER_A, meterNumber: 'WTR-001', type: UtilityType.WATER },
        unit: { id: UNIT_A, code: 'A-101', name: 'Flat 101' },
      },
    ]);
    prisma.rentalAgreement.findUnique.mockResolvedValue({
      id: LEASE_A,
      tenant: null,
    });
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4150) }));

    await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(prisma.utilityCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'charge-a' },
        data: { invoiceId: 'inv-a', status: UtilityChargeStatus.INVOICED },
      }),
    );
  });

  it('reports a charge with no lease as unbilled rather than dropping it silently', async () => {
    // A vacant unit's water is a real cost somebody has to decide about.
    const { service, prisma } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);
    prisma.utilityCharge.findMany.mockResolvedValue([
      {
        id: 'charge-vacant',
        rentalAgreementId: null,
        currency: 'KES',
        ratePerUnit: dec('55.5'),
        vatRate: dec(16),
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        billingPeriod: '2026-08',
        allocationShare: dec(1),
        fromReadingId: 'open',
        toReadingId: 'close',
        meterId: METER_A,
        meter: { id: METER_A, meterNumber: 'WTR-001', type: UtilityType.WATER },
        unit: { id: UNIT_A, code: 'A-101', name: 'Flat 101' },
      },
    ]);

    const result = await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.invoices).toHaveLength(0);
    expect(result.unbilled).toHaveLength(1);
    expect(result.unbilled[0].reason).toMatch(/no active rental agreement/);
  });

  /** One vacant charge, and a service set up to price-then-invoice it. */
  function vacantChargePrisma(policy: VacancyPolicy | null) {
    const built = buildService();
    const { prisma, invoicesService } = built;

    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);
    prisma.utilityCharge.findMany.mockResolvedValue([
      {
        id: 'charge-vacant',
        rentalAgreementId: null,
        currency: 'KES',
        ratePerUnit: dec('55.5'),
        vatRate: dec(16),
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        billingPeriod: '2026-08',
        allocationShare: dec(1),
        fromReadingId: 'open',
        toReadingId: 'close',
        meterId: METER_A,
        meter: { id: METER_A, meterNumber: 'WTR-001', type: UtilityType.WATER },
        unit: { id: UNIT_A, code: 'A-101', name: 'Flat 101' },
      },
    ]);
    prisma.rentalAgreement.findUnique.mockResolvedValue(null);
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4150) }));
    prisma.organization.findUnique.mockResolvedValue({ vacancyPolicy: policy });

    return { ...built, invoicesService };
  }

  it('treats an undecided vacancy policy as record-only rather than guessing', async () => {
    // NULL means "nobody has decided". The honest behaviour before they decide is the
    // one that refuses to invent a payer, which is RECORD_ONLY.
    const { service, invoicesService } = vacantChargePrisma(null);

    const result = await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.vacancyPolicy).toBe(VacancyPolicy.RECORD_ONLY);
    expect(result.unbilled).toHaveLength(1);
    expect(invoicesService.create).not.toHaveBeenCalled();
  });

  it('SKIP voids the charge and keeps the reason, rather than leaving it pending forever', async () => {
    const { service, prisma, invoicesService } = vacantChargePrisma(
      VacancyPolicy.SKIP,
    );

    const result = await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/does not bill vacant units/);
    expect(invoicesService.create).not.toHaveBeenCalled();
    expect(prisma.utilityCharge.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'charge-vacant' },
        data: objectContaining({ status: UtilityChargeStatus.VOID }),
      }),
    );
  });

  it('REDISTRIBUTE refuses to re-rate silently, and says why', async () => {
    // Moving one unit's share onto its neighbours changes what *other* residents owe,
    // and a billing run is not the place to decide that.
    const { service, invoicesService } = vacantChargePrisma(
      VacancyPolicy.REDISTRIBUTE,
    );

    const result = await service.billAndInvoice(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.unbilled).toHaveLength(1);
    expect(result.unbilled[0].reason).toMatch(/needs to be run deliberately/);
    expect(invoicesService.create).not.toHaveBeenCalled();
  });

  it('refuses to bill a sub-meter to a unit it does not serve', async () => {
    const { service, prisma } = augustPrisma();
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());

    await expect(
      service.billPeriod(ORG_A, {
        meterId: METER_A,
        billingPeriod: '2026-08',
        unitId: 'unit-other',
      }),
    ).rejects.toThrow(/cannot bill a different unit/);
  });

  it('refuses to price a rolled-over meter backwards', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({ digits: 5, digitWrapAt: 100000 }),
    );
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(99998) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(3) }));
    prisma.utilityRate.findMany.mockResolvedValue([
      rateRow({ type: UtilityType.ELECTRICITY }),
    ]);
    prisma.utilityRate.findUnique.mockResolvedValue(
      rateRow({
        type: UtilityType.ELECTRICITY,
        ratePerUnit: dec(10),
        vatRate: null,
      }),
    );
    prisma.rentalAgreement.findFirst.mockResolvedValue({ id: LEASE_A });
    prisma.utilityCharge.findFirst.mockResolvedValue(null);

    const result = await service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(result.meterConsumption).toBe(5);
    expect(result.rolledOver).toBe(true);
  });

  it('refuses a bulk meter whose apportionment has not been decided', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({
        scope: MeterScope.BULK,
        unitId: null,
        apportionmentMethod: null,
      }),
    );
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4300) }));
    // Units must exist, or the refusal is the "nobody to divide across" one and this
    // test proves nothing about the undecided method.
    prisma.unit.findMany.mockResolvedValue([
      { id: UNIT_A, areaSqFt: dec(1000) },
      { id: 'unit-b', areaSqFt: dec(3000) },
    ]);

    // The database refuses this shape too (`utility_meters_bulk_needs_method`), so the
    // service check is for a row that got there another way — and either way the
    // module refuses rather than picking a split.
    await expect(
      service.billPeriod(ORG_A, { meterId: METER_A, billingPeriod: '2026-08' }),
    ).rejects.toThrow(/has not been decided/);
  });

  it('refuses a bulk meter with no units attached to divide across', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({
        scope: MeterScope.BULK,
        unitId: null,
        apportionmentMethod: ApportionmentMethod.AREA,
      }),
    );
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4300) }));
    prisma.unit.findMany.mockResolvedValue([]);

    await expect(
      service.billPeriod(ORG_A, { meterId: METER_A, billingPeriod: '2026-08' }),
    ).rejects.toThrow(/No units are attached/);
  });

  it('splits OCCUPANCY by days actually occupied, not by an even split', async () => {
    // The regression this pins: OCCUPANCY used to degrade to EQUAL because nothing
    // supplied `occupiedDays`, so a unit that moved in on the 20th was charged a full
    // month of the building's water under a label saying otherwise. The worst kind of
    // wrong — the split is defensible, the label on it is not.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({
        scope: MeterScope.BULK,
        unitId: null,
        apportionmentMethod: ApportionmentMethod.OCCUPANCY,
      }),
    );
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4300) }));
    // Equal areas on purpose: the ONLY thing that can make these two shares differ is
    // occupancy, so an even split here would mean the method is being ignored.
    prisma.unit.findMany.mockResolvedValue([
      { id: UNIT_A, areaSqFt: dec(1000) },
      { id: 'unit-b', areaSqFt: dec(1000) },
    ]);
    // August 2026: unit A occupied all 31 days, unit B only from the 20th (12 days).
    prisma.rentalAgreement.findMany.mockResolvedValue([
      {
        id: 'lease-a',
        unitId: UNIT_A,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: null,
      },
      {
        id: 'lease-b',
        unitId: 'unit-b',
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: null,
      },
    ]);
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);

    const result = await service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    const a = result.charges.find((c) => c.unitId === UNIT_A);
    const b = result.charges.find((c) => c.unitId === 'unit-b');

    expect(a?.share).toBeCloseTo(31 / 43, 5);
    expect(b?.share).toBeCloseTo(12 / 43, 5);
    expect(a?.share).toBeGreaterThan(b?.share ?? 0);
  });

  it('loads every tenancy in the property in one query rather than one per unit', async () => {
    // A tower of thirty units would otherwise turn into thirty queries just to build
    // one apportionment.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({
        scope: MeterScope.BULK,
        unitId: null,
        apportionmentMethod: ApportionmentMethod.AREA,
      }),
    );
    prisma.meterReading.findFirst
      .mockResolvedValueOnce(readingRow({ id: 'open', reading: dec(4000) }))
      .mockResolvedValueOnce(readingRow({ id: 'close', reading: dec(4300) }));
    prisma.unit.findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        id: `unit-${i}`,
        areaSqFt: dec(1000 + i),
      })),
    );
    prisma.rentalAgreement.findMany.mockResolvedValue([]);
    prisma.utilityRate.findMany.mockResolvedValue([rateRow()]);
    prisma.utilityRate.findUnique.mockResolvedValue(rateRow());
    prisma.utilityCharge.findFirst.mockResolvedValue(null);

    await service.billPeriod(ORG_A, {
      meterId: METER_A,
      billingPeriod: '2026-08',
    });

    expect(prisma.rentalAgreement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.rentalAgreement.findFirst).not.toHaveBeenCalled();
  });
});

describe('UtilitiesService — voiding', () => {
  it('stores the reason, the time and who voided it', async () => {
    // The DTO demands a reason; three columns and a CHECK exist to hold it, because
    // validating a sentence and discarding it is worse than not asking.
    const { service, prisma } = buildService();
    prisma.utilityCharge.findFirst.mockResolvedValue({
      id: 'charge-a',
      status: UtilityChargeStatus.PENDING,
      invoice: null,
      voidedAt: null,
      voidReason: null,
    });
    prisma.utilityCharge.update.mockResolvedValue({});

    await service.voidCharge(
      ORG_A,
      'charge-a',
      { reason: 'Meter replaced mid-period' },
      'user-1',
    );

    const data = callArg<{ data: Record<string, unknown> }>(
      prisma.utilityCharge.update,
    ).data;
    expect(data).toMatchObject({
      status: UtilityChargeStatus.VOID,
      voidReason: 'Meter replaced mid-period',
      voidedByUserId: 'user-1',
    });
    expect(data.voidedAt).toBeInstanceOf(Date);
  });

  it('refuses to void a charge that is already on an invoice, and names the Finance action', async () => {
    const { service, prisma } = buildService();
    prisma.utilityCharge.findFirst.mockResolvedValue({
      id: 'charge-a',
      status: UtilityChargeStatus.INVOICED,
      invoice: { id: 'inv-a', invoiceNumber: 'INV-0001', status: 'PENDING' },
      voidedAt: null,
      voidReason: null,
    });

    const promise = service.voidCharge(
      ORG_A,
      'charge-a',
      { reason: 'Trying to reverse this' },
      'user-1',
    );

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(/Cancel that invoice in Finance/);
    expect(prisma.utilityCharge.update).not.toHaveBeenCalled();
  });

  it('refuses to void twice and quotes the original reason', async () => {
    const { service, prisma } = buildService();
    prisma.utilityCharge.findFirst.mockResolvedValue({
      id: 'charge-a',
      status: UtilityChargeStatus.VOID,
      invoice: null,
      voidedAt: new Date('2026-09-02'),
      voidReason: 'Meter replaced mid-period',
    });

    await expect(
      service.voidCharge(
        ORG_A,
        'charge-a',
        { reason: 'Trying again here' },
        'user-1',
      ),
    ).rejects.toThrow(/already voided.*Meter replaced mid-period/);
  });
});

describe('UtilitiesService — retiring a meter', () => {
  it('refuses to retire a bulk meter with priced-but-unbilled periods', async () => {
    // Retiring would leave the consumption measured and nothing explaining what it
    // cost, which is the one outcome worse than an extra click.
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(
      meterRow({
        scope: MeterScope.BULK,
        unitId: null,
        apportionmentMethod: ApportionmentMethod.AREA,
      }),
    );
    prisma.utilityCharge.count.mockResolvedValue(2);

    const promise = service.retireMeter(ORG_A, METER_A);

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(
      /2 periods priced but not yet invoiced/,
    );
    expect(prisma.utilityMeter.update).not.toHaveBeenCalled();
  });

  it('retires cleanly once nothing is outstanding', async () => {
    const { service, prisma } = buildService();
    prisma.utilityMeter.findFirst.mockResolvedValue(meterRow());
    prisma.utilityCharge.count.mockResolvedValue(0);
    prisma.utilityMeter.update.mockResolvedValue(
      meterRow({ status: 'RETIRED' }),
    );

    await service.retireMeter(ORG_A, METER_A);

    expect(prisma.utilityMeter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: METER_A },
        data: { status: 'RETIRED' },
      }),
    );
  });
});
