import {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuoteStatus,
  RfqStatus,
} from '@prisma/client';

/**
 * Module 10 — Procurement lifecycle rules.
 *
 * Three small state machines, pure and unit-tested, for the same reason the
 * maintenance module has one: every interesting refusal in procurement is a
 * gate somebody forgets to write at the moment they add a button. "Approved
 * against a cancelled request", "two suppliers' quotations both marked awarded",
 * "a purchase order marked received when nothing was received" — each of those
 * is one line here and a bug otherwise.
 *
 * Money is never touched here. Totals are derived in the services from the
 * records' own lines; this file answers only "may this happen, and what does it
 * cost the reader if it does not".
 */

export type ActionCheck = { allowed: boolean; reason?: string };

// ─────────────────────────────────────────────── Purchase requests

export type PurchaseRequestAction =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'REOPEN'
  | 'RAISE_RFQ';

export const PR_ACTIONS_BY_STATUS: Record<
  PurchaseRequestStatus,
  PurchaseRequestAction[]
> = {
  // A draft is not yet anybody's problem, so it can still be thrown away.
  [PurchaseRequestStatus.DRAFT]: ['SUBMIT', 'CANCEL'],
  // While it is pending the only thing left to do about it is decide.
  [PurchaseRequestStatus.PENDING]: ['APPROVE', 'REJECT', 'CANCEL'],
  [PurchaseRequestStatus.APPROVED]: ['RAISE_RFQ'],
  [PurchaseRequestStatus.REJECTED]: ['REOPEN'],
  [PurchaseRequestStatus.CANCELLED]: [],
};

const PR_NEXT_STATUS: Record<PurchaseRequestAction, PurchaseRequestStatus> = {
  SUBMIT: PurchaseRequestStatus.PENDING,
  APPROVE: PurchaseRequestStatus.APPROVED,
  REJECT: PurchaseRequestStatus.REJECTED,
  CANCEL: PurchaseRequestStatus.CANCELLED,
  REOPEN: PurchaseRequestStatus.DRAFT,
  // Raising an RFQ does not move the request; the request stays APPROVED while
  // the quotations are out. One request can go to several suppliers.
  RAISE_RFQ: PurchaseRequestStatus.APPROVED,
};

const PR_ACTION_PAST: Record<PurchaseRequestAction, string> = {
  SUBMIT: 'submitted',
  APPROVE: 'approved',
  REJECT: 'rejected',
  CANCEL: 'cancelled',
  REOPEN: 'reopened',
  RAISE_RFQ: 'turned into an RFQ',
};

export interface PurchaseRequestGateContext {
  /** Lines on the request. A request with none cannot be priced or compared. */
  lineCount?: number;
  /** Total of the request's lines, in whole currency units. */
  estimatedAmount?: number | null;
  /** What the approval policy is being asked to authorise. */
  decisionNote?: string | null;
  rejectionReason?: string | null;
  /** How many RFQs have already been raised against it. */
  rfqCount?: number;
}

export function checkPurchaseRequestAction(
  status: PurchaseRequestStatus,
  action: PurchaseRequestAction,
  context: PurchaseRequestGateContext = {},
): ActionCheck {
  if (!PR_ACTIONS_BY_STATUS[status].includes(action)) {
    return {
      allowed: false,
      reason: `A ${label(status).toLowerCase()} purchase request cannot be ${PR_ACTION_PAST[action]}.`,
    };
  }

  switch (action) {
    case 'SUBMIT': {
      if ((context.lineCount ?? 0) === 0) {
        return {
          allowed: false,
          reason:
            'Add at least one line before sending this for approval — a request with nothing on it cannot be compared against a quotation.',
        };
      }
      return { allowed: true };
    }

    case 'APPROVE': {
      if ((context.lineCount ?? 0) === 0) {
        return {
          allowed: false,
          reason:
            'This request has no lines, so there is nothing to approve. Add what is being bought first.',
        };
      }
      // Deliberately *not* requiring an estimate. "We need it and we do not know
      // the price yet" is the common case; the approval policy is where a
      // threshold belongs, and this module does not second-guess it.
      return { allowed: true };
    }

    case 'REJECT': {
      if (!context.rejectionReason?.trim()) {
        return {
          allowed: false,
          reason:
            'Say why this is rejected — it is what the person who raised the request reads.',
        };
      }
      return { allowed: true };
    }

    case 'REOPEN': {
      if (!context.rejectionReason?.trim()) {
        // Not a gate on the request, but a reopened draft carrying no record of
        // why it was rejected is how the same request comes straight back.
        return { allowed: true };
      }
      return { allowed: true };
    }

    case 'CANCEL':
      return { allowed: true };

    case 'RAISE_RFQ': {
      if ((context.lineCount ?? 0) === 0) {
        return {
          allowed: false,
          reason:
            'This request has no lines, so there is nothing to ask suppliers to quote for.',
        };
      }
      return { allowed: true };
    }

    default: {
      // Unreachable while the union above is exhaustive, but widening it here
      // means a future action is refused rather than silently accepted.
      const unknown = action as string;
      return {
        allowed: false,
        reason: `Unknown purchase request action "${unknown}".`,
      };
    }
  }
}

