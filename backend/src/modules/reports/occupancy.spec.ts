import {
  agreementCovers,
  agreementOccupiesNow,
  classifyUnit,
  monthEnds,
  occupancyMetrics,
  percentage,
  percentageChange,
  type AgreementFacts,
  type UnitFacts,
} from './occupancy';

const DAY = 86_400_000;
const NOW = new Date('2026-06-30T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const agreement = (over: Partial<AgreementFacts> = {}): AgreementFacts => ({
  id: 'ag-1',
  unitId: 'unit-1',
  startDate: daysAgo(400),
  endDate: null,
  status: 'ACTIVE',
  ...over,
});

const unit = (over: Partial<UnitFacts> = {}): UnitFacts => ({
  id: 'unit-1',
  code: 'A1',
  status: 'OCCUPIED',
  ...over,
});

describe('agreementCovers', () => {
  it('covers a date inside the term', () => {
    expect(
      agreementCovers(
        // `daysAgo` counts **backwards**, so a negative value is in the future. Started
        // 100 days ago and ending 10 days from now - which contains NOW.
        agreement({ startDate: daysAgo(100), endDate: daysAgo(-10) }),
        NOW,
      ),
    ).toBe(true);
  });

  it('treats endDate as the LAST day, not the first day after', () => {
    // Half-open on the far end. Getting this backwards makes every month-end figure
    // wrong by a whole tenancy.
    const ends = daysAgo(30);
    expect(agreementCovers(agreement({ endDate: ends }), ends)).toBe(true);
    expect(
      agreementCovers(
        agreement({ endDate: ends }),
        new Date(ends.getTime() + 1),
      ),
    ).toBe(false);
  });

  it('never covers a date before it started', () => {
    expect(agreementCovers(agreement({ startDate: daysAgo(-10) }), NOW)).toBe(
      false,
    );
  });

  it('covers any date when open-ended, but only from when it started', () => {
    // Open-ended means "no end", not "no beginning". A lease that starts next month does
    // not cover today, and a report that said otherwise would count a future tenancy as
    // occupancy.
    expect(agreementCovers(agreement({ endDate: null }), NOW)).toBe(true);
    // The *start* has to move, not the check date: an agreement beginning in 100 days
    // does not cover today.
    expect(
      agreementCovers(
        agreement({ endDate: null, startDate: daysAgo(-100) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('does not count a DRAFT agreement', () => {
    // An unsigned agreement is a plan, not a tenancy.
    expect(agreementCovers(agreement({ status: 'DRAFT' }), NOW)).toBe(false);
  });

  it('does not count a TERMINATED agreement even inside its own dates', () => {
    expect(
      agreementCovers(
        agreement({
          status: 'TERMINATED',
          startDate: daysAgo(100),
          endDate: daysAgo(50),
        }),
        daysAgo(70),
      ),
    ).toBe(false);
  });

  it('does count a RENEWED agreement for a date inside its own term', () => {
    // Rule 2: history is in force regardless of what the row is called now.
    expect(
      agreementCovers(
        agreement({
          status: 'RENEWED',
          startDate: daysAgo(800),
          endDate: daysAgo(400),
        }),
        daysAgo(500),
      ),
    ).toBe(true);
  });
});

describe('agreementOccupiesNow', () => {
  it('counts an ACTIVE agreement', () => {
    expect(agreementOccupiesNow(agreement(), NOW)).toBe(true);
  });

  it('does not count a RENEWED agreement, whose successor holds the unit now', () => {
    // Counting both would double-occupy the unit.
    expect(agreementOccupiesNow(agreement({ status: 'RENEWED' }), NOW)).toBe(
      false,
    );
  });

  it('does not count an EXPIRED one', () => {
    expect(agreementOccupiesNow(agreement({ status: 'EXPIRED' }), NOW)).toBe(
      false,
    );
  });
});

describe('classifyUnit', () => {
  it('reports a leased unit as occupied', () => {
    expect(classifyUnit(unit(), [agreement()], NOW)).toMatchObject({
      occupancy: 'OCCUPIED',
      agreementId: 'ag-1',
      disagreement: null,
    });
  });

  it('trusts the lease over the unit status', () => {
    // Rule 1: a tenancy ended last month and nobody flipped the unit.
    const verdict = classifyUnit(unit({ status: 'OCCUPIED' }), [], NOW);
    expect(verdict.occupancy).toBe('VACANT');
    expect(verdict.disagreement).toBe('FLAGGED_OCCUPIED_BUT_NO_LEASE');
  });

  it('flags a leased unit still marked VACANT', () => {
    // The rent roll has lost a row.
    const verdict = classifyUnit(
      unit({ status: 'VACANT' }),
      [agreement()],
      NOW,
    );
    expect(verdict.occupancy).toBe('OCCUPIED');
    expect(verdict.disagreement).toBe('LEASED_BUT_FLAGGED_VACANT');
  });

  it('does not flag a genuinely vacant unit', () => {
    const verdict = classifyUnit(unit({ status: 'VACANT' }), [], NOW);
    expect(verdict.disagreement).toBeNull();
  });

  it('takes MAINTENANCE from the unit status, since no lease can be in a stripped flat', () => {
    expect(
      classifyUnit(unit({ status: 'MAINTENANCE' }), [], NOW).occupancy,
    ).toBe('MAINTENANCE');
  });

  it('does not call a stripped flat occupied just because an old lease exists', () => {
    // The lease is gone and the unit is being refurbished: MAINTENANCE wins, because
    // counting it as occupied would be reporting a tenancy that does not exist.
    expect(
      classifyUnit(
        unit({ status: 'MAINTENANCE' }),
        [agreement({ status: 'TERMINATED' })],
        NOW,
      ).occupancy,
    ).toBe('MAINTENANCE');
  });

  it('treats RESERVED as held, not vacant', () => {
    expect(classifyUnit(unit({ status: 'RESERVED' }), [], NOW).occupancy).toBe(
      'RESERVED',
    );
  });

  it('ignores agreements belonging to another unit', () => {
    expect(
      classifyUnit(
        unit({ status: 'VACANT' }),
        [agreement({ unitId: 'other' })],
        NOW,
      ).occupancy,
    ).toBe('VACANT');
  });
});

describe('percentage', () => {
  it('is null when the denominator is zero, not NaN and not 0', () => {
    // Rule 4: a blank cell reads as "no data"; 0% is a claim.
    expect(percentage(0, 0)).toBeNull();
    expect(percentage(5, 0)).toBeNull();
  });

  it('rounds once, to one decimal', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(2, 3)).toBe(66.7);
  });

  it('clamps a double-counted unit instead of reporting over 100%', () => {
    // Rule 5: 108% occupancy looks like a bug in the report rather than in the data.
    expect(percentage(11, 10)).toBe(100);
    expect(percentage(-1, 10)).toBe(0);
  });
});

describe('occupancyMetrics', () => {
  const units = [
    unit({ id: 'u1', code: 'A1', status: 'OCCUPIED' }),
    unit({ id: 'u2', code: 'A2', status: 'OCCUPIED' }),
    unit({ id: 'u3', code: 'A3', status: 'VACANT' }),
    unit({ id: 'u4', code: 'A4', status: 'MAINTENANCE' }),
  ];
  const agreements = [
    agreement({ id: 'ag-1', unitId: 'u1' }),
    agreement({ id: 'ag-2', unitId: 'u2' }),
  ];

  it('excludes maintenance from the occupancy denominator', () => {
    // Two of four flats stripped for refurbishment is 100% of the occupiable ones full,
    // not 50%. Counting refurbishment as vacancy is the classic way this misleads.
    const metrics = occupancyMetrics(units, agreements, NOW);
    expect(metrics.totalUnits).toBe(4);
    expect(metrics.occupied).toBe(2);
    expect(metrics.maintenance).toBe(1);
    expect(metrics.occupancyPercent).toBe(66.7);
    expect(metrics.vacancyPercent).toBe(33.3);
  });

  it('counts a unit occupied by lease even when flagged vacant, and flags it', () => {
    const metrics = occupancyMetrics(
      [...units, unit({ id: 'u5', code: 'A5', status: 'VACANT' })],
      [...agreements, agreement({ id: 'ag-5', unitId: 'u5' })],
      NOW,
    );
    expect(metrics.occupied).toBe(3);
    expect(metrics.disagreements).toBe(1);
  });

  it('is null occupancy for an estate with nothing occupiable', () => {
    const metrics = occupancyMetrics(
      [unit({ id: 'u9', status: 'MAINTENANCE' })],
      [],
      NOW,
    );
    expect(metrics.occupancyPercent).toBeNull();
    expect(metrics.vacancyPercent).toBeNull();
  });

  it('is null for an empty estate rather than 100%', () => {
    const metrics = occupancyMetrics([], [], NOW);
    expect(metrics.totalUnits).toBe(0);
    expect(metrics.occupancyPercent).toBeNull();
  });

  it('buckets every unit into exactly one occupancy state', () => {
    const metrics = occupancyMetrics(units, agreements, NOW);
    const summed =
      metrics.byOccupancy.OCCUPIED +
      metrics.byOccupancy.VACANT +
      metrics.byOccupancy.MAINTENANCE +
      metrics.byOccupancy.RESERVED;
    expect(summed).toBe(metrics.totalUnits);
  });
});

describe('monthEnds', () => {
  it('returns one point per month, oldest first', () => {
    const points = monthEnds(new Date('2026-01-15'), NOW);
    expect(points).toHaveLength(6);
    expect(points[0].getMonth()).toBe(0);
    expect(points[points.length - 1].getMonth()).toBe(5);
    // Ascending: a chart whose axis runs backwards reads as a collapse.
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].getTime()).toBeGreaterThan(points[i - 1].getTime());
    }
  });

  it('includes a partial first month, because the query needs the same point', () => {
    // Otherwise the chart has fewer bars than the axis has labels, which is the most
    // common way a trend reads as a collapse when nothing happened.
    const points = monthEnds(new Date('2026-03-31'), NOW);
    expect(points[0].getMonth()).toBe(2);
  });

  it('clamps a decade-long request', () => {
    expect(monthEnds(new Date('2015-01-01'), NOW)).toHaveLength(24);
  });

  it('honours a smaller cap', () => {
    expect(monthEnds(new Date('2024-01-01'), NOW, 6)).toHaveLength(6);
  });

  it('returns a single point when from and to are the same month', () => {
    expect(monthEnds(new Date('2026-06-01'), NOW)).toHaveLength(1);
  });
});

describe('percentageChange', () => {
  it('computes the change', () => {
    expect(percentageChange(100, 150)).toBe(50);
    expect(percentageChange(150, 100)).toBe(-33.3);
  });

  it('is null with no baseline, rather than 0%', () => {
    // Rendering 0% for growth from nothing is worse than rendering nothing, because
    // 0% is a claim.
    expect(percentageChange(0, 50)).toBeNull();
  });

  it('is 0% for no change', () => {
    expect(percentageChange(42, 42)).toBe(0);
  });
});
