import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AccessCardHolder,
  AccessCardStatus,
  AccessCardType,
  FacilityBookingStatus,
  FacilityKind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { requireRecord } from '@/common/utils';
import { toCsv } from '@/common/csv';
import {
  buildAvailability,
  checkSlot,
  formatMinutes,
  horizonDays,
  shapeSlot,
  type OccupiedRange,
} from './booking-slots';
import {
  BOOKING_STATUS_ADVICE,
  BOOKING_STATUS_LABEL,
  availableActions,
  bookingTiming,
  formatBookingReference,
  holdsSlot,
  initialStatus,
  transition,
  type BookingAction,
} from './booking-lifecycle';
import {
  ACCESS_CARD_STATUS_LABEL,
  cardTransition,
  type AccessCardAction,
} from './access-card-lifecycle';
import {
  minutesFromClock,
  type BookingFilters,
  type CreateBookingDto,
  type CreateFacilityDto,
  type FacilityFilters,
  type UpdateFacilityDto,
} from './dto/facilities.dto';

type Tx = Prisma.TransactionClient;

/** What a facility list may show. */
const FACILITY_LIST_SELECT = {
  id: true,
  name: true,
  kind: true,
  description: true,
  capacity: true,
  opensAtMinutes: true,
  closesAtMinutes: true,
  slotMinutes: true,
  maxAdvanceDays: true,
  requiresApproval: true,
  isBookable: true,
  isActive: true,
  propertyId: true,
  bookingFee: true,
  bookingFeeCurrency: true,
} as const;

const FACILITY_DETAIL_INCLUDE = {
  property: { select: { id: true, code: true, name: true } },
  blackouts: {
    where: { endsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' as const },
    take: 20,
  },
} as const;

const BOOKING_INCLUDE = {
  facility: {
    select: {
      id: true,
      name: true,
      kind: true,
      propertyId: true,
      requiresApproval: true,
    },
  },
  tenant: {
    select: {
      id: true,
      surname: true,
      otherNames: true,
      code: true,
      phone: true,
    },
  },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      phone: true,
    },
  },
  bookedByUser: { select: { id: true, firstName: true, lastName: true } },
  decidedByUser: { select: { id: true, firstName: true, lastName: true } },
} as const;

const FACILITY_EXPORT_HEADERS = [
  'name',
  'kind',
  'property',
  'capacity',
  'opensAt',
  'closesAt',
  'slotMinutes',
  'maxAdvanceDays',
  'requiresApproval',
  'isBookable',
  'isActive',
  'bookingFee',
  'bookingFeeCurrency',
];

const BOOKING_EXPORT_HEADERS = [
  'reference',
  'facility',
  'bookedFor',
  'phone',
  'startsAt',
  'endsAt',
  'status',
  'phase',
  'purpose',
  'attendeeCount',
  'fee',
  'feeCurrency',
  'createdAt',
];

/** The three opening-hours numbers, wherever the slot rules need them. */
function hoursOf(facility: {
  opensAtMinutes: number;
  closesAtMinutes: number;
  slotMinutes: number;
}) {
  return {
    opensAtMinutes: facility.opensAtMinutes,
    closesAtMinutes: facility.closesAtMinutes,
    slotMinutes: facility.slotMinutes,
  };
}

