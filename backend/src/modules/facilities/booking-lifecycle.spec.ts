import { FacilityBookingStatus } from '@prisma/client';
import {
  BOOKING_STATUS_LABEL,
  availableActions,
  bookingTiming,
  formatBookingReference,
  holdsSlot,
  initialStatus,
  transition,
  type TransitionContext,
} from './booking-lifecycle';

/**
 * `NOW` sits *between* the two fixture ends on purpose. An earlier version had
 * `NOW` at 09:00 and `PAST_END` at 12:00 the same day, which meant every
 * "refuses a past slot" test was quietly asserting against a slot in the future —
 * the tests passed the fixtures through `hasEnded` as false and only failed
 * because the expected `false` never arrived. Ordering them explicitly is what
 * makes the fixture mean what its name says.
 */
const NOW = new Date(2026, 5, 1, 15, 0, 0, 0);
const FUTURE_END = new Date(2026, 5, 10, 12, 0, 0, 0);
const PAST_END = new Date(2026, 5, 1, 12, 0, 0, 0);

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  status: FacilityBookingStatus.PENDING,
  endsAt: FUTURE_END,
  now: NOW,
  ...over,
});

describe('status labels', () => {
  it('covers every state the enum has', () => {
    for (const status of Object.values(FacilityBookingStatus)) {
      expect(BOOKING_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('holdsSlot', () => {
  it('is true only for the states that actually occupy the diary', () => {
    // These must stay in step with the migration's partial predicate: a state that
    // holds a slot here but not there means the database refuses a booking the API
    // said was fine.
    expect(holdsSlot(FacilityBookingStatus.PENDING)).toBe(true);
    expect(holdsSlot(FacilityBookingStatus.CONFIRMED)).toBe(true);
    expect(holdsSlot(FacilityBookingStatus.CANCELLED)).toBe(false);
    expect(holdsSlot(FacilityBookingStatus.REJECTED)).toBe(false);
    expect(holdsSlot(FacilityBookingStatus.NO_SHOW)).toBe(false);
  });
});

describe('initialStatus', () => {
  it('waits for approval when the facility requires it and a resident asked', () => {
    expect(initialStatus({ requiresApproval: true, madeByStaff: false })).toBe(
      FacilityBookingStatus.PENDING,
    );
  });

  it('confirms immediately when staff book on a resident behalf', () => {
    // There is already a person in the loop who could have refused, so there is
    // nothing to wait for.
    expect(initialStatus({ requiresApproval: true, madeByStaff: true })).toBe(
      FacilityBookingStatus.CONFIRMED,
    );
  });

  it('confirms when the facility does not require approval at all', () => {
    expect(initialStatus({ requiresApproval: false, madeByStaff: false })).toBe(
      FacilityBookingStatus.CONFIRMED,
    );
  });
});

describe('transition — APPROVE', () => {
  it('confirms a pending booking', () => {
    expect(transition('APPROVE', ctx())).toEqual({
      ok: true,
      status: FacilityBookingStatus.CONFIRMED,
    });
  });

  it('refuses a booking that is not pending', () => {
    for (const status of [
      FacilityBookingStatus.CONFIRMED,
      FacilityBookingStatus.CANCELLED,
      FacilityBookingStatus.REJECTED,
      FacilityBookingStatus.NO_SHOW,
    ]) {
      const result = transition('APPROVE', ctx({ status }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('awaiting approval');
    }
  });

  it('refuses to approve a slot that has already passed', () => {
    const result = transition('APPROVE', ctx({ endsAt: PAST_END }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('already passed');
  });

  it('refuses when the actor is the person who raised it', () => {
    // The control that makes an approval mean anything.
    const result = transition(
      'APPROVE',
      ctx({ actorUserId: 'user-1', bookedByUserId: 'user-1' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('raised yourself');
  });

  it('allows a different person to approve', () => {
    expect(
      transition(
        'APPROVE',
        ctx({ actorUserId: 'user-1', bookedByUserId: 'user-2' }),
      ).ok,
    ).toBe(true);
  });

  it('allows approval when the booking was raised by a resident with no user id', () => {
    expect(
      transition(
        'APPROVE',
        ctx({ actorUserId: 'user-1', bookedByUserId: null }),
      ).ok,
    ).toBe(true);
  });
});

describe('transition — REJECT', () => {
  it('rejects a pending booking when a reason is given', () => {
    expect(
      transition('REJECT', ctx({ note: 'the clubhouse is hosting the AGM' })),
    ).toEqual({ ok: true, status: FacilityBookingStatus.REJECTED });
  });

  it('refuses without a reason, because that note is all the booker will read', () => {
    const result = transition('REJECT', ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('needs a reason');
  });

  it('treats a whitespace-only note as no note', () => {
    expect(transition('REJECT', ctx({ note: '   ' })).ok).toBe(false);
  });

  it('refuses a confirmed booking — use cancel for that', () => {
    const result = transition(
      'REJECT',
      ctx({
        status: FacilityBookingStatus.CONFIRMED,
        note: 'changed our minds',
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a past slot', () => {
    expect(
      transition('REJECT', ctx({ endsAt: PAST_END, note: 'too late' })).ok,
    ).toBe(false);
  });
});

describe('transition — CANCEL', () => {
  it('cancels a pending booking with a reason', () => {
    expect(transition('CANCEL', ctx({ note: 'plans changed' }))).toEqual({
      ok: true,
      status: FacilityBookingStatus.CANCELLED,
    });
  });

  it('cancels a confirmed booking with a reason', () => {
    expect(
      transition(
        'CANCEL',
        ctx({ status: FacilityBookingStatus.CONFIRMED, note: 'plans changed' }),
      ),
    ).toEqual({ ok: true, status: FacilityBookingStatus.CANCELLED });
  });

  it('refuses without a reason', () => {
    expect(transition('CANCEL', ctx()).ok).toBe(false);
  });

  it('refuses an already-terminal booking', () => {
    for (const status of [
      FacilityBookingStatus.CANCELLED,
      FacilityBookingStatus.REJECTED,
      FacilityBookingStatus.NO_SHOW,
    ]) {
      expect(transition('CANCEL', ctx({ status, note: 'again' })).ok).toBe(
        false,
      );
    }
  });

  it('refuses a past slot and points at NO_SHOW instead', () => {
    // Cancelling a booking that already happened would erase the fact that the
    // slot was held and nobody came — the thing NO_SHOW exists to preserve.
    const result = transition(
      'CANCEL',
      ctx({
        status: FacilityBookingStatus.CONFIRMED,
        endsAt: PAST_END,
        note: 'x',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no-show');
  });
});

describe('transition — REACTIVATE', () => {
  it('brings a cancelled booking back to confirmed', () => {
    expect(
      transition(
        'REACTIVATE',
        ctx({ status: FacilityBookingStatus.CANCELLED }),
      ),
    ).toEqual({
      ok: true,
      status: FacilityBookingStatus.CONFIRMED,
    });
  });

  it('needs no reason — undoing a cancellation is not a decision to defend', () => {
    expect(
      transition('REACTIVATE', ctx({ status: FacilityBookingStatus.CANCELLED }))
        .ok,
    ).toBe(true);
  });

  it('refuses anything other than a cancellation', () => {
    for (const status of [
      FacilityBookingStatus.PENDING,
      FacilityBookingStatus.CONFIRMED,
      FacilityBookingStatus.REJECTED,
      FacilityBookingStatus.NO_SHOW,
    ]) {
      expect(transition('REACTIVATE', ctx({ status })).ok).toBe(false);
    }
  });

  it('refuses a slot that has already passed', () => {
    const result = transition(
      'REACTIVATE',
      ctx({ status: FacilityBookingStatus.CANCELLED, endsAt: PAST_END }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toContain('nothing left to bring back');
  });
});

describe('transition — MARK_NO_SHOW', () => {
  it('records a no-show once the slot has passed', () => {
    expect(
      transition(
        'MARK_NO_SHOW',
        ctx({ status: FacilityBookingStatus.CONFIRMED, endsAt: PAST_END }),
      ),
    ).toEqual({ ok: true, status: FacilityBookingStatus.NO_SHOW });
  });

  it('refuses before the slot has passed, and names the right action instead', () => {
    const result = transition(
      'MARK_NO_SHOW',
      ctx({ status: FacilityBookingStatus.CONFIRMED, endsAt: FUTURE_END }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toContain('Cancelling now is the right action');
  });

  it('refuses a booking that was never confirmed', () => {
    for (const status of [
      FacilityBookingStatus.PENDING,
      FacilityBookingStatus.CANCELLED,
      FacilityBookingStatus.REJECTED,
      FacilityBookingStatus.NO_SHOW,
    ]) {
      expect(
        transition('MARK_NO_SHOW', ctx({ status, endsAt: PAST_END })).ok,
      ).toBe(false);
    }
  });

  it('does not need a reason', () => {
    expect(
      transition(
        'MARK_NO_SHOW',
        ctx({ status: FacilityBookingStatus.CONFIRMED, endsAt: PAST_END }),
      ).ok,
    ).toBe(true);
  });
});

describe('availableActions', () => {
  it('offers approve, reject and cancel on a fresh pending booking', () => {
    // Reject and cancel need a note, which `availableActions` supplies as a
    // placeholder — see the note on the function.
    expect(availableActions(ctx()).sort()).toEqual([
      'APPROVE',
      'CANCEL',
      'REJECT',
    ]);
  });

  it('offers only cancel on a confirmed future booking', () => {
    // Not REACTIVATE (that is from CANCELLED) and not MARK_NO_SHOW (the slot has
    // not passed yet).
    expect(
      availableActions(ctx({ status: FacilityBookingStatus.CONFIRMED })),
    ).toEqual(['CANCEL']);
  });

  it('offers nothing on a rejected or no-show booking', () => {
    for (const status of [
      FacilityBookingStatus.REJECTED,
      FacilityBookingStatus.NO_SHOW,
    ]) {
      expect(availableActions(ctx({ status }))).toEqual([]);
    }
  });

  it('offers reactivate on a cancelled booking', () => {
    // CANCELLED is not terminal in this design — undoing a cancellation is a
    // normal correction, unlike undoing a rejection.
    expect(
      availableActions(ctx({ status: FacilityBookingStatus.CANCELLED })),
    ).toEqual(['REACTIVATE']);
  });

  it('offers nothing on a cancelled booking whose slot has passed', () => {
    expect(
      availableActions(
        ctx({ status: FacilityBookingStatus.CANCELLED, endsAt: PAST_END }),
      ),
    ).toEqual([]);
  });

  it('offers only no-show once a confirmed booking has passed', () => {
    expect(
      availableActions(
        ctx({ status: FacilityBookingStatus.CONFIRMED, endsAt: PAST_END }),
      ),
    ).toEqual(['MARK_NO_SHOW']);
  });

  it('does not offer approve to the person who raised the booking', () => {
    const actions = availableActions(
      ctx({ actorUserId: 'user-1', bookedByUserId: 'user-1' }),
    );
    expect(actions).not.toContain('APPROVE');
  });
});

describe('bookingTiming', () => {
  it('classifies an upcoming slot', () => {
    const timing = bookingTiming(new Date(2026, 5, 10, 10, 0), FUTURE_END, NOW);
    expect(timing.phase).toBe('UPCOMING');
    expect(timing.inProgress).toBe(false);
    expect(timing.hasHappened).toBe(false);
    expect(timing.minutesUntilStart).toBeGreaterThan(0);
  });

  it('classifies a running slot', () => {
    // Bracketed by NOW (15:00) on 1 June.
    const timing = bookingTiming(
      new Date(2026, 5, 1, 14, 0),
      new Date(2026, 5, 1, 17, 0),
      NOW,
    );
    expect(timing.phase).toBe('NOW');
    expect(timing.inProgress).toBe(true);
    expect(timing.hasEnded).toBe(false);
  });

  it('classifies a finished slot as having happened, without anybody recording it', () => {
    // This is the whole reason there is no COMPLETED state.
    const timing = bookingTiming(
      new Date(2026, 4, 31, 10, 0),
      new Date(2026, 4, 31, 12, 0),
      NOW,
    );
    expect(timing.phase).toBe('PAST');
    expect(timing.hasHappened).toBe(true);
    expect(timing.minutesUntilEnd).toBeLessThan(0);
  });

  it('treats the exact end instant as finished, matching the half-open range', () => {
    const timing = bookingTiming(
      new Date(2026, 5, 1, 8, 0),
      new Date(2026, 5, 1, 9, 0),
      new Date(2026, 5, 1, 9, 0),
    );
    expect(timing.hasEnded).toBe(true);
    expect(timing.inProgress).toBe(false);
  });
});

describe('formatBookingReference', () => {
  it('zero-pads so references sort and quote alike', () => {
    expect(formatBookingReference(7)).toBe('FB-0007');
    expect(formatBookingReference(1234)).toBe('FB-1234');
  });
});
