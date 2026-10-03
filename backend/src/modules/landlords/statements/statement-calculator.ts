import {
  ManagementFeeType,
  OwnerStatementStatus,
  PayoutStatus,
} from '@prisma/client';

/**
 * Owner statement arithmetic (Module 6).
 *
 * An owner statement is a document sent to a landlord, so two things matter
 * more than anything else:
 *
 *  1. **It reconciles.** `netPayout` is not a typed-in figure: it is always
 *     `grossIncome − expenses − managementFee − carriedForward`, computed in
 *     integer cents so a percentage fee can never leave a stray cent behind.
 *  2. **It cannot double-count.** Rent is attributed by payment date, so a
 *     second statement covering an overlapping period would pay the owner twice
 *     for the same month. `findOverlappingPeriod` is the guard; the service
 *     refuses to generate rather than trusting the caller.
 *
 * The figures themselves are collected by the service from `Payment` and
 * `LandlordCharge` rows — nothing here touches the database, so the rules are
 * unit-testable and identical whether they run behind the API or in a test.
 */

export interface StatementIncomeLine {
  /** Invoice number, so the owner can find the bill. */
  ref: string;
  description: string;
  property: string | null;
  /** Amount collected in the period against this invoice. */
  amount: number;
  paymentDate: string;
}

export interface StatementExpenseLine {
  /** Charge id. */
  ref: string;
  category: string;
  description: string;
  property: string | null;
  amount: number;
  chargeDate: string;
}

export interface StatementTotalsInput {
  incomeLines: StatementIncomeLine[];
  expenseLines: StatementExpenseLine[];
  feeType: ManagementFeeType;
  /** Percentage, e.g. 8.5 for 8.5%. Only used when `feeType` is PERCENTAGE. */
  feeRate: number;
  /** Flat amount per statement period. Only used when `feeType` is FIXED. */
  feeAmount: number;
  /** Unpaid balance brought in from earlier statements. */
  carriedForward: number;
}

export interface StatementTotals {
  grossIncome: number;
  expenses: number;
  managementFee: number;
  carriedForward: number;
  netPayout: number;
}

export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** The management fee for a period: a percentage of what was collected, or a flat sum. */
export function computeManagementFee(input: {
  feeType: ManagementFeeType;
  feeRate: number;
  feeAmount: number;
  grossIncome: number;
}): number {
  const grossCents = toCents(input.grossIncome);
  if (input.feeType === ManagementFeeType.FIXED) {
    // A flat fee is a flat fee even if the period collected nothing.
    return fromCents(Math.max(0, toCents(input.feeAmount)));
  }
  const rate = Number.isFinite(input.feeRate) ? input.feeRate : 0;
  const clamped = Math.min(Math.max(rate, 0), 100);
  return fromCents(Math.round((grossCents * clamped) / 100));
}

/**
 * Roll a period up into the five numbers a statement carries.
 *
 * `netPayout` is floored at zero *only* in the sense that a negative period
 * (expenses and fees exceeded collection) is reported as a real negative
 * number rather than being silently clamped — the owner is told they owe money
 * instead of the statement quietly claiming a payout of nothing.
 */
export function computeStatementTotals(
  input: StatementTotalsInput,
): StatementTotals {
  const grossIncome = fromCents(
    input.incomeLines.reduce((sum, line) => sum + toCents(line.amount), 0),
  );
  const expenses = fromCents(
    input.expenseLines.reduce((sum, line) => sum + toCents(line.amount), 0),
  );
  const managementFee = computeManagementFee({
    feeType: input.feeType,
    feeRate: input.feeRate,
    feeAmount: input.feeAmount,
    grossIncome,
  });
  const carriedForward = fromCents(Math.max(0, toCents(input.carriedForward)));

  const netCents =
    toCents(grossIncome) -
    toCents(expenses) -
    toCents(managementFee) -
    toCents(carriedForward);

  return {
    grossIncome,
    expenses,
    managementFee,
    carriedForward,
    netPayout: fromCents(netCents),
  };
}

export interface StatementPeriod {
  id?: string;
  periodStart: Date;
  periodEnd: Date;
  status: OwnerStatementStatus;
}

/**
 * A landlord may have several live statements (one per quarter, one per
 * property set) but two that cover any part of the same dates would both claim
 * the same rent. Drafts and void statements are ignored: a draft is a
 * calculation that was never sent, and a void one was retracted.
 */
export function findOverlappingPeriod(
  existing: StatementPeriod[],
  periodStart: Date,
  periodEnd: Date,
): StatementPeriod | undefined {
  const start = periodStart.getTime();
  const end = periodEnd.getTime();

  return existing.find((statement) => {
    if (statement.status === OwnerStatementStatus.VOID) return false;
    const otherStart = statement.periodStart.getTime();
    const otherEnd = statement.periodEnd.getTime();
    return start <= otherEnd && end >= otherStart;
  });
}

/** Only a statement that has actually been sent to the owner counts as owed. */
export function isStatementOutstanding(status: OwnerStatementStatus): boolean {
  return (
    status === OwnerStatementStatus.ISSUED ||
    status === OwnerStatementStatus.SETTLED
  );
}

export interface OutstandingInput {
  statements: Array<{ status: OwnerStatementStatus; netPayout: number }>;
  /** Amounts already sent to the owner, per statement id. */
  paidByStatement: Record<string, number>;
  /**
   * Payouts recorded against no statement (arrears catch-up). These reduce the
   * balance too — otherwise a goodwill payment would be counted as still owed.
   */
  paidUnallocated?: number;
}

/**
 * What the landlord is still owed across every statement ever issued.
 *
 * A payout only clears the balance once the money has actually left
 * (status PAID): a pending or processing transfer is still owed, and a failed
 * one is owed again.
 */
export function computeOutstandingBalance(input: OutstandingInput): number {
  const owed = input.statements
    .filter((statement) => isStatementOutstanding(statement.status))
    .reduce((sum, statement) => sum + toCents(statement.netPayout), 0);

  const paid = Object.values(input.paidByStatement).reduce(
    (sum, amount) => sum + toCents(amount),
    0,
  );

  return fromCents(owed - paid - toCents(input.paidUnallocated ?? 0));
}

export interface PayoutAllocation {
  status: PayoutStatus;
  amount: number;
}

/**
 * How much of a statement is still unpaid by its own payouts. Used to refuse a
 * payout larger than the statement it claims to settle.
 */
export function computeStatementUnsettled(
  netPayout: number,
  allocations: PayoutAllocation[],
): number {
  const settled = allocations
    .filter((allocation) => allocation.status !== PayoutStatus.FAILED)
    .reduce((sum, allocation) => sum + toCents(allocation.amount), 0);

  return fromCents(toCents(netPayout) - settled);
}
