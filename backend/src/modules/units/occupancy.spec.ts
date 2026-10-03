import { AgreementStatus, UnitStatus } from '@prisma/client';
import {
  ALL_UNIT_STATUSES,
  buildOccupancyContext,
  checkTransition,
  deriveOccupancyStatus,
} from './occupancy';

/**
 * Occupancy is the one piece of Unit state that must never disagree with the
 * unit's rental agreements, so the rules are tested as pure functions (no
 * database, no Nest).
 */
describe('unit occupancy rules', () => {
  const today = new Date('2026-06-01T00:00:00.000Z');
  const past = new Date('2026-01-01T00:00:00.000Z');
  const future = new Date('2026-12-01T00:00:00.000Z');

  const activeLease = {
    status: AgreementStatus.ACTIVE,
    startDate: past,
    endDate: future,
  };
  const endedLease = {
    status: AgreementStatus.ACTIVE,
    startDate: past,
    endDate: past,
  };
  const terminatedLease = {
    status: AgreementStatus.TERMINATED,
    startDate: past,
    endDate: null,
  };
  const draftLease = {
    status: AgreementStatus.DRAFT,
    startDate: past,
    endDate: future,
  };

  const noLeases = { hasActiveLease: false, hasUpcomingLease: false };
  const withActiveLease = { hasActiveLease: true, hasUpcomingLease: false };

  describe('deriveOccupancyStatus', () => {
    it('reports OCCUPIED when an active agreement covers today', () => {
      expect(
        deriveOccupancyStatus([activeLease], UnitStatus.VACANT, today),
      ).toBe(UnitStatus.OCCUPIED);
    });

    it('reports RESERVED for a signed lease that has not started', () => {
      const upcoming = {
        status: AgreementStatus.ACTIVE,
        startDate: future,
        endDate: null,
      };
      expect(deriveOccupancyStatus([upcoming], UnitStatus.VACANT, today)).toBe(
        UnitStatus.RESERVED,
      );
    });

    it('falls back to VACANT once the only lease has ended', () => {
      expect(
        deriveOccupancyStatus([endedLease], UnitStatus.OCCUPIED, today),
      ).toBe(UnitStatus.VACANT);
    });

    it('ignores terminated and draft agreements', () => {
      expect(
        deriveOccupancyStatus(
          [terminatedLease, draftLease],
          UnitStatus.OCCUPIED,
          today,
        ),
      ).toBe(UnitStatus.VACANT);
    });

    it('never clears a maintenance hold on its own', () => {
      expect(deriveOccupancyStatus([], UnitStatus.MAINTENANCE, today)).toBe(
        UnitStatus.MAINTENANCE,
      );
    });

    it('keeps a vacant unit vacant when there are no agreements', () => {
      expect(deriveOccupancyStatus([], UnitStatus.VACANT, today)).toBe(
        UnitStatus.VACANT,
      );
    });
  });

  describe('buildOccupancyContext', () => {
    it('detects an active lease and labels it for the error message', () => {
      const context = buildOccupancyContext([activeLease], today);
      expect(context.hasActiveLease).toBe(true);
      expect(context.activeLeaseLabel).toContain('2026-01-01');
    });

    it('does not treat a lease that already ended as active', () => {
      expect(buildOccupancyContext([endedLease], today).hasActiveLease).toBe(
        false,
      );
    });
  });

  describe('checkTransition', () => {
    it('refuses OCCUPIED without an active agreement', () => {
      const result = checkTransition(
        UnitStatus.VACANT,
        UnitStatus.OCCUPIED,
        noLeases,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/active rental agreement/i);
    });

    it('allows OCCUPIED when a lease is active', () => {
      expect(
        checkTransition(UnitStatus.VACANT, UnitStatus.OCCUPIED, withActiveLease)
          .allowed,
      ).toBe(true);
    });

    it('refuses VACANT while a lease is still active', () => {
      const result = checkTransition(UnitStatus.OCCUPIED, UnitStatus.VACANT, {
        ...withActiveLease,
        activeLeaseLabel: 'agreement ACTIVE',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/terminate or expire/i);
    });

    it('refuses MAINTENANCE while a lease is still active', () => {
      expect(
        checkTransition(
          UnitStatus.OCCUPIED,
          UnitStatus.MAINTENANCE,
          withActiveLease,
        ).allowed,
      ).toBe(false);
    });

    it('allows MAINTENANCE once no lease is active', () => {
      expect(
        checkTransition(UnitStatus.VACANT, UnitStatus.MAINTENANCE, noLeases)
          .allowed,
      ).toBe(true);
    });

    it('allows RESERVED for an upcoming signed lease', () => {
      expect(
        checkTransition(UnitStatus.VACANT, UnitStatus.RESERVED, {
          hasActiveLease: false,
          hasUpcomingLease: true,
        }).allowed,
      ).toBe(true);
    });

    it('refuses RESERVED with no agreement at all', () => {
      expect(
        checkTransition(UnitStatus.VACANT, UnitStatus.RESERVED, noLeases)
          .allowed,
      ).toBe(false);
    });

    it('treats re-applying the current status as a no-op', () => {
      expect(
        checkTransition(UnitStatus.VACANT, UnitStatus.VACANT, withActiveLease)
          .allowed,
      ).toBe(true);
    });

    it('can always reach VACANT when no lease is active', () => {
      for (const current of ALL_UNIT_STATUSES) {
        if (current === UnitStatus.VACANT) continue;
        expect(
          checkTransition(current, UnitStatus.VACANT, noLeases).allowed,
        ).toBe(true);
      }
    });
  });
});
