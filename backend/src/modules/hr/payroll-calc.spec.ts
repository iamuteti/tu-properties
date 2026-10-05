import {
  applyBands,
  applyRule,
  baseFigures,
  clampBase,
  computePayslip,
  payrollJournalLines,
  resolveBase,
  totalsFromLines,
  toCents,
  type PayrollRuleInput,
} from './payroll-calc';

/**
 * These tests use a worked example rather than a real jurisdiction's rates. The
 * numbers are invented precisely so nobody later mistakes a test for a statement
 * of law — the Kenya baseline lives in the seed, marked as a dated snapshot, and
 * this file must never be the place that looks authoritative.
 *
 * The engine works in **integer cents**, so assertions are written in whole
 * currency and converted. That way a change of unit shows up as a wall of failing
 * expectations rather than as silently wrong money.
 */
const cents = (amount: number) => Math.round(amount * 100);

const bands = (ladder: [number | null, number][]) =>
  ladder.map(([upTo, ratePercent]) => ({ upTo, ratePercent }));

const rule = (over: Partial<PayrollRuleInput> = {}): PayrollRuleInput => ({
  id: 'r1',
  code: 'TEST',
  name: 'Test rule',
  type: 'PERCENTAGE',
  base: 'GROSS',
  bearer: 'EMPLOYEE',
  ratePercent: 5,
  periodsPerYear: 12,
  ...over,
});

describe('toCents', () => {
  it('rounds once and never re-scales', () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-2.5)).toBe(-250);
  });

  it('treats nothing and rubbish as zero rather than NaN', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents('')).toBe(0);
    expect(toCents('not a number')).toBe(0);
  });
});

describe('baseFigures', () => {
  it('derives four bases from what the employee is actually being paid', () => {
    const figures = baseFigures({
      basicSalary: 80_000,
      earnings: [
        { code: 'HOUSE', name: 'House allowance', amount: 20_000 },
        {
          code: 'VEHICLE',
          name: 'Vehicle',
          amount: 30_000,
          // Taxable but not contributable — the distinction that makes one
          // boolean insufficient.
          isTaxable: true,
          isPensionable: false,
        },
      ],
    });

    expect(figures.gross).toBe(cents(130_000));
    expect(figures.basic).toBe(cents(80_000));
    expect(figures.taxable).toBe(cents(130_000));
    expect(figures.pensionable).toBe(cents(100_000));
  });

  it('excludes a non-taxable earning from taxable pay only', () => {
    const figures = baseFigures({
      basicSalary: 50_000,
      earnings: [
        {
          code: 'MEAL',
          name: 'Meal allowance',
          amount: 10_000,
          isTaxable: false,
        },
      ],
    });

    expect(figures.gross).toBe(cents(60_000));
    expect(figures.taxable).toBe(cents(50_000));
    expect(figures.pensionable).toBe(cents(60_000));
  });

  it('treats an earning that says nothing as taxable and contributable', () => {
    // The safe default is to charge: guessing "non-taxable" would quietly
    // under-deduct and the error would only surface at a tax audit.
    const figures = baseFigures({
      basicSalary: 40_000,
      earnings: [{ code: 'X', name: 'Something', amount: 5_000 }],
    });

    expect(figures.taxable).toBe(cents(45_000));
    expect(figures.pensionable).toBe(cents(45_000));
  });

  it('does not double-count a basic described as an earning', () => {
    const figures = baseFigures({
      basicSalary: 80_000,
      earnings: [{ code: 'BASIC', name: 'Basic', amount: 80_000 }],
    });

    expect(figures.gross).toBe(cents(80_000));
    expect(figures.basic).toBe(cents(80_000));
    expect(figures.taxable).toBe(cents(80_000));
  });

  it('resolves each named base to its own figure', () => {
    const figures = baseFigures({
      basicSalary: 80_000,
      earnings: [{ code: 'HOUSE', name: 'House', amount: 20_000 }],
    });

    expect(resolveBase('GROSS', figures)).toBe(cents(100_000));
    expect(resolveBase('BASIC', figures)).toBe(cents(80_000));
    expect(resolveBase('TAXABLE', figures)).toBe(cents(100_000));
  });
});