/**
 * Actions offered on a row.
 *
 * Separated from `checkPurchaseRequestAction` for the same reason as the
 * work-order one: the inputs an action carries with it (the rejection reason a
 * dialog will ask for) are assumed present, so the list answers "which buttons
 * belong here" rather than "which will succeed".
 */
export function offerablePurchaseRequestActions(
  status: PurchaseRequestStatus,
  context: PurchaseRequestGateContext = {},
): PurchaseRequestAction[] {
  const withInputs = {
    ...context,
    decisionNote: context.decisionNote ?? 'supplied by the action',
    rejectionReason: context.rejectionReason ?? 'supplied by the action',
  };

  return PR_ACTIONS_BY_STATUS[status].filter(
    (action) => checkPurchaseRequestAction(status, action, withInputs).allowed,
  );
}

export function nextPurchaseRequestStatus(
  status: PurchaseRequestStatus,
  action: PurchaseRequestAction,
  context: PurchaseRequestGateContext = {},
): PurchaseRequestStatus | null {
  return checkPurchaseRequestAction(status, action, context).allowed
    ? PR_NEXT_STATUS[action]
    : null;
}

// ─────────────────────────────────────────────────────────────── RFQs

export type RfqAction =
  | 'ISSUE'
  | 'RECORD_QUOTE'
  | 'CLOSE'
  | 'AWARD'
  | 'CANCEL'
  | 'REOPEN';

export const RFQ_ACTIONS_BY_STATUS: Record<RfqStatus, RfqAction[]> = {
  // Invitations can still be added while the round is open, but the round
  // itself has not started until it is issued.
  [RfqStatus.DRAFT]: ['ISSUE', 'CANCEL'],
  [RfqStatus.ISSUED]: ['RECORD_QUOTE', 'CLOSE', 'CANCEL'],
  // A round with one answer is still collecting: a supplier who replies two
  // days after the first has not somehow missed the deadline.
  [RfqStatus.QUOTES_RECEIVED]: ['RECORD_QUOTE', 'CLOSE', 'AWARD', 'CANCEL'],
  // CLOSED is what "we ran the round and are not going to award it" looks
  // like — distinct from CANCELLED, which records a reason.
  [RfqStatus.CLOSED]: ['REOPEN'],
  [RfqStatus.AWARDED]: [],
  [RfqStatus.CANCELLED]: [],
};

/**
 * Where an action leaves an RFQ.
 *
 * Exposed rather than kept private because `RfqsService` writes the status
 * itself, and this is the single place that says what each action means — a
 * service that picked its own status per endpoint is how `close` ends up
 * writing CANCELLED (which is what it did before CLOSED existed).
 */
export const RFQ_NEXT_STATUS: Record<RfqAction, RfqStatus> = {
  ISSUE: RfqStatus.ISSUED,
  // RECORD_QUOTE lands on QUOTES_RECEIVED whatever the round was before.
  RECORD_QUOTE: RfqStatus.QUOTES_RECEIVED,
  CLOSE: RfqStatus.CLOSED,
  AWARD: RfqStatus.AWARDED,
  CANCEL: RfqStatus.CANCELLED,
  // Reopening keeps whatever quotations are already in.
  REOPEN: RfqStatus.QUOTES_RECEIVED,
};

const RFQ_ACTION_PAST: Record<RfqAction, string> = {
  ISSUE: 'issued',
  RECORD_QUOTE: 'recorded against',
  CLOSE: 'closed',
  AWARD: 'awarded',
  CANCEL: 'cancelled',
  REOPEN: 'reopened',
};

export interface RfqGateContext {
  /** Suppliers invited. */
  invitationCount?: number;
  /** Quotations received so far. */
  quoteCount?: number;
  /** Invitations the supplier declined, with reasons. */
  declinedCount?: number;
  cancellationReason?: string | null;
  /** The quote being awarded, and whether it belongs to this RFQ. */
  quoteId?: string | null;
  quoteStatus?: QuoteStatus | null;
  quoteSupplierId?: string | null;
  /** Whether another quote on this RFQ is already awarded. */
  alreadyAwarded?: boolean;
}

