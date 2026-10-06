import {
  MINUTES_PER_DAY,
  atMinutes,
  buildAvailability,
  checkSlot,
  findOverlaps,
  formatMinutes,
  horizonDays,
  minutesOfDay,
  overlaps,
  shapeSlot,
  snapDown,
  type OccupiedRange,
  type OpeningHours,
  type TimeRange,
} from './booking-slots';

/**
 * Module 13 — booking slot rules.
 *
 * The dates are built with `atMinutes` rather than written as ISO strings so the
 * tests run in the machine's own time zone. A slot diary that only passes at UTC+0
 * is a slot diary that fails for half the world, and these functions read local
 * wall-clock minutes on purpose.
 */

/** 08:00–22:00, hourly slots — the default facility. */
const HOURS: OpeningHours = {
  opensAtMinutes: 480,
  closesAtMinutes: 1320,
  slotMinutes: 60,
};

const NOW = new Date(2026, 5, 1, 9, 0, 0, 0); // 1 June 2026, 09:00 local

/** A day in the future, so nothing trips the "in the past" rule. */
const DAY = new Date(2026, 5, 10, 0, 0, 0, 0);

const range = (startMinutes: number, endMinutes: number): TimeRange => ({
  startsAt: atMinutes(DAY, startMinutes),
  endsAt: atMinutes(DAY, endMinutes),
});

const occupied = (
  id: string,
  label: string,
  startMinutes: number,
  endMinutes: number,
): OccupiedRange => ({ id, label, ...range(startMinutes, endMinutes) });

const ask = (startMinutes: number, endMinutes: number, extra = {}) =>
  checkSlot({
    hours: HOURS,
    startsAt: atMinutes(DAY, startMinutes),
    endsAt: atMinutes(DAY, endMinutes),
    now: NOW,
    ...extra,
  });

describe('formatMinutes', () => {
  it('zero-pads to a readable clock time', () => {
    expect(formatMinutes(480)).toBe('08:00');
    expect(formatMinutes(1320)).toBe('22:00');
    expect(formatMinutes(0)).toBe('00:00');
  });

  it('renders a 24-hour facility without an overnight special case', () => {
    expect(formatMinutes(MINUTES_PER_DAY)).toBe('00:00');
    expect(formatMinutes(1439)).toBe('23:59');
  });
});

describe('minutesOfDay / atMinutes', () => {
  it('round-trips', () => {
    expect(minutesOfDay(atMinutes(DAY, 1234))).toBe(1234);
  });

  it('zeroes the seconds so a slot boundary is exact', () => {
    const messy = new Date(2026, 5, 10, 14, 30, 45, 123);
    expect(minutesOfDay(atMinutes(messy, 870))).toBe(870);
  });
});

describe('overlaps', () => {
  it('detects a plain overlap', () => {
    expect(overlaps(range(600, 720), range(660, 780))).toBe(true);
  });

  it('treats abutting intervals as compatible — this is the half-open rule', () => {
    // 10:00-12:00 then 12:00-14:00 is every diary anybody draws. Getting this
    // wrong is the off-by-one that makes a booking system unusable.
    expect(overlaps(range(600, 720), range(720, 840))).toBe(false);
    expect(overlaps(range(720, 840), range(600, 720))).toBe(false);
  });

  it('detects containment in both directions', () => {
    expect(overlaps(range(600, 720), range(630, 660))).toBe(true);
    expect(overlaps(range(630, 660), range(600, 720))).toBe(true);
  });

  it('finds nothing for two empty diaries', () => {
    expect(overlaps(range(600, 660), range(720, 780))).toBe(false);
  });
});

