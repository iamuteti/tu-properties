import { AccessCardStatus } from '@prisma/client';

/**
 * Module 13 — the access-card lifecycle.
 *
 * ```
 *   issue ──► ACTIVE ◄── reactivate ──► SUSPENDED
 *               │  │                        │
 *               │  └── mark lost ──► LOST ─┘ (revoked, not reactivated)
 *               │                         │
 *               ├── expire ──► EXPIRED    └──► REVOKED (terminal, reason required)
 *               └────────────────────────────►
 * ```
 *
 * Two decisions here are the reason this is a state machine rather than a column:
 *
 * **A lost card is never reactivated.** It is the one transition everybody expects
 * to be allowed and must not be. A lost card has been in somebody else's pocket,
 * so its number has to be treated as compromised: reactivating it means two people
 * hold "card 014" and one of them is whoever found it. The way back is to issue a
 * *new* card and record it in `replacementCardId`, which is also the only way the
 * history answers "how many times has this resident lost their fob".
 *
 * **`EXPIRED` is derived *and* settable.** A contractor's visa runs out before
 * their card does, and nobody is going to be at a reader at 23:59 on the expiry
 * date to notice. So the effective status is computed on read from `expiresAt`, and
 * the column exists for the cases the clock cannot see. A card whose `expiresAt`
 * has passed therefore *behaves* as expired whichever column value it holds, and
 * that is stated in `effectiveStatus` rather than left to be discovered.
 *
 * Pure, exhaustive and unit-tested. `status` is in no update DTO.
 */

export const ACCESS_CARD_STATUS_LABEL: Record<AccessCardStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  LOST: 'Reported lost',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

export type AccessCardAction =
  | 'SUSPEND'
  | 'REACTIVATE'
  | 'MARK_LOST'
  | 'MARK_EXPIRED'
  | 'REVOKE'
  | 'RECORD_REPLACEMENT';

export const ACCESS_CARD_ACTIONS: AccessCardAction[] = [
  'SUSPEND',
  'REACTIVATE',
  'MARK_LOST',
  'MARK_EXPIRED',
  'REVOKE',
  'RECORD_REPLACEMENT',
];

export interface CardTransitionContext {
  status: AccessCardStatus;
  expiresAt?: Date | null;
  now?: Date;
  /** Required to suspend, revoke or record a loss — see the notes per action. */
  note?: string | null;
  /** For `RECORD_REPLACEMENT`: the card issued in place of this one. */
  replacementCardId?: string | null;
}

export type CardTransitionResult =
  | { ok: true; status: AccessCardStatus }
  | { ok: false; reason: string };

const refuse = (reason: string): CardTransitionResult => ({
  ok: false,
  reason,
});

/**
 * What the card actually does at the gate, today.
 *
 * `EXPIRED` wins over everything except a card that has already been ended. That
 * ordering is the point: a card with a `REVOKED` column and a future `expiresAt`
 * is revoked, and a card with an `ACTIVE` column and a past `expiresAt` is
 * expired, because relying on somebody to have flipped the column is how an
 * expired contractor badge stays valid for a month.
 */
export function effectiveStatus(
  status: AccessCardStatus,
  expiresAt?: Date | null,
  now = new Date(),
): AccessCardStatus {
  if (status === AccessCardStatus.REVOKED || status === AccessCardStatus.LOST) {
    return status;
  }
  if (expiresAt && expiresAt <= now) return AccessCardStatus.EXPIRED;
  return status;
}

/** Only an effective ACTIVE card opens anything. */
export function isUsable(
  status: AccessCardStatus,
  expiresAt?: Date | null,
  now = new Date(),
): boolean {
  return effectiveStatus(status, expiresAt, now) === AccessCardStatus.ACTIVE;
}

/**
 * The one place a card changes state.
 *
 * A note is required wherever somebody might later ask why: a suspension, a loss
 * and a revocation are all decisions that outlive the person who made them, and
 * "revoked" with no reason is the row nobody can defend at a residents' meeting.
 */
