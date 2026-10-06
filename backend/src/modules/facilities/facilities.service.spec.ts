import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccessCardStatus, FacilityBookingStatus } from '@prisma/client';
import { FacilitiesService } from './facilities.service';

/**
 * Module 13 — the facilities service, against a hand-written Prisma mock.
 *
 * The mock's Prisma type is declared explicitly rather than inferred from an
 * `any`, for the reason `hr-self-service.spec.ts` does it: a new query that nobody
 * added to the mock should fail to **compile**, not throw `undefined.map` at
 * runtime in production.
 */
type MockDelegate = Record<string, jest.Mock>;

interface MockPrisma {
  facility: MockDelegate;
  facilityBooking: MockDelegate;
  facilityBlackout: MockDelegate;
  accessCard: MockDelegate;
  contact: MockDelegate;
  tenant: MockDelegate;
  property: MockDelegate;
  unit: MockDelegate;
  user: MockDelegate;
  visitor: MockDelegate;
  $transaction: jest.Mock;
}

const ORG_A = 'org-a';
const PROPERTY_A = 'prop-a';
const FACILITY_A = 'fac-a';

/**
 * Typed access to what a mocked call was asked for.
 *
 * `jest.Mock` types `calls` as `any[][]`, so `calls[0][0].where.id` is an unsafe
 * chain — it would silently read `undefined` and then let a test assert against a
 * property the mock was never called with, which passes for the wrong reason. This
 * helper puts the shape back at the boundary, so a wrong field name downstream is a
 * compile error rather than an assertion against nothing.
 *
 * The `any` is unavoidable inside `jest.Mock` and is confined to these four lines,
 * which is a better trade than disabling the rule for the whole file.
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
 * A facility row shaped like the one `findOne` returns, i.e. **with** the relations
 * it includes. The same helper serves `facilityRecord`, which does not include
 * them — extra keys are harmless there and a second fixture would drift.
 */
function facilityRow(over: Record<string, unknown> = {}) {
  return {
    id: FACILITY_A,
    organizationId: ORG_A,
    propertyId: PROPERTY_A,
    name: 'Clubhouse',
    kind: 'CLUBHOUSE',
    description: null,
    capacity: 40,
    opensAtMinutes: 480,
    closesAtMinutes: 1320,
    slotMinutes: 60,
    maxAdvanceDays: 90,
    requiresApproval: false,
    isBookable: true,
    isActive: true,
    bookingFee: null,
    bookingFeeCurrency: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    property: { id: PROPERTY_A, code: 'P-01', name: 'Riverside' },
    blackouts: [],
    ...over,
  };
}

/** The relation-bearing shape `findOne` needs for the summary panels. */
function facilityDetailRow(over: Record<string, unknown> = {}) {
  return facilityRow(over);
}

function bookingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'book-a',
    organizationId: ORG_A,
    facilityId: FACILITY_A,
    reference: 'FB-0001',
    bookedByUserId: 'user-1',
    contactId: null,
    tenantId: null,
    bookedForName: 'Kariuki',
    bookedForPhone: '+254700000000',
    purpose: 'Family party',
    attendeeCount: 20,
    startsAt: new Date(Date.now() + 5 * 86400000),
    endsAt: new Date(Date.now() + 5 * 86400000 + 3600000),
    status: FacilityBookingStatus.CONFIRMED,
    decisionNote: null,
    decidedAt: null,
    decidedByUserId: null,
    cancelledAt: null,
    cancelReason: null,
    fee: null,
    feeCurrency: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

/** A `startsAt`/`endsAt` pair on the hour, `days` from now, inside opening hours. */
function slot(daysAhead: number, startHour: number, durationHours = 1) {
  const starts = new Date(Date.now() + daysAhead * 86400000);
  starts.setHours(startHour, 0, 0, 0);
  const ends = new Date(starts.getTime() + durationHours * 3600000);
  return { startsAt: starts, endsAt: ends };
}