describe('findOverlaps', () => {
  const diary = [
    occupied('a', 'FB-0001', 600, 720),
    occupied('b', 'FB-0002', 780, 840),
  ];

  it('returns only the colliding entries, in the order given', () => {
    const hits = findOverlaps(range(660, 800), diary);
    expect(hits.map((hit) => hit.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a free slot', () => {
    expect(findOverlaps(range(720, 780), diary)).toEqual([]);
  });
});

describe('snapDown', () => {
  it('snaps down, never up — rounding up would move a booking later than asked', () => {
    expect(snapDown(650, 60)).toBe(600);
    expect(snapDown(659, 60)).toBe(600);
    expect(snapDown(600, 60)).toBe(600);
  });

  it('respects a finer grid', () => {
    expect(snapDown(657, 15)).toBe(645);
  });
});

describe('checkSlot — refusals', () => {
  it('refuses a facility that is not bookable', () => {
    const result = ask(600, 660, { isBookable: false });
    expect(result.code).toBe('NOT_BOOKABLE');
    expect(result.reason).toContain('not bookable');
  });

  it('refuses an end at or before the start', () => {
    const result = ask(600, 600);
    expect(result.code).toBe('INVALID_RANGE');
    expect(result.reason).toContain('ends at or before it starts');
  });

  it('refuses a start in the past', () => {
    const result = checkSlot({
      hours: HOURS,
      startsAt: atMinutes(NOW, 480),
      endsAt: atMinutes(NOW, 540),
      now: NOW,
    });
    expect(result.code).toBe('IN_THE_PAST');
  });

  it('refuses a booking beyond the facility horizon and names the limit', () => {
    const far = new Date(2027, 0, 1, 0, 0, 0, 0);
    const result = checkSlot({
      hours: HOURS,
      startsAt: far,
      endsAt: new Date(2027, 0, 1, 1, 0, 0, 0),
      maxAdvanceDays: 90,
      now: NOW,
    });
    expect(result.code).toBe('TOO_FAR_AHEAD');
    expect(result.reason).toContain('90 days ahead');
  });

  it('refuses a booking that crosses midnight rather than guessing', () => {
    const result = checkSlot({
      hours: {
        opensAtMinutes: 0,
        closesAtMinutes: MINUTES_PER_DAY,
        slotMinutes: 60,
      },
      startsAt: atMinutes(DAY, 1320),
      endsAt: atMinutes(new Date(2026, 5, 11, 0, 0, 0, 0), 120),
      now: NOW,
    });
    expect(result.code).toBe('INVALID_RANGE');
    expect(result.reason).toContain('midnight');
  });

  it('refuses a slot before opening, quoting both sets of hours', () => {
    const result = ask(360, 420);
    expect(result.code).toBe('OUTSIDE_OPENING_HOURS');
    expect(result.reason).toContain('06:00–07:00');
    expect(result.reason).toContain('08:00–22:00');
  });

  it('refuses a slot running past closing', () => {
    expect(ask(1260, 1380).code).toBe('OUTSIDE_OPENING_HOURS');
  });

  it('allows a slot that ends exactly at closing time', () => {
    // Half-open again, on the facility's own hours: 21:00–22:00 is a real slot.
    expect(ask(1260, 1320).ok).toBe(true);
  });

  it('refuses a start that is not on the grid, and suggests the nearest one', () => {
    const result = ask(630, 690);
    expect(result.code).toBe('NOT_ON_SLOT_GRID');
    expect(result.reason).toContain('10:00');
  });

  it('refuses a duration that is not a whole number of slots', () => {
    const result = ask(600, 690);
    expect(result.code).toBe('MISALIGNED_TO_GRID');
    expect(result.reason).toContain('90 minutes');
  });

  it('works on a finer grid', () => {
    // 08:00–12:00 on a 15-minute grid, so a mid-morning off-grid time is inside
    // opening hours and the grid rule is what refuses it.
    const quarter: OpeningHours = {
      opensAtMinutes: 480,
      closesAtMinutes: 720,
      slotMinutes: 15,
    };
    // 10:05 is genuinely off a 15-minute grid.
    const off = checkSlot({
      hours: quarter,
      startsAt: atMinutes(DAY, 605),
      endsAt: atMinutes(DAY, 620),
      now: NOW,
    });
    expect(off.code).toBe('NOT_ON_SLOT_GRID');
    expect(off.reason).toContain('10:00');

    const on = checkSlot({
      hours: quarter,
      startsAt: atMinutes(DAY, 600),
      endsAt: atMinutes(DAY, 630),
      now: NOW,
    });
    expect(on.ok).toBe(true);
    expect(on.slots).toEqual([600, 615]);
  });
});

describe('checkSlot — blackouts', () => {
  it('refuses a slot inside a closure and names it', () => {
    const result = ask(600, 720, {
      blackouts: [occupied('bl', 'repainting the floor', 540, 780)],
    });
    expect(result.code).toBe('BLACKED_OUT');
    expect(result.reason).toContain('repainting the floor');
  });

  it('allows a slot that merely abuts a closure', () => {
    const result = ask(780, 840, {
      blackouts: [occupied('bl', 'repainting the floor', 540, 780)],
    });
    expect(result.ok).toBe(true);
  });

  it('prefers a closure over a clash — the facility being shut is the real answer', () => {
    const result = ask(600, 660, {
      blackouts: [occupied('bl', 'repainting the floor', 540, 780)],
      booked: [occupied('a', 'FB-0001', 600, 720)],
    });
    expect(result.code).toBe('BLACKED_OUT');
  });
});

describe('checkSlot — clashes', () => {
  it('refuses a slot somebody else holds, naming the holder', () => {
    const result = ask(660, 720, {
      booked: [occupied('a', 'FB-0001', 600, 720)],
    });
    expect(result.code).toBe('CLASHES');
    expect(result.reason).toContain('FB-0001');
  });

  it('allows a slot that abuts the next one', () => {
    expect(
      ask(720, 780, { booked: [occupied('a', 'FB-0001', 600, 720)] }).ok,
    ).toBe(true);
  });

  it('allows a multi-slot booking where the diary is clear throughout', () => {
    const result = ask(600, 780, {
      booked: [occupied('a', 'FB-0001', 840, 900)],
    });
    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([600, 660, 720]);
  });

  it('refuses a multi-slot booking that overlaps in the middle only', () => {
    const result = ask(600, 780, {
      booked: [occupied('a', 'FB-0001', 720, 780)],
    });
    expect(result.code).toBe('CLASHES');
  });

  it('respects a capacity above one', () => {
    // A facility that takes two simultaneous parties: a second booking fits, a
    // third does not. The comparison is on the booking being *added*, so
    // `clashes.length >= capacity` is what makes 1-into-2 legal and 2-into-2
    // not.
    expect(ask(600, 660, { booked: [], capacity: 2 }).ok).toBe(true);

    const one = [occupied('a', 'FB-0001', 600, 720)];
    expect(ask(600, 660, { booked: one, capacity: 2 }).ok).toBe(true);

    const two = [...one, occupied('b', 'FB-0002', 600, 720)];
    const full = ask(600, 660, { booked: two, capacity: 2 });
    expect(full.code).toBe('CLASHES');
    expect(full.reason).toContain('the limit is 2');

    // The same diary in a single-occupancy facility.
    expect(ask(600, 660, { booked: two, capacity: 1 }).code).toBe('CLASHES');
  });

  it('always reports a reason sentence alongside the code', () => {
    const result = ask(360, 420);
    expect(result.code).not.toBeNull();
    expect(result.reason).toBeTruthy();
    expect(result.reason!.endsWith('.')).toBe(true);
  });
});

describe('checkSlot — acceptance', () => {
  it('accepts a plain slot and reports the grid positions it occupies', () => {
    const result = ask(600, 780);
    expect(result.ok).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
    expect(result.startsAtMinutes).toBe(600);
    expect(result.endsAtMinutes).toBe(780);
    expect(result.slots).toEqual([600, 660, 720]);
  });

  it('refuses a same-moment request rather than inventing a slot for it', () => {
    // A zero-length half-open interval is the empty set: it would hold no time and
    // would collide with nothing forever. Widening it silently would mean the caller
    // got a booking they did not ask for.
    const result = ask(600, 600);
    expect(result.code).toBe('INVALID_RANGE');
    expect(result.reason).toContain('one slot after the start');
  });

  it('accepts the first slot of the day', () => {
    expect(ask(480, 540).ok).toBe(true);
  });
});

describe('shapeSlot', () => {
  it('computes the timestamps to persist rather than echoing the request', () => {
    const shape = shapeSlot(HOURS, atMinutes(DAY, 600), atMinutes(DAY, 780));
    expect(shape.startsAtMinutes).toBe(600);
    expect(shape.endsAtMinutes).toBe(780);
    expect(shape.label).toBe('10:00–13:00');
    expect(shape.startsAt.getHours()).toBe(10);
    expect(shape.endsAt.getHours()).toBe(13);
  });

  it('normalises a same-moment request only if it somehow reached shapeSlot', () => {
    // checkSlot refuses this shape, so in practice it cannot reach here. The
    // assertion documents that shapeSlot does not silently widen a request.
    const shape = shapeSlot(HOURS, atMinutes(DAY, 600), atMinutes(DAY, 600));
    expect(shape.endsAtMinutes).toBe(600);
    expect(shape.startsAt.getTime()).toBe(shape.endsAt.getTime());
  });

  it('strips seconds so the stored boundary is exactly on the grid', () => {
    const messy = new Date(2026, 5, 10, 10, 0, 42, 999);
    const shape = shapeSlot(HOURS, messy, messy);
    expect(shape.startsAt.getSeconds()).toBe(0);
    expect(shape.startsAt.getMilliseconds()).toBe(0);
  });
});

describe('buildAvailability', () => {
  it('lays out every grid slot across the day', () => {
    const [day] = buildAvailability(HOURS, [DAY]);
    expect(day.date).toBe('2026-06-10');
    expect(day.isOpen).toBe(true);
    expect(day.reason).toBeNull();
    // 08:00 to 22:00 on an hourly grid is 14 slots, and the last starts at 21:00.
    expect(day.slots).toHaveLength(14);
    expect(day.slots[0].label).toBe('08:00');
    expect(day.slots[13].label).toBe('21:00');
  });

  it('marks a held slot unavailable and names the holder', () => {
    const [day] = buildAvailability(
      HOURS,
      [DAY],
      [occupied('a', 'FB-0001 (Kariuki)', 600, 720)],
    );
    const ten = day.slots.find((slot) => slot.minutes === 600)!;
    expect(ten.available).toBe(false);
    expect(ten.bookedBy).toBe('FB-0001 (Kariuki)');

    const eleven = day.slots.find((slot) => slot.minutes === 660)!;
    expect(eleven.available).toBe(false);

    const twelve = day.slots.find((slot) => slot.minutes === 720)!;
    expect(twelve.available).toBe(true);
    expect(twelve.bookedBy).toBeNull();
  });

  it('greys out a slot inside a closure rather than dropping it', () => {
    const [day] = buildAvailability(
      HOURS,
      [DAY],
      [],
      [occupied('bl', 'repainting', 600, 660)],
    );
    const ten = day.slots.find((slot) => slot.minutes === 600)!;
    expect(ten.available).toBe(false);
    expect(day.slots).toHaveLength(14);
  });

  it('spans several days', () => {
    const days = buildAvailability(HOURS, [
      DAY,
      new Date(2026, 5, 11, 0, 0, 0, 0),
    ]);
    expect(days.map((day) => day.date)).toEqual(['2026-06-10', '2026-06-11']);
  });

  it('reports a facility that never opens', () => {
    const [day] = buildAvailability(
      { opensAtMinutes: 600, closesAtMinutes: 600, slotMinutes: 60 },
      [DAY],
    );
    expect(day.isOpen).toBe(false);
    expect(day.reason).toContain('Closed all day');
    expect(day.slots).toHaveLength(0);
  });

  it('supports a 24-hour facility with no overnight special case', () => {
    const [day] = buildAvailability(
      { opensAtMinutes: 0, closesAtMinutes: MINUTES_PER_DAY, slotMinutes: 60 },
      [DAY],
    );
    expect(day.slots).toHaveLength(24);
    expect(day.slots[0].label).toBe('00:00');
  });
});

describe('horizonDays', () => {
  it('returns consecutive days from today, at midnight', () => {
    const days = horizonDays(90, NOW, 3);
    expect(days).toHaveLength(3);
    expect(days[0].getDate()).toBe(1);
    expect(days[2].getDate()).toBe(3);
    expect(days[0].getHours()).toBe(0);
    expect(days[0].getMinutes()).toBe(0);
  });
});