/**
 * Two invitations is the floor for a competitive round.
 *
 * Deliberately not enforced as a hard gate on issuing — sometimes there is only
 * one supplier who does this work, and refusing to raise the RFQ would push the
 * purchase back into an email thread where nothing is recorded. It is surfaced
 * instead: `warnsSingleSource`, which the comparison view shows.
 */
export const MINIMUM_QUOTES_FOR_COMPETITION = 2;

export function warnsSingleSource(context: RfqGateContext): boolean {
  return (context.invitationCount ?? 0) < MINIMUM_QUOTES_FOR_COMPETITION;
}

export function checkRfqAction(
  status: RfqStatus,
  action: RfqAction,
  context: RfqGateContext = {},
): ActionCheck {
  if (!RFQ_ACTIONS_BY_STATUS[status].includes(action)) {
    return {
      allowed: false,
      reason: `An RFQ that is ${label(status).toLowerCase()} cannot be ${RFQ_ACTION_PAST[action]}.`,
    };
  }

  switch (action) {
    case 'ISSUE': {
      if ((context.invitationCount ?? 0) === 0) {
        return {
          allowed: false,
          reason:
            'Invite at least one supplier before issuing this RFQ, or there is nobody to ask.',
        };
      }
      return { allowed: true };
    }

    case 'RECORD_QUOTE':
      return { allowed: true };

    case 'CLOSE':
      // Closing with nothing received is legitimate — it is what a buyer does
      // when every supplier declines — so it is not gated.
      return { allowed: true };

    case 'AWARD': {
      if (!context.quoteId) {
        return {
          allowed: false,
          reason: 'Choose the quotation you are awarding.',
        };
      }
      if (context.quoteStatus !== QuoteStatus.SUBMITTED) {
        return {
          allowed: false,
          reason:
            context.quoteStatus === QuoteStatus.AWARDED
              ? 'That quotation has already been awarded.'
              : `A ${label(
                  String(context.quoteStatus ?? 'unknown'),
                ).toLowerCase()} quotation cannot be awarded.`,
        };
      }
      if ((context.quoteCount ?? 0) === 0) {
        return {
          allowed: false,
          reason: 'There are no quotations on this RFQ to award.',
        };
      }
      if (context.alreadyAwarded) {
        return {
          allowed: false,
          reason:
            'Another quotation on this RFQ has already been awarded. Withdraw it first — two winners on one round is a purchase order nobody can explain.',
        };
      }
      return { allowed: true };
    }

    case 'CANCEL': {
      if (!context.cancellationReason?.trim()) {
        return {
          allowed: false,
          reason:
            'Cancelling an RFQ needs a reason — it is what explains to the suppliers who were asked.',
        };
      }
      return { allowed: true };
    }

    case 'REOPEN':
      return { allowed: true };

    default: {
      const unknown = action as string;
      return {
        allowed: false,
        reason: `Unknown RFQ action "${unknown}".`,
      };
    }
  }
}

export function offerableRfqActions(
  status: RfqStatus,
  context: RfqGateContext = {},
): RfqAction[] {
  const withInputs = {
    ...context,
    cancellationReason: context.cancellationReason ?? 'supplied by the action',
  };

  return RFQ_ACTIONS_BY_STATUS[status].filter(
    (action) => checkRfqAction(status, action, withInputs).allowed,
  );
}

/**
 * Whether quotations are past their due date.
 *
 * Only while the round is genuinely still collecting: a closed, awarded or
 * cancelled round has stopped waiting for answers, so an old `quotesDueAt` on
 * it is not overdue, it is history.
 */
export function isRfqOverdue(
  rfq: { quotesDueAt: Date | null; status: RfqStatus },
  now: Date = new Date(),
): boolean {
  if (!rfq.quotesDueAt) return false;
  if (
    rfq.status === RfqStatus.AWARDED ||
    rfq.status === RfqStatus.CANCELLED ||
    rfq.status === RfqStatus.CLOSED
  ) {
    return false;
  }
  return rfq.quotesDueAt < now;
}

// ─────────────────────────────────────────────────────── Purchase orders

export type PurchaseOrderAction =
  | 'SEND'
  | 'ACCEPT'
  | 'RECEIVE'
  | 'RECEIVE_PART'
  | 'CLOSE'
  | 'CANCEL'
  | 'REOPEN';

