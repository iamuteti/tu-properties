/**
 * Commission arithmetic (Module 4).
 *
 * Money rounding is the whole problem here: two agents splitting 50/50 on a
 * 10,000.01 commission must still add up to exactly the commission, or the
 * finance module's totals drift from the report. So the split is computed in
 * integer cents and the remainder is handed to the first participant — the
 * total is always exact, never "off by a cent".
 */

export interface CommissionParticipant {
  agentUserId: string;
  /** Share of the commission, 0–100. All participants should add to 100. */
  splitPercentage: number;
}

export interface CommissionInput {
  /** The price the commission is calculated on (the agreed sale price). */
  agreedPrice: number;
  /** Commission rate as a percentage, e.g. 3 for 3%. */
  commissionRate: number;
  participants: CommissionParticipant[];
}

export interface CommissionShare {
  agentUserId: string;
  splitPercentage: number;
  amount: number;
}

export interface CommissionValidation {
  valid: boolean;
  reason?: string;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Validate a split before any money moves: rate in range, at least one
 * participant, percentages in 0–100 and adding up to 100 (±0.01 for rounding).
 */
export function validateCommissionInput(
  input: CommissionInput,
): CommissionValidation {
  if (!Number.isFinite(input.agreedPrice) || input.agreedPrice < 0) {
    return { valid: false, reason: 'The agreed price must be zero or more.' };
  }
  if (!Number.isFinite(input.commissionRate) || input.commissionRate < 0) {
    return {
      valid: false,
      reason: 'The commission rate must be zero or more.',
    };
  }
  if (input.commissionRate > 100) {
    return { valid: false, reason: 'The commission rate cannot exceed 100%.' };
  }
  if (input.participants.length === 0) {
    return {
      valid: false,
      reason: 'At least one agent must be on the commission split.',
    };
  }

  for (const participant of input.participants) {
    if (!participant.agentUserId) {
      return { valid: false, reason: 'Every commission row needs an agent.' };
    }
    if (
      !Number.isFinite(participant.splitPercentage) ||
      participant.splitPercentage < 0 ||
      participant.splitPercentage > 100
    ) {
      return {
        valid: false,
        reason: 'Each split must be between 0% and 100%.',
      };
    }
  }

  const total = input.participants.reduce(
    (sum, participant) => sum + participant.splitPercentage,
    0,
  );
  if (Math.abs(total - 100) > 0.01) {
    return {
      valid: false,
      reason: `Commission splits must add up to 100% (they add up to ${round2(total)}%).`,
    };
  }

  return { valid: true };
}

/** Total commission earned on a sale. */
export function calculateCommissionTotal(input: {
  agreedPrice: number;
  commissionRate: number;
}): number {
  return fromCents(toCents(input.agreedPrice) * (input.commissionRate / 100));
}

/**
 * Split a commission between participants. The shares always sum to the total
 * exactly: each participant gets their rounded share except the first, which
 * absorbs the rounding remainder.
 */
export function calculateCommissionShares(
  input: CommissionInput,
): CommissionShare[] {
  const validation = validateCommissionInput(input);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const totalCents = toCents(
    calculateCommissionTotal({
      agreedPrice: input.agreedPrice,
      commissionRate: input.commissionRate,
    }),
  );

  let allocated = 0;
  return input.participants.map((participant, index) => {
    const isLast = index === input.participants.length - 1;
    const shareCents = isLast
      ? totalCents - allocated
      : Math.round((totalCents * participant.splitPercentage) / 100);
    allocated += shareCents;

    return {
      agentUserId: participant.agentUserId,
      splitPercentage: participant.splitPercentage,
      amount: fromCents(shareCents),
    };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