describe('clampBase', () => {
  it('does nothing when there is no floor or cap', () => {
    expect(clampBase(100_00, rule())).toEqual({
      base: 100_00,
      floored: false,
      capped: false,
    });
  });

  it('floors the base, not the result', () => {
    // A minimum contribution is a minimum contributory wage: below the floor,
    // everyone is rated as though they earned the floor. Clamping the *result*
    // would give a figure the right shape and the wrong value.
    const clamped = clampBase(3_000_00, rule({ minimumBaseAmount: 6_000 }));

    expect(clamped).toEqual({ base: 6_000_00, floored: true, capped: false });
  });

  it('caps the base', () => {
    const clamped = clampBase(900_000_00, rule({ maximumBaseAmount: 300_000 }));

    expect(clamped).toEqual({ base: 300_000_00, floored: false, capped: true });
  });

  it('leaves a base inside the window alone', () => {
    const clamped = clampBase(
      50_000_00,
      rule({
        minimumBaseAmount: 6_000,
        maximumBaseAmount: 300_000,
      }),
    );

    expect(clamped).toEqual({ base: 50_000_00, floored: false, capped: false });
  });
});

describe('applyBands', () => {
  const ladder = bands([
    [6_000, 0],
    [16_000, 10],
    [31_000, 15],
    [56_000, 20],
    [null, 25],
  ]);

  it('charges nothing on the first band', () => {
    expect(applyBands(6_000_00, ladder)).toBe(0);
  });

  it('taxes only the slice inside each band, not the whole salary', () => {
    // 6,000 at 0%, then 10,000 at 10% = 1,000.
    expect(applyBands(16_000_00, ladder)).toBe(1_000_00);
    // + 15,000 at 15% = 2,250 more.
    expect(applyBands(31_000_00, ladder)).toBe(3_250_00);
  });

  it('sends the overflow through the open-ended band', () => {
    // 3,250 + 25,000 × 20% = 8,250.
    expect(applyBands(56_000_00, ladder)).toBe(8_250_00);
    // + 44,000 × 25% = 11,000 more.
    expect(applyBands(100_000_00, ladder)).toBe(19_250_00);
  });

  it('is exactly zero at the very bottom', () => {
    expect(applyBands(0, ladder)).toBe(0);
  });

  it('charges a flat amount per band for a banded fixed rule', () => {
    const fixed = [
      { upTo: 50_000, amount: 500 },
      { upTo: null, amount: 200 },
    ];

    expect(applyBands(40_000_00, fixed)).toBe(50_000);
    expect(applyBands(80_000_00, fixed)).toBe(70_000);
  });

  it('returns zero for an empty ladder rather than a division by nothing', () => {
    expect(applyBands(50_000_00, [])).toBe(0);
  });
});

