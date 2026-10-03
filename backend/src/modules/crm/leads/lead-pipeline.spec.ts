import { LeadStage } from '@prisma/client';
import {
  availableStages,
  checkStageChange,
  PIPELINE_ORDER,
  stageLabel,
  TERMINAL_STAGES,
} from './lead-pipeline';

/**
 * The pipeline is a state machine, not a dropdown: these tests pin the moves
 * the board and the API allow, so a future "let users pick any stage" change
 * has to be deliberate.
 */
describe('lead pipeline rules', () => {
  const openStages = PIPELINE_ORDER.filter(
    (stage) => !TERMINAL_STAGES.includes(stage),
  );

  describe('checkStageChange', () => {
    it('allows the forward moves of the happy path', () => {
      expect(checkStageChange(LeadStage.NEW, LeadStage.CONTACTED).allowed).toBe(
        true,
      );
      expect(
        checkStageChange(LeadStage.CONTACTED, LeadStage.VIEWING_SCHEDULED)
          .allowed,
      ).toBe(true);
      expect(
        checkStageChange(LeadStage.VIEWING_SCHEDULED, LeadStage.NEGOTIATION)
          .allowed,
      ).toBe(true);
    });

    it('allows skipping ahead for a hot lead', () => {
      expect(
        checkStageChange(LeadStage.NEW, LeadStage.NEGOTIATION).allowed,
      ).toBe(true);
    });

    it('allows moving backwards when a prospect goes cold', () => {
      expect(
        checkStageChange(LeadStage.NEGOTIATION, LeadStage.CONTACTED).allowed,
      ).toBe(true);
    });

    it('refuses WON until the lead has been converted', () => {
      const result = checkStageChange(LeadStage.NEGOTIATION, LeadStage.WON);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/convert/i);
    });

    it('allows WON once a contact exists', () => {
      expect(
        checkStageChange(LeadStage.NEGOTIATION, LeadStage.WON, {
          converted: true,
        }).allowed,
      ).toBe(true);
    });

    it('refuses any move out of a terminal stage', () => {
      for (const terminal of TERMINAL_STAGES) {
        for (const target of PIPELINE_ORDER) {
          const result = checkStageChange(terminal, target, {
            converted: true,
          });
          if (terminal === target) {
            expect(result.allowed).toBe(true); // no-op
          } else {
            expect(result.allowed).toBe(false);
          }
        }
      }
    });

    it('treats re-applying the current stage as a no-op', () => {
      expect(
        checkStageChange(LeadStage.CONTACTED, LeadStage.CONTACTED).allowed,
      ).toBe(true);
    });

    it('rejects an unknown stage', () => {
      const result = checkStageChange(
        LeadStage.NEW,
        'NOT_A_STAGE' as LeadStage,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/unknown/i);
    });
  });

  describe('availableStages', () => {
    it('never offers a terminal stage before conversion', () => {
      const stages = availableStages(LeadStage.NEW);
      expect(stages).not.toContain(LeadStage.WON);
      expect(stages).toContain(LeadStage.LOST);
    });

    it('offers WON once the lead is converted', () => {
      expect(
        availableStages(LeadStage.NEGOTIATION, { converted: true }),
      ).toContain(LeadStage.WON);
    });

    it('offers only the current stage for a closed lead', () => {
      expect(availableStages(LeadStage.WON, { converted: true })).toEqual([
        LeadStage.WON,
      ]);
      expect(availableStages(LeadStage.LOST)).toEqual([LeadStage.LOST]);
    });

    it('agrees with checkStageChange for every open stage', () => {
      for (const stage of openStages) {
        const offered = availableStages(stage);
        for (const target of PIPELINE_ORDER) {
          expect(offered.includes(target)).toBe(
            checkStageChange(stage, target).allowed,
          );
        }
      }
    });
  });

  describe('stageLabel', () => {
    it('renders enum values as human labels', () => {
      expect(stageLabel(LeadStage.VIEWING_SCHEDULED)).toBe('Viewing Scheduled');
      expect(stageLabel(LeadStage.NEW)).toBe('New');
    });
  });
});