function minutesNow(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

interface SubjectInput {
  contactId?: string;
  tenantId?: string;
  bookedForName?: string;
  bookedForPhone?: string;
}

/**
 * Module 13 — facilities, their bookings and their closures.
 *
 * One service rather than two, because a booking is only meaningful against a
 * facility and the overlap check needs that facility's hours, grid and closures
 * loaded in the *same round trip* as the existing diary. Splitting them would mean
 * judging a slot against a facility read before the write, which is precisely the
 * race the database constraint exists to catch.
 *
 * Four decisions worth keeping:
 *
 * - **`endsAt` is computed, never stored as sent.** `checkSlot` validates it
 *   against the facility's grid and `shapeSlot` derives the value actually written,
 *   so no row can exist whose end disagrees with its own start and its facility's
 *   `slotMinutes`.
 * - **The overlap check runs inside the write transaction, and the database carries
 *   an exclusion constraint on top.** The check exists to *name the conflicting
 *   booking* in the error; the constraint is what makes the check honest when two
 *   people press Confirm in the same instant. Both are load-bearing.
 * - **Every reference is tenant-verified before it is connected**, including
 *   `contactId` and `tenantId`. `Tenant.organizationId` is nullable in this
 *   schema, so without that check a resident id from another organization connects
 *   cleanly.
 * - **Moving a slot, shrinking a grid and closing a facility all refuse when they
 *   would orphan a live booking**, and say which ones. This is the same guard as
 *   Module 6's overlapping owner statements (master doc issue 61).
 */
@Injectable()
export class FacilitiesService {
  constructor(private prisma: PrismaService) {}

  // ===================================================== facilities — reads

  async findAll(
    organizationId: string | undefined,
    filters: FacilityFilters = {},
  ) {
    const now = new Date();
    const nowMinutes = minutesNow(now);

    const rows = await this.prisma.facility.findMany({
      where: this.facilityWhere(organizationId, filters),
      select: {
        ...FACILITY_LIST_SELECT,
        property: { select: { id: true, code: true, name: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    });

    return rows.map((row) => ({
      ...this.facilityView(row),
      property: row.property,
      openingHours: `${formatMinutes(row.opensAtMinutes)}–${formatMinutes(row.closesAtMinutes)}`,
      totalBookings: row._count.bookings,
      /**
       * Derived on read, never stored. A column would have to be kept in step with
       * the clock by a sweep, and the sweep would eventually be the thing that is
       * wrong.
       */
      isOpenNow:
        row.isActive &&
        row.isBookable &&
        row.closesAtMinutes > row.opensAtMinutes &&
        nowMinutes >= row.opensAtMinutes &&
        nowMinutes < row.closesAtMinutes,
      nowMinutesLabel: formatMinutes(nowMinutes),
      now: now.toISOString(),
    }));
  }

  async findOne(id: string, organizationId: string | undefined) {
    const facility = await requireRecord(
      this.prisma.facility.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: FACILITY_DETAIL_INCLUDE,
      }),
      'Facility',
    );

    const [upcoming, confirmedCount, noShowCount, pendingCount] =
      await Promise.all([
        this.prisma.facilityBooking.findMany({
          where: {
            facilityId: id,
            endsAt: { gte: new Date() },
            status: {
              in: [
                FacilityBookingStatus.PENDING,
                FacilityBookingStatus.CONFIRMED,
              ],
            },
          },
          orderBy: { startsAt: 'asc' },
          take: 25,
          select: {
            id: true,
            reference: true,
            bookedForName: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        }),
        this.prisma.facilityBooking.count({
          where: { facilityId: id, status: FacilityBookingStatus.CONFIRMED },
        }),
        this.prisma.facilityBooking.count({
          where: { facilityId: id, status: FacilityBookingStatus.NO_SHOW },
        }),
        this.prisma.facilityBooking.count({
          where: { facilityId: id, status: FacilityBookingStatus.PENDING },
        }),
      ]);

    return {
      ...this.facilityView(facility),
      property: facility.property,
      openingHours: `${formatMinutes(facility.opensAtMinutes)}–${formatMinutes(facility.closesAtMinutes)}`,
      blackouts: facility.blackouts,
      upcomingBookings: upcoming.map((booking) => ({
        ...booking,
        slotLabel: this.slotLabel(booking.startsAt, booking.endsAt),
        timing: bookingTiming(booking.startsAt, booking.endsAt),
      })),
      statistics: {
        confirmed: confirmedCount,
        noShow: noShowCount,
        awaitingApproval: pendingCount,
        closuresScheduled: facility.blackouts.length,
      },
    };
  }

  /**
   * The diary.
   *
   * Slot-by-slot availability for a date range — what a booking screen needs and
   * what a list of bookings cannot answer, because "when is the clubhouse free?" is
   * a question about *empty* slots rather than occupied ones.
   */
  async availability(
    facilityId: string,
    organizationId: string | undefined,
    from?: string,
    to?: string,
    days = 14,
  ) {
    const facility = await this.facilityRecord(facilityId, organizationId);
    const now = new Date();

    const anchor =
      from && !Number.isNaN(new Date(from).getTime()) ? new Date(from) : now;
    const dayList = horizonDays(
      facility.maxAdvanceDays,
      anchor,
      Math.min(days, 60),
    );

    const rangeEnd =
      to && !Number.isNaN(new Date(to).getTime())
        ? new Date(to)
        : new Date(dayList[dayList.length - 1]);
    rangeEnd.setHours(23, 59, 59, 999);

    const [booked, blackouts] = await Promise.all([
      this.prisma.facilityBooking.findMany({
        where: {
          facilityId,
          status: {
            in: [
              FacilityBookingStatus.PENDING,
              FacilityBookingStatus.CONFIRMED,
            ],
          },
          endsAt: { gte: anchor },
          startsAt: { lte: rangeEnd },
        },
        select: {
          id: true,
          reference: true,
          bookedForName: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
      }),
      this.prisma.facilityBlackout.findMany({
        where: {
          facilityId,
          startsAt: { lte: rangeEnd },
          endsAt: { gte: anchor },
        },
        select: { id: true, reason: true, startsAt: true, endsAt: true },
      }),
    ]);

    return {
      facility: {
        id: facility.id,
        name: facility.name,
        kind: facility.kind,
        slotMinutes: facility.slotMinutes,
        requiresApproval: facility.requiresApproval,
        isBookable: facility.isBookable,
        maxAdvanceDays: facility.maxAdvanceDays,
        capacity: facility.capacity,
        bookingFee:
          facility.bookingFee == null ? null : Number(facility.bookingFee),
        bookingFeeCurrency: facility.bookingFeeCurrency,
      },
      openingHours: `${formatMinutes(facility.opensAtMinutes)}–${formatMinutes(facility.closesAtMinutes)}`,
      days: buildAvailability(
        hoursOf(facility),
        dayList,
        booked.map(
          (booking): OccupiedRange => ({
            id: booking.id,
            label: `${booking.reference} — ${booking.bookedForName}`,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
          }),
        ),
        blackouts.map(
          (blackout): OccupiedRange => ({
            id: blackout.id,
            label: blackout.reason,
            startsAt: blackout.startsAt,
            endsAt: blackout.endsAt,
          }),
        ),
      ),
      bookings: booked.map((booking) => ({
        ...booking,
        slotLabel: this.slotLabel(booking.startsAt, booking.endsAt),
        timing: bookingTiming(booking.startsAt, booking.endsAt),
      })),
      blackouts,
    };
  }

  // ========================================================= bookings — reads

  async bookings(
    organizationId: string | undefined,
    filters: BookingFilters = {},
  ) {
    const rows = await this.prisma.facilityBooking.findMany({
      where: this.bookingWhere(organizationId, filters),
      include: BOOKING_INCLUDE,
      orderBy: [{ startsAt: 'desc' }],
      take: 500,
    });

    return rows.map((row) => this.bookingView(row));
  }

  async booking(id: string, organizationId: string | undefined) {
    const booking = await requireRecord(
      this.prisma.facilityBooking.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: BOOKING_INCLUDE,
      }),
      'Booking',
    );
    return this.bookingView(booking);
  }

  // ======================================================== facilities — writes

  async create(
    dto: CreateFacilityDto,
    propertyId: string,
    organizationId: string,
  ) {
    await this.assertProperty(propertyId, organizationId);

    const name = dto.name.trim();
    const clash = await this.prisma.facility.findFirst({
      where: { propertyId, name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `This property already has a facility called "${name}". Two clubhouses are two rows; two names for one room is a data error.`,
      );
    }

    const hours = {
      opensAtMinutes: dto.opensAt ? minutesFromClock(dto.opensAt) : 480,
      closesAtMinutes: dto.closesAt ? minutesFromClock(dto.closesAt) : 1320,
    };
    this.assertHoursUsable(hours);

    const created = await this.prisma.facility.create({
      data: {
        organization: { connect: { id: organizationId } },
        property: { connect: { id: propertyId } },
        name,
        kind: dto.kind ?? FacilityKind.OTHER,
        description: dto.description?.trim() || null,
        capacity: dto.capacity ?? null,
        opensAtMinutes: hours.opensAtMinutes,
        closesAtMinutes: hours.closesAtMinutes,
        slotMinutes: dto.slotMinutes ?? 60,
        maxAdvanceDays: dto.maxAdvanceDays ?? 90,
        requiresApproval: dto.requiresApproval ?? false,
        isBookable: dto.isBookable ?? true,
        bookingFee:
          dto.bookingFee == null ? null : new Prisma.Decimal(dto.bookingFee),
        bookingFeeCurrency: dto.bookingFeeCurrency?.toUpperCase() ?? null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.findOne(created.id, organizationId);
  }

  async update(id: string, dto: UpdateFacilityDto, organizationId: string) {
    const facility = await this.facilityRecord(id, organizationId);

    // Hours are merged against the *stored* values rather than defaulted, because
    // "close the clubhouse at 23:00" must not silently reopen it at 08:00.
    const opensAtMinutes =
      dto.opensAt !== undefined
        ? minutesFromClock(dto.opensAt)
        : facility.opensAtMinutes;
    const closesAtMinutes =
      dto.closesAt !== undefined
        ? minutesFromClock(dto.closesAt)
        : facility.closesAtMinutes;

    if (dto.opensAt !== undefined || dto.closesAt !== undefined) {
      this.assertHoursUsable({ opensAtMinutes, closesAtMinutes });
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const clash = await this.prisma.facility.findFirst({
        where: { propertyId: facility.propertyId, name, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          `This property already has a facility called "${name}".`,
        );
      }
    }

    // Refuse a grid or hours change that would orphan a live booking, *before*
    // writing anything. The caller is told which bookings to move or cancel first,
    // so the diary never contains a slot this facility can no longer express.
    const nextSlotMinutes = dto.slotMinutes ?? facility.slotMinutes;
    const gridChanged =
      nextSlotMinutes !== facility.slotMinutes ||
      opensAtMinutes !== facility.opensAtMinutes ||
      closesAtMinutes !== facility.closesAtMinutes;
    if (gridChanged) {
      await this.assertExistingBookingsFit(id, {
        opensAtMinutes,
        closesAtMinutes,
        slotMinutes: nextSlotMinutes,
      });
    }

    await this.prisma.facility.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.capacity !== undefined
          ? { capacity: dto.capacity ?? null }
          : {}),
        ...(dto.opensAt !== undefined ? { opensAtMinutes } : {}),
        ...(dto.closesAt !== undefined ? { closesAtMinutes } : {}),
        ...(dto.slotMinutes !== undefined
          ? { slotMinutes: nextSlotMinutes }
          : {}),
        ...(dto.maxAdvanceDays !== undefined
          ? { maxAdvanceDays: dto.maxAdvanceDays }
          : {}),
        ...(dto.requiresApproval !== undefined
          ? { requiresApproval: dto.requiresApproval }
          : {}),
        ...(dto.isBookable !== undefined ? { isBookable: dto.isBookable } : {}),
        ...(dto.bookingFee !== undefined
          ? {
              bookingFee:
                dto.bookingFee == null
                  ? null
                  : new Prisma.Decimal(dto.bookingFee),
            }
          : {}),
        ...(dto.bookingFeeCurrency !== undefined
          ? {
              bookingFeeCurrency: dto.bookingFeeCurrency?.toUpperCase() || null,
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.findOne(id, organizationId);
  }

  async facilitiesExportCsv(
    organizationId: string | undefined,
  ): Promise<string> {
    const rows = await this.prisma.facility.findMany({
      where: organizationId ? { organizationId } : {},
      select: { ...FACILITY_LIST_SELECT, property: { select: { name: true } } },
      orderBy: [{ property: { name: 'asc' } }, { name: 'asc' }],
      take: 5000,
    });

    return toCsv(
      FACILITY_EXPORT_HEADERS,
      rows.map((row) => ({
        name: row.name,
        kind: row.kind,
        property: row.property.name,
        capacity: row.capacity ?? '',
        opensAt: formatMinutes(row.opensAtMinutes),
        closesAt: formatMinutes(row.closesAtMinutes),
        slotMinutes: row.slotMinutes,
        maxAdvanceDays: row.maxAdvanceDays,
        requiresApproval: row.requiresApproval ? 'yes' : 'no',
        isBookable: row.isBookable ? 'yes' : 'no',
        isActive: row.isActive ? 'yes' : 'no',
        bookingFee: row.bookingFee == null ? '' : String(row.bookingFee),
        bookingFeeCurrency: row.bookingFeeCurrency ?? '',
      })),
    );
  }

  // ========================================================= bookings — writes

  async createBooking(
    dto: CreateBookingDto,
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    const facility = await this.facilityRecord(dto.facilityId, organizationId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException(
        'The start or end time is not a date the server understands.',
      );
    }

    const subject = await this.resolveSubject(dto, organizationId);

    const check = await this.checkSlotAgainstDiary(facility, startsAt, endsAt);
    if (!check.ok) {
      throw new ConflictException(
        check.reason ?? `That slot cannot be booked on ${facility.name}.`,
      );
    }

    const shape = shapeSlot(hoursOf(facility), startsAt, endsAt);

    // Staff booking on somebody's behalf is confirmed immediately — there is already
    // a person in the loop who could have refused. A resident's own request waits
    // when the facility says so. `requestApproval` can force PENDING either way;
    // it cannot *remove* the approval requirement, which is the facility's call.
    const madeByStaff = Boolean(actorUserId);
    const status = initialStatus({
      requiresApproval: facility.requiresApproval,
      madeByStaff,
    });
    const finalStatus =
      dto.requestApproval === true
        ? FacilityBookingStatus.PENDING
        : dto.requestApproval === false &&
            !madeByStaff &&
            facility.requiresApproval
          ? FacilityBookingStatus.PENDING
          : status;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const reference = await this.nextReference(tx, facility.id);
        return tx.facilityBooking.create({
          data: {
            organization: { connect: { id: organizationId } },
            facility: { connect: { id: facility.id } },
            reference,
            ...(actorUserId
              ? { bookedByUser: { connect: { id: actorUserId } } }
              : {}),
            ...(subject.contactId
              ? { contact: { connect: { id: subject.contactId } } }
              : {}),
            ...(subject.tenantId
              ? { tenant: { connect: { id: subject.tenantId } } }
              : {}),
            bookedForName: subject.name,
            bookedForPhone: subject.phone ?? null,
            purpose: dto.purpose?.trim() || null,
            attendeeCount: dto.attendeeCount ?? null,
            startsAt: shape.startsAt,
            endsAt: shape.endsAt,
            status: finalStatus,
            // Snapshotted, so a fee change next month does not retroactively change
            // what last month's booking said it cost. Not invoiced yet — see the
            // module's open items.
            fee: facility.bookingFee,
            feeCurrency: facility.bookingFeeCurrency,
          },
        });
      });

      return this.booking(created.id, organizationId);
    } catch (error) {
      if (this.isOverlapViolation(error)) {
        throw new ConflictException(
          'Another booking for that slot was saved a moment before yours, so this one has not been created. Reload the diary and pick another time.',
        );
      }
      throw error;
    }
  }

  async updateBooking(
    id: string,
    dto: SubjectInput & { purpose?: string; attendeeCount?: number },
    organizationId: string,
  ) {
    await this.bookingRecord(id, organizationId);

    await this.prisma.facilityBooking.update({
      where: { id },
      data: {
        ...(dto.bookedForName !== undefined
          ? { bookedForName: dto.bookedForName.trim() }
          : {}),
        ...(dto.bookedForPhone !== undefined
          ? { bookedForPhone: dto.bookedForPhone?.trim() || null }
          : {}),
        ...(dto.purpose !== undefined
          ? { purpose: dto.purpose?.trim() || null }
          : {}),
        ...(dto.attendeeCount !== undefined
          ? { attendeeCount: dto.attendeeCount ?? null }
          : {}),
        ...(dto.contactId !== undefined
          ? {
              contact: dto.contactId
                ? {
                    connect: {
                      id: await this.assertContact(
                        dto.contactId,
                        organizationId,
                      ),
                    },
                  }
                : { disconnect: true },
            }
          : {}),
        ...(dto.tenantId !== undefined
          ? {
              tenant: dto.tenantId
                ? {
                    connect: {
                      id: await this.assertTenant(dto.tenantId, organizationId),
                    },
                  }
                : { disconnect: true },
            }
          : {}),
      },
    });

    return this.booking(id, organizationId);
  }

  /**
   * Move a booking to a different slot.
   *
   * Its own action rather than a field on the update DTO, because moving a booking
   * is the one edit that re-enters the overlap check and re-derives the times
   * against a possibly-changed grid. Excluding the row being moved is what makes
   * this possible at all — without it every booking would collide with itself.
   */
  async reschedule(
    id: string,
    startsAt: string,
    endsAt: string,
    organizationId: string,
  ) {
    const booking = await this.bookingRecord(id, organizationId);
    if (!holdsSlot(booking.status)) {
      throw new ConflictException(
        `A ${BOOKING_STATUS_LABEL[booking.status].toLowerCase()} booking holds no slot, so there is nothing to move.`,
      );
    }

    const facility = await this.facilityRecord(
      booking.facilityId,
      organizationId,
    );
    const nextStartsAt = new Date(startsAt);
    const nextEndsAt = new Date(endsAt);
    if (
      Number.isNaN(nextStartsAt.getTime()) ||
      Number.isNaN(nextEndsAt.getTime())
    ) {
      throw new BadRequestException(
        'The new start or end time is not a date the server understands.',
      );
    }

    const check = await this.checkSlotAgainstDiary(
      facility,
      nextStartsAt,
      nextEndsAt,
      booking.id,
    );
    if (!check.ok) {
      throw new ConflictException(
        check.reason ?? 'That slot cannot be booked.',
      );
    }

    const shape = shapeSlot(hoursOf(facility), nextStartsAt, nextEndsAt);

    try {
      await this.prisma.facilityBooking.update({
        where: { id },
        data: { startsAt: shape.startsAt, endsAt: shape.endsAt },
      });
    } catch (error) {
      if (this.isOverlapViolation(error)) {
        throw new ConflictException(
          'Another booking took that slot a moment before this move, so nothing has changed. Reload the diary and pick another time.',
        );
      }
      throw error;
    }

    return this.booking(id, organizationId);
  }

  /**
   * Read-only "would this be allowed?".
   *
   * Answers with the *same* `checkSlot` the create path uses, which is what lets a
   * booking dialog tell somebody the clubhouse shuts at 22:00 while they are still
   * looking at the time picker, rather than after they press Confirm.
   */
  async previewBooking(
    facilityId: string,
    organizationId: string | undefined,
    startsAt: string,
    endsAt: string,
  ) {
    const facility = await this.facilityRecord(facilityId, organizationId);
    const result = await this.checkSlotAgainstDiary(
      facility,
      new Date(startsAt),
      new Date(endsAt),
    );
    return {
      ...result,
      facilityName: facility.name,
      openingHours: `${formatMinutes(facility.opensAtMinutes)}–${formatMinutes(facility.closesAtMinutes)}`,
      /** What the slot would cost, if the facility charges. Not yet invoiced. */
      fee: facility.bookingFee == null ? null : Number(facility.bookingFee),
      feeCurrency: facility.bookingFeeCurrency,
      /** Whether a booking made now would wait for somebody to confirm it. */
      willRequireApproval: facility.requiresApproval,
    };
  }

  /**
   * The four lifecycle actions, as named routes.
   *
   * All four go through `booking-lifecycle.ts`. `status` is in no update DTO, which
   * is what keeps "a body field cannot skip straight past the gates" true here.
   */
  async decide(
    id: string,
    action: BookingAction,
    note: string | undefined,
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    const booking = await this.bookingRecord(id, organizationId);

    const result = transition(action, {
      status: booking.status,
      endsAt: booking.endsAt,
      note,
      actorUserId,
      bookedByUserId: booking.bookedByUserId,
    });
    if (!result.ok) {
      throw new ConflictException(result.reason);
    }

    const now = new Date();
    await this.prisma.facilityBooking.update({
      where: { id },
      data: {
        status: result.status,
        decidedAt: now,
        ...(actorUserId
          ? { decidedByUser: { connect: { id: actorUserId } } }
          : {}),
        ...(note?.trim() ? { decisionNote: note.trim() } : {}),
        ...(action === 'CANCEL'
          ? { cancelledAt: now, cancelReason: note?.trim() }
          : {}),
      },
    });

    return this.booking(id, organizationId);
  }

  /**
   * Approve, decline or cancel many bookings at once, reported per row.
   *
   * Deliberately *not* one transaction. A bulk action that rolls all forty rows
   * back because two have already passed is far less useful than one that does the
   * thirty-eight it can and says which two it could not — and each row goes through
   * the same `booking-lifecycle.ts` gate as the single-row path, so there is no
   * second set of rules to keep in step.
   */
  async bulkDecide(
    ids: string[],
    action: 'approve' | 'reject' | 'cancel',
    note: string | undefined,
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    const mapped: Record<typeof action, BookingAction> = {
      approve: 'APPROVE',
      reject: 'REJECT',
      cancel: 'CANCEL',
    };

    const results: Array<{ id: string; ok: boolean; reason?: string }> = [];
    for (const id of ids) {
      try {
        await this.decide(
          id,
          mapped[action],
          note,
          organizationId,
          actorUserId,
        );
        results.push({ id, ok: true });
      } catch (error) {
        results.push({
          id,
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    const verb = {
      approve: 'approved',
      reject: 'declined',
      cancel: 'cancelled',
    }[action];
    return {
      succeeded,
      failed: results.length - succeeded,
      results,
      message:
        succeeded === 0
          ? `None of the ${ids.length} booking${ids.length === 1 ? '' : 's'} could be ${verb}. See the per-row reasons.`
          : `${succeeded} of ${ids.length} booking${ids.length === 1 ? '' : 's'} ${verb}.`,
    };
  }

  async deleteBooking(id: string, organizationId: string | undefined) {
    const booking = await this.bookingRecord(id, organizationId);

    if (booking.startsAt <= new Date()) {
      throw new ConflictException(
        'A booking whose slot has passed is history. Cancel it if it has not happened yet, or mark it a no-show if it did — deleting it would remove the fact that the slot was held.',
      );
    }
    if (holdsSlot(booking.status)) {
      throw new ConflictException(
        'A confirmed or pending booking is a record somebody is relying on. Cancel it with a reason rather than deleting it, so the diary explains itself.',
      );
    }

    await this.prisma.facilityBooking.delete({ where: { id } });
    return {
      message: `Booking ${booking.reference} deleted.`,
      facilityId: booking.facilityId,
    };
  }

  async bookingsExportCsv(
    organizationId: string | undefined,
    filters: BookingFilters = {},
  ): Promise<string> {
    const rows = await this.bookings(organizationId, filters);

    return toCsv(
      BOOKING_EXPORT_HEADERS,
      rows.map((row) => ({
        reference: row.reference,
        facility: row.facility?.name ?? '',
        bookedFor: row.bookedForName,
        phone: row.bookedForPhone ?? '',
        startsAt: new Date(row.startsAt).toISOString(),
        endsAt: new Date(row.endsAt).toISOString(),
        status: row.statusLabel,
        phase: row.timing.phase,
        purpose: row.purpose ?? '',
        attendeeCount: row.attendeeCount ?? '',
        fee: row.fee ?? '',
        feeCurrency: row.feeCurrency ?? '',
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    );
  }

  // =========================================================== closures

  /**
   * Close a facility for a period.
   *
   * Refuses when live bookings fall inside, and names them. Same guard as Module 6's
   * overlapping owner statements (master doc issue 61): a closure that quietly
   * overrides a booking somebody is relying on turns a day-sheet argument into an
   * argument about the database.
   */
  async createBlackout(
    dto: {
      facilityId: string;
      reason: string;
      startsAt: string;
      endsAt: string;
    },
    organizationId: string,
    actorUserId: string | undefined,
  ) {
    await this.facilityRecord(dto.facilityId, organizationId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException(
        'The closure start or end time is not a date the server understands.',
      );
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'The closure ends at or before it starts, so it closes nothing.',
      );
    }

    const clashing = await this.prisma.facilityBooking.findMany({
      where: {
        facilityId: dto.facilityId,
        status: {
          in: [FacilityBookingStatus.PENDING, FacilityBookingStatus.CONFIRMED],
        },
        endsAt: { gt: startsAt },
        startsAt: { lt: endsAt },
      },
      select: {
        id: true,
        reference: true,
        bookedForName: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: { startsAt: 'asc' },
      take: 6,
    });

    if (clashing.length > 0) {
      const list = clashing
        .map((booking) => `${booking.reference} (${booking.bookedForName})`)
        .join(', ');
      throw new ConflictException(
        `${clashing.length} live booking${clashing.length === 1 ? ' falls' : 's fall'} inside that period: ${list}${clashing.length > 5 ? '…' : ''}. Move or cancel ${clashing.length === 1 ? 'it' : 'them'} first — a closure that quietly overrides a booking somebody is relying on is not a closure.`,
      );
    }

    const created = await this.prisma.facilityBlackout.create({
      data: {
        organization: { connect: { id: organizationId } },
        facility: { connect: { id: dto.facilityId } },
        reason: dto.reason.trim(),
        startsAt,
        endsAt,
        ...(actorUserId
          ? { createdByUser: { connect: { id: actorUserId } } }
          : {}),
      },
    });

    return created;
  }

  async deleteBlackout(id: string, organizationId: string | undefined) {
    const blackout = await requireRecord(
      this.prisma.facilityBlackout.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        select: {
          id: true,
          facilityId: true,
          reason: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      'Closure',
    );

    await this.prisma.facilityBlackout.delete({ where: { id } });
    return {
      message: `Closure removed: ${blackout.reason}.`,
      facilityId: blackout.facilityId,
      period: { startsAt: blackout.startsAt, endsAt: blackout.endsAt },
    };
  }

  // =========================================================== access cards

  /**
   * The card register.
   *
   * `status` filters on the **effective** status, which is why this is a service
   * method rather than a `where` clause: `?status=EXPIRED` has to find cards whose
   * `expiresAt` has passed even though their column still says ACTIVE, because
   * `effectiveStatus` is what the gate honours and a filter that disagreed with it
   * would hide live cards.
   */
  async accessCards(
    organizationId: string | undefined,
    filters: {
      search?: string;
      type?: string;
      status?: string;
      holder?: string;
      propertyId?: string;
      unitId?: string;
      facilityId?: string;
      expiringSoon?: string;
    } = {},
  ) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 86400000);

    const rows = await this.prisma.accessCard.findMany({
      where: this.cardWhere(organizationId, filters, now, soon),
      include: {
        property: { select: { id: true, code: true, name: true } },
        unit: { select: { id: true, code: true, name: true } },
        facility: { select: { id: true, name: true, kind: true } },
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isBlacklisted: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { cardNumber: 'asc' }],
      take: 500,
    });

    // Post-filter for the two derived states, because they are not columns.
    const filtered = rows.filter((row) => {
      const effective = this.effectiveCardStatus(
        row.status,
        row.expiresAt,
        now,
      );
      if (filters.status && effective !== filters.status) return false;
      return true;
    });

    return filtered.map((row) => this.cardView(row, now));
  }

  async accessCard(id: string, organizationId: string | undefined) {
    const card = await requireRecord(
      this.prisma.accessCard.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: {
          property: { select: { id: true, code: true, name: true } },
          unit: { select: { id: true, code: true, name: true } },
          facility: { select: { id: true, name: true, kind: true } },
          tenant: {
            select: { id: true, surname: true, otherNames: true, code: true },
          },
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
            },
          },
          visitor: { select: { id: true, firstName: true, lastName: true } },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          visits: {
            orderBy: { createdAt: 'desc' as const },
            take: 10,
            select: {
              id: true,
              createdAt: true,
              checkedInAt: true,
              checkedOutAt: true,
            },
          },
        },
      }),
      'Access card',
    );

    return this.cardView(card, new Date());
  }

  async createAccessCard(
    dto: {
      cardNumber?: string;
      type?: AccessCardType;
      propertyId?: string;
      unitId?: string;
      facilityId?: string;
      userId?: string;
      tenantId?: string;
      contactId?: string;
      visitorId?: string;
      holderName?: string;
      expiresAt?: string;
      notes?: string;
    },
    organizationId: string,
  ) {
    const type = dto.type ?? AccessCardType.BUILDING;
    const target = await this.resolveCardTarget(dto, type, organizationId);
    const holder = await this.resolveCardHolder(dto, organizationId);

    // A card that opens nothing is not a card. Which target is *required* depends
    // on the type, and this is where that is enforced — the check is the reason
    // `type` is on the row rather than being implied by the target.
    if (type === AccessCardType.UNIT && !target.unitId) {
      throw new BadRequestException(
        'A unit card has to name the unit it opens. A card that opens nothing is refused at the gate and reads as valid in a list.',
      );
    }
    if (type === AccessCardType.FACILITY && !target.facilityId) {
      throw new BadRequestException(
        'A facility card has to name the facility it opens.',
      );
    }
    if (
      (type === AccessCardType.BUILDING || type === AccessCardType.PARKING) &&
      !target.propertyId &&
      !target.unitId
    ) {
      throw new BadRequestException(
        'A building or parking card has to say which property or unit it opens.',
      );
    }

    const cardNumber = dto.cardNumber
      ? dto.cardNumber.trim().toUpperCase()
      : await this.nextCardNumber(organizationId);

    const clash = await this.prisma.accessCard.findFirst({
      where: { organizationId, cardNumber },
      select: { id: true, holderName: true },
    });
    if (clash) {
      throw new ConflictException(
        `Card ${cardNumber} already exists in this organization, held by ${clash.holderName}. Card numbers come off one printer per estate, so this is usually a misprint rather than a new card — pick another number.`,
      );
    }

    const created = await this.prisma.accessCard.create({
      data: {
        organization: { connect: { id: organizationId } },
        cardNumber,
        type,
        holder: holder.holder,
        ...(target.propertyId
          ? { property: { connect: { id: target.propertyId } } }
          : {}),
        ...(target.unitId ? { unit: { connect: { id: target.unitId } } } : {}),
        ...(target.facilityId
          ? { facility: { connect: { id: target.facilityId } } }
          : {}),
        ...(holder.userId ? { user: { connect: { id: holder.userId } } } : {}),
        ...(holder.tenantId
          ? { tenant: { connect: { id: holder.tenantId } } }
          : {}),
        ...(holder.contactId
          ? { contact: { connect: { id: holder.contactId } } }
          : {}),
        ...(holder.visitorId
          ? { visitor: { connect: { id: holder.visitorId } } }
          : {}),
        holderName: holder.name,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        notes: dto.notes?.trim() || null,
      },
    });

    return this.accessCard(created.id, organizationId);
  }

  /**
   * Reassigning a card's holder name and expiry.
   *
   * No general update: `cardNumber`, `type`, `status`, `issuedAt` and the "what it
   * opens" columns are all absent because each has an action of its own. Moving a
   * card to a different unit would hand a resident a fob for a door nobody
   * approved, so if a card needs to be somewhere else it is revoked and reissued.
   */
  async updateAccessCard(
    id: string,
    dto: { holderName?: string; expiresAt?: string; notes?: string },
    organizationId: string,
  ) {
    await this.accessCardRecord(id, organizationId);

    await this.prisma.accessCard.update({
      where: { id },
      data: {
        ...(dto.holderName !== undefined
          ? { holderName: dto.holderName.trim() }
          : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
      },
    });

    return this.accessCard(id, organizationId);
  }

  async decideAccessCard(
    id: string,
    action: AccessCardAction,
    dto: { note?: string; replacementCardId?: string },
    organizationId: string,
  ) {
    const card = await this.accessCardRecord(id, organizationId);

    const result = cardTransition(action, {
      status: card.status,
      expiresAt: card.expiresAt,
      note: dto.note,
      replacementCardId: dto.replacementCardId,
    });
    if (!result.ok) {
      throw new ConflictException(result.reason);
    }

    const now = new Date();
    await this.prisma.accessCard.update({
      where: { id },
      data: {
        ...(result.status !== card.status ? { status: result.status } : {}),
        ...(action === 'SUSPEND' ? { suspendedAt: now } : {}),
        ...(action === 'REVOKE'
          ? { revokedAt: now, revokedReason: dto.note?.trim() ?? null }
          : {}),
        ...(action === 'RECORD_REPLACEMENT'
          ? { replacementCardId: dto.replacementCardId }
          : {}),
      },
    });

    return this.accessCard(id, organizationId);
  }

  async accessCardsExportCsv(
    organizationId: string | undefined,
  ): Promise<string> {
    const rows = await this.accessCards(organizationId);
    return toCsv(
      [
        'cardNumber',
        'type',
        'effectiveStatus',
        'holder',
        'holderName',
        'opens',
        'issuedAt',
        'expiresAt',
        'lastSeenAt',
      ],
      rows.map((row) => ({
        cardNumber: row.cardNumber,
        type: row.type,
        effectiveStatus: row.effectiveStatus,
        holder: row.holder,
        holderName: row.holderName,
        opens: row.opensDescription,
        issuedAt: new Date(row.issuedAt).toISOString().slice(0, 10),
        expiresAt: row.expiresAt
          ? new Date(row.expiresAt).toISOString().slice(0, 10)
          : '',
        lastSeenAt: row.lastSeenAt
          ? new Date(row.lastSeenAt).toISOString()
          : '',
      })),
    );
  }

  // =========================================================== helpers

  /**
   * The one place a slot is judged against a real diary.
   *
   * `excludeBookingId` is what makes a reschedule possible at all: without
   * excluding the row being moved, every booking would collide with itself.
   */
  private async checkSlotAgainstDiary(
    facility: {
      id: string;
      opensAtMinutes: number;
      closesAtMinutes: number;
      slotMinutes: number;
      maxAdvanceDays: number;
      isBookable: boolean;
    },
    startsAt: Date,
    endsAt: Date,
    excludeBookingId?: string,
  ) {
    const [booked, blackouts] = await Promise.all([
      this.prisma.facilityBooking.findMany({
        where: {
          facilityId: facility.id,
          status: {
            in: [
              FacilityBookingStatus.PENDING,
              FacilityBookingStatus.CONFIRMED,
            ],
          },
          endsAt: { gt: startsAt },
          startsAt: { lt: endsAt },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
        select: {
          id: true,
          reference: true,
          bookedForName: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      this.prisma.facilityBlackout.findMany({
        where: {
          facilityId: facility.id,
          endsAt: { gt: startsAt },
          startsAt: { lt: endsAt },
        },
        select: { id: true, reason: true, startsAt: true, endsAt: true },
      }),
    ]);

    return checkSlot({
      hours: hoursOf(facility),
      startsAt,
      endsAt,
      booked: booked.map(
        (booking): OccupiedRange => ({
          id: booking.id,
          label: `${booking.reference} (${booking.bookedForName})`,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        }),
      ),
      blackouts: blackouts.map(
        (blackout): OccupiedRange => ({
          id: blackout.id,
          label: blackout.reason,
          startsAt: blackout.startsAt,
          endsAt: blackout.endsAt,
        }),
      ),
      maxAdvanceDays: facility.maxAdvanceDays,
      isBookable: facility.isBookable,
      capacity: 1,
    });
  }

  /**
   * Who the slot is for, and what the day sheet will say.
   *
   * Returns a name even when no reference was given, because "a guest of the family
   * in B4, and we do not have their details" is a real booking and the diary still
   * has to say who the room is for. Forcing that into a `Contact` would create
   * contact records for people who were never a lead — the exact mistake master doc
   * issue 35 documents for `Tenant`/`Contact`.
   */
  private async resolveSubject(
    dto: SubjectInput,
    organizationId: string,
  ): Promise<{
    contactId?: string;
    tenantId?: string;
    name: string;
    phone?: string;
  }> {
    const explicitName = dto.bookedForName?.trim();
    const explicitPhone = dto.bookedForPhone?.trim();

    if (dto.contactId) {
      const contactId = await this.assertContact(dto.contactId, organizationId);
      const contact = await this.prisma.contact.findFirstOrThrow({
        where: { id: contactId },
        select: { firstName: true, lastName: true, company: true, phone: true },
      });
      const name =
        explicitName ??
        [contact.company, contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' ');
      return {
        contactId,
        name,
        phone: explicitPhone ?? contact.phone ?? undefined,
      };
    }

    if (dto.tenantId) {
      const tenantId = await this.assertTenant(dto.tenantId, organizationId);
      const tenant = await this.prisma.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: { surname: true, otherNames: true, phone: true },
      });
      const name =
        explicitName ??
        [tenant.otherNames, tenant.surname].filter(Boolean).join(' ');
      return {
        tenantId,
        name,
        phone: explicitPhone ?? tenant.phone ?? undefined,
      };
    }

    if (!explicitName) {
      throw new BadRequestException(
        'Say who the slot is for. Naming a contact or a resident on file is optional because "a guest of the family in B4" is a real answer, but an unnamed booking cannot go on a day sheet.',
      );
    }

    return { name: explicitName, phone: explicitPhone };
  }

  /** Tenant-scoped, because `Contact.organizationId` is a plain `String`. */
  private async assertContact(
    contactId: string,
    organizationId: string,
  ): Promise<string> {
    await requireRecord(
      this.prisma.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { id: true },
      }),
      'Contact',
    );
    return contactId;
  }

  /**
   * Tenant-scoped, and the filter has to be in the `where` clause: `Tenant.organizationId`
   * is **nullable** in this schema, so a post-hoc check on a fetched row would be a
   * check on a value that may legitimately be null.
   */
  private async assertTenant(
    tenantId: string,
    organizationId: string,
  ): Promise<string> {
    await requireRecord(
      this.prisma.tenant.findFirst({
        where: { id: tenantId, organizationId },
        select: { id: true },
      }),
      'Tenant',
    );
    return tenantId;
  }

  private async assertProperty(propertyId: string, organizationId: string) {
    await requireRecord(
      this.prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        select: { id: true },
      }),
      'Property',
    );
  }

  /** `FB-0007`, sequential within the facility. */
  private async nextReference(tx: Tx, facilityId: string): Promise<string> {
    const count = await tx.facilityBooking.count({ where: { facilityId } });
    let sequence = count + 1;
    // The unique index on (facilityId, reference) is the real guarantee. This loop
    // only avoids an exception on the rare occasion a row was deleted.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = formatBookingReference(sequence);
      const taken = await tx.facilityBooking.findFirst({
        where: { facilityId, reference: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      sequence += 1;
    }
    return `${formatBookingReference(sequence)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  private async nextCardNumber(organizationId: string): Promise<string> {
    const count = await this.prisma.accessCard.count({
      where: { organizationId },
    });
    let sequence = count + 1;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = `AC-${String(sequence).padStart(4, '0')}`;
      const taken = await this.prisma.accessCard.findFirst({
        where: { organizationId, cardNumber: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      sequence += 1;
    }
    return `AC-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  }

  /** The "what it opens" columns, each tenant-verified before it is connected. */
  private async resolveCardTarget(
    dto: {
      propertyId?: string;
      unitId?: string;
      facilityId?: string;
    },
    _type: AccessCardType,
    organizationId: string,
  ): Promise<{ propertyId?: string; unitId?: string; facilityId?: string }> {
    const result: {
      propertyId?: string;
      unitId?: string;
      facilityId?: string;
    } = {};

    if (dto.propertyId) {
      await this.assertProperty(dto.propertyId, organizationId);
      result.propertyId = dto.propertyId;
    }

    if (dto.unitId) {
      // `Unit` has no `organizationId` (master doc issue 25), so the tenant filter
      // has to go through the parent property. Filtering `unit.organizationId`
      // directly is a Prisma validation error, not just a wrong result.
      const unit = await requireRecord(
        this.prisma.unit.findFirst({
          where: { id: dto.unitId, property: { organizationId } },
          select: { id: true, propertyId: true },
        }),
        'Unit',
      );
      result.unitId = unit.id;
      // A card for a unit implies a card for its building, so the gate reader does
      // not need two cards. Derived rather than required, which means one fewer
      // thing for a user to fill in and get wrong.
      result.propertyId = result.propertyId ?? unit.propertyId;
    }

    if (dto.facilityId) {
      const facility = await this.facilityRecord(
        dto.facilityId,
        organizationId,
      );
      result.facilityId = facility.id;
      result.propertyId = result.propertyId ?? facility.propertyId;
    }

    return result;
  }

  /** The holder columns, with `holder` derived from whichever one is set. */
  private async resolveCardHolder(
    dto: {
      userId?: string;
      tenantId?: string;
      contactId?: string;
      visitorId?: string;
      holderName?: string;
    },
    organizationId: string,
  ): Promise<{
    holder: AccessCardHolder;
    userId?: string;
    tenantId?: string;
    contactId?: string;
    visitorId?: string;
    name: string;
  }> {
    const name = dto.holderName?.trim();
    const supplied = [
      dto.userId ? 'userId' : null,
      dto.tenantId ? 'tenantId' : null,
      dto.contactId ? 'contactId' : null,
      dto.visitorId ? 'visitorId' : null,
    ].filter(Boolean);

    if (supplied.length > 1) {
      throw new BadRequestException(
        'A card is held by one person. Pick a staff login, a resident, a contact or a visitor — not several.',
      );
    }

    if (dto.userId) {
      const user = await requireRecord(
        this.prisma.user.findFirst({
          where: { id: dto.userId, organizationId },
          select: { id: true, firstName: true, lastName: true },
        }),
        'User',
      );
      return {
        holder: AccessCardHolder.STAFF,
        userId: user.id,
        name: name ?? `${user.firstName} ${user.lastName}`,
      };
    }

    if (dto.tenantId) {
      const tenantId = await this.assertTenant(dto.tenantId, organizationId);
      const tenant = await this.prisma.tenant.findFirstOrThrow({
        where: { id: tenantId },
        select: { surname: true, otherNames: true },
      });
      return {
        holder: AccessCardHolder.TENANT,
        tenantId,
        name:
          name ?? [tenant.otherNames, tenant.surname].filter(Boolean).join(' '),
      };
    }

    if (dto.contactId) {
      const contactId = await this.assertContact(dto.contactId, organizationId);
      const contact = await this.prisma.contact.findFirstOrThrow({
        where: { id: contactId },
        select: { firstName: true, lastName: true, company: true },
      });
      return {
        holder: AccessCardHolder.CONTACT,
        contactId,
        name:
          name ??
          [contact.company, contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(' '),
      };
    }

    if (dto.visitorId) {
      // A card that says VISITOR and names nobody is a card that cannot be
      // withdrawn from anybody, so the visitor is required rather than implied.
      const visitor = await requireRecord(
        this.prisma.visitor.findFirst({
          where: { id: dto.visitorId, organizationId },
          select: { id: true, firstName: true, lastName: true },
        }),
        'Visitor',
      );
      return {
        holder: AccessCardHolder.VISITOR,
        visitorId: visitor.id,
        name: name ?? `${visitor.firstName} ${visitor.lastName}`,
      };
    }

    // No holder at all: a spare, kept at the gate. Legitimate, and the reason
    // `AccessCardHolder.NONE` exists.
    return {
      holder: AccessCardHolder.NONE,
      name: name ?? 'Unassigned — gate spare',
    };
  }

  private facilityWhere(
    organizationId: string | undefined,
    filters: FacilityFilters,
  ): Prisma.FacilityWhereInput {
    const where: Prisma.FacilityWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.kind) where.kind = filters.kind as FacilityKind;
    if (filters.isBookable === 'true') where.isBookable = true;
    else if (filters.isBookable === 'false') where.isBookable = false;

    if (!filters.includeInactive) where.isActive = true;

    if (filters.openNow === 'true') {
      const minutes = minutesNow();
      where.isActive = true;
      where.isBookable = true;
      where.opensAtMinutes = { lte: minutes };
      where.closesAtMinutes = { gt: minutes };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
        { property: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private bookingWhere(
    organizationId: string | undefined,
    filters: BookingFilters,
  ): Prisma.FacilityBookingWhereInput {
    const where: Prisma.FacilityBookingWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.facilityId) where.facilityId = filters.facilityId;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.status) where.status = filters.status as FacilityBookingStatus;
    if (filters.propertyId) where.facility = { propertyId: filters.propertyId };

    // `upcoming` / `past` / `today` are **derived** filters. There is no column to
    // read them from and nothing to keep in step, which is the point.
    if (filters.when === 'upcoming') where.endsAt = { gte: new Date() };
    else if (filters.when === 'past') where.endsAt = { lt: new Date() };
    else if (filters.when === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      where.startsAt = { gte: start, lte: end };
    }

    if (filters.from || filters.to) {
      where.startsAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { reference: { contains: search, mode: 'insensitive' } },
        { bookedForName: { contains: search, mode: 'insensitive' } },
        { purpose: { contains: search, mode: 'insensitive' } },
        { facility: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private cardWhere(
    organizationId: string | undefined,
    filters: {
      search?: string;
      type?: string;
      status?: string;
      holder?: string;
      propertyId?: string;
      unitId?: string;
      facilityId?: string;
      expiringSoon?: string;
    },
    now: Date,
    soon: Date,
  ): Prisma.AccessCardWhereInput {
    const where: Prisma.AccessCardWhereInput = {};
    if (organizationId) where.organizationId = organizationId;

    if (filters.type) where.type = filters.type as AccessCardType;
    if (filters.holder) where.holder = filters.holder as AccessCardHolder;
    if (filters.propertyId) where.propertyId = filters.propertyId;
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.facilityId) where.facilityId = filters.facilityId;

    // `expiringSoon` is a real date range, so it is a `where` clause; the *effective*
    // status filter is not, and is applied in `accessCards` after the read.
    if (filters.expiringSoon === 'true') {
      where.expiresAt = { gt: now, lte: soon };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { cardNumber: { contains: search, mode: 'insensitive' } },
        { holderName: { contains: search, mode: 'insensitive' } },
        { property: { name: { contains: search, mode: 'insensitive' } } },
        { unit: { name: { contains: search, mode: 'insensitive' } } },
        { facility: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  /**
   * Refuse a grid or hours change that would orphan a live booking.
   *
   * Done in a loop rather than SQL because Prisma cannot express a modulo on a
   * timestamp portably, and a partial guard would be worse than none: it would let
   * through exactly the change it was written to stop.
   */
  private async assertExistingBookingsFit(
    facilityId: string,
    next: {
      opensAtMinutes: number;
      closesAtMinutes: number;
      slotMinutes: number;
    },
  ) {
    const live = await this.prisma.facilityBooking.findMany({
      where: {
        facilityId,
        status: {
          in: [FacilityBookingStatus.PENDING, FacilityBookingStatus.CONFIRMED],
        },
        endsAt: { gte: new Date() },
      },
      select: { id: true, reference: true, startsAt: true, endsAt: true },
      take: 200,
    });

    const offenders = live.filter((booking) => {
      const startMinutes =
        booking.startsAt.getHours() * 60 + booking.startsAt.getMinutes();
      const endMinutes =
        booking.endsAt.getHours() * 60 + booking.endsAt.getMinutes();
      return (
        startMinutes % next.slotMinutes !== 0 ||
        endMinutes % next.slotMinutes !== 0 ||
        startMinutes < next.opensAtMinutes ||
        endMinutes > next.closesAtMinutes
      );
    });

    if (offenders.length > 0) {
      const list = offenders
        .slice(0, 5)
        .map((booking) => booking.reference)
        .join(', ');
      throw new ConflictException(
        `${offenders.length} live booking${offenders.length === 1 ? '' : 's'} would fall outside the new hours or slot grid: ${list}${offenders.length > 5 ? '…' : ''}. Move or cancel ${offenders.length === 1 ? 'it' : 'them'} first, or the diary would contain slots this facility can no longer express.`,
      );
    }
  }

  private async facilityRecord(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.facility.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Facility',
    );
  }

  private async bookingRecord(id: string, organizationId: string | undefined) {
    return requireRecord(
      this.prisma.facilityBooking.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Booking',
    );
  }

  private async accessCardRecord(
    id: string,
    organizationId: string | undefined,
  ) {
    return requireRecord(
      this.prisma.accessCard.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
      }),
      'Access card',
    );
  }

  private assertHoursUsable(hours: {
    opensAtMinutes: number;
    closesAtMinutes: number;
  }) {
    if (hours.closesAtMinutes <= hours.opensAtMinutes) {
      throw new BadRequestException(
        `Closing time (${formatMinutes(hours.closesAtMinutes)}) must be later than opening time (${formatMinutes(hours.opensAtMinutes)}).`,
      );
    }
  }

  /**
   * The database said no.
   *
   * `facility_bookings_no_overlap` is the guarantee this module's acceptance
   * criterion rests on, and its violation arrives as an opaque driver error rather
   * than a Prisma code — so it is recognised by the constraint's name. This is the
   * one place in the codebase where that is the right thing to do.
   */
  private isOverlapViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('facility_bookings_no_overlap') ||
      message.includes('conflicting key value violates exclusion constraint')
    );
  }

  private effectiveCardStatus(
    status: AccessCardStatus,
    expiresAt: Date | null,
    now: Date,
  ): AccessCardStatus {
    if (
      status === AccessCardStatus.REVOKED ||
      status === AccessCardStatus.LOST
    ) {
      return status;
    }
    if (expiresAt && expiresAt <= now) return AccessCardStatus.EXPIRED;
    return status;
  }

  private slotLabel(startsAt: Date, endsAt: Date): string {
    return `${formatMinutes(minutesNow(startsAt))}–${formatMinutes(minutesNow(endsAt))}`;
  }

  private facilityView(row: {
    id: string;
    name: string;
    kind: FacilityKind;
    description: string | null;
    capacity: number | null;
    opensAtMinutes: number;
    closesAtMinutes: number;
    slotMinutes: number;
    maxAdvanceDays: number;
    requiresApproval: boolean;
    isBookable: boolean;
    isActive: boolean;
    bookingFee: Prisma.Decimal | null;
    bookingFeeCurrency: string | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      description: row.description,
      capacity: row.capacity,
      opensAtMinutes: row.opensAtMinutes,
      closesAtMinutes: row.closesAtMinutes,
      slotMinutes: row.slotMinutes,
      maxAdvanceDays: row.maxAdvanceDays,
      requiresApproval: row.requiresApproval,
      isBookable: row.isBookable,
      isActive: row.isActive,
      bookingFee: row.bookingFee == null ? null : Number(row.bookingFee),
      bookingFeeCurrency: row.bookingFeeCurrency,
      opensAtLabel: formatMinutes(row.opensAtMinutes),
      closesAtLabel: formatMinutes(row.closesAtMinutes),
    };
  }

  private bookingView(row: {
    id: string;
    reference: string;
    facilityId: string;
    bookedByUserId: string | null;
    bookedForName: string;
    bookedForPhone: string | null;
    purpose: string | null;
    attendeeCount: number | null;
    startsAt: Date;
    endsAt: Date;
    status: FacilityBookingStatus;
    decisionNote: string | null;
    decidedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
    fee: Prisma.Decimal | null;
    feeCurrency: string | null;
    createdAt: Date;
    facility?: {
      id: string;
      name: string;
      kind: FacilityKind;
      propertyId: string;
      requiresApproval: boolean;
    };
    tenant?: {
      id: string;
      surname: string;
      otherNames: string | null;
      code: string;
      phone: string;
    } | null;
    contact?: {
      id: string;
      firstName: string;
      lastName: string;
      company: string | null;
      phone: string | null;
    } | null;
    bookedByUser?: { id: string; firstName: string; lastName: string } | null;
    decidedByUser?: { id: string; firstName: string; lastName: string } | null;
  }) {
    const timing = bookingTiming(row.startsAt, row.endsAt);

    return {
      id: row.id,
      reference: row.reference,
      facilityId: row.facilityId,
      facility: row.facility ?? null,
      bookedByUserId: row.bookedByUserId,
      bookedByUser: row.bookedByUser ?? null,
      tenant: row.tenant ?? null,
      contact: row.contact ?? null,
      bookedForName: row.bookedForName,
      bookedForPhone: row.bookedForPhone,
      purpose: row.purpose,
      attendeeCount: row.attendeeCount,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      slotLabel: this.slotLabel(row.startsAt, row.endsAt),
      status: row.status,
      statusLabel: BOOKING_STATUS_LABEL[row.status],
      statusAdvice: BOOKING_STATUS_ADVICE[row.status],
      decisionNote: row.decisionNote,
      decidedAt: row.decidedAt,
      decidedByUser: row.decidedByUser ?? null,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      fee: row.fee == null ? null : Number(row.fee),
      feeCurrency: row.feeCurrency,
      createdAt: row.createdAt,
      /** Derived, never stored — the whole reason there is no COMPLETED state. */
      timing,
      isPast: timing.hasEnded,
      /** Which actions the server would accept; the row menu reads exactly this. */
      availableActions: availableActions({
        status: row.status,
        endsAt: row.endsAt,
      }),
    };
  }

  private cardView(
    row: {
      id: string;
      cardNumber: string;
      type: AccessCardType;
      status: AccessCardStatus;
      holder: AccessCardHolder;
      holderName: string;
      issuedAt: Date;
      expiresAt: Date | null;
      lastSeenAt: Date | null;
      suspendedAt: Date | null;
      revokedAt: Date | null;
      revokedReason: string | null;
      replacementCardId: string | null;
      notes: string | null;
      property?: { id: string; code: string; name: string } | null;
      unit?: { id: string; code: string; name: string } | null;
      facility?: { id: string; name: string; kind: FacilityKind } | null;
      visitor?: {
        id: string;
        firstName: string;
        lastName: string;
        isBlacklisted?: boolean;
      } | null;
      tenant?: {
        id: string;
        surname: string;
        otherNames: string | null;
        code: string;
      } | null;
      contact?: {
        id: string;
        firstName: string;
        lastName: string;
        company: string | null;
      } | null;
      user?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      } | null;
      visits?: Array<{
        id: string;
        createdAt: Date;
        checkedInAt: Date | null;
        checkedOutAt: Date | null;
      }>;
    },
    now: Date,
  ) {
    const effectiveStatus = this.effectiveCardStatus(
      row.status,
      row.expiresAt,
      now,
    );
    const daysUntilExpiry = row.expiresAt
      ? Math.floor((row.expiresAt.getTime() - now.getTime()) / 86400000)
      : null;
    // False on a terminal state. A revoked card whose date is three weeks out is
    // not "expiring soon" — it opens nothing, and a renewal nudge on it would send
    // somebody to renew access that was deliberately ended.
    const terminal =
      effectiveStatus === AccessCardStatus.REVOKED ||
      effectiveStatus === AccessCardStatus.LOST;

    return {
      id: row.id,
      cardNumber: row.cardNumber,
      type: row.type,
      status: row.status,
      effectiveStatus,
      statusLabel: ACCESS_CARD_STATUS_LABEL[effectiveStatus],
      /** Only an effective ACTIVE card opens anything. Drives the gate list. */
      isUsable: effectiveStatus === AccessCardStatus.ACTIVE,
      holder: row.holder,
      holderName: row.holderName,
      property: row.property ?? null,
      unit: row.unit ?? null,
      facility: row.facility ?? null,
      tenant: row.tenant ?? null,
      contact: row.contact ?? null,
      user: row.user ?? null,
      visitor: row.visitor ?? null,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      suspendedAt: row.suspendedAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason,
      replacementCardId: row.replacementCardId,
      notes: row.notes,
      daysUntilExpiry,
      /** False on a terminal state — see the note where `terminal` is computed. */
      expiringSoon:
        !terminal &&
        daysUntilExpiry !== null &&
        daysUntilExpiry > 0 &&
        daysUntilExpiry <= 30,
      /** Nothing further will happen to this card, whatever its date says. */
      isTerminal: terminal,
      /** What a guard would say the card is for, in one line. */
      opensDescription:
        row.unit?.name ??
        row.facility?.name ??
        row.property?.name ??
        'Nothing recorded — this card opens nothing',
      recentVisits: row.visits ?? [],
    };
  }
}