describe('applyRule — annualisation is the whole point', () => {
  const ladder = bands([
    [6_000, 0],
    [16_000, 10],
    [31_000, 15],
    [56_000, 20],
    [null, 25],
  ]);

  const annual = rule({
    type: 'PROGRESSIVE_BANDS',
    bands: ladder,
    periodMode: 'ANNUALISED',
    periodsPerYear: 12,
  });

  it('taxes the annual figure and divides back down', () => {
    const figures = baseFigures({ basicSalary: 16_000 });
    const result = applyRule(annual, figures);

    // 16,000 × 12 = 192,000 a year. Bands: 6,000 at 0% = 0; the next 10,000
    // at 10% = 1,000; the next 15,000 at 15% = 2,250; the remaining 161,000
    // at 20% = 32,200. Annual tax 35,450, divided by 12.
    expect(result.employeeCents).toBe(352_083);
  });

  it('does NOT agree with walking the same bands once per month', () => {
    const figures = baseFigures({ basicSalary: 16_000 });

    const annualised = applyRule(annual, figures).employeeCents;
    const monthly = applyRule(
      rule({ type: 'PROGRESSIVE_BANDS', bands: ladder, periodMode: 'PERIOD' }),
      figures,
    ).employeeCents;

    // A monthly walk spends the whole year's band allowance in January and
    // then taxes nothing else at anything below the top rate, so it charges
    // 1,000 for the year against the correct 35,450. That is a factor of
    // three, from two pieces of arithmetic that look identical.
    expect(monthly).toBe(100_000);
    expect(annualised).toBe(352_083);
    expect(annualised).not.toBe(monthly);
  });

  it('diverges at a band boundary, which is where it matters most', () => {
    const atBandEdge = baseFigures({ basicSalary: 16_000 });
    const midBand = baseFigures({ basicSalary: 12_000 });

    const correct = (f: typeof atBandEdge) =>
      applyRule(annual, f).employeeCents;
    const naive = (f: typeof atBandEdge) =>
      applyRule(
        rule({
          type: 'PROGRESSIVE_BANDS',
          bands: ladder,
          periodMode: 'PERIOD',
        }),
        f,
      ).employeeCents;

    // The whole error is proportional to how much of the annual allowance the
    // monthly salary consumes, so it is largest at the top of the relief band
    // and shrinks as pay rises.
    expect(correct(atBandEdge)).toBeGreaterThan(naive(atBandEdge) * 2);
    expect(correct(midBand)).toBeGreaterThan(naive(midBand));
  });

  it("uses the employee's own period count when they are paid weekly", () => {
    const weekly = applyRule(annual, baseFigures({ basicSalary: 25_000 }), 52);

    // 25,000 × 52 = 1,300,000 a year → 0 + 1,000 + 2,250 + 5,000 + (1,300,000 −
    // 56,000) × 25% = 8,250 + 311,000 = 319,250 a year → ÷ 52.
    expect(weekly.employeeCents).toBe(613_942);
  });

  it("falls back to the rule's own period count when the employee has none", () => {
    expect(
      applyRule(annual, baseFigures({ basicSalary: 16_000 })).employeeCents,
    ).toBe(352_083);
  });

  it('does not divide by zero', () => {
    const broken = rule({
      type: 'PROGRESSIVE_BANDS',
      bands: ladder,
      periodMode: 'ANNUALISED',
      periodsPerYear: 0,
    });

    // Falls back to 12 rather than producing Infinity or NaN.
    expect(
      applyRule(broken, baseFigures({ basicSalary: 16_000 })).employeeCents,
    ).toBe(352_083);
  });
});

describe('applyRule — who bears it', () => {
  const figures = baseFigures({ basicSalary: 100_000 });

  it('puts an employee-borne rule entirely on the employee', () => {
    const result = applyRule(rule({ bearer: 'EMPLOYEE' }), figures);

    expect(result.employeeCents).toBe(5_000_00);
    expect(result.employerCents).toBe(0);
  });

  it('puts an employer-borne rule entirely on the employer', () => {
    const result = applyRule(rule({ bearer: 'EMPLOYER' }), figures);

    expect(result.employeeCents).toBe(0);
    expect(result.employerCents).toBe(5_000_00);
  });

  it('charges both sides once each for a matched rule', () => {
    const result = applyRule(rule({ bearer: 'BOTH' }), figures);

    expect(result.employeeCents).toBe(5_000_00);
    expect(result.employerCents).toBe(5_000_00);
  });
});