/**
 * A purchase order cannot be cancelled once goods have arrived.
 *
 * The obvious reason is money — the goods exist, so the bill exists — but the
 * real one is that a cancelled order with receipts against it reads as a
 * contradiction in an audit. The right move is to receive the goods and write
 * the bill off deliberately if they were not wanted.
 */
export const PO_ACTIONS_BY_STATUS: Record<
  PurchaseOrderStatus,
  PurchaseOrderAction[]
> = {
  [PurchaseOrderStatus.DRAFT]: ['SEND', 'CANCEL'],
  [PurchaseOrderStatus.SENT]: ['ACCEPT', 'CANCEL'],
  [PurchaseOrderStatus.ACCEPTED]: ['RECEIVE', 'CANCEL'],
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
    'RECEIVE_PART',
    'RECEIVE',
    'CANCEL',
  ],
  [PurchaseOrderStatus.RECEIVED]: ['CLOSE'],
  [PurchaseOrderStatus.CLOSED]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

const PO_NEXT_STATUS: Record<PurchaseOrderAction, PurchaseOrderStatus> = {
  SEND: PurchaseOrderStatus.SENT,
  ACCEPT: PurchaseOrderStatus.ACCEPTED,
  // Which of the two receive actions ran decides the target; see
  // `nextPurchaseOrderStatus`, which is the only place that knows.
  RECEIVE: PurchaseOrderStatus.RECEIVED,
  RECEIVE_PART: PurchaseOrderStatus.PARTIALLY_RECEIVED,
  CLOSE: PurchaseOrderStatus.CLOSED,
  CANCEL: PurchaseOrderStatus.CANCELLED,
  REOPEN: PurchaseOrderStatus.SENT,
};

const PO_ACTION_PAST: Record<PurchaseOrderAction, string> = {
  SEND: 'sent',
  ACCEPT: 'accepted',
  RECEIVE: 'received',
  RECEIVE_PART: 'part-received',
  CLOSE: 'closed',
  CANCEL: 'cancelled',
  REOPEN: 'reopened',
};

export interface PurchaseOrderGateContext {
  /** Lines on the order. */
  lineCount?: number;
  /** Total of the order's lines. */
  totalAmount?: number | null;
  /** Outstanding units across the order's lines, against `orderedQuantity`. */
  outstandingQuantity?: number;
  hasDeliveryAddress?: boolean;
  /** Whether the supplier has already been paid through a bill. */
  hasBill?: boolean;
  cancellationReason?: string | null;
  /** Nothing may be received before the supplier has confirmed the order. */
  hasReceipt?: boolean;
}

export function checkPurchaseOrderAction(
  status: PurchaseOrderStatus,
  action: PurchaseOrderAction,
  context: PurchaseOrderGateContext = {},
): ActionCheck {
  if (!PO_ACTIONS_BY_STATUS[status].includes(action)) {
    return {
      allowed: false,
      reason: `A purchase order that is ${label(status).toLowerCase()} cannot be ${PO_ACTION_PAST[action]}.`,
    };
  }

  switch (action) {
    case 'SEND': {
      if ((context.lineCount ?? 0) === 0) {
        return {
          allowed: false,
          reason:
            'Add at least one line before sending this to the supplier — an order with nothing on it cannot be accepted.',
        };
      }
      if (!context.totalAmount || context.totalAmount <= 0) {
        return {
          allowed: false,
          reason:
            'This order has no value. Price at least one line before sending it out.',
        };
      }
      return { allowed: true };
    }

    case 'ACCEPT':
      return { allowed: true };

    case 'RECEIVE':
    case 'RECEIVE_PART': {
      if (!context.hasReceipt) {
        return {
          allowed: false,
          reason:
            'Record what arrived first — a receipt with no lines records nothing.',
        };
      }
      if ((context.outstandingQuantity ?? 0) <= 0) {
        return {
          allowed: false,
          reason:
            'Everything on this order has already been received. Raise a new order for anything further.',
        };
      }
      return { allowed: true };
    }

    case 'CLOSE':
      return { allowed: true };

    case 'CANCEL': {
      if (!context.cancellationReason?.trim()) {
        return {
          allowed: false,
          reason:
            'Cancelling an order needs a reason — it is what the supplier and the auditor read.',
        };
      }
      // Goods already received plus a cancellation is a contradiction, not a
      // shortcut. See the note on PO_ACTIONS_BY_STATUS.
      if (context.hasReceipt) {
        return {
          allowed: false,
          reason:
            'Goods have already been received against this order, so it cannot be cancelled. Close it and write off what should not have been ordered.',
        };
      }
      return { allowed: true };
    }

    case 'REOPEN':
      return { allowed: true };

    default: {
      const unknown = action as string;
      return {
        allowed: false,
        reason: `Unknown purchase order action "${unknown}".`,
      };
    }
  }
}

