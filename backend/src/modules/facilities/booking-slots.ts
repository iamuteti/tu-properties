/**
 * Module 13 — when a facility is available, and whether two bookings collide.
 *
 * Everything here is pure, integer-based and free of any notion of which property,
 * organization or database it is running for. That is not stylistic: this is the
 * only code in the module that can say whether a booking is *allowed*, and it is
 * the code most worth being sure about, so it has to be readable and testable
 * without a database. The service's job is to load the facility, its existing
 * bookings and its blackouts, hand them to these functions, and turn a refusal
 * into a sentence naming what collided.
 *
 * **The guarantee itself is not in this file.** The database carries a GiST
 * exclusion constraint (`facility_bookings_no_overlap`) that makes overlapping
 * bookings impossible regardless of what this code decides — see the migration.
 * These functions exist to produce a *good refusal message* and to catch the
 * ordinary cases before a database round-trip; the constraint is what makes the
 * check honest when two requests arrive at the same instant.
 */

/** A facility's opening hours, in minutes from local midnight. */
export interface OpeningHours {
  opensAtMinutes: number;
  closesAtMinutes: number;
  /** The booking grid: a 60-minute facility can only be booked on the hour. */
  slotMinutes: number;
}

/** A half-open interval `[startsAt, endsAt)`. */
export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

/** Something already on the diary that a new booking has to fit around. */
export interface OccupiedRange extends TimeRange {
  id: string;
  /** What to call it in a refusal message. */
  label: string;
}

export const MINUTES_PER_DAY = 1440;

export interface SlotCheck {
  ok: boolean;
  /** Minutes from local midnight, snapped down onto the facility's grid. */
  startsAtMinutes: number;
  endsAtMinutes: number;
  /** Which whole grid slots this booking occupies, ascending. */
  slots: number[];
  /** Populated only when `ok` is false. Written for the person who pressed the button. */
  reason: string | null;
  /** Machine-readable companion to `reason`, for the client to branch on. */
  code:
    | null
    | 'INVALID_RANGE'
    | 'NOT_BOOKABLE'
    | 'IN_THE_PAST'
    | 'TOO_FAR_AHEAD'
    | 'OUTSIDE_OPENING_HOURS'
    | 'NOT_ON_SLOT_GRID'
    | 'MISALIGNED_TO_GRID'
    | 'BLACKED_OUT'
    | 'CLASHES'
    | 'AT_CAPACITY';
}

const fail = (
  code: NonNullable<SlotCheck['code']>,
  reason: string,
  startsAtMinutes: number,
  endsAtMinutes: number,
): SlotCheck => ({
  ok: false,
  startsAtMinutes,
  endsAtMinutes,
  slots: [],
  reason,
  code,
});

const ok = (
  startsAtMinutes: number,
  endsAtMinutes: number,
  slots: number[],
): SlotCheck => ({
  ok: true,
  startsAtMinutes,
  endsAtMinutes,
  slots,
  reason: null,
  code: null,
});

/** `720` → `"12:00"`. Used in every refusal message so the hours are quotable. */
export function formatMinutes(minutes: number): string {
  const normalised =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalised / 60);
  const mins = normalised % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Minutes since local midnight for a `Date`, read in the server's local zone. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** `10:30` on the given date. Used to build the refusals' comparison values. */
export function atMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Do two half-open intervals overlap?
 *
 * `a.endsAt === b.startsAt` is **not** an overlap. That single rule is what lets
 * a clubhouse be booked 10:00–12:00 and 12:00–14:00 back to back, which is every
 * diary anybody draws; getting it wrong is the off-by-one that makes a booking
 * system unusable for exactly the bookings people want to make.
 */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** Which of `ranges` collide with `candidate`, in the order given. */
export function findOverlaps(
  candidate: TimeRange,
  ranges: OccupiedRange[],
): OccupiedRange[] {
  return ranges.filter((range) => overlaps(candidate, range));
}

