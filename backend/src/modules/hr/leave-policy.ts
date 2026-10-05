/**
 * Module 12 — leave arithmetic.
 *
 * Pure and country-agnostic in the same way `payroll-calc.ts` is: nothing here
 * knows what 21 days means anywhere. The entitlement, the carryover cap and the
 * weekend pattern all arrive as arguments, because they differ between countries,
 * between industries and often between two departments of one company.
 *
 * The rule this file exists to enforce is small and easy to get wrong by accident:
 *
 * **"five days of leave" means five *working* days, and working days are not
 * calendar days.** A request from Friday to Tuesday is one working day in the UK,
 * three in a country whose weekend is Thursday and Friday, and a different number
 * again once public holidays land. A hand-typed "5" that disagrees with the dates
 * is a rejected request with no visible reason, which is why `workingDays` is
 * derived here and never accepted from a caller.
 */

/** ISO-8601 day of week: Monday = 1 … Sunday = 7. */
export type IsoDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LeavePolicyInput {
  /** Working days per year. Fractional so 22.5 covers a half-day allowance. */
  annualEntitlementDays: number;
  /** How much unused entitlement may carry forward. Null = no cap. */
  carryoverLimitDays?: number | null;
  /** Notice required, in working days. */
  minNoticeDays?: number;
  /** A request this short or shorter skips the notice requirement. */
  minNoticeWaivedDays?: number;
  /** Whether an absence may be taken as unpaid. */
  unpaidAllowed?: boolean;
  /** Above this length a different approval applies. Null = no such rule. */
  maxConsecutiveDays?: number | null;
}

