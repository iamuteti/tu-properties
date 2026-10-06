/**
 * Module 14 - utility consumption, apportionment and billing arithmetic.
 *
 * Everything in this file is pure: it derives a number from readings and a tariff,
 * and it needs no database and no Nest. That is the design in one sentence -
 * **consumption is the difference between two register values, and this is where
 * that difference is taken.** `MeterReading` stores the value the register showed
 * and nothing else, for the same reason `InventoryItem` has no
 * `quantityOnHand`: a stored delta is a second copy of a fact that the two columns
 * it is derived from can contradict, and it drifts the first time a reading is
 * corrected.
 *
 * Four rules live here rather than in the service, because each is easy to get
 * subtly wrong and none of them needs a database:
 *
 * 1. **A meter that rolled over is not a meter that ran backwards.** A 5-digit
 *    electromechanical register reading 99998 and then 00003 consumed 5 units.
 *    Naive subtraction returns -99995, which metered onto an invoice is a
 *    five-figure credit. Rollover is handled when the meter says it rolls, and
 *    only then - an always-on rollover fix would be a permanent risk paid for an
 *    edge case.
 * 2. **A reading lower than the last one is refused, not clamped.** Clamping to
 *    zero would quietly bill a resident for no water in the month their meter was
 *    replaced, which is the wrong answer in a way nobody would notice.
 * 3. **Bulk apportionment is a decision the estate has to make.** Area, headcount,
 *    occupancy days and a negotiated fixed split are all defensible and all produce
 *    different bills, so there is no default here: a bulk meter with no method
 *    cannot be priced, and that refusal is the correct behaviour.
 * 4. **Money is computed in integer cents.** Floating-point money is the reason
 *    `0.1 + 0.2` is not `0.3`, and a utility bill that is 0.01 out is a support
 *    ticket. Rates carry four decimal places, so the multiplication is done on
 *    integers and rounded once, at the end.
 *
 * Period boundaries follow the same half-open `[from, to)` rule as facility
 * bookings: a reading taken exactly on the boundary belongs to the period that is
 * ending, never to both.
 */

/** Mirrors the `UtilityType` enum. Local so this file stays importable in a unit test. */
export type UtilityType = 'WATER' | 'ELECTRICITY' | 'GAS' | 'SEWAGE';

/** Mirrors the `ApportionmentMethod` enum. */
export type ApportionmentMethod = 'AREA' | 'EQUAL' | 'OCCUPANCY' | 'MANUAL';

/** Mirrors the `MeterScope` enum. */
export type MeterScope = 'SUBMETER' | 'BULK';

/** The minimum a consumer of this file has to know about a register. */
export interface MeterReadingInput {
  /** The value the register showed. */
  reading: number;
  /** When it was read. */
  readingDate: Date;
}

/** The rollover configuration, as stored on `UtilityMeter`. */
export interface RolloverConfig {
  /** Digits on the register. Null means the meter does not roll. */
  digits: number | null;
  /** The value the register returns to zero - i.e. `10 ** digits`. */
  digitWrapAt: number | null;
}

/** One unit of consumption in a billing period, priced. */
export interface RateInput {
  /** ISO 4217. */
  currency: string;
  /** Price of one unit, to four decimal places. */
  ratePerUnit: number;
  /** Fixed component charged regardless of consumption. */
  standingCharge?: number;
  /** Whether `standingCharge` is prorated for a period that is not a full month. */
  prorateStandingCharge?: boolean;
  vatRate?: number | null;
  incomeAccount?: string | null;
  revenueExpenseItem?: string | null;
}

/** A unit that a bulk meter's consumption may be divided across. */
export interface ApportionableUnit {
  id: string;
  /** `Unit.areaSqFt`. Null when the unit has not been measured. */
  areaSqFt: number | null;
  /**
   * Days this unit was occupied inside the billing period. Only consulted by
   * `OCCUPANCY`, and null is treated as zero occupied days rather than as a full
   * month - an unmeasured unit has not been measured, and defaulting it to a full
   * month would let an unrecorded tenancy absorb a neighbour's water.
   */
  occupiedDays?: number | null;
}