/**
 * Snap a start time down onto the facility's grid.
 *
 * Snapping **down** rather than to the nearest is deliberate: rounding 10:50 up to
 * 11:00 would silently move a resident's booking an hour later than they asked
 * for, and nobody notices until they turn up at the wrong time.
 */
export function snapDown(minutes: number, slotMinutes: number): number {
  return Math.floor(minutes / slotMinutes) * slotMinutes;
}

export interface SlotCheckInput {
  hours: OpeningHours;
  /** The window being asked for, as sent by the caller. */
  startsAt: Date;
  endsAt: Date;
  /** Bookings that hold a slot, already narrowed to the relevant days. */
  booked?: OccupiedRange[];
  /** Closures, same shape. */
  blackouts?: OccupiedRange[];
  /** How far ahead the facility allows. Omit to skip that check. */
  maxAdvanceDays?: number;
  isBookable?: boolean;
  /** Maximum simultaneous bookings; 1 for a room that can hold one party. */
  capacity?: number;
  /** Default `new Date()`. A parameter so the past/future checks are testable. */
  now?: Date;
}

/**
 * Every way a slot can be refused, in the order that produces the most useful
 * message, and the one function that produces an allowed slot.
 *
 * Order matters more than it looks. Opening hours are checked before clashes, so
 * "the clubhouse closes at 22:00" is never reported as "that slot is taken" when
 * the real problem is that the caller asked for a time the facility does not
 * exist at. And `TOO_FAR_AHEAD` precedes both, because a booking for next year on
 * a facility with a 90-day horizon is a different conversation from a booking for
 * next Tuesday.
 */
