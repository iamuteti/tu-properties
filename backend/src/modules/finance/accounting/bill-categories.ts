import { BillCategory } from '@prisma/client';
import { ACCOUNT_CODES } from './chart-of-accounts';

/**
 * Module 7 — Finance & Accounting: which expense a supplier bill lands in.
 *
 * Picking the account from the bill's *category* rather than making whoever
 * types the bill remember a code is the difference between a bookkeeper using
 * this and a bookkeeper avoiding it. A line may still name an account
 * explicitly, and that is validated against the chart when the entry posts, so
 * neither route can produce an entry the ledger rejects.
 *
 * A missing mapping must not silently become "Other Expense" for a category
 * someone set deliberately — that is how a repairs bill quietly flattens a
 * report. Unmapped categories throw instead.
 */
export const BILL_CATEGORY_ACCOUNTS: Record<BillCategory, string> = {
  MAINTENANCE: ACCOUNT_CODES.REPAIRS_MAINTENANCE,
  UTILITIES: ACCOUNT_CODES.UTILITIES_EXPENSE,
  INSURANCE: '5060',
  PROFESSIONAL: ACCOUNT_CODES.LEGAL_PROFESSIONAL,
  MARKETING: ACCOUNT_CODES.MARKETING_EXPENSE,
  OFFICE: ACCOUNT_CODES.OFFICE_ADMIN,
  SALARIES: ACCOUNT_CODES.SALARIES_WAGES,
  TAX: ACCOUNT_CODES.OTHER_EXPENSE,
  OTHER: ACCOUNT_CODES.OTHER_EXPENSE,
};

export function expenseAccountFor(
  category: BillCategory,
  explicitAccountCode?: string | null,
): string {
  if (explicitAccountCode?.trim()) return explicitAccountCode.trim();
  const mapped = BILL_CATEGORY_ACCOUNTS[category];
  if (!mapped) {
    throw new Error(
      `No expense account is mapped for bill category "${category}" — add one to BILL_CATEGORY_ACCOUNTS rather than letting it fall into Other Expense`,
    );
  }
  return mapped;
}