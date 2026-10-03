import { SaleStage } from '@prisma/client';

/**
 * Sale pipeline rules (Module 4).
 *
 * A sale is money and a handover date, so the stage order is not a suggestion:
 * you cannot invoice before there is an agreement, and you cannot hand over
 * with money outstanding. The gates live here as pure functions so they can be
 * unit-tested without a database and reused by the board, the API and the UI.
 */

/** Forward order of the pipeline, as shown on the board. */
export const SALE_PIPELINE_ORDER: SaleStage[] = [
  SaleStage.QUOTATION,
  SaleStage.OFFER,
  SaleStage.RESERVATION,
  SaleStage.AGREEMENT,
  SaleStage.PAYMENT,
  SaleStage.HANDOVER,
];

export const TERMINAL_SALE_STAGES: SaleStage[] = [
  SaleStage.HANDOVER,
  SaleStage.CANCELLED,
];

/** One step forward in the pipeline; CANCELLED is reachable from anywhere. */
const NEXT_STAGE: Record<SaleStage, SaleStage | undefined> = {
  [SaleStage.QUOTATION]: SaleStage.OFFER,
  [SaleStage.OFFER]: SaleStage.RESERVATION,
  [SaleStage.RESERVATION]: SaleStage.AGREEMENT,
  [SaleStage.AGREEMENT]: SaleStage.PAYMENT,
  [SaleStage.PAYMENT]: SaleStage.HANDOVER,
  [SaleStage.HANDOVER]: undefined,
  [SaleStage.CANCELLED]: undefined,
};

export interface SaleGateContext {
  agreedPrice?: number | null;
  buyerContactId?: string | null;
  /** At least one instalment has had an invoice raised against it. */
  hasInvoices?: boolean;
  /** Instalments outstanding (not paid, not waived). */
  outstandingBalance?: number;
  currency?: string;
}

export interface StageCheck {
  allowed: boolean;
  reason?: string;
}

export function checkStageChange(
  current: SaleStage,
  target: SaleStage,
  context: SaleGateContext = {},
): StageCheck {
  if (![...SALE_PIPELINE_ORDER, SaleStage.CANCELLED].includes(target)) {
    return { allowed: false, reason: `Unknown sale stage "${target}".` };
  }

  if (current === target) return { allowed: true };

  if (TERMINAL_SALE_STAGES.includes(current)) {
    return {
      allowed: false,
      reason:
        current === SaleStage.HANDOVER
          ? 'This sale has been handed over and is closed.'
          : 'This sale was cancelled and is closed.',
    };
  }

  // Cancellation is always allowed before handover, but only with a reason
  // (checked by the service, which has the field).
  if (target === SaleStage.CANCELLED) {
    return { allowed: true };
  }

  if (NEXT_STAGE[current] !== target) {
    return {
      allowed: false,
      reason: `A sale moves forward one stage at a time: ${current} → ${NEXT_STAGE[current] ?? 'closed'}.`,
    };
  }

  switch (target) {
    case SaleStage.RESERVATION:
      if (!context.agreedPrice || context.agreedPrice <= 0) {
        return {
          allowed: false,
          reason:
            'Record the agreed price before reserving the property — a reservation is a commitment.',
        };
      }
      return { allowed: true };

    case SaleStage.AGREEMENT:
      if (!context.buyerContactId) {
        return {
          allowed: false,
          reason: 'Attach a buyer contact before drafting the sale agreement.',
        };
      }
      return { allowed: true };

    case SaleStage.PAYMENT:
      if (!context.hasInvoices) {
        return {
          allowed: false,
          reason:
            'Raise at least one instalment invoice before moving the sale to payment collection.',
        };
      }
      return { allowed: true };

    case SaleStage.HANDOVER: {
      const outstanding = context.outstandingBalance ?? 0;
      if (outstanding > 0) {
        const currency = context.currency ?? 'KES';
        return {
          allowed: false,
          reason:
            `${currency} ${outstanding.toLocaleString()} is still outstanding. ` +
            'A property cannot be handed over with money outstanding.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/** Stages a sale can move to right now — drives the board and the UI actions. */
export function availableSaleStages(
  current: SaleStage,
  context: SaleGateContext = {},
): SaleStage[] {
  const candidates = [
    ...SALE_PIPELINE_ORDER,
    SaleStage.CANCELLED,
  ] as SaleStage[];
  return candidates.filter(
    (stage) => checkStageChange(current, stage, context).allowed,
  );
}

export function saleStageLabel(stage: SaleStage): string {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

/** The date column stamped when a sale enters a stage (audit trail). */
export const STAGE_DATE_FIELD: Partial<Record<SaleStage, string>> = {
  [SaleStage.QUOTATION]: 'quotationDate',
  [SaleStage.OFFER]: 'offerDate',
  [SaleStage.RESERVATION]: 'reservationDate',
  [SaleStage.AGREEMENT]: 'agreementDate',
  [SaleStage.PAYMENT]: 'paymentDate',
  [SaleStage.HANDOVER]: 'handoverDate',
  [SaleStage.CANCELLED]: 'cancelledAt',
};