function buildService() {
  const prisma: MockPrisma = {
    facility: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    facilityBooking: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    facilityBlackout: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    accessCard: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    contact: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    tenant: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    property: { findFirst: jest.fn() },
    // `Unit` has no `organizationId` (master doc issue 25), so a card scoped by its
    // unit reaches for this through `property.organizationId` — and the mock needs
    // it declared, which is exactly the point of declaring the type.
    unit: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    visitor: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  // `$transaction(fn)` runs the callback with the same mock as its client, which is
  // what the real thing does with a single client.
  prisma.$transaction.mockImplementation(
    async (fn: (tx: MockPrisma) => Promise<unknown>) => fn(prisma),
  );

  const service = new FacilitiesService(prisma as never);
  return { service, prisma };
}

describe('FacilitiesService — tenant scoping', () => {
  it('scopes a read-by-id to the caller organization', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());

    await service.findOne(FACILITY_A, ORG_A);

    expect(prisma.facility.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FACILITY_A, organizationId: ORG_A },
      }),
    );
  });

  it('404s a facility belonging to another organization rather than returning null', async () => {
    // Master doc issue 24: without `requireRecord` this resolved to `null` and Nest
    // answered 200 with an empty body, leaking the existence of the row.
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('someone-elses', ORG_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a super admin read across organizations by omitting the filter', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());

    await service.findOne(FACILITY_A, undefined);

    expect(prisma.facility.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: FACILITY_A } }),
    );
  });

  it('scopes the facility list to the caller organization', async () => {
    const { service, prisma } = buildService();

    await service.findAll(ORG_A, { search: 'club' });

    const call = callArg<{ where: { organizationId: string; OR: unknown[] } }>(
      prisma.facility.findMany,
    );
    expect(call.where.organizationId).toBe(ORG_A);
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.objectContaining({ contains: 'club' }),
        }),
      ]),
    );
  });

  it('hides inactive facilities unless asked', async () => {
    const { service, prisma } = buildService();

    await service.findAll(ORG_A);
    expect(
      callArg<{ where: { isActive?: boolean } }>(prisma.facility.findMany).where
        .isActive,
    ).toBe(true);

    await service.findAll(ORG_A, { includeInactive: 'true' });
    expect(
      callArg<{ where: { isActive?: boolean } }>(prisma.facility.findMany, 1)
        .where.isActive,
    ).toBeUndefined();
  });
});

describe('FacilitiesService — opening hours on update', () => {
  it('merges a half-specified change against the stored row', async () => {
    // "Close the clubhouse at 23:00" must not silently reopen it at 08:00.
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facility.update.mockResolvedValue({});
    prisma.facilityBooking.findMany.mockResolvedValue([]);

    await service.update(FACILITY_A, { closesAt: '23:00' }, ORG_A);

    expect(prisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ closesAtMinutes: 23 * 60 }),
      }),
    );
    expect(
      callArg<{ data: { opensAtMinutes?: number } }>(prisma.facility.update)
        .data.opensAtMinutes,
    ).toBeUndefined();
  });

  it('refuses hours where closing is not after opening', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());

    await expect(
      service.update(
        FACILITY_A,
        { opensAt: '22:00', closesAt: '06:00' },
        ORG_A,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });

  it('refuses a grid change that would orphan a live booking, and names it', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    // 10:37 is on neither a 60- nor a 15-minute grid past its start… but 10:37 is
    // off a 30-minute grid, which is what this change would impose.
    prisma.facilityBooking.findMany.mockResolvedValue([
      {
        id: 'book-1',
        reference: 'FB-0007',
        startsAt: new Date(new Date().setHours(10, 37, 0, 0)),
        endsAt: new Date(new Date().setHours(11, 7, 0, 0)),
      },
    ]);

    await expect(
      service.update(FACILITY_A, { slotMinutes: 30 }, ORG_A),
    ).rejects.toThrow(/FB-0007/);
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });

  it('allows a grid change when nothing live would be stranded', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facility.update.mockResolvedValue({});

    await service.update(FACILITY_A, { slotMinutes: 30 }, ORG_A);

    expect(prisma.facility.update).toHaveBeenCalled();
  });
});