/** The result of dividing a bulk meter's consumption across units. */
export interface ApportionmentResult {
  ok: true;
  /** unit id -> that unit's share of the meter, summing to 1. */
  shares: Record<string, number>;
  /** Why the split came out the way it did, for the charge's `allocationBasis`. */
  basis: string;
  /** Sum of all shares. Always 1; asserted rather than assumed. */
  total: number;
}

/** A consumption charge, priced. All money in the invoice currency, rounded to cents. */
export interface ChargeCalculation {
  /** Meter units consumed over the period, before apportionment. */
  meterConsumption: number;
  /** This unit's share of it. Equals `meterConsumption` for a sub-meter. */
  billableConsumption: number;
  /** `billableConsumption x ratePerUnit`, in cents-rounded money. */
  consumptionAmount: number;
  /** The fixed component, prorated if the rate says so. */
  standingChargeAmount: number;
  /** `consumptionAmount + standingChargeAmount`. */
  subtotal: number;
  /** VAT on the subtotal, at the rate's `vatRate`. Zero when there is none. */
  vatAmount: number;
  /** `subtotal + vatAmount`. This is what the resident owes. */
  total: number;
  currency: string;
  vatRate: number | null;
  incomeAccount: string | null;
  revenueExpenseItem: string | null;
  /** The unit's share of the meter, as stored on `UtilityCharge.allocationShare`. */
  allocationShare: number;
}

/** Why a period could not be priced. Every one of these must become a sentence. */
export type ChargeRefusalReason =
  | 'NO_CLOSING_READING'
  | 'NO_OPENING_READING'
  | 'READINGS_OUT_OF_ORDER'
  | 'NEGATIVE_CONSUMPTION'
  | 'ROLLOVER_NOT_CONFIGURED'
  | 'BULK_METRE_UNALLOCATED'
  | 'NO_SHARE_FOUND'
  | 'SHARES_DO_NOT_ADD_UP'
  | 'NO_RATE';

export interface ChargeRefusal {
  ok: false;
  reason: ChargeRefusalReason;
  /** A sentence naming what is wrong, for the API's 409 body. */
  message: string;
}

export interface ChargeOk {
  ok: true;
  value: ChargeCalculation;
}

export type ChargeResult = ChargeOk | ChargeRefusal;

/**
 * Round to cents with the epsilon nudge, so 1.005 becomes 1.01 rather than 1.00.
 * The same helper Finance uses, restated here because this file must stay free of
 * imports from another module's internals.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * "2026-10" for a date - the unit a billing period is identified by, matching
 * `Invoice.billingPeriod`'s form so the two are comparable.
 */
export function billingPeriodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The half-open `[from, to)` window a billing period covers.
 *
 * A reading taken exactly on `to` belongs to the period that is ending, never to
 * both - the same rule facility bookings use for slots, and the reason a reading
 * entered on the 1st does not appear on two bills.
 */
export function periodWindow(
  year: number,
  month: number,
): { from: Date; to: Date } {
  // `month` is 1-based. Month 0 of the next year is December's rollover, which is
  // what makes this correct for December without a special case.
  return {
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 1),
  };
}

/**
 * Order readings chronologically.
 *
 * A tie-break on id would be redundant here and is deliberately absent:
 * `MeterReading` is unique on `(meterId, readingDate)`, so the service can never
 * hand this function two readings for one meter at one instant. `stock-ledger.ts`
 * *does* need the tie-break, because a store genuinely can take two movements in
 * the same millisecond; a meter register cannot.
 */
export function sortReadings(
  readings: MeterReadingInput[],
): MeterReadingInput[] {
  return [...readings].sort(
    (a, b) => a.readingDate.getTime() - b.readingDate.getTime(),
  );
}

