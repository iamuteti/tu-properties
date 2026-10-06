/**
 * Module 16 - occupancy, and the arithmetic every report in this module shares.
 *
 * Everything here is pure: it compares dates and divides numbers, and it needs no
 * database and no Nest. That is the design in one sentence - **a report's arithmetic
 * is a function of its rows, and this is where those functions live.**
 *
 * Five rules, each of which is easy to get subtly wrong:
 *
 * 1. **"Occupied" means a lease covers the date, not that a column says so.**
 *    `Unit.status = 'OCCUPIED'` is what the operations team last recorded. A tenancy
 *    ended last month and nobody flipped the unit, and an occupancy report driven off
 *    that column reports a full building over an empty flat. The lease is the evidence;
 *    the unit's status is a note somebody wrote about it.
 * 2. **The two kinds of occupancy are different queries and must not be shared.**
 *    A *snapshot* ("how full is the estate today?") asks which agreement is live now.
 *    A *trend* ("how full was it in March?") asks which agreement covered that date -
 *    including one now marked `RENEWED` or `TERMINATED`, because at that date it *was*
 *    the agreement in force. Using the snapshot test for the trend understates history
 *    and makes occupancy appear to jump when nothing happened.
 * 3. **A disagreement between the two is a finding, not a rounding error.** When a unit
 *    says `OCCUPIED` and no lease covers the date, the report says so and counts it.
 *    Silently preferring either source is how a report becomes confidently wrong.
 * 4. **An estate with no units is undefined, not 100% and not 0%.** Dividing by zero
 *    produces `NaN`, which renders as a blank cell and reads as "no data" rather than
 *    "nothing to measure". `null` is the honest answer and the UI must handle it.
 * 5. **Percentages are bounded to [0, 100] and rounded once, at the end.** A double
 *    counted unit would otherwise produce 108% occupancy, which looks like a bug in the
 *    report rather than a bug in the data.
 *
 * Money is never computed here. Reporting sums are aggregated in the database, because
 * a report that loads a hundred thousand invoices into Node to add them up is a report
 * that stops working at exactly the scale where it is needed.
 */

/** Mirrors the `UnitStatus` enum. */
export type UnitStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';

/** Mirrors the `AgreementStatus` enum. */
export type AgreementStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'RENEWED';

/** The columns the occupancy query needs. Narrow on purpose. */
export interface UnitFacts {
  id: string;
  code: string;
  status: UnitStatus;
  propertyId?: string | null;
}

/** The columns the occupancy query needs from an agreement. */
export interface AgreementFacts {
  id: string;
  unitId: string;
  startDate: Date;
  /** `null` is a genuinely open-ended agreement, which is legal and common. */
  endDate: Date | null;
  status: AgreementStatus;
}

/** How a unit is doing on a given date. */
export type UnitOccupancy =
  /** A lease covers this date. */
  | 'OCCUPIED'
  /** No lease covers this date, and the unit is not being held for anything. */
  | 'VACANT'
  /** Being refurbished. Not occupiable, and not part of the vacancy denominator. */
  | 'MAINTENANCE'
  /** Held for a specific incoming tenant. Not vacant in the sense that matters. */
  | 'RESERVED';

/** What the report says about one unit. */
export interface UnitVerdict {
  unitId: string;
  code: string;
  occupancy: UnitOccupancy;
  /** The agreement relied on, for the report to link to. */
  agreementId: string | null;
  /**
   * `Unit.status` and the lease evidence disagree.
   *
   * The two cases are different and both matter: a unit flagged `OCCUPIED` with no
   * lease is a tenant in the property with no agreement, and a unit flagged `VACANT`
   * with a live lease is a rent roll that has lost a row.
   */
  disagreement:
    | 'FLAGGED_OCCUPIED_BUT_NO_LEASE'
    | 'LEASED_BUT_FLAGGED_VACANT'
    | null;
}

/** The headline figures. */
export interface OccupancyMetrics {
  totalUnits: number;
  occupied: number;
  vacant: number;
  maintenance: number;
  reserved: number;
  /**
   * `null` when there is nothing to measure, rather than `0` or `100`.
   *
   * The denominator is occupiable units - `total - maintenance` - because a building
   * with ten flats and two of them stripped for refurbishment is not 80% full, it is
   * 100% full of the eight that can be occupied. Counting refurbishment as vacancy is
   * the single most common way an occupancy report misleads its reader.
   */
  occupancyPercent: number | null;
  vacancyPercent: number | null;
  /** Units where the two sources disagree. Zero is the only acceptable number. */
  disagreements: number;
  byOccupancy: Record<UnitOccupancy, number>;
}

/**
 * Whether an agreement was in force on a date.
 *
 * Half-open on the far end: `endDate` is the last day the tenancy runs, so a lease
 * ending on the 31st has covered the 31st and not the 1st of the next month. Getting
 * this backwards makes every month-end occupancy figure wrong by a whole tenancy.
 *
 * `DRAFT` never counts - an unsigned agreement is a plan, not a tenancy. `TERMINATED`
 * does not count either, because a terminated agreement is not in force even where its
 * dates would otherwise say it was.
 */
export function agreementCovers(agreement: AgreementFacts, on: Date): boolean {
  if (agreement.status === 'DRAFT' || agreement.status === 'TERMINATED')
    return false;
  if (on.getTime() < agreement.startDate.getTime()) return false;
  if (agreement.endDate === null) return true;
  return on.getTime() <= agreement.endDate.getTime();
}

/**
 * Whether an agreement is the one that occupies its unit **right now**.
 *
 * Differs from `agreementCovers` for history, per rule 2: an agreement now marked
 * `RENEWED` was in force until its successor took over, but today the successor is what
 * occupies the unit, and counting both would double-occup it. So `RENEWED` is excluded
 * from a snapshot and included in a trend.
 */