describe('FacilitiesService — creating a facility', () => {
  it('refuses a duplicate name on the same property', async () => {
    const { service, prisma } = buildService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_A });
    prisma.facility.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create({ name: 'Clubhouse' }, PROPERTY_A, ORG_A),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s a property belonging to another organization', async () => {
    const { service, prisma } = buildService();
    prisma.property.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ name: 'Clubhouse' }, 'someone-elses', ORG_A),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.facility.create).not.toHaveBeenCalled();
  });

  it('converts HH:MM opening times to minutes from midnight', async () => {
    const { service, prisma } = buildService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_A });
    prisma.facility.findFirst
      // Duplicate-name check.
      .mockResolvedValueOnce(null)
      // The record read at the end of `create`.
      .mockResolvedValueOnce(facilityDetailRow({ name: 'Gym' }));
    prisma.facility.create.mockResolvedValue(facilityRow({ name: 'Gym' }));

    await service.create(
      { name: 'Gym', opensAt: '06:30', closesAt: '21:15' },
      PROPERTY_A,
      ORG_A,
    );

    const data = callArg<{ data: Record<string, unknown> }>(
      prisma.facility.create,
    ).data;
    expect(data.opensAtMinutes).toBe(6 * 60 + 30);
    expect(data.closesAtMinutes).toBe(21 * 60 + 15);
  });
});

describe('FacilitiesService — booking a slot', () => {
  it('refuses a slot that collides and names the holder', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([
      {
        id: 'book-x',
        reference: 'FB-0042',
        bookedForName: 'Achieng',
        startsAt,
        endsAt,
      },
    ]);

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          bookedForName: 'Kariuki',
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/FB-0042/);
    expect(prisma.facilityBooking.create).not.toHaveBeenCalled();
  });

  it('refuses a slot inside a closure and names the reason', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBlackout.findMany.mockResolvedValue([
      { id: 'bl-1', reason: 'repainting the floor', startsAt, endsAt },
    ]);

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          bookedForName: 'Kariuki',
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/repainting the floor/);
  });

  it('writes the computed end, never the one that was sent', async () => {
    const { service, prisma } = buildService();
    const { startsAt } = slot(5, 10);
    // Ends at 10:45 on an hourly facility — rejected, so there is nothing to write.
    const endsAt = new Date(startsAt.getTime() + 45 * 60000);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          bookedForName: 'Kariuki',
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('snapshots the facility fee onto the booking', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(
      facilityRow({ bookingFee: 5000, bookingFeeCurrency: 'KES' }),
    );
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBooking.count.mockResolvedValue(0);
    prisma.facilityBooking.create.mockResolvedValue(bookingRow());
    prisma.facilityBooking.findFirst.mockResolvedValue(bookingRow());

    await service.createBooking(
      {
        facilityId: FACILITY_A,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        bookedForName: 'Kariuki',
      },
      ORG_A,
      'user-1',
    );

    const data = callArg<{ data: Record<string, unknown> }>(
      prisma.facilityBooking.create,
    ).data;
    // A fee change next month must not retroactively change what this booking cost.
    expect(data.fee).toEqual(5000);
    expect(data.feeCurrency).toBe('KES');
  });

  it('confirms a staff booking on an approval facility', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(
      facilityRow({ requiresApproval: true }),
    );
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBooking.count.mockResolvedValue(0);
    prisma.facilityBooking.create.mockResolvedValue(bookingRow());
    prisma.facilityBooking.findFirst.mockResolvedValue(bookingRow());

    await service.createBooking(
      {
        facilityId: FACILITY_A,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        bookedForName: 'Kariuki',
      },
      ORG_A,
      'user-1',
    );

    expect(
      callArg<{ data: { status: string } }>(prisma.facilityBooking.create).data
        .status,
    ).toBe('CONFIRMED');
  });

  it('lets a resident force approval on a facility that does not require it', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(
      facilityRow({ requiresApproval: false }),
    );
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBooking.count.mockResolvedValue(0);
    prisma.facilityBooking.create.mockResolvedValue(bookingRow());
    prisma.facilityBooking.findFirst.mockResolvedValue(bookingRow());

    await service.createBooking(
      {
        facilityId: FACILITY_A,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        bookedForName: 'Kariuki',
        requestApproval: true,
      },
      ORG_A,
      'user-1',
    );

    expect(
      callArg<{ data: { status: string } }>(prisma.facilityBooking.create).data
        .status,
    ).toBe('PENDING');
  });

  it('requires a name when neither a contact nor a resident is named', async () => {
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a contact from another organization instead of connecting it', async () => {
    // Master doc issue 35's shape: a shared people directory plus a tenant-scoped
    // service is exactly where a cross-tenant write would land.
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          contactId: 'contact-from-org-b',
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.facilityBooking.create).not.toHaveBeenCalled();
  });

  it('turns the exclusion-constraint violation into a readable 409', async () => {
    // Two receptionists pressing Confirm in the same instant: the service check let
    // both through, and only the database stopped the second write.
    const { service, prisma } = buildService();
    const { startsAt, endsAt } = slot(5, 10);
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBooking.count.mockResolvedValue(0);
    prisma.facilityBooking.create.mockRejectedValue(
      new Error(
        'conflicting key value violates exclusion constraint "facility_bookings_no_overlap"',
      ),
    );

    await expect(
      service.createBooking(
        {
          facilityId: FACILITY_A,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          bookedForName: 'Kariuki',
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/saved a moment before yours/);
  });
});

