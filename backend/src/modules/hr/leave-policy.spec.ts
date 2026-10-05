import {
  accruedBy,
  availableDays,
  checkLeaveRequest,
  dateKey,
  isoDayOf,
  leaveBalance,
  overlappingDays,
  workingDaysBetween,
  type LeavePolicyInput,
  type WorkingCalendar,
} from './leave-policy';

/**
 * Worked examples rather than any one jurisdiction's rules. The weekend, the
 * entitlement and the holidays are all arguments here precisely because none of
 * them is universal — pinning a test to "Kenya has Saturday off" would be the same
 * mistake the module is built to avoid.
 */

/** Saturday and Sunday, ISO 6 and 7. */
const satSun: WorkingCalendar = { weekendDays: [6, 7], holidayDates: [] };

/** Sunday only — the Gulf and much of India. */
const sundayOnly: WorkingCalendar = { weekendDays: [7], holidayDates: [] };

/** Thursday and Friday — much of the Gulf weekend. */
const thuFri: WorkingCalendar = { weekendDays: [4, 5], holidayDates: [] };

const policy: LeavePolicyInput = {
  annualEntitlementDays: 21,
  carryoverLimitDays: 5,
  minNoticeDays: 7,
  minNoticeWaivedDays: 1,
  unpaidAllowed: true,
};

describe('isoDayOf', () => {
  it('is ISO-8601: Monday 1, Sunday 7', () => {
    expect(isoDayOf(new Date('2026-03-02T00:00:00Z'))).toBe(1);
    expect(isoDayOf(new Date('2026-03-07T00:00:00Z'))).toBe(6);
    expect(isoDayOf(new Date('2026-03-08T00:00:00Z'))).toBe(7);
  });
});

describe('workingDaysBetween', () => {
  it('counts an inclusive range', () => {
    // Mon 2 Mar – Fri 6 Mar 2026 is five working days.
    expect(workingDaysBetween('2026-03-02', '2026-03-06', satSun)).toBe(5);
  });

  it('is inclusive at both ends, which is the part people get wrong', () => {
    expect(workingDaysBetween('2026-03-02', '2026-03-02', satSun)).toBe(1);
  });

  it('counts both the Friday and the Monday of a long weekend', () => {
    // Fri 6 Mar – Mon 9 Mar 2026 is two working days, not zero and not one:
    // the weekend days in between are not working days, but the two ends are.
    expect(workingDaysBetween('2026-03-06', '2026-03-09', satSun)).toBe(2);
  });

  it('gives zero for a pure weekend', () => {
    expect(workingDaysBetween('2026-03-07', '2026-03-08', satSun)).toBe(0);
  });

  it('is zero for a reversed range rather than negative', () => {
    expect(workingDaysBetween('2026-03-09', '2026-03-02', satSun)).toBe(0);
  });

  it('uses the weekend it is given, not the one it assumes', () => {
    // Fri 6 – Sat 7 Mar 2026, against three different weekends.
    // Sunday-only: neither day is a weekend day → 2.
    // Saturday/Sunday: Friday works, Saturday does not → 1.
    // Thursday/Friday: Friday is a weekend day, Saturday is not → 1.
    // The same range is a different length in every one of them, which is the
    // whole reason the weekend is an input.
    expect(workingDaysBetween('2026-03-06', '2026-03-07', sundayOnly)).toBe(2);
    expect(workingDaysBetween('2026-03-06', '2026-03-07', satSun)).toBe(1);
    expect(workingDaysBetween('2026-03-06', '2026-03-07', thuFri)).toBe(1);
  });

  it('excludes public holidays', () => {
    const calendar: WorkingCalendar = {
      ...satSun,
      holidayDates: ['2026-04-03'],
    };

    // Mon 30 Mar – Fri 3 Apr is five days without the holiday.
    expect(workingDaysBetween('2026-03-30', '2026-04-03', satSun)).toBe(5);
    expect(workingDaysBetween('2026-03-30', '2026-04-03', calendar)).toBe(4);
  });

  it('spans a year boundary', () => {
    // Mon 28 Dec 2026 – Fri 1 Jan 2027.
    expect(workingDaysBetween('2026-12-28', '2027-01-01', satSun)).toBe(5);
  });
});

