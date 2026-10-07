/**
 * Module 16 - the window a report covers.
 *
 * Pure date arithmetic, deliberately in its own file rather than private to the service.
 *
 * **This file exists because of a bug.** `resolvePeriod` used to live at the bottom of
 * `reports.service.ts` as a module-private function, and it subtracted `DEFAULT_MONTHS_BACK`
 * from `from` *unconditionally* - including when the caller had supplied one. Every report
 * with a date range therefore silently answered a window twelve months wider than the one
 * asked for, while reporting `clamped: false`. Nothing caught it, for two reasons that
 * generalise: a private function cannot be reached by a test, and the arithmetic it got
 * wrong (`setMonth(-12)`) is the kind that looks obviously correct while reading.
 *
 * The rule that fixes it: **the default may be a guess, but a supplied window is not.**
 * `resolvePeriod` invents a window only when the caller named none.
 *
 * **Boundaries are UTC, and that is not incidental.** Every `DateTime` in this schema is
 * `timestamp without time zone` holding a UTC instant, and the month buckets are
 * `to_char(issueDate, 'YYYY-MM')` over those stored values. A window built from *local*
 * midnight on a UTC+3 server is `2025-09-30T21:00:00Z` - it silently includes three hours
 * of the previous month, which is how an October report comes to carry a September
 * invoice. This is the same class of defect as issue 97 (a period window computed in the
 * wrong time frame) and it was fixed for Module 14 with `utcPeriodWindow`; the decision
 * recorded there was to have **no local-time sibling**, and that is honoured here.
 */

/** The default window when the caller names no `from`: twelve months back from `to`. */
export const DEFAULT_MONTHS_BACK = 12;

/**
 * The floor.
 *
 * A report covering three years when the reader asked for three months is a different
 * document from the one they requested, so hitting this bound is *reported* rather than
 * applied quietly.
 */
export const MAX_MONTHS_BACK = 36;

export interface ResolvedPeriod {
  from: Date;
  to: Date;
  /** True when the floor moved `from`, i.e. the window is not the one that was asked for. */
  clamped: boolean;
}

/**
 * Resolve the window a report should cover.
 *
 * Three cases, and the difference between them is the whole function:
 *
 * - **A caller-supplied `from` is honoured exactly.** Not snapped to a month boundary,
 *   not widened, not "helpfully" adjusted. If somebody asks for 1 June to 30 June they get
 *   1 June to 30 June, and if they ask for the 15th they get the 15th.
 * - **No `from` means the default**, which *is* a guess: twelve months back, snapped to
 *   the first of the month, because `byMonth` buckets by whole months and a window opening
 *   mid-month would file its first partial month under a heading it does not fill.
 * - **Either way the floor applies**, and applying it sets `clamped`.
 *
 * `clamped` is compared against the window we *wanted*, not against the caller's string, so
 * it means exactly what its comment says. The previous version compared a value it had
 * already overwritten, which is why a window twelve months too wide still reported `false`.
 */
export function resolvePeriod(from?: string, to?: string): ResolvedPeriod {
  const end = to ? new Date(to) : new Date();

  // Built from year/month arithmetic rather than `setMonth()` on a live date, so the day
  // of the month cannot drift: 31 March minus one month is "February 31", which
  // JavaScript silently rolls forward into March and yields a zero-length month.
  const earliest = utcMonthStart(
    end.getUTCFullYear(),
    end.getUTCMonth() - MAX_MONTHS_BACK,
  );

  const requested = from
    ? new Date(from)
    : utcMonthStart(
        end.getUTCFullYear(),
        end.getUTCMonth() - DEFAULT_MONTHS_BACK,
      );

  const start = requested < earliest ? earliest : requested;

  return {
    from: start,
    to: end,
    clamped: start.getTime() !== requested.getTime(),
  };
}

/**
 * Midnight UTC on the first of a month.
 *
 * Takes a possibly out-of-range `month` on purpose: `Date.UTC` rolls `-3` back into the
 * previous year's October, which is exactly what a twelve-months-back default needs and is
 * arithmetic `setMonth` on a live date cannot be trusted to do.
 */
function utcMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}
