import { AgreementStatus, UnitStatus } from '@prisma/client';

/**
 * Occupancy rules for units (Module 2).
 *
 * `Unit.status` used to be a free-form column that any `PATCH /units/:id`
 * could set, so a unit could claim to be VACANT while holding an active
 * lease. The rules below make occupancy status a state machine that is always
 * checked against the unit's rental agreements, and they are deliberately
 * pure so they can be unit-tested without a database.
 */

export interface AgreementLike {
  status: AgreementStatus;
  startDate: Date;
  endDate: Date | null;
}

export interface OccupancyContext {
  /** An ACTIVE agreement whose date range covers today. */
  hasActiveLease: boolean;
  /** An agreement that is signed but not started yet (future start date). */
  hasUpcomingLease: boolean;
  /** Human label for the blocking agreement, used in the error message. */
  activeLeaseLabel?: string;
}

/** Which states a unit may move to from a given state. */
export const ALLOWED_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  [UnitStatus.VACANT]: [
    UnitStatus.OCCUPIED,
    UnitStatus.RESERVED,
    UnitStatus.MAINTENANCE,
  ],
  [UnitStatus.OCCUPIED]: [
    UnitStatus.VACANT,
    UnitStatus.MAINTENANCE,
    UnitStatus.RESERVED,
  ],
  [UnitStatus.RESERVED]: [
    UnitStatus.VACANT,
    UnitStatus.OCCUPIED,
    UnitStatus.MAINTENANCE,
  ],
  [UnitStatus.MAINTENANCE]: [
    UnitStatus.VACANT,
    UnitStatus.OCCUPIED,
    UnitStatus.RESERVED,
  ],
};

export const ALL_UNIT_STATUSES: UnitStatus[] = Object.values(UnitStatus);

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether `current → target` is a legal occupancy transition for a
 * unit whose agreements are described by `context`.
 */
export function checkTransition(
  current: UnitStatus,
  target: UnitStatus,
  context: OccupancyContext,
): TransitionCheck {
  if (!ALL_UNIT_STATUSES.includes(target)) {
    return { allowed: false, reason: `Unknown occupancy status "${target}".` };
  }

  // Re-applying the current status is a no-op, not an error.
  if (current === target) return { allowed: true };

  if (!ALLOWED_TRANSITIONS[current].includes(target)) {
    return {
      allowed: false,
      reason: `A unit cannot move from ${current} to ${target}.`,
    };
  }

  const lease = context.activeLeaseLabel
    ? ` (${context.activeLeaseLabel})`
    : '';

  switch (target) {
    case UnitStatus.OCCUPIED:
      if (!context.hasActiveLease) {
        return {
          allowed: false,
          reason:
            'A unit can only be marked OCCUPIED while an active rental agreement exists. ' +
            'Create and activate the rental agreement first.',
        };
      }
      return { allowed: true };

    case UnitStatus.RESERVED:
      if (!context.hasActiveLease && !context.hasUpcomingLease) {
        return {
          allowed: false,
          reason:
            'A unit can only be RESERVED when a rental agreement exists for it ' +
            '(active or starting in the future).',
        };
      }
      return { allowed: true };

    case UnitStatus.VACANT:
    case UnitStatus.MAINTENANCE:
      if (context.hasActiveLease) {
        return {
          allowed: false,
          reason: `Terminate or expire the active rental agreement${lease} before marking the unit ${target}.`,
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Derive the occupancy status a unit should have from its agreements.
 *
 * Called whenever a rental agreement changes so `Unit.status` reflects real
 * lease state. A unit that a human deliberately took out of service
 * (MAINTENANCE) is never silently put back to VACANT by this function — lease
 * state alone cannot clear a maintenance hold.
 */
export function deriveOccupancyStatus(
  agreements: AgreementLike[],
  current: UnitStatus,
  now: Date = new Date(),
): UnitStatus {
  const covers = (agreement: AgreementLike) => {
    if (agreement.status !== AgreementStatus.ACTIVE) return false;
    if (agreement.startDate > now) return false;
    return !agreement.endDate || agreement.endDate >= now;
  };

  const startsLater = (agreement: AgreementLike) =>
    agreement.status === AgreementStatus.ACTIVE && agreement.startDate > now;

  if (agreements.some(covers)) return UnitStatus.OCCUPIED;
  if (agreements.some(startsLater)) return UnitStatus.RESERVED;

  // No lease justifies occupancy any more.
  if (current === UnitStatus.MAINTENANCE) return UnitStatus.MAINTENANCE;
  return UnitStatus.VACANT;
}

/**
 * Describe a unit's agreements the way `checkTransition` needs them.
 */
export function buildOccupancyContext(
  agreements: AgreementLike[],
  now: Date = new Date(),
): OccupancyContext {
  const active = agreements.find(
    (agreement) =>
      agreement.status === AgreementStatus.ACTIVE &&
      agreement.startDate <= now &&
      (!agreement.endDate || agreement.endDate >= now),
  );

  const hasUpcomingLease = agreements.some(
    (agreement) =>
      agreement.status === AgreementStatus.ACTIVE && agreement.startDate > now,
  );

  return {
    hasActiveLease: Boolean(active),
    hasUpcomingLease,
    activeLeaseLabel: active
      ? `${agreementLabel(active)}${
          active.endDate
            ? ` until ${active.endDate.toISOString().slice(0, 10)}`
            : ''
        }`
      : undefined,
  };
}

function agreementLabel(agreement: AgreementLike): string {
  return `agreement ${agreement.status} from ${agreement.startDate.toISOString().slice(0, 10)}`;
}
