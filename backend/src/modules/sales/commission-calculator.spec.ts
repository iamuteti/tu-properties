import {
  calculateCommissionShares,
  calculateCommissionTotal,
  validateCommissionInput,
} from './commission-calculator';

/**
 * Commission arithmetic is the part of this module that silently corrupts
 * finance if it is wrong: a split that does not add up to the total shows up as
 * a rounding gap in the ledger. These tests pin the exactness.
 */
describe('commission calculator', () => {
  const participants = [
    { agentUserId: 'agent-1', splitPercentage: 60 },
    { agentUserId: 'agent-2', splitPercentage: 40 },
  ];

  describe('validateCommissionInput', () => {
    it('accepts a well-formed split', () => {
      expect(
        validateCommissionInput({
          agreedPrice: 10_000_000,
          commissionRate: 3,
          participants,
        }).valid,
      ).toBe(true);
    });

    it('requires at least one participant', () => {
      const result = validateCommissionInput({
        agreedPrice: 1_000,
        commissionRate: 5,
        participants: [],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/at least one agent/i);
    });

    it('requires the splits to add up to 100%', () => {
      const result = validateCommissionInput({
        agreedPrice: 1_000,
        commissionRate: 5,
        participants: [
          { agentUserId: 'a', splitPercentage: 60 },
          { agentUserId: 'b', splitPercentage: 30 },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/add up to 100%/);
      expect(result.reason).toContain('90');
    });

    it('rejects a negative or over-100 rate', () => {
      expect(
        validateCommissionInput({
          agreedPrice: 100,
          commissionRate: -1,
          participants: [{ agentUserId: 'a', splitPercentage: 100 }],
        }).valid,
      ).toBe(false);
      expect(
        validateCommissionInput({
          agreedPrice: 100,
          commissionRate: 150,
          participants: [{ agentUserId: 'a', splitPercentage: 100 }],
        }).valid,
      ).toBe(false);
    });

    it('rejects a participant without an agent', () => {
      const result = validateCommissionInput({
        agreedPrice: 100,
        commissionRate: 5,
        participants: [{ agentUserId: '', splitPercentage: 100 }],
      });
      expect(result.valid).toBe(false);
    });

    it('tolerates floating-point noise in the total', () => {
      expect(
        validateCommissionInput({
          agreedPrice: 100,
          commissionRate: 5,
          participants: [
            { agentUserId: 'a', splitPercentage: 33.33 },
            { agentUserId: 'b', splitPercentage: 33.33 },
            { agentUserId: 'c', splitPercentage: 33.34 },
          ],
        }).valid,
      ).toBe(true);
    });
  });

  describe('calculateCommissionTotal', () => {
    it('is the agreed price times the rate', () => {
      expect(
        calculateCommissionTotal({
          agreedPrice: 10_000_000,
          commissionRate: 3,
        }),
      ).toBe(300_000);
    });

    it('is zero at a zero rate', () => {
      expect(
        calculateCommissionTotal({
          agreedPrice: 10_000_000,
          commissionRate: 0,
        }),
      ).toBe(0);
    });
  });

  describe('calculateCommissionShares', () => {
    it('splits exactly, with no rounding gap', () => {
      const shares = calculateCommissionShares({
        agreedPrice: 10_000_000,
        commissionRate: 3,
        participants,
      });
      expect(shares).toEqual([
        { agentUserId: 'agent-1', splitPercentage: 60, amount: 180_000 },
        { agentUserId: 'agent-2', splitPercentage: 40, amount: 120_000 },
      ]);
    });

    it('always sums to the total, even with an awkward amount', () => {
      const shares = calculateCommissionShares({
        agreedPrice: 10_000_007,
        commissionRate: 2.5,
        participants: [
          { agentUserId: 'a', splitPercentage: 33.33 },
          { agentUserId: 'b', splitPercentage: 33.33 },
          { agentUserId: 'c', splitPercentage: 33.34 },
        ],
      });

      const total = calculateCommissionTotal({
        agreedPrice: 10_000_007,
        commissionRate: 2.5,
      });
      const summed = shares.reduce((sum, share) => sum + share.amount, 0);
      expect(Math.round(summed * 100)).toBe(Math.round(total * 100));
    });

    it('handles a single 100% participant', () => {
      const shares = calculateCommissionShares({
        agreedPrice: 8_500_000,
        commissionRate: 2,
        participants: [{ agentUserId: 'solo', splitPercentage: 100 }],
      });
      expect(shares).toEqual([
        { agentUserId: 'solo', splitPercentage: 100, amount: 170_000 },
      ]);
    });

    it('throws rather than writing a bad split', () => {
      expect(() =>
        calculateCommissionShares({
          agreedPrice: 1000,
          commissionRate: 3,
          participants: [{ agentUserId: 'a', splitPercentage: 50 }],
        }),
      ).toThrow(/add up to 100%/);
    });
  });
});
