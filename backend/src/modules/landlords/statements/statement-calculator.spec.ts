import {
  ManagementFeeType,
  OwnerStatementStatus,
  PayoutStatus,
} from '@prisma/client';
import {
  computeManagementFee,
  computeOutstandingBalance,
  computeStatementTotals,
  computeStatementUnsettled,
  findOverlappingPeriod,
  isStatementOutstanding,
  type StatementExpenseLine,
  type StatementIncomeLine,
} from './statement-calculator';

const income = (amount: number, ref = 'INV-1'): StatementIncomeLine => ({
  ref,
  description: 'Rent',
  property: 'Tolo Towers',
  amount,
  paymentDate: '2026-09-05',
});

const charge = (amount: number, ref = 'CHG-1'): StatementExpenseLine => ({
  ref,
  category: 'REPAIR',
  description: 'Burst pipe',
  property: 'Tolo Towers',
  amount,
  chargeDate: '2026-09-07',
});

describe('computeStatementTotals', () => {
  it('reconciles net payout from the lines, not from a typed-in total', () => {
    const totals = computeStatementTotals({
      incomeLines: [income(100000), income(50000, 'INV-2')],
      expenseLines: [charge(12000)],
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 10,
      feeAmount: 0,
      carriedForward: 0,
    });

    expect(totals.grossIncome).toBe(150000);
    expect(totals.expenses).toBe(12000);
    expect(totals.managementFee).toBe(15000);
    expect(totals.netPayout).toBe(123000);
  });

  it('keeps every cent: a percentage fee never leaves a fraction behind', () => {
    // 10% of 10,000.01 is 1,000.001 — the statement must still add up.
    const totals = computeStatementTotals({
      incomeLines: [income(10000.01)],
      expenseLines: [],
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 10,
      feeAmount: 0,
      carriedForward: 0,
    });

    expect(totals.managementFee).toBe(1000);
    expect(totals.grossIncome - totals.managementFee).toBe(totals.netPayout);
    expect(Number.isInteger(totals.netPayout * 100)).toBe(true);
  });

  it('deducts a flat fee even when nothing was collected', () => {
    const totals = computeStatementTotals({
      incomeLines: [],
      expenseLines: [],
      feeType: ManagementFeeType.FIXED,
      feeRate: 0,
      feeAmount: 25000,
      carriedForward: 0,
    });

    expect(totals.managementFee).toBe(25000);
    expect(totals.netPayout).toBe(-25000);
  });

  it('reports a negative net payout instead of pretending the owner is owed nothing', () => {
    const totals = computeStatementTotals({
      incomeLines: [income(20000)],
      expenseLines: [charge(45000)],
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 5,
      feeAmount: 0,
      carriedForward: 0,
    });

    expect(totals.managementFee).toBe(1000);
    expect(totals.netPayout).toBe(-26000);
  });

  it('deducts the balance carried in from earlier statements', () => {
    const totals = computeStatementTotals({
      incomeLines: [income(80000)],
      expenseLines: [charge(5000)],
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 8,
      feeAmount: 0,
      carriedForward: 12500.5,
    });

    expect(totals.managementFee).toBe(6400);
    expect(totals.carriedForward).toBe(12500.5);
    expect(totals.netPayout).toBe(56099.5);
  });

  it('ignores a negative carried-forward balance', () => {
    const totals = computeStatementTotals({
      incomeLines: [income(10000)],
      expenseLines: [],
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 0,
      feeAmount: 0,
      carriedForward: -500,
    });

    expect(totals.carriedForward).toBe(0);
    expect(totals.netPayout).toBe(10000);
  });

  it('clamps a percentage above 100 rather than paying the owner', () => {
    const fee = computeManagementFee({
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: 150,
      feeAmount: 0,
      grossIncome: 10000,
    });

    expect(fee).toBe(10000);
  });

  it('treats a missing or unparseable rate as no fee', () => {
    const fee = computeManagementFee({
      feeType: ManagementFeeType.PERCENTAGE,
      feeRate: Number.NaN,
      feeAmount: 5000,
      grossIncome: 10000,
    });

    expect(fee).toBe(0);
  });
});

describe('findOverlappingPeriod', () => {
  const september = {
    id: 'stm-1',
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-30T23:59:59.999Z'),
    status: OwnerStatementStatus.ISSUED,
  };

  it('refuses a period that re-covers an issued statement', () => {
    const overlap = findOverlappingPeriod(
      [september],
      new Date('2026-09-15T00:00:00.000Z'),
      new Date('2026-10-15T23:59:59.999Z'),
    );

    expect(overlap?.id).toBe('stm-1');
  });

  it('allows a period that starts the day after the previous one ends', () => {
    const overlap = findOverlappingPeriod(
      [september],
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-31T23:59:59.999Z'),
    );

    expect(overlap).toBeUndefined();
  });

  it('ignores a void statement so the period can be reissued', () => {
    const overlap = findOverlappingPeriod(
      [{ ...september, status: OwnerStatementStatus.VOID }],
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T23:59:59.999Z'),
    );

    expect(overlap).toBeUndefined();
  });

  it('still blocks on a draft, because a draft already claimed the rent', () => {
    const overlap = findOverlappingPeriod(
      [{ ...september, status: OwnerStatementStatus.DRAFT }],
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T23:59:59.999Z'),
    );

    expect(overlap?.id).toBe('stm-1');
  });
});

describe('computeOutstandingBalance', () => {
  it('counts what was issued and not yet paid', () => {
    const outstanding = computeOutstandingBalance({
      statements: [
        { status: OwnerStatementStatus.ISSUED, netPayout: 100000 },
        { status: OwnerStatementStatus.ISSUED, netPayout: 50000 },
      ],
      paidByStatement: { 'stm-1': 60000 },
    });

    expect(outstanding).toBe(90000);
  });

  it('ignores drafts and void statements', () => {
    const outstanding = computeOutstandingBalance({
      statements: [
        { status: OwnerStatementStatus.DRAFT, netPayout: 100000 },
        { status: OwnerStatementStatus.VOID, netPayout: 70000 },
        { status: OwnerStatementStatus.SETTLED, netPayout: 20000 },
      ],
      paidByStatement: {},
    });

    expect(outstanding).toBe(20000);
  });

  it('never reports a negative balance when more was paid than owed', () => {
    const outstanding = computeOutstandingBalance({
      statements: [{ status: OwnerStatementStatus.ISSUED, netPayout: 10000 }],
      paidByStatement: { 'stm-1': 25000 },
    });

    expect(outstanding).toBe(-15000);
  });

  it('marks an issued statement as outstanding but a draft as not', () => {
    expect(isStatementOutstanding(OwnerStatementStatus.ISSUED)).toBe(true);
    expect(isStatementOutstanding(OwnerStatementStatus.SETTLED)).toBe(true);
    expect(isStatementOutstanding(OwnerStatementStatus.DRAFT)).toBe(false);
    expect(isStatementOutstanding(OwnerStatementStatus.VOID)).toBe(false);
  });
});

describe('computeStatementUnsettled', () => {
  it('subtracts every payout that has not failed', () => {
    const unsettled = computeStatementUnsettled(100000, [
      { status: PayoutStatus.PAID, amount: 40000 },
      { status: PayoutStatus.PENDING, amount: 20000 },
      { status: PayoutStatus.FAILED, amount: 50000 },
    ]);

    expect(unsettled).toBe(40000);
  });

  it('returns the full amount when nothing is recorded', () => {
    expect(computeStatementUnsettled(75000, [])).toBe(75000);
  });
});