describe('overlappingDays', () => {
  it('returns only the shared dates', () => {
    const days = overlappingDays(
      { start: '2026-03-02', end: '2026-03-06' },
      { start: '2026-03-05', end: '2026-03-10' },
    );

    expect(days).toEqual(['2026-03-05', '2026-03-06']);
  });

  it('is empty for ranges that merely touch the same weekend', () => {
    const days = overlappingDays(
      { start: '2026-03-02', end: '2026-03-06' },
      { start: '2026-03-09', end: '2026-03-13' },
    );

    expect(days).toEqual([]);
  });
});

describe('availableDays', () => {
  it('is the entitlement when nothing carries over', () => {
    expect(availableDays(policy)).toEqual({
      available: 21,
      carriedIn: 0,
      expired: 0,
    });
  });

  it('adds carryover up to the cap', () => {
    expect(availableDays(policy, 3).available).toBe(24);
  });

  it('reports what the carryover cap destroyed', () => {
    // Eight unused days against a cap of five: three of somebody's leave just
    // stops existing, and the balance has to say so rather than quietly
    // showing 21.
    expect(availableDays(policy, 8)).toEqual({
      available: 26,
      carriedIn: 5,
      expired: 3,
    });
  });

  it('treats a missing cap as no cap', () => {
    expect(availableDays({ annualEntitlementDays: 20 }, 40).available).toBe(60);
  });

  it('survives a fractional entitlement', () => {
    expect(availableDays({ annualEntitlementDays: 22.5 }).available).toBe(22.5);
  });
});

describe('leaveBalance', () => {
  const calendar = satSun;
  const onDate = new Date('2026-06-15T00:00:00Z');

  it('counts taken and booked separately', () => {
    const balance = leaveBalance({
      policy,
      calendar,
      onDate,
      approved: [
        { start: '2026-03-02', end: '2026-03-06' }, // past: 5 days
        { start: '2026-08-03', end: '2026-08-07' }, // future: 5 days
      ],
      unusedFromLastYear: 2,
    });

    expect(balance.taken).toBe(5);
    expect(balance.booked).toBe(5);
    expect(balance.entitlement).toBe(21);
    expect(balance.carriedIn).toBe(2);
    // 21 + 2 − 5 − 5.
    expect(balance.remaining).toBe(13);
  });

  it('subtracts booked leave as well as taken, so the same December cannot be approved twice', () => {
    const balance = leaveBalance({
      policy: { annualEntitlementDays: 10 },
      calendar,
      onDate,
      approved: [{ start: '2026-12-01', end: '2026-12-11' }],
    });

    expect(balance.taken).toBe(0);
    expect(balance.booked).toBe(9);
    expect(balance.remaining).toBe(1);
  });

  it('ignores a zero-day range', () => {
    const balance = leaveBalance({
      policy: { annualEntitlementDays: 10 },
      calendar,
      onDate,
      approved: [{ start: '2026-03-07', end: '2026-03-08' }],
    });

    expect(balance.taken).toBe(0);
    expect(balance.remaining).toBe(10);
  });
});