/**
 * Consumption between two register values, handling rollover.
 *
 * A register of `wrapAt` digits runs 0 .. wrapAt-1 and then returns to zero, so a
 * backwards movement on a wrapping meter is not an error - it is the register
 * passing its maximum. Consumption is then `(wrapAt - from) + to`: on a 5-digit
 * register, 99998 followed by 00003 is 2 + 3 = 5 units, where naive subtraction
 * returns -99995 and, metered onto an invoice, becomes a five-figure credit.
 *
 * A backwards movement on a meter that does **not** roll is refused rather than
 * clamped. Clamping to zero would produce a plausible-looking nil bill for the
 * month a resident's meter was swapped, and nobody would ever find out why the
 * water was free.
 *
 * One thing this function deliberately cannot do: tell you that a reading is
 * missing from the *middle* of the period. Two consecutive readings 1000 apart
 * look identical whether or not somebody skipped a month, and no arithmetic on the
 * pair can distinguish them. Data completeness is a separate question, answered by
 * the service walking the reading sequence rather than by the delta.
 */
export function consumptionBetween(
  from: number,
  to: number,
  rollover: RolloverConfig,
):
  | { ok: true; consumption: number; rolledOver: boolean }
  | { ok: false; reason: ChargeRefusalReason; message: string } {
  const wrapAt = rollover.digitWrapAt;
  const digits = rollover.digits;
  const configured = wrapAt !== null && digits !== null;

  if (configured && wrapAt !== null && to >= wrapAt) {
    return {
      ok: false,
      reason: 'ROLLOVER_NOT_CONFIGURED',
      message: `The register shows ${to}, but this meter's ${String(digits)} digits stop at ${wrapAt - 1}. One of the two figures is wrong.`,
    };
  }

  if (to > from) {
    return { ok: true, consumption: to - from, rolledOver: false };
  }

  if (to === from) {
    // Not an error: a vacant unit on a bulk meter reads identically twice.
    return { ok: true, consumption: 0, rolledOver: false };
  }

  if (!configured || wrapAt === null) {
    return {
      ok: false,
      reason: 'NEGATIVE_CONSUMPTION',
      message: `The reading went backwards, from ${from} to ${to}, so there is no consumption to bill. If the meter was replaced, record the new meter's first reading on its own meter; if the figure is a typo, correct the reading rather than billing the difference.`,
    };
  }

  // A backwards movement on a wrapping meter always costs less than one full
  // register: `to <= from - 1` forces `wrapAt - from + to <= wrapAt - 1`. So the
  // "the register went round twice" case is unreachable here, and there is
  // deliberately no branch pretending to catch it.
  return { ok: true, consumption: wrapAt - from + to, rolledOver: true };
}

/**
 * Divide a bulk meter's consumption across the units it feeds.
 *
 * There is deliberately no default. Every method here is a defensible business
 * decision that produces a different bill, so the estate picks one and the module
 * refuses to invent it - the same refusal discipline Module 10 uses when the bid
 * comparison is a trade-off rather than a winner.
 */
