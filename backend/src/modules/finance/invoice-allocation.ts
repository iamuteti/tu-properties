import { InvoiceStatus } from '@prisma/client';

/**
 * Module 8 — Payments: the one place that decides how an amount lands on an
 * invoice.
 *
 * Every path that moves money toward an invoice (a payment, a receipt line, a
 * credit, a credit note) shares these rules, so "paid 20,000 against a 15,000
 * invoice" behaves identically whichever door it came through:
 *
 *   - an invoice never goes negative — only the outstanding balance is consumed,
 *   - whatever is left over is `surplus`, and the caller must turn it into a
 *     credit rather than dropping it,
 *   - status follows the balance, not the other way round: fully covered is
 *     PAID, partly covered is PARTIALLY_PAID, nothing covered leaves the
 *     previous status alone so an OVERDUE invoice stays OVERDUE.
 */

/** All money maths is done in integer cents; floats only ever hold cents. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface InvoiceAllocationInput {
  totalAmount: number;
  balanceAmount: number;
  /** Sum of live payments already applied (excludes reversed ones). */
  paidAmount?: number;
  status: InvoiceStatus;
}

export interface InvoiceAllocationResult {
  /** Portion of the incoming amount that the invoice actually absorbed. */
  applied: number;
  /** Portion that no invoice needed — the caller must credit it. */
  surplus: number;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
}

/**
 * Status derived purely from coverage. An invoice nothing has been applied to
 * keeps its existing status (an OVERDUE invoice is still overdue, not PENDING).
 */
export function deriveInvoiceStatus(
  paidAmount: number,
  balanceAmount: number,
  previousStatus: InvoiceStatus,
): InvoiceStatus {
  if (balanceAmount <= 0) return InvoiceStatus.PAID;
  if (paidAmount > 0) return InvoiceStatus.PARTIALLY_PAID;
  return previousStatus;
}

/**
 * Apply `amount` to one invoice, consuming only what is still outstanding.
 */
export function allocateToInvoice(
  invoice: InvoiceAllocationInput,
  amount: number,
): InvoiceAllocationResult {
  const incoming = round2(Number(amount));
  const balance = round2(Number(invoice.balanceAmount));
  const paidBefore = round2(
    invoice.paidAmount ?? Number(invoice.totalAmount) - balance,
  );

  if (incoming <= 0) {
    return {
      applied: 0,
      surplus: 0,
      paidAmount: paidBefore,
      balanceAmount: balance,
      status: deriveInvoiceStatus(paidBefore, balance, invoice.status),
    };
  }

  // A cancelled invoice absorbs nothing — the caller must decide what to do
  // with the money rather than have it silently land on a dead document.
  if (invoice.status === InvoiceStatus.CANCELLED) {
    return {
      applied: 0,
      surplus: incoming,
      paidAmount: paidBefore,
      balanceAmount: balance,
      status: invoice.status,
    };
  }

  const applied = round2(Math.min(incoming, Math.max(0, balance)));
  const surplus = round2(incoming - applied);
  const paidAmount = round2(paidBefore + applied);
  const balanceAmount = round2(Math.max(0, balance - applied));

  return {
    applied,
    surplus,
    paidAmount,
    balanceAmount,
    status: deriveInvoiceStatus(paidAmount, balanceAmount, invoice.status),
  };
}

export interface InvoiceProgress {
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
}

/**
 * Re-derive an invoice's money columns from scratch after something moved
 * backwards (a reversal, a refund). Used instead of subtracting, so a refund
 * that lands twice cannot drive the invoice negative.
 */
export function deriveInvoiceProgress(
  totalAmount: number,
  livePaidAmount: number,
  previousStatus: InvoiceStatus,
): InvoiceProgress {
  const total = round2(Number(totalAmount));
  const paid = round2(Math.max(0, Number(livePaidAmount)));
  const balance = round2(Math.max(0, total - paid));

  // PAID and PARTIALLY_PAID both assert coverage, so they cannot survive a
  // rewind to zero. OVERDUE is left alone — the invoice really is still late,
  // whatever happened to the last payment.
  const status =
    paid === 0 &&
    (previousStatus === InvoiceStatus.PAID ||
      previousStatus === InvoiceStatus.PARTIALLY_PAID)
      ? InvoiceStatus.PENDING
      : deriveInvoiceStatus(paid, balance, previousStatus);

  return { paidAmount: paid, balanceAmount: balance, status };
}
