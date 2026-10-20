import {
  computeDepositAmount,
  DEPOSIT_BASIS,
  resolveDepositRule,
  ruleTakesNoDeposit,
  validateDepositRule,
} from './deposit-rule';

/**
 * The deposit rule, which is the whole of what a deposit can be: one number,
 * or a number of months of rent.
 *
 * The two cases that are easy to get wrong are tested explicitly:
 *   - a rule of **zero** is "this kind of unit takes no deposit", which is a
 *     decision, and
 *   - **no rule at all** is "nobody has decided yet", which is not.
 */
describe('the deposit rule', () => {
  describe('what a rule works out to', () => {
    it('is the amount when the basis is a fixed sum', () => {
      expect(
        computeDepositAmount(
          { amount: 11_500, basis: DEPOSIT_BASIS.FIXED },
          11_500,
        ),
      ).toBe(11_500);
    });

    it('is the rent times the months when the basis is a rent multiple', () => {
      expect(
        computeDepositAmount(
          { amount: 0, basis: DEPOSIT_BASIS.RENT_MONTHS, months: 2 },
          11_500,
        ),
      ).toBe(23_000);
    });

    it('follows the rent, so an escalation does not leave a stale deposit', () => {
      const rule = { amount: 0, basis: DEPOSIT_BASIS.RENT_MONTHS, months: 1 };
      expect(computeDepositAmount(rule, 11_500)).toBe(11_500);
      expect(computeDepositAmount(rule, 13_000)).toBe(13_000);
    });

    it('is nothing without a rule', () => {
      expect(computeDepositAmount(null, 11_500)).toBe(0);
    });

    it('is nothing when the rent is missing and the rule is a rent multiple', () => {
      expect(
        computeDepositAmount(
          { amount: 0, basis: DEPOSIT_BASIS.RENT_MONTHS, months: 1 },
          null,
        ),
      ).toBe(0);
    });

    it('never goes negative', () => {
      expect(
        computeDepositAmount(
          { amount: -500, basis: DEPOSIT_BASIS.FIXED },
          11_500,
        ),
      ).toBe(0);
    });

    it('rounds to the cent', () => {
      expect(
        computeDepositAmount(
          { amount: 0, basis: DEPOSIT_BASIS.RENT_MONTHS, months: 1.5 },
          11_500,
        ),
      ).toBe(17_250);
    });
  });

  describe('decided or not', () => {
    it('says a rule of zero is a decision', () => {
      const view = resolveDepositRule(
        { amount: 0, basis: DEPOSIT_BASIS.FIXED },
        11_500,
      );
      expect(view.decided).toBe(true);
      expect(view.amount).toBe(0);
      expect(ruleTakesNoDeposit(view.rule)).toBe(true);
    });

    it('says no rule at all is not a decision', () => {
      const view = resolveDepositRule(null, 11_500);
      expect(view.decided).toBe(false);
      expect(ruleTakesNoDeposit(view.rule)).toBe(false);
    });

    it('says a rent multiple of zero months takes no deposit', () => {
      expect(
        ruleTakesNoDeposit({
          amount: 0,
          basis: DEPOSIT_BASIS.RENT_MONTHS,
          months: 0,
        }),
      ).toBe(true);
    });
  });

  describe('saving a rule', () => {
    it('accepts a fixed amount', () => {
      expect(
        validateDepositRule({ amount: 11_500, basis: DEPOSIT_BASIS.FIXED }),
      ).toEqual({ valid: true });
    });

    it('accepts a deposit of zero, because that is a decision', () => {
      expect(
        validateDepositRule({ amount: 0, basis: DEPOSIT_BASIS.FIXED }),
      ).toEqual({ valid: true });
    });

    it('rejects a negative deposit', () => {
      const result = validateDepositRule({
        amount: -1,
        basis: DEPOSIT_BASIS.FIXED,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/negative/i);
    });

    it('rejects a rent multiple with no months', () => {
      const result = validateDepositRule({
        basis: DEPOSIT_BASIS.RENT_MONTHS,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a deposit of more than a year of rent', () => {
      const result = validateDepositRule({
        basis: DEPOSIT_BASIS.RENT_MONTHS,
        months: 13,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects an unknown basis', () => {
      const result = validateDepositRule({ amount: 1, basis: 'WHATEVER' });
      expect(result.valid).toBe(false);
    });
  });
});
