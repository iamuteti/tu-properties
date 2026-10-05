import { AgreementStatus } from '@prisma/client';

/**
 * Lease lifecycle rules (Module 5).
 *
 * The module audit found leases were record-keeping: `status` could be set to
 * anything by a plain update, and there was no activate / renew / terminate
 * flow with side-effects. These rules make the lifecycle explicit — they decide
 * which action is legal and what has to be true first, and they are pure so the
 * matrix can be unit-tested without a database.
 */

export interface LeaseGateContext {
  startDate: Date;
  endDate: Date | null;
  /** Rent still unpaid across the lease's invoices. */
  outstandingRent?: number;
  /** Rent arrears (overdue invoices only). */
  arrears?: number;
  /** The unit already has a live agreement (double-letting check). */
  hasOtherActiveAgreement?: boolean;
  /** Someone already moved out of this tenancy. */
  moveOutRequested?: boolean;
  /** The unit has an approved/pending move-out request. */
  currency?: string;
}

export type LeaseAction =
  | 'ACTIVATE'
  | 'RENEW'
  | 'EXTEND'
  | 'TERMINATE'
  | 'EXPIRE'
  | 'REACTIVATE';

export interface ActionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Which actions a lease in `status` may be given. Pure data — the ordering is
 * the same one the UI renders as buttons.
 */
export const ACTIONS_BY_STATUS: Record<AgreementStatus, LeaseAction[]> = {
  [AgreementStatus.DRAFT]: ['ACTIVATE', 'TERMINATE'],
  [AgreementStatus.ACTIVE]: ['RENEW', 'EXTEND', 'TERMINATE', 'EXPIRE'],
  [AgreementStatus.RENEWED]: [],
  [AgreementStatus.EXPIRED]: ['REACTIVATE'],
  [AgreementStatus.TERMINATED]: [],
};

/**
 * Default renewal window: a lease can be renewed once it is within this many
 * days of its end date (or has no end date at all — a rolling monthly rental).
 */
export const RENEWAL_WINDOW_DAYS = 60;

export function availableLeaseActions(
  status: AgreementStatus,
  context: LeaseGateContext,
  now: Date = new Date(),
): LeaseAction[] {
  return ACTIONS_BY_STATUS[status].filter(
    (action) => checkLeaseAction(status, action, context, now).allowed,
  );
}

export function checkLeaseAction(
  status: AgreementStatus,
  action: LeaseAction,
  context: LeaseGateContext,
  now: Date = new Date(),
): ActionCheck {
  if (!ACTIONS_BY_STATUS[status].includes(action)) {
    return {
      allowed: false,
      reason: `A ${status.toLowerCase()} lease cannot be ${action.toLowerCase()}d.`,
    };
  }

  switch (action) {
    case 'ACTIVATE': {
      if (context.moveOutRequested) {
        return {
          allowed: false,
          reason:
            'This tenancy has a move-out request against it. Resolve it before activating a new lease.',
        };
      }
      if (context.hasOtherActiveAgreement) {
        return {
          allowed: false,
          reason:
            'The unit already has an active lease. Terminate or expire it before activating another.',
        };
      }
      if (context.startDate > now) {
        return {
          allowed: false,
          reason: `This lease starts on ${formatDate(context.startDate)} — activate it on or after that date.`,
        };
      }
      return { allowed: true };
    }

    case 'RENEW': {
      if (!context.endDate) {
        return {
          allowed: false,
          reason:
            'This lease has no end date (rolling monthly rental) — extend it instead of renewing.',
        };
      }
      if (context.endDate > addDays(now, RENEWAL_WINDOW_DAYS)) {
        return {
          allowed: false,
          reason: `This lease runs until ${formatDate(context.endDate)}. Renewal opens ${RENEWAL_WINDOW_DAYS} days before it ends.`,
        };
      }
      if (context.moveOutRequested) {
        return {
          allowed: false,
          reason:
            'There is a move-out request on this tenancy — it cannot be renewed.',
        };
      }
      return { allowed: true };
    }

    case 'EXTEND': {
      // An extension pushes the existing end date out; it has no window.
      return { allowed: true };
    }

    case 'TERMINATE': {
      // Outstanding rent does not block termination — a tenant leaving with a
      // debt is normal — but it must be visible in the message the UI shows.
      return { allowed: true };
    }

    case 'EXPIRE': {
      if (!context.endDate) {
        return {
          allowed: false,
          reason:
            'This lease has no end date, so it cannot expire — terminate it instead.',
        };
      }
      if (context.endDate > now) {
        return {
          allowed: false,
          reason: `This lease does not end until ${formatDate(context.endDate)}.`,
        };
      }
      return { allowed: true };
    }

    case 'REACTIVATE': {
      if (context.hasOtherActiveAgreement) {
        return {
          allowed: false,
          reason: 'The unit is already let under another lease.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: `Unknown lease action "${action}".` };
  }
}

export function agreementStatusLabel(status: AgreementStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Days until a lease ends; negative once it has, null when open-ended. */
export function daysUntilEnd(
  endDate: Date | null,
  now: Date = new Date(),
): number | null {
  if (!endDate) return null;
  return Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