export function offerablePurchaseOrderActions(
  status: PurchaseOrderStatus,
  context: PurchaseOrderGateContext = {},
): PurchaseOrderAction[] {
  const withInputs = {
    ...context,
    cancellationReason: context.cancellationReason ?? 'supplied by the action',
  };

  return PO_ACTIONS_BY_STATUS[status].filter(
    (action) => checkPurchaseOrderAction(status, action, withInputs).allowed,
  );
}

/**
 * Where a receive action lands.
 *
 * The single case that needs the numbers rather than the matrix: receiving the
 * last of what was ordered finishes the order, receiving part of it does not.
 * The service has already summed the receipts, so this only decides which of two
 * true states applies.
 */
export function nextPurchaseOrderStatus(
  status: PurchaseOrderStatus,
  action: PurchaseOrderAction,
  context: PurchaseOrderGateContext = {},
): PurchaseOrderStatus | null {
  if (!checkPurchaseOrderAction(status, action, context).allowed) return null;
  if (action === 'RECEIVE_PART') return PurchaseOrderStatus.PARTIALLY_RECEIVED;
  return PO_NEXT_STATUS[action];
}

/** Whether a delivery is late against the promised date. Derived on read. */
export function isPurchaseOrderOverdue(
  order: {
    expectedDelivery: Date | null;
    status: PurchaseOrderStatus;
  },
  now: Date = new Date(),
): boolean {
  if (!order.expectedDelivery) return false;
  if (
    order.status === PurchaseOrderStatus.RECEIVED ||
    order.status === PurchaseOrderStatus.CLOSED ||
    order.status === PurchaseOrderStatus.CANCELLED
  ) {
    return false;
  }
  return order.expectedDelivery < now;
}

export function daysOverdue(
  order: { expectedDelivery: Date | null; status: PurchaseOrderStatus },
  now: Date = new Date(),
): number {
  if (!order.expectedDelivery || !isPurchaseOrderOverdue(order, now)) return 0;
  return Math.floor(
    (now.getTime() - order.expectedDelivery.getTime()) / 86_400_000,
  );
}

// ─────────────────────────────────────────────────── The comparison view

/**
 * Which bill category a purchase becomes.
 *
 * The bridge between procurement's vocabulary and finance's. It is a mapping
 * rather than a shared enum because they answer different questions (see the
 * `PurchaseCategory` comment in the schema): a request for building materials
 * posts to whichever account the supplier's own bill belongs in, and finance —
 * not the requester — has the last word on that.
 */
export const PURCHASE_CATEGORY_TO_BILL_CATEGORY = {
  MAINTENANCE_PARTS: 'MAINTENANCE',
  EQUIPMENT: 'OTHER',
  FURNITURE: 'OFFICE',
  IT_AND_TECH: 'OFFICE',
  STATIONERY: 'OFFICE',
  CLEANING: 'MAINTENANCE',
  SECURITY: 'MAINTENANCE',
  UTILITIES: 'UTILITIES',
  PROFESSIONAL_SERVICES: 'PROFESSIONAL',
  OTHER: 'OTHER',
} as const;

export type MappedBillCategory =
  (typeof PURCHASE_CATEGORY_TO_BILL_CATEGORY)[keyof typeof PURCHASE_CATEGORY_TO_BILL_CATEGORY];

export function billCategoryFor(category: string): MappedBillCategory {
  const mapped =
    PURCHASE_CATEGORY_TO_BILL_CATEGORY[
      category as keyof typeof PURCHASE_CATEGORY_TO_BILL_CATEGORY
    ];
  return mapped ?? 'OTHER';
}

// ─────────────────────────────────────────────────────────────── Helpers

/** "Pending", "Partially received" — one label helper for all five enums. */
export function label(value: string): string {
  if (!value) return value;
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** The states in which a purchase request is still waiting on somebody. */
export const OPEN_REQUEST_STATUSES: PurchaseRequestStatus[] = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING,
];

/** The states in which a purchase order has been placed but not finished. */
export const OPEN_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.ACCEPTED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

/** RFQs still collecting answers. */
export const OPEN_RFQ_STATUSES: RfqStatus[] = [
  RfqStatus.DRAFT,
  RfqStatus.ISSUED,
  RfqStatus.QUOTES_RECEIVED,
];
