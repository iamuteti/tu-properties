import { AgreementStatus } from '@prisma/client';
import {
  ACTIONS_BY_STATUS,
  availableAgreementActions,
  checkAgreementAction,
  daysUntilEnd,
  RENEWAL_WINDOW_DAYS,
  type AgreementGateContext,
} from './agreement-lifecycle';

/**
 * The agreement lifecycle is the acceptance criterion for this module: an
 * agreement must be creatable, renewable and terminable, with correct occupancy
 * side-effects. These tests pin which transitions are legal and why.
 */
describe('agreement lifecycle', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const days = (offset: number) =>
    new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);

  const base: AgreementGateContext = {
    startDate: days(-180),
    endDate: days(30),
  };

  describe('checkLeaseAction', () => {
    it('activates a drafted lease that has started', () => {
      expect(
        checkAgreementAction(AgreementStatus.DRAFT, 'ACTIVATE', base, now)
          .allowed,
      ).toBe(true);
    });

    it('refuses to activate an agreement that has not started yet', () => {
      const result = checkAgreementAction(
        AgreementStatus.DRAFT,
        'ACTIVATE',
        { ...base, startDate: days(30) },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/starts on/i);
    });

    it('refuses to activate when the unit is already let', () => {
      const result = checkAgreementAction(
        AgreementStatus.DRAFT,
        'ACTIVATE',
        { ...base, hasOtherActiveAgreement: true },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/already has an active agreement/i);
    });

    it('refuses to activate while a move-out request is open', () => {
      const result = checkAgreementAction(
        AgreementStatus.DRAFT,
        'ACTIVATE',
        { ...base, moveOutRequested: true },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/move-out request/i);
    });

    it('renews inside the renewal window', () => {
      expect(
        checkAgreementAction(AgreementStatus.ACTIVE, 'RENEW', base, now)
          .allowed,
      ).toBe(true);
    });

    it('refuses to renew before the renewal window opens', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'RENEW',
        { ...base, endDate: days(RENEWAL_WINDOW_DAYS + 30) },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/renewal opens/i);
    });

    it('refuses to renew an open-ended agreement — extend it instead', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'RENEW',
        { ...base, endDate: null },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/no end date/i);
    });

    it('refuses to renew a tenancy with a move-out request', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'RENEW',
        { ...base, moveOutRequested: true },
        now,
      );
      expect(result.allowed).toBe(false);
    });

    it('allows an extension of an open-ended agreement', () => {
      expect(
        checkAgreementAction(
          AgreementStatus.ACTIVE,
          'EXTEND',
          { ...base, endDate: null },
          now,
        ).allowed,
      ).toBe(true);
    });

    it('allows early termination even with rent outstanding', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'TERMINATE',
        { ...base, arrears: 45000, outstandingRent: 90000 },
        now,
      );
      expect(result.allowed).toBe(true);
    });

    it('expires an agreement that has passed its end date', () => {
      expect(
        checkAgreementAction(
          AgreementStatus.ACTIVE,
          'EXPIRE',
          { ...base, endDate: days(-1) },
          now,
        ).allowed,
      ).toBe(true);
    });

    it('refuses to expire an agreement that has not ended', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'EXPIRE',
        { ...base, endDate: days(30) },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/does not end until/i);
    });

    it('refuses to expire an open-ended agreement', () => {
      const result = checkAgreementAction(
        AgreementStatus.ACTIVE,
        'EXPIRE',
        { ...base, endDate: null },
        now,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/terminate it instead/i);
    });

    it('reactivates an expired agreement when the unit is free', () => {
      expect(
        checkAgreementAction(AgreementStatus.EXPIRED, 'REACTIVATE', base, now)
          .allowed,
      ).toBe(true);
    });

    it('refuses to reactivate when the unit is already let', () => {
      expect(
        checkAgreementAction(
          AgreementStatus.EXPIRED,
          'REACTIVATE',
          { ...base, hasOtherActiveAgreement: true },
          now,
        ).allowed,
      ).toBe(false);
    });

    it('refuses everything on a closed agreement', () => {
      for (const action of [
        'RENEW',
        'EXTEND',
        'TERMINATE',
        'EXPIRE',
        'ACTIVATE',
      ] as const) {
        const result = checkAgreementAction(
          AgreementStatus.RENEWED,
          action,
          base,
          now,
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/cannot be/i);
      }
    });

    it('refuses to terminate a renewed or terminated agreement', () => {
      expect(
        checkAgreementAction(AgreementStatus.RENEWED, 'TERMINATE', base, now)
          .allowed,
      ).toBe(false);
      expect(
        checkAgreementAction(AgreementStatus.TERMINATED, 'TERMINATE', base, now)
          .allowed,
      ).toBe(false);
    });
  });

  describe('availableLeaseActions', () => {
    it('offers activate and terminate on a draft', () => {
      expect(
        availableAgreementActions(AgreementStatus.DRAFT, base, now),
      ).toEqual(['ACTIVATE', 'TERMINATE']);
    });

    it('offers renewal only inside the window', () => {
      expect(
        availableAgreementActions(AgreementStatus.ACTIVE, base, now),
      ).toEqual(['RENEW', 'EXTEND', 'TERMINATE']);
      expect(
        availableAgreementActions(
          AgreementStatus.ACTIVE,
          { ...base, endDate: days(RENEWAL_WINDOW_DAYS + 30) },
          now,
        ),
      ).toEqual(['EXTEND', 'TERMINATE']);
    });

    it('offers nothing on a closed lease', () => {
      expect(
        availableAgreementActions(AgreementStatus.TERMINATED, base, now),
      ).toEqual([]);
      expect(
        availableAgreementActions(AgreementStatus.RENEWED, base, now),
      ).toEqual([]);
    });

    it('agrees with checkLeaseAction for every status and action', () => {
      const actions = Object.values(
        ACTIONS_BY_STATUS[AgreementStatus.DRAFT],
      ).concat(
        ACTIONS_BY_STATUS[AgreementStatus.ACTIVE],
        ACTIONS_BY_STATUS[AgreementStatus.EXPIRED],
      );

      for (const status of [
        AgreementStatus.DRAFT,
        AgreementStatus.ACTIVE,
        AgreementStatus.EXPIRED,
        AgreementStatus.RENEWED,
        AgreementStatus.TERMINATED,
      ]) {
        const offered = availableAgreementActions(status, base, now);
        for (const action of actions) {
          expect(offered.includes(action)).toBe(
            checkAgreementAction(status, action, base, now).allowed,
          );
        }
      }
    });
  });

  describe('daysUntilEnd', () => {
    it('counts down to the end date', () => {
      expect(daysUntilEnd(days(10), now)).toBe(10);
    });

    it('is negative once the agreement has ended', () => {
      expect(daysUntilEnd(days(-3), now)).toBe(-3);
    });

    it('is null for an open-ended agreement', () => {
      expect(daysUntilEnd(null, now)).toBeNull();
    });
  });
});
