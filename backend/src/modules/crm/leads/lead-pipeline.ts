import { LeadStage } from '@prisma/client';

/**
 * Lead pipeline rules (Module 3).
 *
 * A lead stage is not a free-text field: it drives the kanban board, the
 * follow-up queue and (later) the sale/lease handoff, so "which moves are
 * legal" has to be answered in one place. Pure functions so the rules can be
 * unit-tested without a database.
 */

/** The order stages appear in on the pipeline board. */
export const PIPELINE_ORDER: LeadStage[] = [
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.VIEWING_SCHEDULED,
  LeadStage.NEGOTIATION,
  LeadStage.WON,
  LeadStage.LOST,
];

/** Stages a lead can no longer leave (a converted/lost lead is final). */
export const TERMINAL_STAGES: LeadStage[] = [LeadStage.WON, LeadStage.LOST];

/**
 * Legal moves. Backwards moves are allowed (a prospect who stops answering
 * goes back to CONTACTED), skipping ahead is allowed (a hot lead can jump to
 * NEGOTIATION), and terminal stages are closed until the lead is reopened.
 */
const TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  [LeadStage.NEW]: [
    LeadStage.CONTACTED,
    LeadStage.VIEWING_SCHEDULED,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST,
  ],
  [LeadStage.CONTACTED]: [
    LeadStage.NEW,
    LeadStage.VIEWING_SCHEDULED,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST,
  ],
  [LeadStage.VIEWING_SCHEDULED]: [
    LeadStage.NEW,
    LeadStage.CONTACTED,
    LeadStage.NEGOTIATION,
    LeadStage.WON,
    LeadStage.LOST,
  ],
  [LeadStage.NEGOTIATION]: [
    LeadStage.NEW,
    LeadStage.CONTACTED,
    LeadStage.VIEWING_SCHEDULED,
    LeadStage.WON,
    LeadStage.LOST,
  ],
  [LeadStage.WON]: [],
  [LeadStage.LOST]: [],
};

export interface StageCheck {
  allowed: boolean;
  reason?: string;
}

export interface StageContext {
  /** The lead already produced a contact. */
  converted?: boolean;
}

/**
 * Decide whether `current → target` is a legal move for this lead.
 */
export function checkStageChange(
  current: LeadStage,
  target: LeadStage,
  context: StageContext = {},
): StageCheck {
  if (!PIPELINE_ORDER.includes(target)) {
    return { allowed: false, reason: `Unknown pipeline stage "${target}".` };
  }

  if (current === target) return { allowed: true };

  if (TERMINAL_STAGES.includes(current)) {
    return {
      allowed: false,
      reason:
        current === LeadStage.WON
          ? 'This lead has already been won and converted. Reopen it before moving it again.'
          : 'This lead is marked lost. Reopen it before moving it again.',
    };
  }

  if (!TRANSITIONS[current].includes(target)) {
    return {
      allowed: false,
      reason: `A lead cannot move from ${current} to ${target}.`,
    };
  }

  // WON means "we converted them", so the lead must actually be converted.
  if (target === LeadStage.WON && !context.converted) {
    return {
      allowed: false,
      reason:
        'Convert the lead to a contact first — marking it won without a contact would lose the enquiry.',
    };
  }

  return { allowed: true };
}

/**
 * Stages a lead can move to right now. Drives the board's drag targets and the
 * UI action buttons, so the client never offers an illegal move.
 */
export function availableStages(
  current: LeadStage,
  context: StageContext = {},
): LeadStage[] {
  return PIPELINE_ORDER.filter(
    (stage) => checkStageChange(current, stage, context).allowed,
  );
}

export function stageLabel(stage: LeadStage): string {
  return stage
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}