describe('FacilitiesService — deciding a booking', () => {
  it('records the actor and the note on an approval', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({
        status: FacilityBookingStatus.PENDING,
        bookedByUserId: 'user-1',
      }),
    );
    prisma.facilityBooking.update.mockResolvedValue({});
    prisma.facilityBooking.findFirst.mockResolvedValueOnce(
      bookingRow({
        status: FacilityBookingStatus.PENDING,
        bookedByUserId: 'user-1',
      }),
    );
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({ status: FacilityBookingStatus.CONFIRMED }),
    );

    await service.decide('book-a', 'APPROVE', 'Fine by me', ORG_A, 'user-2');

    const data = callArg<{ data: Record<string, unknown> }>(
      prisma.facilityBooking.update,
    ).data;
    expect(data.status).toBe(FacilityBookingStatus.CONFIRMED);
    expect(data.decisionNote).toBe('Fine by me');
    expect(data.decidedByUser).toEqual({ connect: { id: 'user-2' } });
  });

  it('refuses to let the person who raised it approve', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({
        status: FacilityBookingStatus.PENDING,
        bookedByUserId: 'user-1',
      }),
    );

    await expect(
      service.decide('book-a', 'APPROVE', undefined, ORG_A, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.facilityBooking.update).not.toHaveBeenCalled();
  });

  it('refuses a decline with no reason', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({ status: FacilityBookingStatus.PENDING }),
    );

    await expect(
      service.decide('book-a', 'REJECT', undefined, ORG_A, 'user-2'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.facilityBooking.update).not.toHaveBeenCalled();
  });

  it('stamps cancelledAt and the reason on a cancellation', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(bookingRow());

    await service.decide('book-a', 'CANCEL', 'Plans changed', ORG_A, 'user-2');

    const data = callArg<{ data: Record<string, unknown> }>(
      prisma.facilityBooking.update,
    ).data;
    expect(data.status).toBe(FacilityBookingStatus.CANCELLED);
    expect(data.cancelReason).toBe('Plans changed');
    expect(data.cancelledAt).toBeInstanceOf(Date);
  });

  it('reports each bulk row separately rather than rolling the whole batch back', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockImplementation(({ where }: never) => {
      const args = where as { id: string };
      // Returned synchronously rather than through an `async` wrapper: nothing
      // inside awaits, and an async arrow with no `await` is a lint error that
      // exists precisely to catch this.
      if (args.id === 'book-ok') {
        return Promise.resolve(
          bookingRow({
            id: 'book-ok',
            status: FacilityBookingStatus.PENDING,
          }),
        );
      }
      return Promise.resolve(
        bookingRow({
          id: 'book-bad',
          status: FacilityBookingStatus.CONFIRMED,
        }),
      );
    });

    const result = await service.bulkDecide(
      ['book-ok', 'book-bad'],
      'approve',
      undefined,
      ORG_A,
      'user-2',
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.find((row) => row.id === 'book-bad')?.ok).toBe(false);
    expect(
      result.results.find((row) => row.id === 'book-bad')?.reason,
    ).toContain('awaiting approval');
  });
});