export function agreementOccupiesNow(
  agreement: AgreementFacts,
  on: Date,
): boolean {
  if (agreement.status !== 'ACTIVE') return false;
  return agreementCovers(agreement, on);
}

/**
 * Classify one unit on a date.
 *
 * The lease is consulted first (rule 1) and the unit's own status is used only when no
 * lease speaks, and even then not for `OCCUPIED` - a unit the operations team flagged
 * occupied with no lease behind it is reported as `VACANT` **and** flagged, because
 * calling it occupied is the claim the evidence does not support.
 */
export function classifyUnit(
  unit: UnitFacts,
  agreements: readonly AgreementFacts[],
  on: Date,
): UnitVerdict {
  const covering = agreements.filter(
    (agreement) => agreement.unitId === unit.id,
  );

  const live = covering.find((agreement) =>
    agreementOccupiesNow(agreement, on),
  );
  if (live) {
    return {
      unitId: unit.id,
      code: unit.code,
      occupancy: 'OCCUPIED',
      agreementId: live.id,
      // A unit that is leased but still flagged VACANT is the rent roll having lost a
      // row, and it is worth showing even though the report still calls it occupied.
      disagreement:
        unit.status === 'VACANT' ? 'LEASED_BUT_FLAGGED_VACANT' : null,
    };
  }

  // No live agreement. Held for maintenance or reserved is not vacancy (rule in the
  // metrics docstring), so both are taken from the unit's own status.
  if (unit.status === 'MAINTENANCE') {
    return {
      unitId: unit.id,
      code: unit.code,
      occupancy: 'MAINTENANCE',
      agreementId: null,
      disagreement: null,
    };
  }
  if (unit.status === 'RESERVED') {
    return {
      unitId: unit.id,
      code: unit.code,
      occupancy: 'RESERVED',
      agreementId: null,
      disagreement: null,
    };
  }

  return {
    unitId: unit.id,
    code: unit.code,
    occupancy: 'VACANT',
    agreementId: null,
    // The interesting case. Either somebody is living there without an agreement, or a
    // tenancy ended and the flag was never cleared.
    disagreement:
      unit.status === 'OCCUPIED' ? 'FLAGGED_OCCUPIED_BUT_NO_LEASE' : null,
  };
}

/**
 * Occupancy as a bounded percentage, or `null` when the denominator is zero.
 *
 * Rounded once, to one decimal, and clamped to [0, 100] (rule 5).
 */
export function percentage(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator <= 0) return null;
  const raw = (numerator / denominator) * 100;
  const bounded = Math.min(100, Math.max(0, raw));
  return Math.round(bounded * 10) / 10;
}

/** Headline figures for a set of units on a date. */
export function occupancyMetrics(
  units: readonly UnitFacts[],
  agreements: readonly AgreementFacts[],
  on: Date,
): OccupancyMetrics {
  const verdicts = units.map((unit) => classifyUnit(unit, agreements, on));

  const byOccupancy: Record<UnitOccupancy, number> = {
    OCCUPIED: 0,
    VACANT: 0,
    MAINTENANCE: 0,
    RESERVED: 0,
  };
  for (const verdict of verdicts) byOccupancy[verdict.occupancy] += 1;

  const occupied = byOccupancy.OCCUPIED;
  const vacant = byOccupancy.VACANT;
  const total = units.length;
  // Refurbishment is not vacancy - see the metrics docstring.
  const occupiable = total - byOccupancy.MAINTENANCE;

  return {
    totalUnits: total,
    occupied,
    vacant,
    maintenance: byOccupancy.MAINTENANCE,
    reserved: byOccupancy.RESERVED,
    occupancyPercent: percentage(occupied, occupiable),
    vacancyPercent: percentage(vacant, occupiable),
    disagreements: verdicts.filter((verdict) => verdict.disagreement !== null)
      .length,
    byOccupancy,
  };
}

/**
 * The month-ends a trend series covers, oldest first.
 *
 * Returned rather than computed at the call site so the *query* and the *labels* cannot
 * disagree: a chart whose axis has 12 points and whose data has 11 is the most common
 * way a trend reads as a collapse when nothing happened.
 *
 * Clamped to 24 months. A report that will draw a bar per month for a decade is a
 * report nobody reads and a query nobody wants to run.
 */
export function monthEnds(from: Date, to: Date, maxMonths = 24): Date[] {
  const points: Date[] = [];

  // Walk **backwards** from `to`'s month, one month at a time, and unshift each. Going
  // backwards and prepending is what makes the cap trivial to honour and the order
  // ascending by construction rather than by a final `reverse()` that could be forgot.
  let year = to.getFullYear();
  let month = to.getMonth();

  while (points.length < maxMonths) {
    const end = lastInstantOfMonth(year, month);
    if (end.getTime() < startOfMonth(from).getTime()) break;
    points.unshift(end);

    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }

  return points;
}

/**
 * The last instant of a month.
 *
 * Built from day **0 of the following month** rather than by `setMonth(-1)` from an
 * arbitrary day. Stepping back from 31 January lands on "February 31", which JavaScript
 * silently rolls forward into March - so the series came out containing 2 January and
 * the wrong number of points. Arithmetic on a day-of-month is the whole hazard here.
 */
function lastInstantOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

/** The first instant of the month `date` falls in. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Percentage change between two readings, or `null` when there is no baseline.
 *
 * A report that renders "0%" for growth from nothing is worse than one that renders
 * nothing, because `0%` is a claim.
 */
export function percentageChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}
