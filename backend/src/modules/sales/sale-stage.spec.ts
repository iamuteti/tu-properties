import { SaleStage } from '@prisma/client';
import {
  availableSaleStages,
  checkStageChange,
  SALE_PIPELINE_ORDER,
  saleStageLabel,
  TERMINAL_SALE_STAGES,
} from './sale-stage';

/**
 * The sale pipeline gates the money: you cannot reserve without a price, draft
 * an agreement without a buyer, collect payment without an invoice, or hand
 * over with cash outstanding. These tests pin that.
 */
describe('sale stage rules', () => {
  const ready = {
    agreedPrice: 10_000_000,
    buyerContactId: 'contact-1',
    hasInvoices: true,
    outstandingBalance: 0,
    currency: 'KES',
  } as const;

  describe('checkStageChange', () => {
    it('walks the happy path one stage at a time', () => {
      const path: SaleStage[] = [
        SaleStage.OFFER,
        SaleStage.RESERVATION,
        SaleStage.AGREEMENT,
        SaleStage.PAYMENT,
        SaleStage.HANDOVER,
      ];

      let current: SaleStage = SaleStage.QUOTATION;
      for (const next of path) {
        expect(checkStageChange(current, next, { ...ready }).allowed).toBe(
          true,
        );
        current = next;
      }
    });

    it('refuses to skip a stage', () => {
      const result = checkStageChange(
        SaleStage.QUOTATION,
        SaleStage.AGREEMENT,
        ready,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/one stage at a time/i);
    });

    it('refuses to move backwards', () => {
      expect(
        checkStageChange(SaleStage.PAYMENT, SaleStage.OFFER, ready).allowed,
      ).toBe(false);
    });

    it('requires an agreed price before reserving', () => {
      const result = checkStageChange(SaleStage.OFFER, SaleStage.RESERVATION, {
        ...ready,
        agreedPrice: 0,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/agreed price/i);
    });

    it('requires a buyer before drafting the agreement', () => {
      const result = checkStageChange(
        SaleStage.RESERVATION,
        SaleStage.AGREEMENT,
        {
          ...ready,
          buyerContactId: null,
        },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/buyer contact/i);
    });

    it('requires at least one invoice before payment collection', () => {
      const result = checkStageChange(SaleStage.AGREEMENT, SaleStage.PAYMENT, {
        ...ready,
        hasInvoices: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/invoice/i);
    });

    it('refuses handover with money outstanding, and says how much', () => {
      const result = checkStageChange(SaleStage.PAYMENT, SaleStage.HANDOVER, {
        ...ready,
        outstandingBalance: 250000,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('250,000');
      expect(result.reason).toContain('KES');
    });

    it('allows handover once nothing is outstanding', () => {
      expect(
        checkStageChange(SaleStage.PAYMENT, SaleStage.HANDOVER, {
          ...ready,
          outstandingBalance: 0,
        }).allowed,
      ).toBe(true);
    });

    it('allows cancellation from any open stage', () => {
      for (const stage of SALE_PIPELINE_ORDER.filter(
        (s) => !TERMINAL_SALE_STAGES.includes(s),
      )) {
        expect(checkStageChange(stage, SaleStage.CANCELLED, {}).allowed).toBe(
          true,
        );
      }
    });

    it('refuses to move a closed sale', () => {
      expect(
        checkStageChange(SaleStage.HANDOVER, SaleStage.OFFER, ready).allowed,
      ).toBe(false);
      expect(
        checkStageChange(SaleStage.CANCELLED, SaleStage.OFFER, ready).allowed,
      ).toBe(false);
    });

    it('treats re-applying the current stage as a no-op', () => {
      expect(
        checkStageChange(SaleStage.OFFER, SaleStage.OFFER, {}).allowed,
      ).toBe(true);
    });

    it('rejects an unknown stage', () => {
      const result = checkStageChange(
        SaleStage.QUOTATION,
        'CLOSED_DEAL' as SaleStage,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/unknown/i);
    });
  });

  describe('availableSaleStages', () => {
    it('offers only the next stage plus cancellation mid-pipeline', () => {
      expect(
        availableSaleStages(SaleStage.OFFER, { ...ready, agreedPrice: 0 }),
      ).toEqual([SaleStage.OFFER, SaleStage.CANCELLED]);
      expect(availableSaleStages(SaleStage.OFFER, ready)).toEqual([
        SaleStage.OFFER, // re-applying the current stage is a no-op, not an error
        SaleStage.RESERVATION,
        SaleStage.CANCELLED,
      ]);
    });

    it('offers nothing but the current stage for a closed sale', () => {
      expect(availableSaleStages(SaleStage.HANDOVER, ready)).toEqual([
        SaleStage.HANDOVER,
      ]);
    });

    it('agrees with checkStageChange for every stage', () => {
      for (const stage of [...SALE_PIPELINE_ORDER, SaleStage.CANCELLED]) {
        const offered = availableSaleStages(stage, ready);
        for (const target of [...SALE_PIPELINE_ORDER, SaleStage.CANCELLED]) {
          expect(offered.includes(target)).toBe(
            checkStageChange(stage, target, ready).allowed,
          );
        }
      }
    });
  });

  describe('saleStageLabel', () => {
    it('renders enum values as human labels', () => {
      expect(saleStageLabel(SaleStage.QUOTATION)).toBe('Quotation');
    });
  });
});