describe('FacilitiesService — deleting a booking', () => {
  it('refuses to delete a live booking', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({ status: FacilityBookingStatus.CONFIRMED }),
    );

    await expect(service.deleteBooking('book-a', ORG_A)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.facilityBooking.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a booking whose slot has passed', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({
        status: FacilityBookingStatus.REJECTED,
        startsAt: new Date(Date.now() - 5 * 86400000),
        endsAt: new Date(Date.now() - 5 * 86400000 + 3600000),
      }),
    );

    await expect(service.deleteBooking('book-a', ORG_A)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes a rejected booking that has not happened yet', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({
        status: FacilityBookingStatus.REJECTED,
        reference: 'FB-0009',
      }),
    );

    const result = await service.deleteBooking('book-a', ORG_A);

    expect(prisma.facilityBooking.delete).toHaveBeenCalledWith({
      where: { id: 'book-a' },
    });
    expect(result.message).toContain('FB-0009');
  });
});

describe('FacilitiesService — closures', () => {
  it('refuses a closure that would override a live booking, naming them', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([
      {
        id: 'b1',
        reference: 'FB-0011',
        bookedForName: 'Achieng',
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 86400000 + 3600000),
      },
    ]);

    await expect(
      service.createBlackout(
        {
          facilityId: FACILITY_A,
          reason: 'repainting',
          startsAt: new Date(Date.now()).toISOString(),
          endsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/FB-0011 \(Achieng\)/);
    expect(prisma.facilityBlackout.create).not.toHaveBeenCalled();
  });

  it('allows a closure over a clear period', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    prisma.facilityBlackout.create.mockResolvedValue({ id: 'bl-1' });

    await service.createBlackout(
      {
        facilityId: FACILITY_A,
        reason: 'repainting',
        startsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        endsAt: new Date(Date.now() + 32 * 86400000).toISOString(),
      },
      ORG_A,
      'user-1',
    );

    expect(prisma.facilityBlackout.create).toHaveBeenCalled();
  });

  it('refuses a closure that closes nothing', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());

    const when = new Date(Date.now() + 86400000).toISOString();
    await expect(
      service.createBlackout(
        {
          facilityId: FACILITY_A,
          reason: 'oops',
          startsAt: when,
          endsAt: when,
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('FacilitiesService — rescheduling', () => {
  it('excludes the booking being moved from its own clash check', async () => {
    // Without the exclusion every booking would collide with itself and nothing
    // could ever be rescheduled.
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(bookingRow());
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([]);
    const { startsAt, endsAt } = slot(9, 14);

    await service.reschedule(
      'book-a',
      startsAt.toISOString(),
      endsAt.toISOString(),
      ORG_A,
    );

    expect(
      callArg<{ where: { id: unknown } }>(prisma.facilityBooking.findMany).where
        .id,
    ).toEqual({
      not: 'book-a',
    });
  });

  it('refuses to move a booking that holds no slot', async () => {
    const { service, prisma } = buildService();
    prisma.facilityBooking.findFirst.mockResolvedValue(
      bookingRow({ status: FacilityBookingStatus.CANCELLED }),
    );
    const { startsAt, endsAt } = slot(9, 14);

    await expect(
      service.reschedule(
        'book-a',
        startsAt.toISOString(),
        endsAt.toISOString(),
        ORG_A,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.facilityBooking.update).not.toHaveBeenCalled();
  });
});

describe('FacilitiesService — closure refusal wording', () => {
  it('agrees in number', async () => {
    // A message that says "1 live booking fall inside that period" is the sort of
    // thing nobody reads twice, and this one is read by somebody who has been told
    // no. Cheap to assert, and it is the only thing standing between a copy-paste
    // pluralisation bug and the user.
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([
      {
        id: 'b1',
        reference: 'FB-0011',
        bookedForName: 'Achieng',
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 86400000 + 3600000),
      },
    ]);

    await expect(
      service.createBlackout(
        {
          facilityId: FACILITY_A,
          reason: 'repainting',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/1 live booking falls inside/);
  });

  it('pluralises for more than one', async () => {
    const { service, prisma } = buildService();
    prisma.facility.findFirst.mockResolvedValue(facilityRow());
    prisma.facilityBooking.findMany.mockResolvedValue([
      {
        id: 'b1',
        reference: 'FB-0011',
        bookedForName: 'Achieng',
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 86400000 + 3600000),
      },
      {
        id: 'b2',
        reference: 'FB-0012',
        bookedForName: 'Wanjiru',
        startsAt: new Date(Date.now() + 86400000 + 3600000),
        endsAt: new Date(Date.now() + 86400000 + 7200000),
      },
    ]);

    await expect(
      service.createBlackout(
        {
          facilityId: FACILITY_A,
          reason: 'repainting',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
        },
        ORG_A,
        'user-1',
      ),
    ).rejects.toThrow(/2 live bookings fall inside/);
  });
});

describe('FacilitiesService — access card expiry flag', () => {
  const cardRow = (over: Record<string, unknown>) => ({
    id: 'card-1',
    cardNumber: 'AC-0001',
    type: 'UNIT',
    status: AccessCardStatus.ACTIVE,
    holder: 'TENANT',
    holderName: 'Kariuki',
    issuedAt: new Date(Date.now() - 100 * 86400000),
    expiresAt: new Date(Date.now() + 20 * 86400000),
    lastSeenAt: null,
    suspendedAt: null,
    revokedAt: null,
    revokedReason: null,
    replacementCardId: null,
    notes: null,
    ...over,
  });

  it('flags a live card inside the renewal window', async () => {
    const { service, prisma } = buildService();
    prisma.accessCard.findMany.mockResolvedValue([cardRow({})]);

    const rows = await service.accessCards(ORG_A);

    expect(rows[0].expiringSoon).toBe(true);
    expect(rows[0].isTerminal).toBe(false);
  });

  it('does not flag a revoked card that merely has a near date', async () => {
    // A revoked card whose expiry is three weeks out is not "expiring soon" — it
    // opens nothing, and a renewal nudge on it would send somebody to renew access
    // that was deliberately ended.
    const { service, prisma } = buildService();
    prisma.accessCard.findMany.mockResolvedValue([
      cardRow({
        status: AccessCardStatus.REVOKED,
        revokedAt: new Date(Date.now() - 86400000),
        revokedReason: 'Resident moved out.',
      }),
    ]);

    const rows = await service.accessCards(ORG_A);

    expect(rows[0].effectiveStatus).toBe('REVOKED');
    expect(rows[0].expiringSoon).toBe(false);
    expect(rows[0].isTerminal).toBe(true);
  });

  it('does not flag a lost card', async () => {
    const { service, prisma } = buildService();
    prisma.accessCard.findMany.mockResolvedValue([
      cardRow({ status: AccessCardStatus.LOST }),
    ]);

    const rows = await service.accessCards(ORG_A);

    expect(rows[0].expiringSoon).toBe(false);
    expect(rows[0].isTerminal).toBe(true);
  });
});

describe('FacilitiesService — access cards', () => {
  it('refuses a unit card with no unit', async () => {
    // A card that opens nothing reads as valid in a list and fails at the gate.
    const { service } = buildService();

    await expect(
      service.createAccessCard({ type: 'UNIT' as never }, ORG_A),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a visitor from another organization rather than issuing a card to them', async () => {
    // A card that says VISITOR and names nobody is a card that cannot be withdrawn
    // from anybody, so the visitor is required — and has to be ours.
    const { service, prisma } = buildService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_A });
    prisma.visitor.findFirst.mockResolvedValue(null);

    await expect(
      service.createAccessCard(
        {
          type: 'BUILDING' as never,
          propertyId: PROPERTY_A,
          visitorId: 'visitor-from-org-b',
        },
        ORG_A,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.accessCard.create).not.toHaveBeenCalled();
  });

  it('derives the property from the unit, so a unit card also opens the building', async () => {
    const { service, prisma } = buildService();
    prisma.unit.findFirst.mockResolvedValue({
      id: 'unit-1',
      propertyId: PROPERTY_A,
    });
    prisma.accessCard.count.mockResolvedValue(0);
    prisma.accessCard.create.mockResolvedValue({ id: 'card-1' });
    // Three reads in order: `nextCardNumber` probing `AC-0001`, the
    // duplicate-number clash check, then the record read at the end of `create`.
    prisma.accessCard.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'card-1',
        cardNumber: 'AC-0001',
        type: 'UNIT',
        status: 'ACTIVE',
        holder: 'NONE',
        holderName: 'Gate spare',
        issuedAt: new Date(),
        expiresAt: null,
        lastSeenAt: null,
        suspendedAt: null,
        revokedAt: null,
        revokedReason: null,
        replacementCardId: null,
        notes: null,
        property: null,
        unit: null,
        facility: null,
        tenant: null,
        contact: null,
        user: null,
        visitor: null,
        visits: [],
      });

    await service.createAccessCard(
      { type: 'UNIT' as never, unitId: 'unit-1' },
      ORG_A,
    );

    // `Unit` has no `organizationId`, so the tenant filter goes through the parent
    // property — filtering the unit's own column would be a Prisma validation error.
    expect(prisma.unit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'unit-1', property: { organizationId: ORG_A } },
      }),
    );
    expect(
      callArg<{ data: { property: unknown } }>(prisma.accessCard.create).data
        .property,
    ).toEqual({
      connect: { id: PROPERTY_A },
    });
  });

  it('refuses a card held by more than one person', async () => {
    const { service } = buildService();

    await expect(
      service.createAccessCard({ userId: 'u-1', tenantId: 't-1' }, ORG_A),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a duplicate card number and says whose it was', async () => {
    const { service, prisma } = buildService();
    prisma.property.findFirst.mockResolvedValue({ id: PROPERTY_A });
    prisma.accessCard.findFirst.mockResolvedValue({
      id: 'c1',
      holderName: 'Kariuki',
    });

    await expect(
      service.createAccessCard(
        {
          cardNumber: 'AC-0001',
          type: 'BUILDING' as never,
          propertyId: PROPERTY_A,
        },
        ORG_A,
      ),
    ).rejects.toThrow(/Kariuki/);
  });

  it('refuses to bring a lost card back into use', async () => {
    const { service, prisma } = buildService();
    prisma.accessCard.findFirst.mockResolvedValue({
      id: 'card-1',
      status: AccessCardStatus.LOST,
      expiresAt: null,
    });

    await expect(
      service.decideAccessCard('card-1', 'REACTIVATE', {}, ORG_A),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.accessCard.update).not.toHaveBeenCalled();
  });

  it('filters on the effective status, so a passed date is found as EXPIRED', async () => {
    // A filter that disagreed with what the gate honours would hide live cards.
    const { service, prisma } = buildService();
    prisma.accessCard.findMany.mockResolvedValue([
      {
        id: 'card-1',
        cardNumber: 'AC-0001',
        type: 'UNIT',
        status: AccessCardStatus.ACTIVE,
        holder: 'TENANT',
        holderName: 'Kariuki',
        issuedAt: new Date(Date.now() - 400 * 86400000),
        expiresAt: new Date(Date.now() - 10 * 86400000),
        lastSeenAt: null,
        suspendedAt: null,
        revokedAt: null,
        revokedReason: null,
        replacementCardId: null,
        notes: null,
      },
      {
        id: 'card-2',
        cardNumber: 'AC-0002',
        type: 'UNIT',
        status: AccessCardStatus.ACTIVE,
        holder: 'TENANT',
        holderName: 'Achieng',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 100 * 86400000),
        lastSeenAt: null,
        suspendedAt: null,
        revokedAt: null,
        revokedReason: null,
        replacementCardId: null,
        notes: null,
      },
    ]);

    const rows = await service.accessCards(ORG_A, { status: 'EXPIRED' });

    expect(rows).toHaveLength(1);
    expect(rows[0].cardNumber).toBe('AC-0001');
    expect(rows[0].isUsable).toBe(false);
  });
});
