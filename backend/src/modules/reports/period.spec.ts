import { DEFAULT_MONTHS_BACK, MAX_MONTHS_BACK, resolvePeriod } from './period';

/**
 * Regression tests for a bug the *service* had, not the arithmetic.
 *
 * `resolvePeriod` used to subtract twelve months from a `from` the caller had supplied,
 * so `?from=2026-06-01&to=2026-06-30` answered the eighteen months ending June 2026 - and
 * reported `clamped: false` while doing it. It lived as a module-private function in a
 * 34 KB service, which is precisely why nothing caught it: the arithmetic
 * (`setMonth(getMonth() - 12)`) reads as obviously correct, and no test could reach it.
 *
 * Every case below is a shape the endpoint was actually called with during the live run.
 */
describe('resolvePeriod', () => {
  describe('a caller-supplied window is honoured exactly', () => {
    // The bug lived here. All three of these returned a window a year too wide.
    it('does not widen a single month', () => {
      const period = resolvePeriod('2026-06-01', '2026-06-30');
      expect(period.from.toISOString().slice(0, 10)).toBe('2026-06-01');
      expect(period.to.toISOString().slice(0, 10)).toBe('2026-06-30');
    });

    it('does not widen a two-month window', () => {
      const period = resolvePeriod('2026-02-01', '2026-03-31');
      expect(period.from.toISOString().slice(0, 10)).toBe('2026-02-01');
    });

    it('honours a mid-month start rather than snapping it to the 1st', () => {
      // A "helpful" snap to the month boundary is still not the window that was asked
      // for. If this ever becomes desirable it should be a separate, named behaviour.
      const period = resolvePeriod('2026-06-15', '2026-06-30');
      expect(period.from.toISOString().slice(0, 10)).toBe('2026-06-15');
    });

    it('reports clamped=false, because the window is the requested one', () => {
      expect(resolvePeriod('2026-06-01', '2026-06-30').clamped).toBe(false);
    });

    it('handles a window that crosses a year boundary', () => {
      const period = resolvePeriod('2025-11-01', '2026-02-28');
      expect(period.from.toISOString().slice(0, 10)).toBe('2025-11-01');
      expect(period.to.toISOString().slice(0, 10)).toBe('2026-02-28');
    });
  });

  describe('the default is a guess, and is allowed to be', () => {
    const NOW = '2026-10-07T09:00:00.000Z';

    it('defaults to twelve months back, snapped to the first of the month', () => {
      const period = resolvePeriod(undefined, NOW);
      expect(period.from.toISOString().slice(0, 10)).toBe('2025-10-01');
      expect(period.from.getTime()).toBe(Date.UTC(2025, 9, 1));
    });

    it('builds the boundary in UTC, not local midnight', () => {
      // On a UTC+3 server a *local* October 1 is `2025-09-30T21:00:00Z`, which silently
      // pulls three hours of September into an October report. This assertion is written
      // with `Date.UTC` deliberately: replacing it with `new Date(2025, 9, 1)` would make
      // it pass on a UTC machine and quietly reintroduce the skew everywhere else.
      const period = resolvePeriod(undefined, NOW);
      expect(period.from.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    });

    it('does not report the default as clamped', () => {
      // The default is not "a change to the request" - there was no request to change.
      expect(resolvePeriod(undefined, NOW).clamped).toBe(false);
    });

    it('does not report a supplied window as clamped either', () => {
      expect(resolvePeriod('2026-01-01', NOW).clamped).toBe(false);
    });

    it('defaults `to` to now when only `from` is given', () => {
      const before = Date.now();
      const period = resolvePeriod('2026-01-01');
      expect(period.from.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(period.to.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('the floor is applied and reported', () => {
    it('refuses to run further back than MAX_MONTHS_BACK', () => {
      const period = resolvePeriod('2000-01-01', '2026-10-07');
      expect(period.from.getTime()).toBe(
        Date.UTC(2026, 9 - MAX_MONTHS_BACK, 1),
      );
    });

    it('sets clamped when the floor moved the window', () => {
      expect(resolvePeriod('2000-01-01', '2026-10-07').clamped).toBe(true);
    });

    it('leaves clamped alone for a window inside the floor', () => {
      expect(resolvePeriod('2024-01-01', '2026-10-07').clamped).toBe(false);
    });
  });

  describe('month arithmetic', () => {
    // The original used `setMonth()` on a live date, which is how a report ends up
    // covering February 31th and silently rolling into March.
    it('does not roll a 31st forward into the next month', () => {
      const period = resolvePeriod(undefined, '2026-03-31T00:00:00.000Z');
      expect(period.from.getUTCMonth()).toBe(2); // March, not April
      expect(period.from.getUTCDate()).toBe(1);
    });

    it('crosses the year boundary backwards correctly', () => {
      const period = resolvePeriod(undefined, '2026-01-15T00:00:00.000Z');
      expect(period.from.getUTCFullYear()).toBe(2025);
      expect(period.from.getUTCMonth()).toBe(0); // January 2025
    });

    it('uses a default that is a whole number of months', () => {
      expect(DEFAULT_MONTHS_BACK).toBe(12);
    });
  });
});
