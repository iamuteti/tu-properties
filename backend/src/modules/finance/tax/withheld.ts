import { Prisma } from '@prisma/client';
import { round2 } from '../invoice-allocation';

/**
 * Module 7 — Finance & Accounting: the withheld tax owed on an invoice.
 *
 * Withholding tax is deducted from the customer's payment rather than added to
 * it, so the invoice records a liability that is not part of `totalAmount`. The
 * money only exists once the payment arrives, which is when the obligation is
 * incurred — so the ledger entry that debits it belongs here rather than on the
 * invoice.
 *
 * Returns null when there is nothing withheld, which keeps the caller's entry
 * identical to what it would have been before withholding existed.
 */
export function withheldOn(invoice: {
  taxWithheldAmount?: Prisma.Decimal | number | null;
  taxSummary?: Prisma.JsonValue;
}): { amount: number; code?: string } | undefined {
  const amount = round2(Number(invoice.taxWithheldAmount ?? 0));
  if (amount <= 0) return undefined;

  // The code comes from the snapshot so the receipt entry names the tax that
  // was actually withheld. The account is deliberately NOT the rule's payable:
  // at this point the customer owes *us*, so it is the withholding receivable
  // (2210) that is debited, and the payable is only touched when we remit.
  const summary = Array.isArray(invoice.taxSummary)
    ? (invoice.taxSummary as { treatment?: string; code?: string }[])
    : [];
  const entry = summary.find((item) => item?.treatment === 'WITHHELD');

  return {
    amount,
    code: entry?.code ?? 'WHT',
  };
}