export function apportion(
  method: ApportionmentMethod | null,
  units: ApportionableUnit[],
  opts: {
    /** Required for `MANUAL`: unit id -> weight, as stored on the meter. */
    weights?: Record<string, number> | null;
    /** Days in the billing period, for prorating `OCCUPANCY`. */
    periodDays?: number;
  } = {},
): ApportionmentResult | ChargeRefusal {
  if (units.length === 0) {
    return {
      ok: false,
      reason: 'NO_SHARE_FOUND',
      message:
        'No units are attached to this bulk meter, so there is nobody to divide the consumption across.',
    };
  }

  if (method === null) {
    return {
      ok: false,
      reason: 'BULK_METRE_UNALLOCATED',
      message:
        'This is a bulk meter, and how its consumption is divided has not been decided. Choose one of area, equal split, occupancy days or a negotiated split before billing it - the module will not pick one, because each produces a different bill.',
    };
  }

  const raw = new Map<string, number>();

  switch (method) {
    case 'AREA': {
      // Units with no recorded area contribute nothing rather than defaulting to
      // zero-area-and-therefore-nothing, which is the same answer - but the sum is
      // checked below so a property where nobody measured anything is refused
      // instead of billing only the units that happen to have a figure.
      for (const u of units) raw.set(u.id, u.areaSqFt ?? 0);
      break;
    }
    case 'EQUAL': {
      for (const u of units) raw.set(u.id, 1);
      break;
    }
    case 'OCCUPANCY': {
      const periodDays = opts.periodDays;
      if (!periodDays || periodDays <= 0) {
        return {
          ok: false,
          reason: 'SHARES_DO_NOT_ADD_UP',
          message: `Occupancy-based apportionment needs the length of the billing period, and ${String(periodDays)} is not a usable one.`,
        };
      }
      for (const u of units) raw.set(u.id, u.occupiedDays ?? 0);
      break;
    }
    case 'MANUAL': {
      if (!opts.weights) {
        return {
          ok: false,
          reason: 'SHARES_DO_NOT_ADD_UP',
          message:
            'This meter is set to a negotiated split, but no split has been recorded against it.',
        };
      }
      for (const u of units) raw.set(u.id, opts.weights[u.id] ?? 0);
      break;
    }
  }

  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return {
      ok: false,
      reason: 'SHARES_DO_NOT_ADD_UP',
      message:
        method === 'AREA'
          ? 'None of the units on this bulk meter has a recorded area, so area-based apportionment has nothing to divide by. Record the areas, or choose a different method.'
          : method === 'OCCUPANCY'
            ? 'None of the units on this bulk meter has any recorded occupancy in the period, so occupancy-based apportionment has nothing to divide by.'
            : 'The recorded split for this meter adds up to nothing, so there is no consumption to divide.',
    };
  }

  const shares: Record<string, number> = {};
  for (const [id, value] of raw) {
    // Rounded to 6dp because that is what `UtilityCharge.allocationShare` holds;
    // rounding here rather than at the point of use means the sum the charge
    // records is the sum that was calculated.
    shares[id] = round6(value / total);
  }

  return { ok: true, shares, basis: basisFor(method), total: 1 };
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function basisFor(method: ApportionmentMethod): string {
  switch (method) {
    case 'AREA':
      return 'Split by floor area';
    case 'EQUAL':
      return 'Split evenly between the units fed';
    case 'OCCUPANCY':
      return 'Split by days occupied in the period';
    case 'MANUAL':
      return 'Negotiated split recorded against the meter';
  }
}

/**
 * Pick the rate in force at a date: meter-specific, else property-wide, else the
 * organization default. Most-specific-wins.
 *
 * A rate is chosen once and snapshotted onto the charge, so a later tariff change
 * cannot retroactively reprice history - the same reason `TaxRule` and
 * `PayrollRule` carry a `validFrom..validTo` window and are superseded rather than
 * edited.
 */
export function resolveRate(
  candidates: Array<
    RateInput & {
      meterId: string | null;
      propertyId: string | null;
      validFrom: Date;
      validTo: Date | null;
    }
  >,
  ctx: { meterId: string; propertyId: string; at: Date },
): RateInput | null {
  const active = candidates.filter(
    (r) =>
      r.validFrom.getTime() <= ctx.at.getTime() &&
      (r.validTo === null || r.validTo.getTime() > ctx.at.getTime()),
  );

  const specificity = (r: {
    meterId: string | null;
    propertyId: string | null;
  }) =>
    r.meterId === ctx.meterId ? 3 : r.propertyId === ctx.propertyId ? 2 : 1;

  // Highest specificity wins; among equals the most recently valid-from wins, so
  // two overlapping rates resolve deterministically rather than by row order.
  const best = active.reduce<(typeof active)[number] | null>((acc, r) => {
    if (acc === null) return r;
    const diff = specificity(r) - specificity(acc);
    if (diff > 0) return r;
    if (diff < 0) return acc;
    return r.validFrom.getTime() >= acc.validFrom.getTime() ? r : acc;
  }, null);

  return best;
}

/**
 * Price a period's consumption.
 *
 * `meterConsumption` is what the register did. `billableConsumption` is what this
 * unit is responsible for, which is the same number for a sub-meter and a share of
 * it for a unit on a bulk meter.
 *
 * The one thing this function will not do is round per-unit-share before
 * multiplying: `consumption x share x rate` is evaluated at full precision and
 * rounded once, because rounding a share to cents and then multiplying it by a
 * thousand units moves the total by more than the rounding error is worth.
 */