export interface WorkingCalendar {
  /** ISO days that are never working days. Empty = Monday to Friday. */
  weekendDays: number[];
  /** Dates (YYYY-MM-DD) that are not working days, from the jurisdiction's
   *  public holidays and the organization's own closures. */
  holidayDates: string[];
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in UTC, which is what a date *is* as far as a leave calendar goes. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoDayOf(date: Date): IsoDay {
  // `getUTCDay` is 0-based with Sunday = 0; ISO is 1-based with Monday = 1.
  return (((date.getUTCDay() + 6) % 7) + 1) as IsoDay;
}

/**
 * The working days in an inclusive date range.
 *
 * Inclusive at both ends, which is the part people get wrong: Friday to Monday
 * with a Saturday/Sunday weekend is **one** working day, not zero and not three.
 */
export function workingDaysBetween(
  start: Date | string,
  end: Date | string,
  calendar: WorkingCalendar,
): number {
  const from = typeof start === 'string' ? parseKey(start) : start;
  const to = typeof end === 'string' ? parseKey(end) : end;

  if (to.getTime() < from.getTime()) return 0;

  const weekend = new Set(calendar.weekendDays);
  const holidays = new Set(calendar.holidayDates);

  let count = 0;
  for (
    let cursor = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    cursor <= to.getTime();
    cursor += DAY_MS
  ) {
    const day = new Date(cursor);
    if (weekend.has(isoDayOf(day))) continue;
    if (holidays.has(dateKey(day))) continue;
    count += 1;
  }

  return count;
}

/** Which of two ranges overlap, as `YYYY-MM-DD` keys. Shared dates only. */
export function overlappingDays(
  a: { start: Date | string; end: Date | string },
  b: { start: Date | string; end: Date | string },
): string[] {
  const aStart = typeof a.start === 'string' ? parseKey(a.start) : a.start;
  const aEnd = typeof a.end === 'string' ? parseKey(a.end) : a.end;
  const bStart = typeof b.start === 'string' ? parseKey(b.start) : b.start;
  const bEnd = typeof b.end === 'string' ? parseKey(b.end) : b.end;

  const from = new Date(
    Math.max(
      Date.UTC(
        aStart.getUTCFullYear(),
        aStart.getUTCMonth(),
        aStart.getUTCDate(),
      ),
      Date.UTC(
        bStart.getUTCFullYear(),
        bStart.getUTCMonth(),
        bStart.getUTCDate(),
      ),
    ),
  );
  const to = new Date(
    Math.min(
      Date.UTC(aEnd.getUTCFullYear(), aEnd.getUTCMonth(), aEnd.getUTCDate()),
      Date.UTC(bEnd.getUTCFullYear(), bEnd.getUTCMonth(), bEnd.getUTCDate()),
    ),
  );

  const days: string[] = [];
  for (let cursor = from.getTime(); cursor <= to.getTime(); cursor += DAY_MS) {
    days.push(dateKey(new Date(cursor)));
  }
  return days;
}

export interface LeaveBalance {
  /** Entitlement for the year, after any adjustment. */
  entitlement: number;
  /** Approved and taken so far this year. */
  taken: number;
  /** Approved and still ahead this year. */
  booked: number;
  /** What is left to book, after carryover. */
  remaining: number;
  /** Days brought in from last year, after the carryover cap. */
  carriedIn: number;
  /** Anything above the carryover cap that was lost. */
  expired: number;
}

/**
 * What an employee has left, as at a point in the year.
 *
 * `remaining` is deliberately **not** `entitlement − taken`. It is that plus
 * carryover, because unused leave is the employer's liability in most
 * jurisdictions and a balance that quietly vanishes at the year boundary is the
 * classic way a payroll system becomes a legal problem.
 *
 * `booked` is approved leave dated **ahead** of `onDate` — the days somebody has
 * a holiday approved for but has not taken yet. They are subtracted too, because a
 * balance that only counts leave already taken will happily approve the same
 * December twice.
 */
export function leaveBalance(input: {
  policy: LeavePolicyInput;
  calendar: WorkingCalendar;
  /** Every approved range that touches the year in question. */
  approved: { start: Date | string; end: Date | string }[];
  /** Unused days carried in, as recorded at the start of the year. */
  unusedFromLastYear?: number;
  /** Defaults to now. */
  onDate?: Date;
}): LeaveBalance {
  const onDate = input.onDate ?? new Date();
  const policy = input.policy;

  const entitlement = Math.max(0, Number(policy.annualEntitlementDays) || 0);
  const { available, carriedIn, expired } = availableDays(
    policy,
    input.unusedFromLastYear,
  );

  let taken = 0;
  let booked = 0;

  for (const range of input.approved) {
    const days = workingDaysBetween(range.start, range.end, input.calendar);
    if (days === 0) continue;

    const end = typeof range.end === 'string' ? parseKey(range.end) : range.end;
    if (end.getTime() < onDate.getTime()) taken += days;
    else booked += days;
  }

  return {
    entitlement,
    taken,
    booked,
    remaining: available - taken - booked,
    carriedIn,
    expired,
  };
}

/** Days actually usable this year: entitlement plus carryover, capped. */
export function availableDays(
  policy: LeavePolicyInput,
  unusedFromLastYear = 0,
): { available: number; carriedIn: number; expired: number } {
  const entitlement = Math.max(0, Number(policy.annualEntitlementDays) || 0);
  const unused = Math.max(0, Number(unusedFromLastYear) || 0);
  const cap =
    policy.carryoverLimitDays == null
      ? null
      : Math.max(0, Number(policy.carryoverLimitDays));

  const carriedIn = cap === null ? unused : Math.min(unused, cap);

  return {
    available: entitlement + carriedIn,
    carriedIn,
    expired: Math.max(0, unused - carriedIn),
  };
}

export interface LeaveCheckInput {
  policy: LeavePolicyInput;
  start: Date | string;
  end: Date | string;
  /** Approved leave already booked this year. */
  existing: { start: Date | string; end: Date | string }[];
  /** Approved ranges in other years — never overlap, but checked anyway. */
  allApproved: { start: Date | string; end: Date | string }[];
  calendar: WorkingCalendar;
  leaveType?: string;
  unusedFromLastYear?: number;
}

export interface LeaveCheck {
  allowed: boolean;
  workingDays: number;
  /** Working days this request would add to the year. */
  totalInYear: number;
  remaining: number;
  reason?: string;
}

/**
 * Whether a request can be granted, and if not, why.
 *
 * Checks in the order that produces the most useful message, because somebody
 * filing leave at 9pm should be told the thing they can actually act on. Every
 * refusal carries a sentence: a bare "insufficient balance" on a form somebody has
 * to ask a human to interpret is a support ticket, not an answer.
 */
export function checkLeaveRequest(input: LeaveCheckInput): LeaveCheck {
  const { policy, calendar } = input;
  const workingDays = workingDaysBetween(input.start, input.end, calendar);

  const startKey =
    typeof input.start === 'string' ? input.start : dateKey(input.start);

  const year = startKey.slice(0, 4);
  const inYear = input.allApproved.filter((range) => {
    const from =
      typeof range.start === 'string' ? range.start : dateKey(range.start);
    return from.slice(0, 4) === year;
  });
  const totalInYear =
    inYear.reduce(
      (sum, range) =>
        sum + workingDaysBetween(range.start, range.end, calendar),
      0,
    ) + workingDays;

  const { available } = availableDays(policy, input.unusedFromLastYear);
  const remaining = available - totalInYear;

  const deny = (reason: string): LeaveCheck => ({
    allowed: false,
    workingDays,
    totalInYear,
    remaining,
    reason,
  });

  // A zero-day request is almost always a client bug or a request that spans
  // only a weekend, and granting it would create a record that says somebody was
  // away when they were not.
  if (workingDays === 0) {
    return deny(
      'Those dates contain no working days, so there is nothing to book. Check the range against the weekend and public holidays.',
    );
  }

  const unpaid = input.leaveType === 'UNPAID';
  if (unpaid && policy.unpaidAllowed === false) {
    return deny(
      'This policy does not allow unpaid leave, so an unpaid request cannot be granted.',
    );
  }

  if (policy.minNoticeDays && policy.minNoticeDays > 0) {
    const waived = policy.minNoticeWaivedDays ?? 1;
    const noticeDays = workingDaysBetween(new Date(), input.start, calendar);
    if (workingDays > waived && noticeDays < policy.minNoticeDays) {
      return deny(
        `This policy needs ${policy.minNoticeDays} working days' notice, and there are ${noticeDays}. A request of ${workingDays} working days is too long for the ${waived}-day short-notice exemption.`,
      );
    }
  }

  if (policy.maxConsecutiveDays && workingDays > policy.maxConsecutiveDays) {
    return deny(
      `A single request may not exceed ${policy.maxConsecutiveDays} working days. This one is ${workingDays}, so it needs to be split or escalated.`,
    );
  }

  // Two people cannot cover the same shift. Overlap with an existing approved
  // request is refused rather than trimmed, because trimming silently would
  // grant a different holiday from the one that was asked for.
  const clashes = input.allApproved.filter((range) => {
    const overlap = overlappingDays(
      { start: input.start, end: input.end },
      range,
    );
    return overlap.some(
      (day) =>
        !calendar.weekendDays.includes(isoDayOf(parseKey(day))) &&
        !calendar.holidayDates.includes(day),
    );
  });
  if (clashes.length > 0) {
    return deny(
      `These dates overlap ${clashes.length} leave ${clashes.length === 1 ? 'request' : 'requests'} that ${clashes.length === 1 ? 'has' : 'have'} already been approved. Somebody cannot be away twice.`,
    );
  }

  if (!unpaid && remaining < 0) {
    return deny(
      `That would take ${totalInYear} days from a balance of ${available}, which is ${Math.abs(remaining)} short. ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} will need to be unpaid, approved as an exception, or the request shortened.`,
    );
  }

  return { allowed: true, workingDays, totalInYear, remaining };
}

/**
 * Entitlement that has actually accrued by a date.
 *
 * Some jurisdictions grant leave as the year passes rather than up front, so
 * somebody who leaves in February cannot take the whole year. Pro-rated linearly
 * by elapsed calendar days, which is a simplification — most schemes pro-rate by
 * completed months or by a qualifying date — and it is a simplification *because
 * the real rule is not knowable without the policy*, which is why this takes the
 * ratio as an argument rather than computing a jurisdiction's qualifying period.
 */
export function accruedBy(
  policy: LeavePolicyInput,
  onDate: Date,
  yearStart: Date,
  yearEnd: Date,
): number {
  const total = Math.max(0, Number(policy.annualEntitlementDays) || 0);
  const start = yearStart.getTime();
  const end = yearEnd.getTime();
  if (end <= start) return total;

  const elapsed = Math.min(Math.max(onDate.getTime(), start), end) - start;
  const ratio = elapsed / (end - start);
  return Math.round(total * ratio * 100) / 100;
}
