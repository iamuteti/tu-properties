/**
 * The invoice classes.
 *
 * An invoice's class decides what it *is*: what it is billed for, which
 * ledger accounts it touches, and whether the recurring billing run, the
 * arrears sweep or the resident's statement is allowed to touch it at all.
 *
 * - `RENT` — the monthly rent. Billed every period, collected every period.
 * - `SALE` — a sale instalment. Not rent, and never overdue in the ordinary
 *   sense.
 * - `UTILITY` — a metered or standing charge, collected in arrears.
 * - `DEPOSIT` — **a deposit**. Money the estate holds on a resident's behalf:
 *   not income, not a monthly bill, and not something the arrears sweep
 *   should be chasing. It is charged once, at the start of a tenancy, and
 *   settled at the end of it.
 *
 * The class lives here, in Finance, because it is a Finance concept: a
 * document and what it means to the ledger. The deposits module imports it
 * rather than the other way round, so the dependency graph stays a tree.
 */
export const TRANSACTION_CLASS = {
  RENT: 'RENT',
  SALE: 'SALE',
  UTILITY: 'UTILITY',
  DEPOSIT: 'DEPOSIT',
} as const;

export type TransactionClass =
  (typeof TRANSACTION_CLASS)[keyof typeof TRANSACTION_CLASS];

/** Whether a class is one of the monthly bills the estate chases. */
export function isRecurringCharge(transactionClass?: string | null): boolean {
  return (
    transactionClass === TRANSACTION_CLASS.RENT ||
    transactionClass === TRANSACTION_CLASS.UTILITY
  );
}
