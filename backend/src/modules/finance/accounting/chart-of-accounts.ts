import { AccountType, BalanceSide } from '@prisma/client';

/**
 * Module 7 — Finance & Accounting.
 *
 * The default chart of accounts seeded for every organization the first time
 * it posts a journal entry (or when an accountant opens the chart explicitly).
 * Codes follow the standard 1000/2000/3000/4000/5000 layout so reports and any
 * future statutory mapping stay predictable:
 *
 *   1000–1999 assets, 2000–2999 liabilities, 3000–3999 equity,
 *   4000–4999 revenue, 5000–5999 expenses.
 *
 * Auto-posting resolves accounts by these codes, so the codes are part of the
 * contract with `AccountingService` — treat renames here as a data migration.
 */
export interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  normalBalance: BalanceSide;
  description?: string;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  // ── Assets ────────────────────────────────────────────────────────────────
  {
    code: '1000',
    name: 'Cash on Hand',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
    description: 'Physical cash held at the office or a property.',
  },
  {
    code: '1010',
    name: 'Bank - KCB',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1020',
    name: 'Bank - Co-operative',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1030',
    name: 'Bank - NCBA',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1100',
    name: 'M-Pesa / Mobile Money',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1200',
    name: 'Accounts Receivable',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
    description: 'Amounts owed by tenants and buyers (AR control account).',
  },
  {
    code: '1300',
    name: 'Security Deposits Receivable',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1400',
    name: 'Rent Receivable from Landlords',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1350',
    name: 'VAT Recoverable',
    type: AccountType.ASSET,
    subtype: 'Current Asset',
    normalBalance: BalanceSide.DEBIT,
    description:
      'Input tax paid to suppliers, reclaimed from the authority. The payable side of 2100.',
  },
  {
    code: '1500',
    name: 'Property, Plant & Equipment',
    type: AccountType.ASSET,
    subtype: 'Non-Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '1510',
    name: 'Motor Vehicles',
    type: AccountType.ASSET,
    subtype: 'Non-Current Asset',
    normalBalance: BalanceSide.DEBIT,
  },

  // ── Liabilities ───────────────────────────────────────────────────────────
  {
    code: '2000',
    name: 'Accounts Payable',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
    description:
      'Amounts owed to suppliers and contractors (AP control account).',
  },
  {
    code: '2100',
    name: 'VAT Payable',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '2200',
    name: 'Withholding Tax Payable',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '2300',
    name: 'PAYE Payable',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '2400',
    name: 'Security Deposits Held',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '2500',
    name: 'Rent Collected on Behalf of Landlords',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
    description:
      'Held pending owner statement payout — money that is not income yet.',
  },
  {
    code: '2550',
    name: 'Credit Owed by Suppliers',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
    description:
      'Credit a supplier owes us — our overpayment, or goods returned. The payable side of customer credit.',
  },
  {
    code: '2600',
    name: 'Accrued Expenses',
    type: AccountType.LIABILITY,
    subtype: 'Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '2700',
    name: 'Long Term Loans',
    type: AccountType.LIABILITY,
    subtype: 'Non-Current Liability',
    normalBalance: BalanceSide.CREDIT,
  },

  // ── Equity ────────────────────────────────────────────────────────────────
  {
    code: '3000',
    name: 'Owner Contribution',
    type: AccountType.EQUITY,
    subtype: 'Contributed Capital',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '3100',
    name: 'Owner Drawing',
    type: AccountType.EQUITY,
    subtype: 'Drawings',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '3200',
    name: 'Retained Earnings',
    type: AccountType.EQUITY,
    subtype: 'Retained Earnings',
    normalBalance: BalanceSide.CREDIT,
  },

  // ── Revenue ───────────────────────────────────────────────────────────────
  {
    code: '4000',
    name: 'Rent Income',
    type: AccountType.REVENUE,
    subtype: 'Operating Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4010',
    name: 'Service Charge Income',
    type: AccountType.REVENUE,
    subtype: 'Operating Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4020',
    name: 'Parking Income',
    type: AccountType.REVENUE,
    subtype: 'Operating Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4030',
    name: 'Utility Income (Recharge)',
    type: AccountType.REVENUE,
    subtype: 'Operating Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4040',
    name: 'Late Payment Penalty Income',
    type: AccountType.REVENUE,
    subtype: 'Other Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4100',
    name: 'Sale of Property Income',
    type: AccountType.REVENUE,
    subtype: 'Operating Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4200',
    name: 'Commission Earned',
    type: AccountType.REVENUE,
    subtype: 'Other Revenue',
    normalBalance: BalanceSide.CREDIT,
  },
  {
    code: '4290',
    name: 'Refunds & Allowances',
    type: AccountType.REVENUE,
    subtype: 'Contra Revenue',
    normalBalance: BalanceSide.DEBIT,
    description:
      'Debited when money is refunded or a credit note is issued, so a refund reduces revenue instead of vanishing.',
  },
  {
    code: '4900',
    name: 'Other Income',
    type: AccountType.REVENUE,
    subtype: 'Other Revenue',
    normalBalance: BalanceSide.CREDIT,
  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  {
    code: '5000',
    name: 'Management Commission Expense',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5010',
    name: 'Repairs & Maintenance',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5020',
    name: 'Utilities Expense',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5030',
    name: 'Security Expense',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5040',
    name: 'Cleaning Expense',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5050',
    name: 'Marketing Expense',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5060',
    name: 'Legal & Professional Fees',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5070',
    name: 'Bank Charges',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5080',
    name: 'Office Supplies & Admin',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5090',
    name: 'Salaries & Wages',
    type: AccountType.EXPENSE,
    subtype: 'Operating Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5100',
    name: 'Depreciation',
    type: AccountType.EXPENSE,
    subtype: 'Non-Cash Expense',
    normalBalance: BalanceSide.DEBIT,
  },
  {
    code: '5200',
    name: 'Landlord Payout - Rent',
    type: AccountType.EXPENSE,
    subtype: 'Owner Cost',
    normalBalance: BalanceSide.DEBIT,
    description: "The owner's share of rent when rent is collected directly.",
  },
  {
    code: '5900',
    name: 'Other Expense',
    type: AccountType.EXPENSE,
    subtype: 'Other Expense',
    normalBalance: BalanceSide.DEBIT,
  },
];

