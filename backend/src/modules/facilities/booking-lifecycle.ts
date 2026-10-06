import { FacilityBookingStatus } from '@prisma/client';

/**
 * Module 13 — the booking lifecycle.
 *
 * Five states and no sixth, chosen so that every one of them is something a person
 * *decides* rather than something that happens to a row while nobody is looking:
 *
 * ```
 *                 approve
 *   PENDING ──────────────────► CONFIRMED ──────► NO_SHOW
 *      │                           │  ▲             (the slot passed, nobody came)
 *      │ reject                    │  │ reactivate
 *      ▼                           ▼  │
 *   REJECTED                    CANCELLED
 *                                  ▲
 *                    cancel       │  cancel
 *   CONFIRMED ─────────────────────┘
 * ```
 *
 * The decision worth recording: **there is no `COMPLETED`.** Every other module in
 * this codebase that has a "finished" state sets it from a button —
 * `WorkOrderStatus.COMPLETED`, `PayrollRunStatus.PAID`, `InspectionStatus` — and in
 * each case that is right, because somebody did the work and had to say so. A
 * booking is different: it is over when the clock says `endsAt` has passed, and a
 * `COMPLETED` column would be a second copy of that fact that somebody has to keep
 * in step by hand. So "has this already happened" is derived on read
 * (`bookingTiming`), and `NO_SHOW` is the only past-tense state because it is a
 * judgement — somebody looked at an empty clubhouse at 14:00 and recorded that
 * the person who booked it did not come.
 *
 * `PENDING` is reachable **only** on a facility with `requiresApproval`. That is
 * enforced by the service at creation and again here at transition time, because
 * the two are different questions: "may this request wait?" is asked when the
 * booking is made, and "may this pending booking be approved?" is asked later, by
 * a different person, against a facility whose setting may have changed since.
 *
 * Pure and dependency-free, so it can be exhaustively tested. `status` appears in
 * **no** update DTO — every move below is a named action on the controller.
 */

export const BOOKING_STATUS_LABEL: Record<FacilityBookingStatus, string> = {
  PENDING: 'Awaiting approval',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  NO_SHOW: 'No show',
};

/** What each state means for the person who booked it, in their words. */
export const BOOKING_STATUS_ADVICE: Record<FacilityBookingStatus, string> = {
  PENDING: 'Waiting for somebody to confirm the slot.',
  CONFIRMED: 'The slot is held.',
  CANCELLED: 'The slot has been given up.',
  REJECTED: 'The booking was declined.',
  NO_SHOW: 'The slot passed and nobody came.',
};

export type BookingAction =
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'REACTIVATE'
  | 'MARK_NO_SHOW';

/**
 * The moves this module is willing to make.
 *
 * Returned rather than hard-coded at each call site so the client can render
 * exactly the buttons the server would accept — the same approach
 * `work-order-lifecycle.ts` and `procurement-lifecycle.ts` use, and for the same
 * reason: a UI that offers an action the API refuses is a support ticket, and a
 * UI that hides one the API allows is a mystery.
 */
export const BOOKING_ACTIONS: BookingAction[] = [
  'APPROVE',
  'REJECT',
  'CANCEL',
  'REACTIVATE',
  'MARK_NO_SHOW',
];

/** Only these states hold a slot. Mirrors the migration's partial predicate. */
export const SLOT_HOLDING_STATUSES: FacilityBookingStatus[] = [
  FacilityBookingStatus.PENDING,
  FacilityBookingStatus.CONFIRMED,
];

export function holdsSlot(status: FacilityBookingStatus): boolean {
  return SLOT_HOLDING_STATUSES.includes(status);
}

export interface TransitionContext {
  status: FacilityBookingStatus;
  /** The slot's end. A past booking cannot be approved, cancelled or marked. */
  endsAt: Date;
  now?: Date;
  /** The facility's setting at the moment of the decision, not at creation. */
  requiresApproval?: boolean;
  /** Set on approve/reject/cancel. A refusal with no reason is a dead end. */
  note?: string | null;
  /** The person deciding, and the person who raised it. */
  actorUserId?: string | undefined;
  bookedByUserId?: string | null;
}

