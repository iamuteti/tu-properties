import { DeductionCategory } from '@prisma/client';

/**
 * Deposit refund arithmetic (Module 5).
 *
 * The audit found the refund was a number typed into the move-out form, which
 * is not auditable. Now the itemised deductions are the record and the refund
 * is always derived from them: `deposit − deductions − unpaid rent`, floored at
 * zero with any excess carried forward as a debt to the tenant. Pure, so the
 * arithmetic is unit-tested rather than trusted.
 */

export interface DeductionLike {
  category: DeductionCategory;
  description: string;
  amount: number;
}

export interface DepositInputs {
  /** Deposit held on the lease, if any. */
  securityDeposit: number | null;
  deductions: DeductionLike[];
  /** Rent still unpaid across the lease's invoices. */
  unpaidRent: number;
}

export interface DepositBreakdown {
  depositHeld: number;
  deductions: DeductionLike[];
  deductionsByCategory: Array<{ category: DeductionCategory; total: number }>;
  deductionsTotal: number;
  unpaidRent: number;
  /** What goes back to the tenant — never negative. */
  refund: number;
  /** Set when the deductions and arrears exceed the deposit. */
  carriedForward: number;
}

export function calculateDeposit(inputs: DepositInputs): DepositBreakdown {
  const depositHeld = round2(Math.max(inputs.securityDeposit ?? 0, 0));
  const deductions = inputs.deductions.map((deduction) => ({
    ...deduction,
    amount: round2(Math.max(deduction.amount, 0)),
  }));
  const deductionsTotal = round2(
    deductions.reduce((sum, deduction) => sum + deduction.amount, 0),
  );
  const unpaidRent = round2(Math.max(inputs.unpaidRent, 0));

  const byCategory = new Map<DeductionCategory, number>();
  for (const deduction of deductions) {
    byCategory.set(
      deduction.category,
      round2((byCategory.get(deduction.category) ?? 0) + deduction.amount),
    );
  }

  const net = round2(depositHeld - deductionsTotal - unpaidRent);

  return {
    depositHeld,
    deductions,
    deductionsByCategory: Array.from(byCategory.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total),
    deductionsTotal,
    unpaidRent,
    refund: net > 0 ? net : 0,
    carriedForward: net < 0 ? round2(Math.abs(net)) : 0,
  };
}

/**
 * Refuse deductions that are not defensible: a blank description or a
 * non-positive amount. Called before a deduction row is written so the reason
 * is at record time rather than at dispute time.
 */
export function validateDeduction(deduction: {
  description: string;
  amount: number;
}): { valid: boolean; reason?: string } {
  if (!deduction.description?.trim()) {
    return { valid: false, reason: 'A deduction needs a description.' };
  }
  if (!Number.isFinite(deduction.amount) || deduction.amount <= 0) {
    return {
      valid: false,
      reason: 'A deduction must be greater than zero.',
    };
  }
  return { valid: true };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}