/** Control/system accounts that auto-posting resolves by code. */
export const ACCOUNT_CODES = {
  CASH_ON_HAND: '1000',
  MPESA: '1100',
  ACCOUNTS_RECEIVABLE: '1200',
  SECURITY_DEPOSITS_RECEIVABLE: '1300',
  RENT_RECEIVABLE_LANDLORDS: '1400',
  ACCOUNTS_PAYABLE: '2000',
  SUPPLIER_CREDIT: '2550',
  VAT_PAYABLE: '2100',
  WHT_PAYABLE: '2200',
  SECURITY_DEPOSITS_HELD: '2400',
  RENT_HELD_FOR_LANDLORDS: '2500',
  RENT_INCOME: '4000',
  SALE_OF_PROPERTY_INCOME: '4100',
  SERVICE_CHARGE_INCOME: '4010',
  PARKING_INCOME: '4020',
  UTILITY_INCOME: '4030',
  OTHER_INCOME: '4900',
  REFUNDS_AND_ALLOWANCES: '4290',
  VAT_RECOVERABLE: '1350',
  REPAIRS_MAINTENANCE: '5010',
  UTILITIES_EXPENSE: '5020',
  LEGAL_PROFESSIONAL: '5060',
  MARKETING_EXPENSE: '5050',
  OFFICE_ADMIN: '5080',
  SALARIES_WAGES: '5090',
  OTHER_EXPENSE: '5900',
} as const;

/** Default cash/bank account for each payment method. */
export const PAYMENT_METHOD_ACCOUNT: Record<string, string> = {
  CASH: ACCOUNT_CODES.CASH_ON_HAND,
  MPESA: ACCOUNT_CODES.MPESA,
  BANK_TRANSFER: '1010',
  CHEQUE: '1010',
  CARD: '1010',
  OTHER: ACCOUNT_CODES.CASH_ON_HAND,
};