export type TransitionResult =
  | { ok: true; status: FacilityBookingStatus }
  | { ok: false; reason: string };

const refuse = (reason: string): TransitionResult => ({ ok: false, reason });

/**
 * Does a *new* booking start CONFIRMED or PENDING?
 *
 * A separate question from a transition, and it is the one with a rule in it: the
 * facility decides. Staff booking on a resident's behalf is confirmed
 * immediately — there is already a person in the loop who could have refused —
 * and a resident's own request on an approval facility waits.
 */
export function initialStatus(options: {
  requiresApproval: boolean;
  /** True when a member of staff pressed the button. */
  madeByStaff: boolean;
}): FacilityBookingStatus {
  return options.requiresApproval && !options.madeByStaff
    ? FacilityBookingStatus.PENDING
    : FacilityBookingStatus.CONFIRMED;
}

/**
 * The one place a booking changes state.
 *
 * Three rules that are easy to leave out and expensive to discover late:
 *
 * 1. **A past slot is frozen.** You cannot approve, cancel or mark a booking whose
 *    end has passed. Without this, "cancel" quietly becomes "erase the evidence
 *    that the clubhouse was double-booked" — the exact thing the audit trail and
 *    the `NO_SHOW` state exist to prevent.
 * 2. **A decision needs a person, and a refusal needs a reason.** `REJECT` and
 *    `CANCEL` require a note, because that note is what the person who booked it
 *    reads, and "your booking was declined" with nothing attached produces a phone
 *    call.
 * 3. **Nobody approves their own pending booking.** Absolute, and inherited from
 *    the Module 18 engine's equivalent rule — except this path does not go through
 *    the engine, so it has to say so itself.
 */
export function transition(
  action: BookingAction,
  context: TransitionContext,
): TransitionResult {
  const now = context.now ?? new Date();
  const { status, endsAt } = context;
  const hasEnded = endsAt <= now;

  switch (action) {
    case 'APPROVE': {
      if (status !== FacilityBookingStatus.PENDING) {
        return refuse(
          `Only a booking awaiting approval can be approved; this one is ${BOOKING_STATUS_LABEL[status].toLowerCase()}.`,
        );
      }
      if (hasEnded) {
        return refuse(
          'This slot has already passed, so it cannot be confirmed. Create a booking for a time that has not happened yet.',
        );
      }
      if (
        context.actorUserId &&
        context.bookedByUserId &&
        context.actorUserId === context.bookedByUserId
      ) {
        return refuse(
          'You cannot approve a booking you raised yourself. That is the one control that makes an approval mean anything.',
        );
      }
      return { ok: true, status: FacilityBookingStatus.CONFIRMED };
    }

    case 'REJECT': {
      if (status !== FacilityBookingStatus.PENDING) {
        return refuse(
          `Only a booking awaiting approval can be declined; this one is ${BOOKING_STATUS_LABEL[status].toLowerCase()}.`,
        );
      }
      if (hasEnded) {
        return refuse(
          'This slot has already passed, so declining it would be meaningless.',
        );
      }
      if (!context.note?.trim()) {
        return refuse(
          'A decline needs a reason. It is the only thing the person who booked it will read.',
        );
      }
      return { ok: true, status: FacilityBookingStatus.REJECTED };
    }

    case 'CANCEL': {
      if (
        status !== FacilityBookingStatus.PENDING &&
        status !== FacilityBookingStatus.CONFIRMED
      ) {
        return refuse(
          `This booking is already ${BOOKING_STATUS_LABEL[status].toLowerCase()} and cannot be cancelled again.`,
        );
      }
      if (hasEnded) {
        return refuse(
          'This slot has already passed. Mark it as a no-show instead — cancelling it would erase the fact that the slot was held and nobody came.',
        );
      }
      if (!context.note?.trim()) {
        return refuse(
          'Give a reason for the cancellation so the diary explains itself later.',
        );
      }
      return { ok: true, status: FacilityBookingStatus.CANCELLED };
    }

    case 'REACTIVATE': {
      if (status !== FacilityBookingStatus.CANCELLED) {
        return refuse(
          `Only a cancelled booking can be brought back; this one is ${BOOKING_STATUS_LABEL[status].toLowerCase()}.`,
        );
      }
      if (hasEnded) {
        return refuse(
          'This slot has already passed, so there is nothing left to bring back. Create a booking for a future time.',
        );
      }
      // Reinstating a booking means re-taking a slot that somebody may have been
      // refused while it was free, so the clash check is the service's job — this
      // function has no view of the diary. Stated here so the pairing is not
      // mistaken for an oversight.
      return { ok: true, status: FacilityBookingStatus.CONFIRMED };
    }

    case 'MARK_NO_SHOW': {
      if (status !== FacilityBookingStatus.CONFIRMED) {
        return refuse(
          `Only a confirmed booking can be recorded as a no-show; this one is ${BOOKING_STATUS_LABEL[status].toLowerCase()}.`,
        );
      }
      if (!hasEnded) {
        return refuse(
          'A no-show can only be recorded once the slot has passed. Cancelling now is the right action while the time is still to come.',
        );
      }
      return { ok: true, status: FacilityBookingStatus.NO_SHOW };
    }

    default: {
      // Exhaustiveness guard: adding an action above without handling it here is a
      // compile error rather than a booking silently doing nothing.
      const unreachable: never = action;
      return refuse(`Unknown booking action: ${String(unreachable)}`);
    }
  }
}

