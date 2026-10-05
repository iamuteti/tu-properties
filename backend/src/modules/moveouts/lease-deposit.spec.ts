import { DeductionCategory } from '@prisma/client';
import { calculateDeposit, validateDeduction } from './lease-deposit';

/**
 * The deposit refund has to be auditable, which means derived — never typed in.
 * These tests pin the arithmetic, including the awkward cases.
 */
describe('deposit calculation', () => {
  const deduction = (
    amount: number,
    category: DeductionCategory = DeductionCategory.DAMAGE,
    description = 'Broken window',
  ) => ({ amount, category, description });

  it('refunds the whole deposit when nothing is deducted', () => {
    const result = calculateDeposit({
      securityDeposit: 80_000,
      deductions: [],
      unpaidRent: 0,
    });
    expect(result).toMatchObject({
      depositHeld: 80_000,
      deductionsTotal: 0,
      unpaidRent: 0,
      refund: 80_000,
      carriedForward: 0,
    });
  });

  it('subtracts itemised deductions', () => {
    const result = calculateDeposit({
      securityDeposit: 80_000,
      deductions: [
        deduction(12_000),
        deduction(8_000, DeductionCategory.CLEANING, 'Deep clean'),
      ],
      unpaidRent: 0,
    });
    expect(result.deductionsTotal).toBe(20_000);
    expect(result.refund).toBe(60_000);
    expect(result.deductionsByCategory).toEqual([
      { category: DeductionCategory.DAMAGE, total: 12_000 },
      { category: DeductionCategory.CLEANING, total: 8_000 },
    ]);
  });

  it('takes unpaid rent out of the deposit before the tenant', () => {
    const result = calculateDeposit({
      securityDeposit: 80_000,
      deductions: [deduction(10_000)],
      unpaidRent: 25_000,
    });
    expect(result).toMatchObject({
      deductionsTotal: 10_000,
      unpaidRent: 25_000,
      refund: 45_000,
      carriedForward: 0,
    });
  });

  it('never refunds a negative amount — it carries the debt forward', () => {
    const result = calculateDeposit({
      securityDeposit: 20_000,
      deductions: [deduction(15_000)],
      unpaidRent: 30_000,
    });
    expect(result.refund).toBe(0);
    expect(result.carriedForward).toBe(25_000);
  });

  it('handles a tenant with no deposit held', () => {
    const result = calculateDeposit({
      securityDeposit: null,
      deductions: [],
      unpaidRent: 0,
    });
    expect(result).toMatchObject({ depositHeld: 0, refund: 0 });
  });

  it('treats a null deposit and negative amounts defensively', () => {
    const result = calculateDeposit({
      securityDeposit: 10_000,
      deductions: [deduction(-5_000)],
      unpaidRent: -1_000,
    });
    expect(result.deductionsTotal).toBe(0);
    expect(result.unpaidRent).toBe(0);
    expect(result.refund).toBe(10_000);
  });

  it('keeps the money to two decimal places', () => {
    const result = calculateDeposit({
      securityDeposit: 33_333.33,
      deductions: [deduction(11_111.11)],
      unpaidRent: 0,
    });
    expect(result.refund).toBe(22_222.22);
  });

  it('groups deductions of the same category', () => {
    const result = calculateDeposit({
      securityDeposit: 100_000,
      deductions: [
        deduction(5_000, DeductionCategory.DAMAGE, 'Door'),
        deduction(7_000, DeductionCategory.DAMAGE, 'Window'),
      ],
      unpaidRent: 0,
    });
    expect(result.deductionsByCategory).toEqual([
      { category: DeductionCategory.DAMAGE, total: 12_000 },
    ]);
  });
});

describe('validateDeduction', () => {
  it('accepts a described, positive deduction', () => {
    expect(
      validateDeduction({ description: 'Broken window', amount: 5_000 }).valid,
    ).toBe(true);
  });

  it('rejects a blank description', () => {
    const result = validateDeduction({ description: '   ', amount: 5_000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/description/i);
  });

  it('rejects a zero or negative amount', () => {
    expect(validateDeduction({ description: 'x', amount: 0 }).valid).toBe(
      false,
    );
    expect(validateDeduction({ description: 'x', amount: -1 }).valid).toBe(
      false,
    );
  });
});
