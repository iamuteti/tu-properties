import {
  apportion,
  billingPeriodOf,
  calculateCharge,
  consumptionBetween,
  periodWindow,
  presentReading,
  resolveRate,
  round2,
  sortReadings,
  type ApportionableUnit,
  type RateInput,
} from './meter-rates';

const NO_ROLLOVER = { digits: null, digitWrapAt: null };
const ROLLOVER_5 = { digits: 5, digitWrapAt: 100000 };

describe('meter-rates', () => {
  describe('billingPeriodOf', () => {
    it('pads single-digit months so the key sorts as a string', () => {
      expect(billingPeriodOf(new Date(2026, 0, 15))).toBe('2026-01');
      expect(billingPeriodOf(new Date(2026, 9, 1))).toBe('2026-10');
      expect(billingPeriodOf(new Date(2026, 11, 31))).toBe('2026-12');
    });
  });

  describe('periodWindow', () => {
    it('covers a month end to end', () => {
      const w = periodWindow(2026, 10);
      expect(w.from).toEqual(new Date(2026, 9, 1));
      expect(w.to).toEqual(new Date(2026, 10, 1));
    });

    it('rolls December into January of the next year', () => {
      // The case a naive `new Date(year, month, 1)` gets wrong when month is 0-based.
      const w = periodWindow(2026, 12);
      expect(w.from).toEqual(new Date(2026, 11, 1));
      expect(w.to).toEqual(new Date(2027, 0, 1));
    });

    it('handles a leap February', () => {
      const w = periodWindow(2028, 2);
      const days = (w.to.getTime() - w.from.getTime()) / 86_400_000;
      expect(days).toBe(29);
    });
  });

  describe('consumptionBetween', () => {
    it('subtracts an ordinary forward movement', () => {
      const r = consumptionBetween(1000, 1250, NO_ROLLOVER);
      expect(r).toEqual({ ok: true, consumption: 250, rolledOver: false });
    });

    it('reports zero consumption when the register did not move', () => {
      // Not an error: a vacant unit on a bulk meter reads identically twice.
      expect(consumptionBetween(4000, 4000, NO_ROLLOVER)).toEqual({
        ok: true,
        consumption: 0,
        rolledOver: false,
      });
    });

    it('adds a wrapped register back up', () => {
      // 99998 -> 00003 on a 5-digit register is 5 units, not -99995. This is the
      // case that produces a five-figure credit if it is missed.
      const r = consumptionBetween(99998, 3, ROLLOVER_5);
      expect(r).toEqual({ ok: true, consumption: 5, rolledOver: true });
    });

    it('handles a wrap on a 6-digit register', () => {
      const r = consumptionBetween(999_998, 2, {
        digits: 6,
        digitWrapAt: 1_000_000,
      });
      expect(r).toEqual({ ok: true, consumption: 4, rolledOver: true });
    });

    it('refuses a backwards movement when the meter does not roll', () => {
      // Deliberately NOT clamped to zero: a zero bill for the month a resident's
      // meter was replaced is wrong in a way nobody would notice.
      const r = consumptionBetween(500, 300, NO_ROLLOVER);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('NEGATIVE_CONSUMPTION');
        expect(r.message).toContain('went backwards');
      }
    });

    it('treats a backwards movement on a wrapping meter as one pass of the register', () => {
      // 500 -> 300 on a 5-digit register is a wrap that cost 99500 + 300 = 99800
      // units, which is a lot of water but perfectly possible. It is not an error,
      // and treating it as one is why the modulus form above exists.
      const r = consumptionBetween(500, 300, ROLLOVER_5);
      expect(r).toEqual({ ok: true, consumption: 99_800, rolledOver: true });
    });

    it('always costs less than one full register on a backwards movement', () => {
      // `to <= from - 1` forces `wrapAt - from + to <= wrapAt - 1`, so a backwards
      // movement on a wrapping meter can never mean "the register went round
      // twice". Asserted rather than assumed, because it is why there is no
      // branch claiming to catch that case.
      const r = consumptionBetween(99999, 99998, ROLLOVER_5);
      expect(r).toEqual({ ok: true, consumption: 99999, rolledOver: true });
    });

    it('refuses a reading at or past the wrap point of a wrapping meter', () => {
      const r = consumptionBetween(500, 200_000, ROLLOVER_5);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('stop at 99999');
    });

    it('accepts a forward movement on a meter that does not roll, however large', () => {
      // No `digitWrapAt` configured means there is no register limit to check
      // against, and inventing one would refuse a legitimate reading.
      const r = consumptionBetween(500, 200_000, NO_ROLLOVER);
      expect(r).toEqual({ ok: true, consumption: 199_500, rolledOver: false });
    });
  });

  describe('sortReadings', () => {
    it('orders chronologically without mutating the input', () => {
      const input = [
        { reading: 3, readingDate: new Date(2026, 9, 1) },
        { reading: 1, readingDate: new Date(2026, 7, 1) },
        { reading: 2, readingDate: new Date(2026, 8, 1) },
      ];
      expect(sortReadings(input).map((r) => r.reading)).toEqual([1, 2, 3]);
      expect(input[0].reading).toBe(3);
    });
  });

  describe('apportion', () => {
    const units: ApportionableUnit[] = [
      { id: 'u1', areaSqFt: 1000, occupiedDays: 30 },
      { id: 'u2', areaSqFt: 3000, occupiedDays: 30 },
    ];

    it('refuses a bulk meter with no method, and does not pick one', () => {
      const r = apportion(null, units);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('BULK_METRE_UNALLOCATED');
        expect(r.message).toContain('will not pick one');
      }
    });

    it('splits by area', () => {
      const r = apportion('AREA', units);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.shares.u1).toBeCloseTo(0.25, 5);
        expect(r.shares.u2).toBeCloseTo(0.75, 5);
        expect(r.basis).toContain('floor area');
      }
    });

    it('splits evenly', () => {
      const r = apportion('EQUAL', units);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.shares.u1).toBeCloseTo(0.5, 5);
        expect(r.shares.u2).toBeCloseTo(0.5, 5);
      }
    });

    it('splits by occupancy days, so a part-month tenancy pays for its part', () => {
      const r = apportion(
        'OCCUPANCY',
        [
          { id: 'u1', areaSqFt: null, occupiedDays: 30 },
          { id: 'u2', areaSqFt: null, occupiedDays: 10 },
        ],
        { periodDays: 30 },
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.shares.u1).toBeCloseTo(0.75, 5);
        expect(r.shares.u2).toBeCloseTo(0.25, 5);
      }
    });

    it('treats an unrecorded occupancy as zero rather than a full month', () => {
      // Defaulting to 30 would let an unrecorded tenancy absorb a neighbour's water.
      const r = apportion(
        'OCCUPANCY',
        [
          { id: 'u1', areaSqFt: null, occupiedDays: 30 },
          { id: 'u2', areaSqFt: null, occupiedDays: null },
        ],
        { periodDays: 30 },
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.shares.u1).toBe(1);
        expect(r.shares.u2).toBe(0);
      }
    });

    it('uses the recorded weights for a negotiated split', () => {
      const r = apportion('MANUAL', units, { weights: { u1: 3, u2: 1 } });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.shares.u1).toBeCloseTo(0.75, 5);
        expect(r.basis).toContain('Negotiated');
      }
    });

    it('refuses a negotiated split with no weights recorded', () => {
      const r = apportion('MANUAL', units);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('no split has been recorded');
    });

    it('refuses when no unit has a recorded area', () => {
      // Better to be asked than to bill only the units that happen to have a figure.
      const r = apportion('AREA', [
        { id: 'u1', areaSqFt: null },
        { id: 'u2', areaSqFt: null },
      ]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain('recorded area');
    });

    it('refuses a meter with no units attached at all', () => {
      const r = apportion('EQUAL', []);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('NO_SHARE_FOUND');
    });

    it('always produces shares that add up to one', () => {
      // 1/3 each does not land on exactly 0.333333, and the charge stores what the
      // calculation produced - so the sum is what the code says it is.
      const three: ApportionableUnit[] = [
        { id: 'a', areaSqFt: 500 },
        { id: 'b', areaSqFt: 500 },
        { id: 'c', areaSqFt: 500 },
      ];
      const r = apportion('AREA', three);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const sum = Object.values(r.shares).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
      }
    });
  });

  describe('resolveRate', () => {
    const ctx = { meterId: 'm1', propertyId: 'p1', at: new Date(2026, 5, 1) };
    const rate = (
      over: Partial<
        RateInput & {
          meterId: string | null;
          propertyId: string | null;
          validFrom: Date;
          validTo: Date | null;
        }
      >,
    ) =>
      ({
        currency: 'KES',
        ratePerUnit: 50,
        meterId: null,
        propertyId: null,
        validFrom: new Date(2026, 0, 1),
        validTo: null,
        ...over,
      }) as RateInput & {
        meterId: string | null;
        propertyId: string | null;
        validFrom: Date;
        validTo: Date | null;
      };

    it('prefers a meter-specific rate', () => {
      const r = resolveRate(
        [
          rate({ meterId: 'm1', ratePerUnit: 10 }),
          rate({ meterId: 'm2', ratePerUnit: 20 }),
          rate({ ratePerUnit: 30 }),
        ],
        ctx,
      );
      expect(r?.ratePerUnit).toBe(10);
    });

    it('falls back to the property rate, then the organization default', () => {
      expect(
        resolveRate(
          [
            rate({ meterId: 'm2', ratePerUnit: 20 }),
            rate({ propertyId: 'p1', ratePerUnit: 30 }),
          ],
          ctx,
        )?.ratePerUnit,
      ).toBe(30);
      expect(resolveRate([rate({ ratePerUnit: 40 })], ctx)?.ratePerUnit).toBe(
        40,
      );
    });

    it('ignores a rate whose window does not contain the date', () => {
      const r = resolveRate(
        [
          rate({
            meterId: 'm1',
            ratePerUnit: 10,
            validFrom: new Date(2026, 6, 1),
          }),
          rate({
            meterId: 'm1',
            ratePerUnit: 20,
            validFrom: new Date(2026, 0, 1),
            validTo: new Date(2026, 3, 1),
          }),
        ],
        ctx,
      );
      expect(r).toBeNull();
    });

    it('treats validTo as exclusive, so back-to-back windows do not both apply', () => {
      const r = resolveRate(
        [
          rate({
            meterId: 'm1',
            ratePerUnit: 10,
            validFrom: new Date(2026, 0, 1),
            validTo: new Date(2026, 3, 1),
          }),
          rate({
            meterId: 'm1',
            ratePerUnit: 20,
            validFrom: new Date(2026, 3, 1),
          }),
        ],
        ctx,
      );
      expect(r?.ratePerUnit).toBe(20);
    });

    it('resolves deterministically when two rates of equal specificity overlap', () => {
      const r = resolveRate(
        [
          rate({
            meterId: 'm1',
            ratePerUnit: 10,
            validFrom: new Date(2026, 0, 1),
          }),
          rate({
            meterId: 'm1',
            ratePerUnit: 20,
            validFrom: new Date(2026, 2, 1),
          }),
        ],
        ctx,
      );
      expect(r?.ratePerUnit).toBe(20);
    });
  });

  describe('calculateCharge', () => {
    const rate: RateInput = { currency: 'KES', ratePerUnit: 55.5 };

    it('prices consumption times rate', () => {
      const r = calculateCharge({
        meterConsumption: 100,
        allocationShare: 1,
        rate,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.consumptionAmount).toBe(5550);
        expect(r.value.subtotal).toBe(5550);
        expect(r.value.total).toBe(5550);
      }
    });

    it('prices only the unit share of a bulk meter', () => {
      const r = calculateCharge({
        meterConsumption: 1000,
        allocationShare: 0.25,
        rate,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billableConsumption).toBe(250);
        expect(r.value.consumptionAmount).toBe(13875);
        expect(r.value.meterConsumption).toBe(1000);
      }
    });

    it('keeps qty times unitPrice equal to the line amount', () => {
      // 1000/3 does not land on a whole number, so this is where an unrounded
      // share would show up as a line that does not foot.
      const r = calculateCharge({
        meterConsumption: 1000,
        allocationShare: 1 / 3,
        rate,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const lineTotal = round2(
          (r.value.billableConsumption * r.value.consumptionAmount) /
            r.value.billableConsumption,
        );
        expect(lineTotal).toBe(r.value.consumptionAmount);
        expect(r.value.consumptionAmount).toBe(round2(333.33 * 55.5));
      }
    });

    it('adds a standing charge', () => {
      const r = calculateCharge({
        meterConsumption: 0,
        allocationShare: 1,
        rate: { ...rate, standingCharge: 250 },
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.consumptionAmount).toBe(0);
        expect(r.value.standingChargeAmount).toBe(250);
        expect(r.value.total).toBe(250);
      }
    });

    it('prorates the standing charge only when the rate says to', () => {
      const prorated = {
        ...rate,
        standingCharge: 310,
        prorateStandingCharge: true,
      };
      const whole = {
        ...rate,
        standingCharge: 310,
        prorateStandingCharge: false,
      };

      const a = calculateCharge({
        meterConsumption: 0,
        allocationShare: 1,
        rate: prorated,
        periodFraction: 15 / 31,
      });
      const b = calculateCharge({
        meterConsumption: 0,
        allocationShare: 1,
        rate: whole,
        periodFraction: 15 / 31,
      });

      expect(a.ok && a.value.standingChargeAmount).toBe(150);
      expect(b.ok && b.value.standingChargeAmount).toBe(310);
    });

    it('adds VAT on the subtotal, not on the consumption alone', () => {
      const r = calculateCharge({
        meterConsumption: 100,
        allocationShare: 1,
        rate: { ...rate, standingCharge: 450, vatRate: 16 },
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.subtotal).toBe(6000);
        expect(r.value.vatAmount).toBe(960);
        expect(r.value.total).toBe(6960);
      }
    });

    it('keeps a rate quoted to four decimals rather than truncating it', () => {
      // 0.0001 lost off the rate is 0.1 off a thousand units, every month.
      const r = calculateCharge({
        meterConsumption: 1000,
        allocationShare: 1,
        rate: { currency: 'KES', ratePerUnit: 12.3456 },
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.consumptionAmount).toBe(12345.6);
    });

    it('refuses to price with no rate', () => {
      const r = calculateCharge({
        meterConsumption: 100,
        allocationShare: 1,
        rate: null,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('NO_RATE');
    });
  });

  describe('presentReading', () => {
    it('reports no consumption when there is no earlier reading', () => {
      // The first reading on a newly installed meter establishes the baseline; it
      // is not a period's consumption.
      const p = presentReading(
        null,
        { reading: 4200, readingDate: new Date(2026, 9, 1) },
        NO_ROLLOVER,
      );
      expect(p).toEqual({
        previousReading: null,
        currentReading: 4200,
        consumption: null,
        rolledOver: false,
      });
    });

    it('derives the pair the module doc asked for', () => {
      const p = presentReading(
        { reading: 4000, readingDate: new Date(2026, 8, 1) },
        { reading: 4130, readingDate: new Date(2026, 9, 1) },
        NO_ROLLOVER,
      );
      expect(p).toEqual({
        previousReading: 4000,
        currentReading: 4130,
        consumption: 130,
        rolledOver: false,
      });
    });

    it('flags a rollover on the presented pair', () => {
      const p = presentReading(
        { reading: 99998, readingDate: new Date(2026, 8, 1) },
        { reading: 3, readingDate: new Date(2026, 9, 1) },
        ROLLOVER_5,
      );
      expect(p.consumption).toBe(5);
      expect(p.rolledOver).toBe(true);
    });

    it('reports no consumption rather than a negative one on a backwards reading', () => {
      const p = presentReading(
        { reading: 500, readingDate: new Date(2026, 8, 1) },
        { reading: 300, readingDate: new Date(2026, 9, 1) },
        NO_ROLLOVER,
      );
      expect(p.previousReading).toBe(500);
      expect(p.currentReading).toBe(300);
      expect(p.consumption).toBeNull();
    });
  });
});