/**
 * Which actions the server would accept right now. Drives the row-action menu.
 *
 * The placeholder note is load-bearing and easy to mistake for a bug. `REJECT` and
 * `CANCEL` *refuse* without one, so calling `transition` with the caller's real
 * context would report them as impossible and the menu would only ever offer
 * `APPROVE` — the opposite of what this function is for. It answers "which actions
 * could this person take here", so it supplies a stand-in note and lets the form
 * collect the real one. Note that this is also why `APPROVE` correctly disappears
 * when the actor is the requester: that refusal has nothing to do with a note.
 */
export function availableActions(context: TransitionContext): BookingAction[] {
  const withNote: TransitionContext = { ...context, note: context.note ?? '—' };
  return BOOKING_ACTIONS.filter((action) => transition(action, withNote).ok);
}

export interface BookingTiming {
  /** Past, present or future, relative to now. */
  phase: 'PAST' | 'NOW' | 'UPCOMING';
  /** True while the slot is running — the answer to "is it happening now?". */
  inProgress: boolean;
  /** Whether the slot has already elapsed, which gates every past-tense action. */
  hasEnded: boolean;
  minutesUntilStart: number;
  minutesUntilEnd: number;
  /** Derived, never stored: is this booking something that happened? */
  hasHappened: boolean;
}

/**
 * Where the booking sits relative to the clock.
 *
 * Every answer here is computed on read, which is the whole point: there is no
 * column to fall out of step, and a booking made for 09:00 needs no job to notice
 * that 09:00 has passed.
 */
export function bookingTiming(
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): BookingTiming {
  const minutesUntilStart = Math.round(
    (startsAt.getTime() - now.getTime()) / 60000,
  );
  const minutesUntilEnd = Math.round(
    (endsAt.getTime() - now.getTime()) / 60000,
  );

  return {
    phase:
      minutesUntilStart > 0 ? 'UPCOMING' : minutesUntilEnd > 0 ? 'NOW' : 'PAST',
    inProgress: startsAt <= now && endsAt > now,
    hasEnded: endsAt <= now,
    minutesUntilStart,
    minutesUntilEnd,
    hasHappened: endsAt <= now,
  };
}

/** `FB-0007`, sequential per facility so the front desk can quote one number. */
export function formatBookingReference(sequence: number): string {
  return `FB-${String(sequence).padStart(4, '0')}`;
}