export function checkSlot(input: SlotCheckInput): SlotCheck {
  const { hours, startsAt, endsAt } = input;
  const now = input.now ?? new Date();

  if (input.isBookable === false) {
    return fail(
      'NOT_BOOKABLE',
      'This facility is not bookable — it is on the register so its access cards have something to point at, but nobody can reserve it.',
      0,
      0,
    );
  }

  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    return fail(
      'INVALID_RANGE',
      'The start time is not a date the server understands.',
      0,
      0,
    );
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    return fail(
      'INVALID_RANGE',
      'The end time is not a date the server understands.',
      0,
      0,
    );
  }
  if (endsAt <= startsAt) {
    return fail(
      'INVALID_RANGE',
      'The booking ends at or before it starts, so it would hold no time at all. To book a single slot, send the end one slot after the start.',
      minutesOfDay(startsAt),
      minutesOfDay(endsAt),
    );
  }

  if (startsAt <= now) {
    return fail(
      'IN_THE_PAST',
      'That slot has already started. Bookings are for time that has not happened yet.',
      minutesOfDay(startsAt),
      minutesOfDay(endsAt),
    );
  }

  if (input.maxAdvanceDays != null) {
    const horizon = new Date(now.getTime() + input.maxAdvanceDays * 86400000);
    if (startsAt > horizon) {
      return fail(
        'TOO_FAR_AHEAD',
        `This facility can only be booked ${input.maxAdvanceDays} days ahead, so ${startsAt.toISOString().slice(0, 10)} is beyond the horizon.`,
        minutesOfDay(startsAt),
        minutesOfDay(endsAt),
      );
    }
  }

  // A booking that spans midnight is refused rather than supported. Half-open
  // ranges make it *expressible*, but "the clubhouse is booked from 22:00 to
  // 02:00" is either two bookings or a facility with different hours on
  // different days, and neither is a thing this module should guess at.
  if (!sameLocalDay(startsAt, endsAt)) {
    return fail(
      'INVALID_RANGE',
      `A booking has to start and end on the same day. ${startsAt.toISOString().slice(0, 10)} to ${endsAt.toISOString().slice(0, 10)} crosses midnight, which is a closure or a second booking rather than one slot.`,
      minutesOfDay(startsAt),
      minutesOfDay(endsAt),
    );
  }

  const startsAtMinutes = minutesOfDay(startsAt);
  // The same-day check above has already established that these two agree on which
  // day they are, so minutes-from-midnight is a faithful linear comparison here and
  // `endsAtMinutes > startsAtMinutes` follows from `endsAt > startsAt`. No
  // normalisation is needed or wanted: a zero-length request was refused above
  // rather than being quietly widened into something the caller did not ask for.
  const endsAtMinutes = minutesOfDay(endsAt);

  if (
    startsAtMinutes < hours.opensAtMinutes ||
    endsAtMinutes > hours.closesAtMinutes
  ) {
    return fail(
      'OUTSIDE_OPENING_HOURS',
      `${formatMinutes(startsAtMinutes)}–${formatMinutes(endsAtMinutes)} is outside this facility's hours. It is open ${formatMinutes(hours.opensAtMinutes)}–${formatMinutes(hours.closesAtMinutes)}.`,
      startsAtMinutes,
      endsAtMinutes,
    );
  }

  if (startsAtMinutes % hours.slotMinutes !== 0) {
    return fail(
      'NOT_ON_SLOT_GRID',
      `Bookings start on ${hours.slotMinutes}-minute boundaries, and ${formatMinutes(startsAtMinutes)} is not one. The nearest one is ${formatMinutes(snapDown(startsAtMinutes, hours.slotMinutes))}.`,
      startsAtMinutes,
      endsAtMinutes,
    );
  }

  if (endsAtMinutes % hours.slotMinutes !== 0) {
    return fail(
      'MISALIGNED_TO_GRID',
      `A ${hours.slotMinutes}-minute facility cannot be booked for ${endsAtMinutes - startsAtMinutes} minutes. Whole slots only — ${(endsAtMinutes - startsAtMinutes) / hours.slotMinutes} of them.`,
      startsAtMinutes,
      endsAtMinutes,
    );
  }

  const startsAtDate = atMinutes(startsAt, startsAtMinutes);
  const endsAtDate = atMinutes(endsAt, endsAtMinutes);
  const candidate: TimeRange = { startsAt: startsAtDate, endsAt: endsAtDate };

  const slots: number[] = [];
  for (
    let minute = startsAtMinutes;
    minute < endsAtMinutes;
    minute += hours.slotMinutes
  ) {
    slots.push(minute);
  }

  const blackoutClashes = findOverlaps(candidate, input.blackouts ?? []);
  if (blackoutClashes.length > 0) {
    const first = blackoutClashes[0];
    return fail(
      'BLACKED_OUT',
      `The facility is closed for ${first.label}. Choose another time or lift the closure first.`,
      startsAtMinutes,
      endsAtMinutes,
    );
  }

  const clashes = findOverlaps(candidate, input.booked ?? []);
  const limit = input.capacity ?? 1;
  if (clashes.length >= limit) {
    return fail(
      'CLASHES',
      limit === 1
        ? `That slot is already taken by ${clashes[0].label}. A slot can only be held once, so pick another time.`
        : `That slot already has ${clashes.length} booking${clashes.length === 1 ? '' : 's'} and the limit is ${limit}.`,
      startsAtMinutes,
      endsAtMinutes,
    );
  }

  return ok(startsAtMinutes, endsAtMinutes, slots);
}

/** A slot as it appears in a diary: the grid positions and the real timestamps. */
export interface SlotShape {
  startsAt: Date;
  endsAt: Date;
  startsAtMinutes: number;
  endsAtMinutes: number;
  label: string;
}

/**
 * Turn a validated request into the timestamps to persist.
 *
 * `endsAt` is **computed**, never taken from the request. Everything above
 * establishes that the requested end agrees with the grid; writing what was
 * computed rather than what was sent means a row cannot exist whose `endsAt`
 * disagrees with its own `startsAt` and its facility's `slotMinutes`, which is
 * the shape of bug that only shows up as an unexplained conflict three months
 * later.
 *
 * Assumes `checkSlot` has already passed. That is why the normalisation is gone:
 * with the same-day and non-empty guarantees behind it, minutes-from-midnight is
 * linear, and re-deriving a "corrected" end here would only ever disagree with the
 * caller about what they asked for.
 */
