import { TaxBasis, TaxTreatment } from '@prisma/client';
import {
  ApplicableTax,
  addInclusiveTax,
  computeInvoiceTax,
  computeLineTaxes,
  extractInclusiveTaxCents,
  orderTaxRules,
  taxOnNetCents,
} from './tax-calculator';

/**
 * The tax engine is the one place money is derived from configuration, so the
 * rules worth pinning are the ones a country change would expose:
 *   - exclusive and inclusive taxes are different operations, not one formula
 *     with a flag,
 *   - several rules can apply at once, and a compound tax must be calculated
 *     after the tax it stacks on,
 *   - withheld tax never reaches the customer's bill,
 *   - cents never drift.
 */
const rule = (over: Partial<ApplicableTax> = {}): ApplicableTax => ({
  id: over.code ?? 'r1',
  code: 'VAT',
  name: 'VAT',
  ratePercent: 16,
  basis: TaxBasis.EXCLUSIVE,
  treatment: TaxTreatment.CHARGED,
  isCompound: false,
  ledgerAccountCode: '2100',
  appliesToCategory: '*',
  ...over,
});

describe('tax calculator', () => {
  describe('taxOnNetCents', () => {
    it('adds tax on top of a net amount', () => {
      // 10,000.00 + 16% = 1,600.00 — all amounts here are cents.
      expect(taxOnNetCents(1_000_000, 16)).toBe(160_000);
    });

    it('does not care how the price was quoted once it is net', () => {
      // A 119.00 VAT-inclusive price at 19% is 100.00 net + 19.00 of tax.
      expect(taxOnNetCents(10_000, 19)).toBe(1_900);
    });

    it('treats a zero rate as no tax', () => {
      expect(taxOnNetCents(1_000_000, 0)).toBe(0);
    });

    it('refuses a negative rate rather than paying out tax', () => {
      expect(() => taxOnNetCents(1_000_000, -5)).toThrow(RangeError);
    });
  });

  describe('extractInclusiveTaxCents', () => {
    it('splits 119 into 100 net + 19 tax', () => {
      expect(extractInclusiveTaxCents(11_900, 19)).toEqual({
        netCents: 10_000,
        taxCents: 1_900,
      });
    });

    it('handles a fractional rate exactly', () => {
      // Brazil-style ISS at 7.7% is not a round number, and must still split
      // back to the penny.
      const { netCents, taxCents } = extractInclusiveTaxCents(10_770, 7.7);
      expect(netCents + taxCents).toBe(10_770);
      expect(taxCents).toBe(770);
    });
  });

  describe('computeLineTaxes', () => {
    it('keeps an exclusive price as the net and adds the tax', () => {
      const result = computeLineTaxes({ description: 'Rent', amount: 10_000 }, [
        rule(),
      ]);
      expect(result.netAmount).toBe(10_000);
      expect(result.grossAmount).toBe(11_600);
      expect(result.taxes[0].amount).toBe(1_600);
    });

    it('rounds per line, the way an invoice document does', () => {
      // 3 x 0.07 = 0.21 net; 16% of each line rounds to 1 cent, so the tax is
      // 0.03, not 0.0336 rounded once at the end. Each line is a separate row a
      // customer can check, so rounding each one is the honest answer.
      const result = computeInvoiceTax(
        Array.from({ length: 3 }, () => ({ description: 'x', amount: 0.07 })),
        [rule({ ratePercent: 16 })],
      );
      expect(result.netAmount).toBe(0.21);
      expect(result.chargedTax).toBe(0.03);
      expect(result.totalAmount).toBe(0.24);
    });

    it('strips an inclusive price back to the net', () => {
      const result = computeLineTaxes({ description: 'Rent', amount: 11_900 }, [
        rule({ ratePercent: 19, basis: TaxBasis.INCLUSIVE }),
      ]);
      expect(result.netAmount).toBe(10_000);
      expect(result.grossAmount).toBe(11_900);
      expect(result.taxes[0].amount).toBe(1_900);
    });

    it('leaves a zero-tax jurisdiction alone', () => {
      const result = computeLineTaxes({ description: 'Rent', amount: 10_000 }, [
        rule({ ratePercent: 0, ledgerAccountCode: undefined }),
      ]);
      expect(result.netAmount).toBe(10_000);
      expect(result.grossAmount).toBe(10_000);
      expect(result.taxes).toHaveLength(0);
    });

    it('keeps withheld tax out of the amount the customer is billed', () => {
      const result = computeLineTaxes(
        { description: 'Contractor fee', amount: 10_000 },
        [rule({ code: 'WHT', treatment: TaxTreatment.WITHHELD })],
      );
      // The invoice still shows 10,000 — the withholding is our deduction.
      expect(result.grossAmount).toBe(10_000);
      expect(result.taxes[0].amount).toBe(1_600);
      expect(result.taxes[0].treatment).toBe(TaxTreatment.WITHHELD);
    });

    it('computes withholding on the charge, not on the total with VAT', () => {
      // Rent withholding tax is a percentage of the rent. Charging it on the
      // rent-plus-VAT total would over-withhold by the VAT amount.
      const result = computeLineTaxes({ description: 'Rent', amount: 10_000 }, [
        rule({ code: 'VAT', ratePercent: 16 }),
        rule({
          id: 'wht',
          code: 'WHT',
          ratePercent: 5,
          treatment: TaxTreatment.WITHHELD,
        }),
      ]);
      expect(result.grossAmount).toBe(11_600);
      expect(result.taxes.find((tax) => tax.code === 'WHT')?.amount).toBe(500);
    });

    it('applies a compound tax on top of the first one', () => {
      const result = computeLineTaxes(
        { description: 'Service', amount: 10_000 },
        [
          rule({ code: 'VAT', ratePercent: 16 }),
          rule({
            id: 'r2',
            code: 'SERVICE_LEVY',
            name: 'Service levy',
            ratePercent: 2,
            isCompound: true,
            compoundOnCode: 'VAT',
            ledgerAccountCode: '2110',
          }),
        ],
      );
      // 10,000 + 1,600 VAT, then 2% of the 11,600 subtotal.
      expect(result.grossAmount).toBe(11_832);
      expect(result.taxes.map((tax) => tax.amount)).toEqual([1_600, 232]);
    });

    it('refuses a compound cycle instead of looping', () => {
      const rules = [
        rule({ id: 'a', code: 'A', isCompound: true, compoundOnCode: 'B' }),
        rule({ id: 'b', code: 'B', isCompound: true, compoundOnCode: 'A' }),
      ];
      expect(() => orderTaxRules(rules)).toThrow(/cycle/i);
    });

    it('orders a compound tax after what it stacks on', () => {
      const ordered = orderTaxRules([
        rule({ id: 'c', code: 'C', isCompound: true, compoundOnCode: 'A' }),
        rule({ id: 'a', code: 'A' }),
      ]);
      expect(ordered.map((item) => item.code)).toEqual(['A', 'C']);
    });

    it('handles two independent taxes on one line', () => {
      const result = computeLineTaxes({ description: 'Rent', amount: 10_000 }, [
        rule({ code: 'VAT', ratePercent: 16 }),
        rule({
          id: 'r2',
          code: 'LEVY',
          ratePercent: 1.5,
          ledgerAccountCode: '2110',
        }),
      ]);
      expect(result.grossAmount).toBe(11_750);
      expect(result.taxes.map((tax) => tax.code)).toEqual(['VAT', 'LEVY']);
    });
  });

  describe('rulesForLine', () => {
    // A standard and a reduced rate of the same tax are both active at once;
    // charging both would bill the tax twice at two rates.
    const standard = rule({ id: 'std', code: 'VAT', ratePercent: 19 });
    const reduced = rule({
      id: 'red',
      code: 'VAT',
      ratePercent: 7,
      appliesToCategory: 'residential_rent',
    });

    it('applies the general rate to a line with no category', () => {
      const line = computeLineTaxes(
        { description: 'Service', amount: 10_000 },
        [standard, reduced],
      );
      expect(line.taxes).toHaveLength(1);
      expect(line.taxes[0].ratePercent).toBe(19);
    });

    it('applies the reduced rate to its own category', () => {
      const line = computeLineTaxes(
        { description: 'Rent', amount: 10_000, category: 'residential_rent' },
        [standard, reduced],
      );
      expect(line.taxes).toHaveLength(1);
      expect(line.taxes[0].ratePercent).toBe(7);
      expect(line.grossAmount).toBe(10_700);
    });

    it('bills two different rates of different taxes on one line', () => {
      const line = computeLineTaxes(
        { description: 'Rent', amount: 10_000, category: 'residential_rent' },
        [
          standard,
          reduced,
          rule({
            id: 'wht',
            code: 'WHT',
            ratePercent: 5,
            treatment: TaxTreatment.WITHHELD,
          }),
        ],
      );
      expect(line.taxes.map((tax) => tax.code).sort()).toEqual(['VAT', 'WHT']);
      expect(line.grossAmount).toBe(10_700);
    });
  });

  describe('computeInvoiceTax', () => {
    it('groups taxes per rule for the ledger', () => {
      const result = computeInvoiceTax(
        [
          { description: 'Rent October', amount: 10_000 },
          { description: 'Parking', amount: 5_000 },
        ],
        [rule()],
      );
      expect(result.netAmount).toBe(15_000);
      expect(result.chargedTax).toBe(2_400);
      expect(result.totalAmount).toBe(17_400);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toMatchObject({
        code: 'VAT',
        ratePercent: 16,
        amount: 2_400,
        account: '2100',
      });
    });

    it('produces one summary entry per tax type', () => {
      const result = computeInvoiceTax(
        [{ description: 'Rent', amount: 10_000 }],
        [
          rule({ code: 'VAT', ratePercent: 16 }),
          rule({
            id: 'r2',
            code: 'LEVY',
            name: 'Levy',
            ratePercent: 1.5,
            ledgerAccountCode: '2110',
          }),
        ],
      );
      expect(result.summary.map((entry) => entry.code)).toEqual([
        'VAT',
        'LEVY',
      ]);
      // Each carries its own ledger account, so the trial balance does not merge
      // two different taxes into one figure.
      expect(result.summary.map((entry) => entry.account)).toEqual([
        '2100',
        '2110',
      ]);
    });

    it('reports that an inclusive invoice needs no adjustment', () => {
      const result = computeInvoiceTax(
        [{ description: 'Rent', amount: 11_900 }],
        [rule({ ratePercent: 19, basis: TaxBasis.INCLUSIVE })],
      );
      expect(result.totalAmount).toBe(11_900);
      expect(result.totalsMatchStatedAmounts).toBe(true);
    });

    it('totals many lines to the penny', () => {
      const result = computeInvoiceTax(
        Array.from({ length: 7 }, () => ({
          description: 'Unit',
          amount: 3_333.33,
        })),
        [rule({ ratePercent: 16 })],
      );
      expect(result.netAmount).toBe(23_333.31);
      expect(result.chargedTax).toBe(3_733.31);
      // Float addition is not exact, so compare at the precision that matters.
      expect(
        Math.round(
          (Number(result.netAmount) + Number(result.chargedTax)) * 100,
        ),
      ).toBe(Math.round(Number(result.totalAmount) * 100));
    });

    it('does not tax an empty invoice', () => {
      const result = computeInvoiceTax([], [rule()]);
      expect(result).toMatchObject({
        netAmount: 0,
        chargedTax: 0,
        totalAmount: 0,
        summary: [],
      });
    });
  });

  describe('addInclusiveTax', () => {
    it('turns a net price into the shelf price', () => {
      expect(addInclusiveTax(100, 19)).toBe(119);
    });
  });
});
