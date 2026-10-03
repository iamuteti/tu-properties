import { PayoutStatus } from '@prisma/client';

/**
 * Owner payout rules (Module 6).
 *
 * Money going out to a landlord is the one direction this system cannot undo
 * by editing a field, so the status is a validated state machine rather than a
 * free column — the same approach as lease lifecycle (Module 5) and sale stages
 * (Module 4):
 *
 *   PENDING ──▶ PROCESSING ──▶ PAID
 *      │            │            │
 *      └────────────┴──▶ FAILED ─┘ (retry → PROCESSING)
 *
 * PAID is terminal and requires a transfer reference, because "we paid the
 * owner" without a bank reference is not an audit trail.
 */

export const PAYOUT_FLOW: Record<PayoutStatus, PayoutStatus[]> = {
  [PayoutStatus.PENDING]: [
    PayoutStatus.PROCESSING,
    PayoutStatus.PAID,
    PayoutStatus.FAILED,
  ],
  [PayoutStatus.PROCESSING]: [PayoutStatus.PAID, PayoutStatus.FAILED],
  [PayoutStatus.FAILED]: [PayoutStatus.PROCESSING, PayoutStatus.PENDING],
  [PayoutStatus.PAID]: [],
};

export const TERMINAL_PAYOUT_STATUSES: PayoutStatus[] = [PayoutStatus.PAID];

export interface PayoutGateContext {
  /** Bank transfer / cheque reference. Required to mark a payout PAID. */
  reference?: string | null;
  /** Reason the transfer failed. Required to mark a payout FAILED. */
  failureReason?: string | null;
  /**
   * Money still owed by the statement this payout settles. A payout larger than
   * this would overpay the owner, so it is refused rather than accepted.
   * Undefined when the payout is not tied to a statement.
   */
  unsettledOnStatement?: number | null;
  /** True when the linked statement was voided. */
  statementVoid?: boolean;
  amount: number;
}

export interface PayoutCheck {
  allowed: boolean;
  reason?: string;
}

export function checkPayoutStatusChange(
  current: PayoutStatus,
  target: PayoutStatus,
  context: PayoutGateContext,
): PayoutCheck {
  if (!Object.values(PayoutStatus).includes(target)) {
    return { allowed: false, reason: `Unknown payout status "${target}".` };
  }

  if (current === target) return { allowed: true };

  if (TERMINAL_PAYOUT_STATUSES.includes(current)) {
    return {
      allowed: false,
      reason:
        'This payout has been paid and is closed — record a new payout instead.',
    };
  }

  if (!PAYOUT_FLOW[current].includes(target)) {
    return {
      allowed: false,
      reason: `A payout moves ${current} → ${PAYOUT_FLOW[current].join(' / ') || 'nowhere'}.`,
    };
  }

  if (!(context.amount > 0)) {
    return {
      allowed: false,
      reason: 'A payout must be for a positive amount.',
    };
  }

  if (context.statementVoid) {
    return {
      allowed: false,
      reason: 'The statement this payout settles has been voided.',
    };
  }

  switch (target) {
    case PayoutStatus.PAID: {
      if (!context.reference || context.reference.trim() === '') {
        return {
          allowed: false,
          reason:
            'Record the transfer reference before marking this payout paid — an unreferenced payout cannot be audited.',
        };
      }
      const unsettled = context.unsettledOnStatement;
      if (
        unsettled !== null &&
        unsettled !== undefined &&
        context.amount > unsettled
      ) {
        return {
          allowed: false,
          reason:
            `This payout is larger than the ${unsettled.toLocaleString()} still owed on the statement. ` +
            'Reduce the amount or detach it from the statement.',
        };
      }
      return { allowed: true };
    }

    case PayoutStatus.FAILED:
      if (!context.failureReason || context.failureReason.trim() === '') {
        return {
          allowed: false,
          reason:
            'Say why the transfer failed so it can be retried or corrected.',
        };
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/** Statuses this payout can move to right now — drives the UI actions. */
export function availablePayoutStatuses(
  current: PayoutStatus,
  context: PayoutGateContext,
): PayoutStatus[] {
  return (Object.values(PayoutStatus) as PayoutStatus[]).filter(
    (status) =>
      status !== current &&
      checkPayoutStatusChange(current, status, context).allowed,
  );
}

/** What is still owed to the owner once these payouts are taken into account. */
export function outstandingAfterPayout(
  netPayout: number,
  settledAmounts: number[],
): number {
  const netCents = Math.round(
    (Number.isFinite(netPayout) ? netPayout : 0) * 100,
  );
  const settledCents = settledAmounts.reduce(
    (sum, amount) =>
      sum + Math.round((Number.isFinite(amount) ? amount : 0) * 100),
    0,
  );
  return (netCents - settledCents) / 100;
}