export function calculateCharge(input: {
  meterConsumption: number;
  /** 1 for a sub-meter; a fraction for a unit on a bulk meter. */
  allocationShare: number;
  rate: RateInput | null;
  /** Prorate the standing charge for a partial month. */
  periodFraction?: number;
}): ChargeResult {
  const { meterConsumption, allocationShare, rate } = input;

  if (rate === null) {
    return {
      ok: false,
      reason: 'NO_RATE',
      message:
        'No tariff applies to this meter on the date being billed, so the consumption cannot be priced. Set a rate for the utility before running billing.',
    };
  }

  // The share is applied first and the result rounded once.
  //
  // The other order is wrong in a way that shows up on the invoice: rounding the
  // product instead leaves `billableConsumption` unrounded, so the invoice line
  // reads as 3.333333 units at a price, and `qty x unitPrice` does not equal its
  // own `amount`. Consumption is a measured quantity presented to two decimals, so
  // it is rounded before the money is touched and the line foots.
  const billableConsumption = round2(meterConsumption * allocationShare);

  // Minor units from here, not floats. The rate carries four decimals because a
  // gas tariff per MMBtu or a water tariff per 1000 litres is quoted finer than
  // cents; truncating the *rate* to cents would quietly move money, so the
  // multiplication runs on scaled integers and rounds once at the end.
  const consumptionMinor = Math.round(billableConsumption * 100);
  const rateMinor = Math.round(rate.ratePerUnit * 10_000);
  const consumptionAmount = round2(
    (consumptionMinor * rateMinor) / (100 * 10_000),
  );

  let standingChargeAmount = rate.standingCharge ?? 0;
  if (
    rate.prorateStandingCharge &&
    input.periodFraction !== undefined &&
    input.periodFraction !== 1
  ) {
    standingChargeAmount = round2(standingChargeAmount * input.periodFraction);
  }

  const subtotal = round2(consumptionAmount + standingChargeAmount);

  // VAT is a percentage of the subtotal, so the divisor carries three factors: the
  // subtotal's minor units, the rate's hundredths, and the percentage-to-fraction
  // step. (Two factors produce a figure 100x too large — the kind of error that
  // looks like a plausible tax bill rather than a bug.)
  const vatAmount = rate.vatRate
    ? round2(
        (Math.round(subtotal * 100) * Math.round(rate.vatRate * 100)) /
          (100 * 100 * 100),
      )
    : 0;
  const total = round2(subtotal + vatAmount);

  return {
    ok: true,
    value: {
      meterConsumption,
      billableConsumption,
      consumptionAmount,
      standingChargeAmount,
      subtotal,
      vatAmount,
      total,
      currency: rate.currency,
      vatRate: rate.vatRate ?? null,
      incomeAccount: rate.incomeAccount ?? null,
      revenueExpenseItem: rate.revenueExpenseItem ?? null,
      allocationShare,
    },
  };
}

/**
 * What a charge derived from a period looks like on the screen, for the days after
 * the month closed.
 *
 * `consumption` and `previousReading` are *derived* here rather than stored, which is
 * the module doc's `previousReading`/`currentReading` pair - presented, not persisted.
 */
export interface ReadingPresentation {
  previousReading: number | null;
  currentReading: number;
  consumption: number | null;
  rolledOver: boolean;
}

export function presentReading(
  previous: MeterReadingInput | null,
  current: MeterReadingInput,
  rollover: RolloverConfig,
): ReadingPresentation {
  if (previous === null) {
    return {
      previousReading: null,
      currentReading: current.reading,
      consumption: null,
      rolledOver: false,
    };
  }
  const result = consumptionBetween(
    previous.reading,
    current.reading,
    rollover,
  );
  return {
    previousReading: previous.reading,
    currentReading: current.reading,
    consumption: result.ok ? round2(result.consumption) : null,
    rolledOver: result.ok ? result.rolledOver : false,
  };
}