export function shapeSlot(
  hours: OpeningHours,
  startsAt: Date,
  endsAt: Date,
): SlotShape {
  const startsAtMinutes = minutesOfDay(startsAt);
  const endsAtMinutes = minutesOfDay(endsAt);

  const starts = atMinutes(startsAt, startsAtMinutes);
  const ends = atMinutes(endsAt, endsAtMinutes);

  return {
    startsAt: starts,
    endsAt: ends,
    startsAtMinutes,
    endsAtMinutes,
    label: `${formatMinutes(startsAtMinutes)}–${formatMinutes(endsAtMinutes)}`,
  };
}

export interface DayAvailability {
  /** `YYYY-MM-DD` in local time. */
  date: string;
  isOpen: boolean;
  /** Why the day is closed, for the calendar to show rather than leaving a blank. */
  reason: string | null;
  slots: {
    minutes: number;
    label: string;
    available: boolean;
    bookedBy: string | null;
  }[];
}

/**
 * The diary: every grid slot across the given days, each saying whether it is free.
 *
 * A facility's opening hours are the same on every day it exists, so the input is
 * just the days themselves rather than a `{ from, to }` pair per day. An earlier
 * shape carried `to` and nothing read it — which is the kind of field that later gets
 * read for something it was never meant to mean.
 *
 * A SQL `generate_series` left join would answer this too, but it is unreadable and
 * untestable; here it is a loop over integers with one overlap test, which is why
 * the slot grid lives in minutes rather than as a `Duration` column.
 *
 * Slots wholly inside a blackout are marked unavailable rather than dropped, so the
 * calendar can grey out "closed" instead of leaving a hole somebody has to guess the
 * meaning of.
 */
export function buildAvailability(
  hours: OpeningHours,
  days: Date[],
  booked: OccupiedRange[] = [],
  blackouts: OccupiedRange[] = [],
): DayAvailability[] {
  return days.map((from) => {
    const date = [
      from.getFullYear(),
      String(from.getMonth() + 1).padStart(2, '0'),
      String(from.getDate()).padStart(2, '0'),
    ].join('-');

    const dayBlackouts = blackouts.filter(
      (b) => sameLocalDay(b.startsAt, from) || sameLocalDay(b.endsAt, from),
    );

    const slots: DayAvailability['slots'] = [];
    for (
      let minute = hours.opensAtMinutes;
      minute < hours.closesAtMinutes;
      minute += hours.slotMinutes
    ) {
      const slotStart = atMinutes(from, minute);
      const slotEnd = atMinutes(from, minute + hours.slotMinutes);
      const range: TimeRange = { startsAt: slotStart, endsAt: slotEnd };

      const blackout = findOverlaps(range, dayBlackouts);
      const holders = findOverlaps(range, booked);

      slots.push({
        minutes: minute,
        label: formatMinutes(minute),
        available: blackout.length === 0 && holders.length === 0,
        bookedBy: holders.length > 0 ? holders[0].label : null,
      });
    }

    const isOpen = hours.closesAtMinutes > hours.opensAtMinutes;
    return {
      date,
      isOpen,
      reason: isOpen
        ? null
        : `Closed all day (${formatMinutes(hours.opensAtMinutes)}–${formatMinutes(hours.closesAtMinutes)}).`,
      slots,
    };
  });
}

/**
 * How far ahead the diary runs.
 *
 * `buildAvailability` above returns exactly the days it is handed, which is right
 * for a caller that has already decided its window. This is for the caller that has
 * not — the day sheet, which should show the facility's own horizon rather than an
 * arbitrary month.
 *
 * `maxAdvanceDays` is accepted but not used to clamp: a caller asking for 14 days of
 * a 7-day horizon wants to see the horizon end and a blank after it, not a silent
 * short return that looks like a bug. The availability read tells such a caller which
 * is which.
 */
export function horizonDays(
  maxAdvanceDays: number,
  now = new Date(),
  count = 14,
): Date[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + index,
    );
    day.setHours(0, 0, 0, 0);
    return day;
  });
}
