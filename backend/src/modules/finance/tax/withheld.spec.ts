import { withheldOn } from './withheld';

/**
 * Withheld tax is a liability that is not part of the invoice total, so the
 * only place it can enter the ledger is when the money arrives. Two things
 * matter: an invoice with no withholding must produce exactly the entry it did
 * before withholding existed, and the entry must name the tax that was withheld
 * rather than a generic label.
 */
describe('withheldOn', () => {
  it('returns nothing when no tax was withheld', () => {
    expect(withheldOn({ taxWithheldAmount: 0 })).toBeUndefined();
    expect(withheldOn({ taxWithheldAmount: null })).toBeUndefined();
    expect(withheldOn({})).toBeUndefined();
  });

  it('defaults to a generic withholding code when there is no snapshot', () => {
    expect(withheldOn({ taxWithheldAmount: 500 })).toEqual({
      amount: 500,
      code: 'WHT',
    });
  });

  it('names the tax the rule withheld', () => {
    expect(
      withheldOn({
        taxWithheldAmount: 250,
        taxSummary: [
          { code: 'VAT', treatment: 'CHARGED', amount: 1600 },
          { code: 'IRPF', treatment: 'WITHHELD', amount: 250 },
        ],
      }),
    ).toEqual({ amount: 250, code: 'IRPF' });
  });

  it('rounds a decimal amount to the cent', () => {
    expect(withheldOn({ taxWithheldAmount: 500.005 })?.amount).toBe(500.01);
  });

  it('ignores a summary that is not an array', () => {
    expect(withheldOn({ taxWithheldAmount: 100, taxSummary: null })?.code).toBe(
      'WHT',
    );
  });
});