describe('applyRule — exemptions and caps', () => {
  const figures = baseFigures({ basicSalary: 3_000 });

  it('charges nothing at all below an exemption threshold', () => {
    // Different from a minimum contribution: below this threshold nobody
    // contributes, rather than everyone contributing a minimum.
    const result = applyRule(
      rule({ exemptBelowBaseAmount: 5_000, minimumBaseAmount: 5_000 }),
      figures,
    );

    expect(result.employeeCents).toBe(0);
    expect(result.explanation).toContain('below the exemption');
  });

  it('explains that it floored the base', () => {
    const result = applyRule(
      rule({ minimumBaseAmount: 6_000 }),
      baseFigures({ basicSalary: 3_000 }),
    );

    expect(result.employeeCents).toBe(300_00);
    expect(result.explanation).toContain('floored');
  });

  it('explains that it capped the base', () => {
    // The rule helper defaults to EMPLOYEE-borne, so this asserts the employee
    // side. An employer-borne cap is covered by the bearer tests.
    const result = applyRule(
      rule({ maximumBaseAmount: 50_000 }),
      baseFigures({ basicSalary: 300_000 }),
    );

    expect(result.employeeCents).toBe(2_500_00);
    expect(result.explanation).toContain('capped');
  });

  it('refuses an unconfigurable rate rather than computing NaN', () => {
    expect(() => applyRule(rule({ ratePercent: Number.NaN }), figures)).toThrow(
      /invalid ratePercent/,
    );
  });
});

describe('computePayslip', () => {
  it('produces basic, then earnings, then deductions, then employer cost', () => {
    const result = computePayslip(
      {
        basicSalary: 100_000,
        earnings: [{ code: 'HOUSE', name: 'House allowance', amount: 20_000 }],
      },
      [
        rule({
          code: 'PAYE',
          name: 'Income tax',
          bearer: 'EMPLOYEE',
          ratePercent: 10,
        }),
        rule({
          code: 'LEVY',
          name: 'Housing levy',
          bearer: 'EMPLOYER',
          ratePercent: 1.5,
        }),
      ],
    );

    expect(result.lines.map((line) => line.code)).toEqual([
      'BASIC',
      'HOUSE',
      'PAYE',
      'LEVY_ER',
    ]);
  });

  it('derives net as gross less employee deductions only', () => {
    const result = computePayslip({ basicSalary: 100_000 }, [
      rule({ code: 'PAYE', bearer: 'EMPLOYEE', ratePercent: 10 }),
      rule({ code: 'LEVY', bearer: 'EMPLOYER', ratePercent: 5 }),
    ]);

    expect(result.totals.gross).toBe(100_000);
    expect(result.totals.employeeDeductions).toBe(10_000);
    expect(result.totals.employerContributions).toBe(5_000);
    // The employer's 5,000 does NOT come out of the employee's pay. This is the
    // most common way a hand-built payroll is wrong.
    expect(result.totals.net).toBe(90_000);
  });

  it('applies a standing component as a percentage of gross', () => {
    const result = computePayslip(
      {
        basicSalary: 100_000,
        components: [{ code: 'PENSION', name: 'Pension', percentage: 6 }],
      },
      [],
    );

    expect(result.totals.employeeDeductions).toBe(6_000);
    expect(result.totals.net).toBe(94_000);
  });

  it('applies a standing component as a fixed amount', () => {
    const result = computePayslip(
      {
        basicSalary: 100_000,
        components: [{ code: 'GARNISH', name: 'Court order', amount: 2_500 }],
      },
      [],
    );

    expect(result.totals.employeeDeductions).toBe(2_500);
  });

  it('prefers the percentage when a component carries both', () => {
    const result = computePayslip(
      {
        basicSalary: 100_000,
        components: [{ code: 'X', name: 'Both', percentage: 5, amount: 999 }],
      },
      [],
    );

    expect(result.totals.employeeDeductions).toBe(5_000);
  });

  it('warns loudly when the jurisdiction has no rules configured', () => {
    // An unconfigured jurisdiction must read as a gap, never as a silent zero
    // that looks like "no tax due".
    const result = computePayslip({ basicSalary: 100_000 }, []);

    expect(result.warnings.map((warning) => warning.code)).toContain(
      'NO_RULES_RESOLVED',
    );
  });

  it('warns when net pay would be negative rather than paying a negative wage', () => {
    const result = computePayslip({ basicSalary: 1_000 }, [
      rule({ code: 'BAD', bearer: 'EMPLOYEE', ratePercent: 150 }),
    ]);

    expect(result.totals.net).toBeLessThan(0);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'NET_NEGATIVE',
    );
  });

  it('warns when gross is zero, because every percentage rule silently becomes zero', () => {
    const result = computePayslip({ basicSalary: 0 }, [rule()]);

    expect(result.warnings.map((warning) => warning.code)).toContain(
      'ZERO_GROSS',
    );
  });

  it('warns when a base sits above a statutory ceiling', () => {
    const result = computePayslip({ basicSalary: 400_000 }, [
      rule({
        code: 'FUND',
        bearer: 'BOTH',
        ratePercent: 10,
        maximumBaseAmount: 300_000,
      }),
    ]);

    const warning = result.warnings.find((w) => w.code === 'BASE_ABOVE_CAP');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('not the whole picture');
  });

  it('warns about a nonsensical period count', () => {
    const result = computePayslip({ basicSalary: 100_000, periodsPerYear: 0 }, [
      rule({
        type: 'PROGRESSIVE_BANDS',
        bands: bands([[null, 25]]),
        periodMode: 'ANNUALISED',
      }),
    ]);

    expect(result.warnings.map((warning) => warning.code)).toContain(
      'MISSING_PERIODS',
    );
  });

  it('leaves every line explaining itself', () => {
    const result = computePayslip({ basicSalary: 100_000 }, [
      rule({ code: 'FUND', bearer: 'BOTH', ratePercent: 10 }),
    ]);

    for (const line of result.lines) {
      expect(line.explanation).toBeTruthy();
    }
  });

  it('records which rules were applied', () => {
    const result = computePayslip({ basicSalary: 100_000 }, [
      rule({ id: 'a', code: 'PAYE', bearer: 'EMPLOYEE', ratePercent: 10 }),
      rule({ id: 'b', code: 'FUND', bearer: 'BOTH', ratePercent: 5 }),
    ]);

    expect(result.totals.applied.map((entry) => entry.code)).toEqual([
      'PAYE',
      'FUND',
    ]);
  });

  it("sorts rule-derived lines by the rule's own sort order", () => {
    const result = computePayslip({ basicSalary: 100_000 }, [
      rule({ code: 'THIRD', sortOrder: 30, ratePercent: 1 }),
      rule({ code: 'FIRST', sortOrder: 10, ratePercent: 2 }),
    ]);

    const codes = result.lines.map((line) => line.code);
    expect(codes.indexOf('FIRST')).toBeLessThan(codes.indexOf('THIRD'));
  });

  it('skips a rule that produced nothing at all', () => {
    const result = computePayslip({ basicSalary: 100_000 }, [
      rule({ code: 'ZERO', ratePercent: 0 }),
    ]);

    expect(result.lines.filter((line) => line.code.startsWith('ZERO'))).toEqual(
      [],
    );
  });

  it('handles a rule on BASIC while gross includes a large allowance', () => {
    const result = computePayslip(
      {
        basicSalary: 50_000,
        earnings: [{ code: 'ALLOW', name: 'Allowance', amount: 50_000 }],
      },
      [rule({ code: 'ON_BASIC', base: 'BASIC', ratePercent: 10 })],
    );

    // 10% of the basic 50,000, not of the 100,000 gross.
    expect(result.totals.employeeDeductions).toBe(5_000);
  });
});

