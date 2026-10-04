import { AssetStatus, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import {
  ACTIONS_BY_STATUS,
  ASSET_STATUS_TRANSITIONS,
  availableWorkOrderActions,
  checkAssetStatusTransition,
  checkWorkOrderAction,
  hoursRemaining,
  isOverdue,
  nextDueDate,
  nextStatus,
  offerableWorkOrderActions,
  responseDeadline,
  type WorkOrderGateContext,
} from './work-order-lifecycle';

/**
 * The work order lifecycle is this module's acceptance criterion — a reported
 * fault has to reach CLOSED through legal steps and refuse every illegal one.
 * These tests pin the matrix, the gates, and the two derived rules that are easy
 * to break without noticing: the emergency fast-track and the overdue window.
 */
describe('work order lifecycle', () => {
  const now = new Date('2026-06-01T09:00:00.000Z');

  const ready: WorkOrderGateContext = {
    priority: WorkOrderPriority.NORMAL,
    inspectionNote: 'Toilet cistern will not stop running.',
    resolutionNote: 'Replaced the fill valve.',
    reason: 'Duplicate of WO-2026-0011.',
    hasTechnician: true,
    technicianActive: true,
    openTasks: 0,
  };

  describe('the documented pipeline', () => {
    it('walks REQUESTED → INSPECTION → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED', () => {
      const seen: WorkOrderStatus[] = [WorkOrderStatus.REQUESTED];
      for (const action of [
        'INSPECT',
        'APPROVE',
        'ASSIGN',
        'START',
        'COMPLETE',
        'CLOSE',
      ] as const) {
        const target = nextStatus(
          seen[seen.length - 1],
          action,
          action === 'ASSIGN' ? { ...ready, hasTechnician: true } : ready,
        );
        expect(target).not.toBeNull();
        seen.push(target as WorkOrderStatus);
      }

      expect(seen).toEqual([
        WorkOrderStatus.REQUESTED,
        WorkOrderStatus.INSPECTION,
        WorkOrderStatus.APPROVED,
        WorkOrderStatus.ASSIGNED,
        WorkOrderStatus.IN_PROGRESS,
        WorkOrderStatus.COMPLETED,
        WorkOrderStatus.CLOSED,
      ]);
    });

    it('offers no actions at all once closed or cancelled', () => {
      expect(ACTIONS_BY_STATUS[WorkOrderStatus.CLOSED]).toEqual([]);
      expect(ACTIONS_BY_STATUS[WorkOrderStatus.CANCELLED]).toEqual([]);
    });
  });

  describe('checkWorkOrderAction', () => {
    it('refuses a shortcut from REQUESTED straight to APPROVED', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.REQUESTED,
        'APPROVE',
        ready,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cannot be approved/i);
    });

    it('refuses to start a work order nobody is assigned to', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.APPROVED,
        'START',
        ready,
      );
      expect(result.allowed).toBe(false);
    });

    it('refuses a completion with no resolution note', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.IN_PROGRESS, 'COMPLETE', {
        ...ready,
        resolutionNote: '   ',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/what was done/i);
    });

    it('refuses a completion while checklist items are open', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.IN_PROGRESS, 'COMPLETE', {
        ...ready,
        openTasks: 2,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/2 checklist items are still open/i);
    });

    it('uses the singular for one open checklist item', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.IN_PROGRESS, 'COMPLETE', {
        ...ready,
        openTasks: 1,
      });
      expect(result.reason).toMatch(/1 checklist item is still open/i);
    });

    it('refuses to inspect without recording a finding', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.REQUESTED,
        'INSPECT',
        { ...ready, inspectionNote: null },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/what the inspection found/i);
    });

    it('refuses to approve work that was never inspected', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.INSPECTION,
        'APPROVE',
        { ...ready, inspectionNote: '' },
      );
      expect(result.allowed).toBe(false);
    });

    it('refuses an assignment with no technician', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.APPROVED, 'ASSIGN', {
        ...ready,
        hasTechnician: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/choose a technician/i);
    });

    it('refuses an assignment to a deactivated account', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.APPROVED, 'ASSIGN', {
        ...ready,
        technicianActive: false,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/inactive/i);
    });

    it('refuses to cancel without a reason', () => {
      const result = checkWorkOrderAction(WorkOrderStatus.REQUESTED, 'CANCEL', {
        ...ready,
        reason: undefined,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/needs a reason/i);
    });

    it('will not cancel work that has already started', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.IN_PROGRESS,
        'CANCEL',
        ready,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/cannot be cancelled/i);
    });

    it('can cancel an approved job nobody ever picked up', () => {
      expect(
        checkWorkOrderAction(WorkOrderStatus.APPROVED, 'CANCEL', ready).allowed,
      ).toBe(true);
    });
  });

  describe('the emergency fast-track', () => {
    it('lets an EMERGENCY job be assigned before it is inspected or approved', () => {
      const result = checkWorkOrderAction(
        WorkOrderStatus.REQUESTED,
        'ASSIGN',
        { ...ready, priority: WorkOrderPriority.EMERGENCY },
      );
      expect(result.allowed).toBe(true);
      expect(
        nextStatus(WorkOrderStatus.REQUESTED, 'ASSIGN', {
          ...ready,
          priority: WorkOrderPriority.EMERGENCY,
        }),
      ).toBe(WorkOrderStatus.ASSIGNED);
    });

    it('does not let a NORMAL job skip the gates', () => {
      expect(
        checkWorkOrderAction(
          WorkOrderStatus.REQUESTED,
          'ASSIGN',
          { ...ready, priority: WorkOrderPriority.NORMAL },
        ).allowed,
      ).toBe(false);
    });

    it('never skips the start step once assigned', () => {
      expect(
        checkWorkOrderAction(WorkOrderStatus.ASSIGNED, 'COMPLETE', ready).allowed,
      ).toBe(false);
    });
  });

  describe('availableWorkOrderActions', () => {
    it('lists exactly the actions that are actually legal', () => {
      expect(
        availableWorkOrderActions(WorkOrderStatus.IN_PROGRESS, {
          ...ready,
          openTasks: 1,
        }),
      ).toEqual([]);
      expect(
        availableWorkOrderActions(WorkOrderStatus.IN_PROGRESS, ready),
      ).toEqual(['COMPLETE']);
    });

    it('never offers a terminal state any action', () => {
      expect(availableWorkOrderActions(WorkOrderStatus.CLOSED, ready)).toEqual([]);
      expect(availableWorkOrderActions(WorkOrderStatus.CANCELLED, ready)).toEqual(
        [],
      );
    });

    it('offers an emergency request both its fast-track and its gates', () => {
      const actions = availableWorkOrderActions(WorkOrderStatus.REQUESTED, {
        ...ready,
        priority: WorkOrderPriority.EMERGENCY,
      });
      expect(actions).toContain('ASSIGN');
      expect(actions).toContain('INSPECT');
      expect(actions).toContain('CANCEL');
    });
  });

  describe('offerableWorkOrderActions', () => {
    it('offers Inspect on a fresh report, because the note is typed in the dialog', () => {
      expect(
        offerableWorkOrderActions(WorkOrderStatus.REQUESTED, {
          priority: WorkOrderPriority.NORMAL,
        }),
      ).toEqual(expect.arrayContaining(['INSPECT', 'CANCEL']));
    });

    it('offers Assign on an emergency nobody has picked up yet', () => {
      expect(
        offerableWorkOrderActions(WorkOrderStatus.REQUESTED, {
          priority: WorkOrderPriority.EMERGENCY,
        }),
      ).toContain('ASSIGN');
    });

    it('does not offer Assign on a routine report — that is the fast-track', () => {
      expect(
        offerableWorkOrderActions(WorkOrderStatus.REQUESTED, {
          priority: WorkOrderPriority.NORMAL,
        }),
      ).not.toContain('ASSIGN');
    });

    it('keeps the checklist as a real gate rather than an assumed input', () => {
      expect(
        offerableWorkOrderActions(WorkOrderStatus.IN_PROGRESS, {
          openTasks: 2,
        }),
      ).toEqual([]);
    });
  });

  describe('response windows', () => {
    it('gives an emergency 24 hours and a low-priority job 30 days', () => {
      const reportedAt = new Date('2026-06-01T00:00:00.000Z');
      expect(
        responseDeadline(WorkOrderPriority.EMERGENCY, reportedAt).getTime() -
          reportedAt.getTime(),
      ).toBe(24 * 3_600_000);
      expect(
        responseDeadline(WorkOrderPriority.LOW, reportedAt).getTime() -
          reportedAt.getTime(),
      ).toBe(30 * 24 * 3_600_000);
    });

    it('calls a job overdue once its window has passed', () => {
      expect(
        isOverdue(
          {
            priority: WorkOrderPriority.HIGH,
            reportedAt: new Date('2026-05-20T00:00:00.000Z'),
            status: WorkOrderStatus.ASSIGNED,
          },
          now,
        ),
      ).toBe(true);
    });

    it('does not call a completed or cancelled job overdue', () => {
      const old = new Date('2026-01-01T00:00:00.000Z');
      expect(
        isOverdue(
          { priority: WorkOrderPriority.EMERGENCY, reportedAt: old, status: WorkOrderStatus.COMPLETED },
          now,
        ),
      ).toBe(false);
      expect(
        isOverdue(
          { priority: WorkOrderPriority.EMERGENCY, reportedAt: old, status: WorkOrderStatus.CANCELLED },
          now,
        ),
      ).toBe(false);
    });

    it('reports the hours left, negative once overdue', () => {
      expect(
        hoursRemaining(
          {
            priority: WorkOrderPriority.NORMAL,
            reportedAt: new Date('2026-06-01T00:00:00.000Z'),
          },
          now,
        ),
      ).toBe(159);
      expect(
        hoursRemaining(
          {
            priority: WorkOrderPriority.NORMAL,
            reportedAt: new Date('2026-05-01T00:00:00.000Z'),
          },
          now,
        ),
      ).toBeLessThan(0);
    });
  });

  describe('asset service state', () => {
    it('allows service, breakdown and retirement from operational', () => {
      expect(ASSET_STATUS_TRANSITIONS[AssetStatus.OPERATIONAL]).toEqual([
        AssetStatus.SERVICE_DUE,
        AssetStatus.OUT_OF_SERVICE,
        AssetStatus.RETIRED,
      ]);
    });

    it('treats a retired asset as terminal', () => {
      const result = checkAssetStatusTransition(
        AssetStatus.RETIRED,
        AssetStatus.OPERATIONAL,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/retired/i);
    });

    it('allows a breakdown to be brought back into service', () => {
      expect(
        checkAssetStatusTransition(
          AssetStatus.OUT_OF_SERVICE,
          AssetStatus.OPERATIONAL,
        ).allowed,
      ).toBe(true);
    });

    it('allows saving an unchanged status', () => {
      expect(
        checkAssetStatusTransition(
          AssetStatus.OPERATIONAL,
          AssetStatus.OPERATIONAL,
        ).allowed,
      ).toBe(true);
    });
  });

  describe('nextDueDate', () => {
    it('advances by the interval from the due date', () => {
      expect(
        nextDueDate(
          new Date('2026-06-01T00:00:00.000Z'),
          30,
          new Date('2026-06-01T00:00:00.000Z'),
        ).toISOString(),
      ).toBe('2026-07-01T00:00:00.000Z');
    });

    it('never lands in the past when a service was done very late', () => {
      const due = new Date('2026-01-01T00:00:00.000Z');
      const servedOn = new Date('2026-06-15T09:30:00.000Z');
      const next = nextDueDate(due, 30, servedOn);
      expect(next.getTime()).toBeGreaterThan(servedOn.getTime());
      // Slips once rather than perpetually: the gap is one interval, not the
      // five months the schedule was dormant.
      expect(next.toISOString().slice(0, 10)).toBe('2026-07-15');
    });
  });
});