describe('checkLeaveRequest', () => {
  // A verified Monday–Friday in 2027, so the expected counts are real calendar
  // facts rather than an assumption about which day a date falls on.
  const MON = '2027-03-08';
  const FRI = '2027-03-12';

  it('grants a request inside the balance', () => {
    const check = checkLeaveRequest({
      policy,
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(true);
    expect(check.workingDays).toBe(5);
    expect(check.remaining).toBe(16);
  });

  it('refuses a range with no working days and says why', () => {
    // Sat 13 – Sun 14 March 2027, a pure weekend.
    const check = checkLeaveRequest({
      policy,
      calendar: satSun,
      start: '2027-03-13',
      end: '2027-03-14',
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('no working days');
  });

  it('counts existing leave in the same year', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 8 },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      // Mon 4 – Fri 8 Jan 2027, also five working days.
      allApproved: [{ start: '2027-01-04', end: '2027-01-08' }],
    });

    // 8 entitlement against 10 days wanted.
    expect(check.allowed).toBe(false);
    expect(check.workingDays).toBe(5);
    expect(check.totalInYear).toBe(10);
  });

  it('does not count leave from another year', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 10 },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [{ start: '2026-12-01', end: '2026-12-11' }],
    });

    expect(check.allowed).toBe(true);
  });

  it('refuses two people being away at once', () => {
    const check = checkLeaveRequest({
      policy,
      calendar: satSun,
      start: '2027-03-09',
      end: '2027-03-11',
      existing: [],
      allApproved: [{ start: '2027-03-10', end: '2027-03-12' }],
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('cannot be away twice');
  });

  it('allows a clash that falls entirely on the weekend', () => {
    // The commonest false positive a naive overlap check produces: Sat 6 – Mon 8
    // March shares Sat and Sun with Fri 5 – Sun 7 March, and no working day.
    const check = checkLeaveRequest({
      policy,
      calendar: satSun,
      start: '2027-03-06',
      end: MON,
      existing: [],
      allApproved: [{ start: '2027-03-05', end: '2027-03-07' }],
    });

    expect(check.allowed).toBe(true);
  });

  it('refuses a request that exhausts the balance, and says by how much', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 4 },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('short');
    expect(check.reason).toContain('unpaid');
  });

  it('allows a request that exactly uses the balance', () => {
    // Spending the entitlement to the day is not overspending.
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 5 },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(0);
  });

  it('lets an unpaid request exceed the balance when the policy allows it', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 5, unpaidAllowed: true },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
      leaveType: 'UNPAID',
    });

    expect(check.allowed).toBe(true);
  });

  it('refuses unpaid leave when the policy forbids it', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 21, unpaidAllowed: false },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
      leaveType: 'UNPAID',
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('does not allow unpaid leave');
  });

  it('enforces notice on a long request', () => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date(start);
    end.setDate(end.getDate() + 20);

    const check = checkLeaveRequest({
      policy: { ...policy, minNoticeDays: 7, minNoticeWaivedDays: 1 },
      calendar: satSun,
      start,
      end,
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('notice');
  });

  it('waives notice for a one-day request', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 1);

    const check = checkLeaveRequest({
      policy: { ...policy, minNoticeDays: 7, minNoticeWaivedDays: 1 },
      calendar: satSun,
      start: soon,
      end: soon,
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(true);
  });

  it('enforces a maximum consecutive length', () => {
    // Mon 1 – Fri 12 March 2027 is ten working days.
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 30, maxConsecutiveDays: 5 },
      calendar: satSun,
      start: '2027-03-01',
      end: '2027-03-12',
      existing: [],
      allApproved: [],
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('split');
  });

  it('always explains itself', () => {
    const check = checkLeaveRequest({
      policy: { annualEntitlementDays: 1 },
      calendar: satSun,
      start: MON,
      end: FRI,
      existing: [],
      allApproved: [],
    });

    expect(check.reason).toBeTruthy();
    expect(check.reason!.length).toBeGreaterThan(30);
  });
});

describe('accruedBy', () => {
  const yearStart = new Date('2026-01-01T00:00:00Z');
  const yearEnd = new Date('2026-12-31T00:00:00Z');

  it('is nothing on the first day of the year', () => {
    expect(
      accruedBy({ annualEntitlementDays: 24 }, yearStart, yearStart, yearEnd),
    ).toBe(0);
  });

  it('is about half at the halfway point', () => {
    const mid = new Date('2026-07-02T00:00:00Z');
    expect(
      accruedBy({ annualEntitlementDays: 24 }, mid, yearStart, yearEnd),
    ).toBeCloseTo(12, 1);
  });

  it('is the whole entitlement at the end of the year', () => {
    expect(
      accruedBy({ annualEntitlementDays: 24 }, yearEnd, yearStart, yearEnd),
    ).toBe(24);
  });

  it('does not exceed the entitlement for a date past the year', () => {
    const past = new Date('2027-06-01T00:00:00Z');
    expect(
      accruedBy({ annualEntitlementDays: 24 }, past, yearStart, yearEnd),
    ).toBe(24);
  });
});

describe('dateKey', () => {
  it('is the UTC calendar date', () => {
    expect(dateKey(new Date('2026-03-02T23:30:00Z'))).toBe('2026-03-02');
  });
});