describe('totalsFromLines', () => {
  it("is the only definition of a payslip's figures", () => {
    const totals = totalsFromLines([
      {
        direction: 'EARNING',
        code: 'B',
        name: 'Basic',
        amount: 100,
        kind: 'COMPANY',
        sortOrder: 0,
      },
      {
        direction: 'EARNING',
        code: 'A',
        name: 'Allowance',
        amount: 20,
        kind: 'COMPANY',
        sortOrder: 1,
      },
      {
        direction: 'EMPLOYEE_DEDUCTION',
        code: 'T',
        name: 'Tax',
        amount: 30,
        kind: 'STATUTORY',
        sortOrder: 2,
      },
      {
        direction: 'EMPLOYER_CONTRIBUTION',
        code: 'L',
        name: 'Levy',
        amount: 5,
        kind: 'STATUTORY',
        sortOrder: 3,
      },
    ]);

    expect(totals.gross).toBe(120);
    expect(totals.employeeDeductions).toBe(30);
    expect(totals.employerContributions).toBe(5);
    expect(totals.net).toBe(90);
  });

  it('gives the same answer whatever order the lines arrive in', () => {
    const lines = [
      {
        direction: 'EARNING' as const,
        code: 'B',
        name: 'Basic',
        amount: 100,
        kind: 'COMPANY' as const,
        sortOrder: 0,
      },
      {
        direction: 'EMPLOYEE_DEDUCTION' as const,
        code: 'T',
        name: 'Tax',
        amount: 30,
        kind: 'STATUTORY' as const,
        sortOrder: 1,
      },
    ];

    expect(totalsFromLines([...lines].reverse())).toEqual(
      totalsFromLines(lines),
    );
  });
});