export function cardTransition(
  action: AccessCardAction,
  context: CardTransitionContext,
): CardTransitionResult {
  const now = context.now ?? new Date();
  const { status } = context;
  const state = effectiveStatus(status, context.expiresAt, now);

  switch (action) {
    case 'SUSPEND': {
      if (state !== AccessCardStatus.ACTIVE) {
        return refuse(
          `Only an active card can be suspended; this one is ${ACCESS_CARD_STATUS_LABEL[state].toLowerCase()}.`,
        );
      }
      if (!context.note?.trim()) {
        return refuse(
          'Give a reason for the suspension so it can be lifted deliberately rather than forgotten.',
        );
      }
      return { ok: true, status: AccessCardStatus.SUSPENDED };
    }

    case 'REACTIVATE': {
      // The expiry case is checked before the state case, and the order is not
      // cosmetic: `effectiveStatus` has already rewritten a card that passed its
      // date as EXPIRED, so the generic "only a suspended card" message would
      // otherwise win — and "bring this back" is the wrong advice for a card that
      // nobody approved extending.
      if (
        status === AccessCardStatus.SUSPENDED &&
        context.expiresAt &&
        context.expiresAt <= now
      ) {
        return refuse(
          'This card passed its expiry date while it was suspended. Issue a new one — bringing this back would extend access nobody approved.',
        );
      }
      if (state !== AccessCardStatus.SUSPENDED) {
        return refuse(
          `Only a suspended card can be brought back into use; this one is ${ACCESS_CARD_STATUS_LABEL[state].toLowerCase()}.`,
        );
      }
      return { ok: true, status: AccessCardStatus.ACTIVE };
    }

    case 'MARK_LOST': {
      if (
        state !== AccessCardStatus.ACTIVE &&
        state !== AccessCardStatus.SUSPENDED
      ) {
        return refuse(
          `Only a card in use can be reported lost; this one is ${ACCESS_CARD_STATUS_LABEL[state].toLowerCase()}.`,
        );
      }
      if (!context.note?.trim()) {
        return refuse(
          'Say where or how it was lost. A lost card is treated as compromised, and "we think it might be somewhere" is not a reason to end somebody\'s access.',
        );
      }
      // Deliberately terminal. See the module note.
      return { ok: true, status: AccessCardStatus.LOST };
    }

    case 'MARK_EXPIRED': {
      if (state === AccessCardStatus.EXPIRED) {
        return refuse('This card is already expired.');
      }
      if (
        state === AccessCardStatus.REVOKED ||
        state === AccessCardStatus.LOST
      ) {
        return refuse(
          `A ${ACCESS_CARD_STATUS_LABEL[state].toLowerCase()} card cannot also be expired. It already opens nothing.`,
        );
      }
      return { ok: true, status: AccessCardStatus.EXPIRED };
    }

    case 'REVOKE': {
      if (state === AccessCardStatus.REVOKED) {
        return refuse('This card is already revoked.');
      }
      if (state === AccessCardStatus.LOST) {
        return refuse(
          'A card already reported lost is not also revoked — it opens nothing either way. Record the replacement instead.',
        );
      }
      if (!context.note?.trim()) {
        return refuse(
          'Revoking a card needs a reason. This is the record somebody will be asked about after a dispute, and it cannot be undone.',
        );
      }
      return { ok: true, status: AccessCardStatus.REVOKED };
    }

    case 'RECORD_REPLACEMENT': {
      if (
        state !== AccessCardStatus.LOST &&
        state !== AccessCardStatus.REVOKED
      ) {
        return refuse(
          'Only a card that has been reported lost or revoked has a replacement — a card still in use does not need one.',
        );
      }
      if (!context.replacementCardId) {
        return refuse(
          'Issue the replacement card first, then record it here, so the history shows which new card took over from which.',
        );
      }
      // Recording a replacement does not change this card's status: it is already
      // terminal. What it changes is the other end of the chain, which is why the
      // success value is the *current* status.
      return { ok: true, status };
    }

    default: {
      const unreachable: never = action;
      return refuse(`Unknown access-card action: ${String(unreachable)}`);
    }
  }
}

/**
 * Which actions the server would accept right now. Drives the row-action menu.
 *
 * As in `booking-lifecycle.ts`, the placeholder note is deliberate: `SUSPEND`,
 * `MARK_LOST` and `REVOKE` all *refuse* without one, so passing the caller's real
 * context through would report them as impossible and leave a card with no
 * available action at all. This answers "which actions could be taken here", and
 * the form collects the note.
 */
export function availableCardActions(
  context: CardTransitionContext,
): AccessCardAction[] {
  const withNote: CardTransitionContext = {
    ...context,
    note: context.note ?? '—',
  };
  return ACCESS_CARD_ACTIONS.filter(
    (action) => cardTransition(action, withNote).ok,
  );
}

export interface CardExpiry {
  expired: boolean;
  /** Negative once expired. Null for a card that never expires. */
  daysUntilExpiry: number | null;
  /** Soon enough that somebody should be renewing it. */
  expiringSoon: boolean;
}

/** The renewal nudge, derived on read. 30 days is a lease, not a week. */
export const EXPIRY_WARNING_DAYS = 30;

export function cardExpiry(
  expiresAt: Date | null | undefined,
  now = new Date(),
  warningDays = EXPIRY_WARNING_DAYS,
): CardExpiry {
  if (!expiresAt)
    return { expired: false, daysUntilExpiry: null, expiringSoon: false };

  const ms = expiresAt.getTime() - now.getTime();
  const days = Math.floor(ms / 86400000);

  return {
    expired: ms <= 0,
    daysUntilExpiry: days,
    expiringSoon: ms > 0 && days <= warningDays,
  };
}

/** `AC-0142`. Card numbers come off a per-estate printer, so unique per org. */
export function formatCardNumber(sequence: number): string {
  return `AC-${String(sequence).padStart(4, '0')}`;
}
