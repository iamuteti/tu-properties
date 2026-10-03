import { PayoutStatus } from '@prisma/client';
import {
  availablePayoutStatuses,
  checkPayoutStatusChange,
  outstandingAfterPayout,
} from './payout-status';

const context = (
  overrides: Partial<Parameters<typeof checkPayoutStatusChange>[2]> = {},
) => ({
  amount: 50000,
  reference: 'BNK-99887',
  ...overrides,
});

describe('checkPayoutStatusChange', () => {
  it('allows the normal path pending → processing → paid', () => {
    expect(
      checkPayoutStatusChange(
        PayoutStatus.PENDING,
        PayoutStatus.PROCESSING,
        context(),
      ),
    ).toEqual({ allowed: true });
    expect(
      checkPayoutStatusChange(
        PayoutStatus.PROCESSING,
        PayoutStatus.PAID,
        context(),
      ),
    ).toEqual({ allowed: true });
  });

  it('allows a payout to be marked paid straight from pending', () => {
    expect(
      checkPayoutStatusChange(
        PayoutStatus.PENDING,
        PayoutStatus.PAID,
        context(),
      ),
    ).toEqual({ allowed: true });
  });

  it('refuses to skip processing backwards', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PROCESSING,
      PayoutStatus.PENDING,
      context(),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('PROCESSING');
  });

  it('requires a transfer reference before marking a payout paid', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PROCESSING,
      PayoutStatus.PAID,
      context({ reference: '   ' }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('transfer reference');
  });

  it('requires a reason before marking a payout failed', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PROCESSING,
      PayoutStatus.FAILED,
      context(),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('why the transfer failed');
  });

  it('lets a failed payout be retried', () => {
    expect(
      checkPayoutStatusChange(
        PayoutStatus.FAILED,
        PayoutStatus.PROCESSING,
        context({ failureReason: 'Account closed' }),
      ),
    ).toEqual({ allowed: true });
  });

  it('treats paid as terminal', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PAID,
      PayoutStatus.FAILED,
      context(),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('closed');
  });

  it('refuses a payout larger than what the statement still owes', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PROCESSING,
      PayoutStatus.PAID,
      {
        ...context(),
        unsettledOnStatement: 30000,
      },
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('30,000');
  });

  it('refuses to pay against a voided statement', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PENDING,
      PayoutStatus.PAID,
      {
        ...context(),
        statementVoid: true,
      },
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('voided');
  });

  it('refuses a non-positive amount at any step', () => {
    expect(
      checkPayoutStatusChange(
        PayoutStatus.PENDING,
        PayoutStatus.PROCESSING,
        context({ amount: 0 }),
      ).allowed,
    ).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = checkPayoutStatusChange(
      PayoutStatus.PENDING,
      'TRANSFERRED' as PayoutStatus,
      context(),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unknown payout status');
  });

  it('treats re-submitting the current status as a no-op', () => {
    expect(
      checkPayoutStatusChange(
        PayoutStatus.PENDING,
        PayoutStatus.PENDING,
        context({ reference: null }),
      ),
    ).toEqual({ allowed: true });
  });
});

describe('availablePayoutStatuses', () => {
  it('offers only the reachable statuses', () => {
    // FAILED is not offered yet: the gate needs a reason, which is only asked
    // for once the operator actually picks it.
    expect(availablePayoutStatuses(PayoutStatus.PENDING, context())).toEqual([
      PayoutStatus.PROCESSING,
      PayoutStatus.PAID,
    ]);
    expect(
      availablePayoutStatuses(
        PayoutStatus.PENDING,
        context({ failureReason: 'Rejected' }),
      ),
    ).toEqual([
      PayoutStatus.PROCESSING,
      PayoutStatus.PAID,
      PayoutStatus.FAILED,
    ]);
  });

  it('offers nothing once the payout is paid', () => {
    expect(availablePayoutStatuses(PayoutStatus.PAID, context())).toEqual([]);
  });
});

describe('outstandingAfterPayout', () => {
  it('returns what is still owed', () => {
    expect(outstandingAfterPayout(100000, [40000, 25000])).toBe(35000);
  });

  it('handles an empty payout list', () => {
    expect(outstandingAfterPayout(0, [])).toBe(0);
  });
});