describe('payrollJournalLines', () => {
  const accounts = { salaryExpense: '5090', netPayable: '2310' };

  const payslip = (basic: number, deductions: number, employer: number) => ({
    lines: [
      {
        direction: 'EARNING' as const,
        code: 'B',
        name: 'Basic',
        amount: basic,
        kind: 'COMPANY' as const,
        sortOrder: 0,
      },
      {
        direction: 'EMPLOYEE_DEDUCTION' as const,
        code: 'T',
        name: 'Statutory',
        amount: deductions,
        kind: 'STATUTORY' as const,
        accountCode: '2300',
        sortOrder: 1,
      },
      {
        direction: 'EMPLOYER_CONTRIBUTION' as const,
        code: 'L',
        name: 'Employer',
        amount: employer,
        kind: 'STATUTORY' as const,
        accountCode: '2320',
        sortOrder: 2,
      },
    ],
  });

  it("debits the employer's full cost: gross plus employer contributions", () => {
    const entry = payrollJournalLines(
      [payslip(100_000, 10_000, 5_000)],
      accounts,
    );

    const expense = entry.lines.find((line) => line.accountCode === '5090');
    expect(expense?.debit).toBe(105_000);
    expect(expense?.credit).toBe(0);
  });

  it('credits each statutory liability separately', () => {
    const entry = payrollJournalLines(
      [payslip(100_000, 10_000, 5_000)],
      accounts,
    );

    expect(
      entry.lines.find((line) => line.accountCode === '2300')?.credit,
    ).toBe(10_000);
  });

  it('owes its own staff the net pay, as a credit', () => {
    const entry = payrollJournalLines(
      [payslip(100_000, 10_000, 5_000)],
      accounts,
    );

    expect(
      entry.lines.find((line) => line.accountCode === '2310')?.credit,
    ).toBe(90_000);
  });

  it('groups forty payslips into a handful of lines, not one per employee', () => {
    const many = Array.from({ length: 40 }, () =>
      payslip(100_000, 10_000, 5_000),
    );
    const entry = payrollJournalLines(many, accounts);

    expect(entry.lines).toHaveLength(4);
    expect(entry.balanced).toBe(true);
  });

  it('balances', () => {
    const entry = payrollJournalLines(
      [payslip(100_000, 10_000, 5_000), payslip(60_000, 4_000, 0)],
      accounts,
    );

    expect(entry.balanced).toBe(true);
    expect(entry.warning).toBeUndefined();
  });

  it('produces a fallback account for a line with none, rather than dropping the money', () => {
    // Only the four fields `payrollJournalLines` reads. Typing the parameter
    // as the full `ComputedLine` would have forced a cast here, and a cast is
    // where a field that suddenly started mattering would silently arrive
    // undefined.
    const entry = payrollJournalLines(
      [
        {
          lines: [
            { direction: 'EARNING', amount: 100_000 },
            { direction: 'EMPLOYEE_DEDUCTION', amount: 10_000 },
          ],
        },
      ],
      { ...accounts, statutoryAccount: '2999' },
    );

    expect(
      entry.lines.find((line) => line.accountCode === '2999'),
    ).toBeDefined();
    expect(entry.balanced).toBe(true);
  });
});
