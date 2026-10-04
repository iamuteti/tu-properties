import {
  AssetStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';

/**
 * Work order lifecycle rules (Module 9).
 *
 * The module audit found `UnitStatus` had already grown a MAINTENANCE value
 * with nothing behind it and no work-order table at all — so the honest first
 * question for any maintenance record is "who is on the job, and what stage is
 * it at". These rules answer that in one place and they are pure, so the matrix
 * is unit-testable without a database, which is the only way the awkward cases
 * get pinned at all (a completed job that still has two open checklist items is
 * precisely the case nobody remembers to forbid by hand).
 *
 * Every transition happens through `checkWorkOrderAction` and nothing else.
 * `status` is deliberately absent from the update DTO, the same way lease
 * status is: a free-form status patch is how a work order ends up COMPLETED
 * with nobody assigned and no resolution note.
 */

export type WorkOrderAction =
  | 'INSPECT'
  | 'APPROVE'
  | 'ASSIGN'
  | 'START'
  | 'COMPLETE'
  | 'CLOSE'
  | 'CANCEL';

export interface ActionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Which actions a work order in each state may be given.
 *
 * CANCEL stops at ASSIGNED: once the technician has started, "cancelled" is a
 * way of losing the record of work that happened. That job gets completed with
 * whatever resolution the truth is.
 */
export const ACTIONS_BY_STATUS: Record<WorkOrderStatus, WorkOrderAction[]> = {
  // ASSIGN is absent here and added back only for EMERGENCY, by the fast-track
  // below — listing it unconditionally would let any priority skip the gates.
  [WorkOrderStatus.REQUESTED]: ['INSPECT', 'CANCEL'],
  [WorkOrderStatus.INSPECTION]: ['APPROVE', 'CANCEL'],
  [WorkOrderStatus.APPROVED]: ['ASSIGN', 'CANCEL'],
  [WorkOrderStatus.ASSIGNED]: ['START', 'CANCEL'],
  [WorkOrderStatus.IN_PROGRESS]: ['COMPLETE'],
  [WorkOrderStatus.COMPLETED]: ['CLOSE'],
  [WorkOrderStatus.CLOSED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

/** What each action moves the work order to. */
const NEXT_STATUS: Record<WorkOrderAction, WorkOrderStatus> = {
  INSPECT: WorkOrderStatus.INSPECTION,
  APPROVE: WorkOrderStatus.APPROVED,
  ASSIGN: WorkOrderStatus.ASSIGNED,
  START: WorkOrderStatus.IN_PROGRESS,
  COMPLETE: WorkOrderStatus.COMPLETED,
  CLOSE: WorkOrderStatus.CLOSED,
  CANCEL: WorkOrderStatus.CANCELLED,
};

/** Past tense for the refusal message, so "cannot be inspected" reads correctly. */
const ACTION_PAST: Record<WorkOrderAction, string> = {
  INSPECT: 'inspected',
  APPROVE: 'approved',
  ASSIGN: 'assigned',
  START: 'started',
  COMPLETE: 'completed',
  CLOSE: 'closed',
  CANCEL: 'cancelled',
};

/**
 * Response windows by priority, in hours.
 *
 * Derived from the priority rather than stored as a `dueAt`: a second date
 * column is a second thing to keep in step, and the only version anybody would
 * ever edit by hand is the one they disagree with.
 */
export const RESPONSE_HOURS: Record<WorkOrderPriority, number> = {
  [WorkOrderPriority.EMERGENCY]: 24,
  [WorkOrderPriority.HIGH]: 72,
  [WorkOrderPriority.NORMAL]: 168,
  [WorkOrderPriority.LOW]: 720,
};

export interface WorkOrderGateContext {
  priority?: WorkOrderPriority;
  /** Checklist items still open on the work order. */
  openTasks?: number;
  /** Somebody has been assigned. */
  hasTechnician?: boolean;
  /** That somebody's account is still active. */
  technicianActive?: boolean;
  /** What the inspection found — required to approve anything. */
  inspectionNote?: string | null;
  /** What was actually done — required to complete anything. */
  resolutionNote?: string | null;
  /** Why the job is being called off. */
  reason?: string | null;
}

export function checkWorkOrderAction(
  status: WorkOrderStatus,
  action: WorkOrderAction,
  context: WorkOrderGateContext = {},
): ActionCheck {
  const legal = ACTIONS_BY_STATUS[status].includes(action);
  // The emergency fast-track: a burst pipe cannot wait for an inspection and an
  // approval. It is the one documented shortcut out of the ordered pipeline,
  // and it only exists for EMERGENCY — everything else goes through the gates.
  const fastTrack =
    action === 'ASSIGN' &&
    context.priority === WorkOrderPriority.EMERGENCY &&
    status === WorkOrderStatus.REQUESTED;

  if (!legal && !fastTrack) {
    return {
      allowed: false,
      reason: `A ${statusLabel(
        status,
      ).toLowerCase()} work order cannot be ${ACTION_PAST[action]}.`,
    };
  }

  switch (action) {
    case 'INSPECT': {
      // An inspection that records no finding is a visit somebody cannot
      // explain the cost of, and it is the note the approver reads.
      if (!context.inspectionNote?.trim()) {
        return {
          allowed: false,
          reason:
            'Record what the inspection found before moving this to inspection — the approver reads it.',
        };
      }
      return { allowed: true };
    }

    case 'APPROVE': {
      if (!context.inspectionNote?.trim()) {
        return {
          allowed: false,
          reason:
            'There is no inspection note on this work order, so there is nothing to approve.',
        };
      }
      return { allowed: true };
    }

    case 'ASSIGN': {
      if (!context.hasTechnician) {
        return {
          allowed: false,
          reason: 'Choose a technician to assign this to.',
        };
      }
      if (context.technicianActive === false) {
        return {
          allowed: false,
          reason:
            'That technician\'s account is inactive. Pick somebody who still works here.',
        };
      }
      return { allowed: true };
    }

    case 'START':
      return { allowed: true };

    case 'COMPLETE': {
      // A "completed" work order with an empty resolution note is the one field
      // a tenant reads when they ask whether anybody came. It is required.
      if (!context.resolutionNote?.trim()) {
        return {
          allowed: false,
          reason:
            'Say what was done before completing this — the resident sees this note.',
        };
      }
      const open = context.openTasks ?? 0;
      if (open > 0) {
        return {
          allowed: false,
          reason: `${open} checklist item${open === 1 ? ' is' : 's are'} still open. Finish or remove ${open === 1 ? 'it' : 'them'} first.`,
        };
      }
      return { allowed: true };
    }

    case 'CLOSE':
      return { allowed: true };

    case 'CANCEL': {
      if (!context.reason?.trim()) {
        return {
          allowed: false,
          reason:
            'Cancelling needs a reason — it is what the resident and the owner read.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: `Unknown work order action "${action}".` };
  }
}

export function availableWorkOrderActions(
  status: WorkOrderStatus,
  context: WorkOrderGateContext = {},
): WorkOrderAction[] {
  // The emergency fast-track can only add ASSIGN, never remove a gate, so the
  // union of both lists is the whole story for a REQUESTED emergency.
  const candidates = new Set<WorkOrderAction>([
    ...ACTIONS_BY_STATUS[status],
    ...(context.priority === WorkOrderPriority.EMERGENCY
      ? (['ASSIGN'] as WorkOrderAction[])
      : []),
  ]);

  return [...candidates].filter((action) =>
    checkWorkOrderAction(status, action, context).allowed,
  );
}

/**
 * What the record already satisfies, as opposed to what an action asks for.
 *
 * "Record what the inspection found" is not a reason to hide the Inspect button
 * — it is the field the Inspect dialog asks the user to type. So the inputs an
 * action carries with it are assumed present here, and only conditions about the
 * record itself are enforced. The result answers "which buttons belong on this
 * row", not "which will succeed": the server still refuses with a message
 * written for whoever pressed, which is why the UI shows the record's
 * `openTasks` next to the Complete button rather than hiding it.
 */
export function offerableWorkOrderActions(
  status: WorkOrderStatus,
  context: WorkOrderGateContext = {},
): WorkOrderAction[] {
  const withActionInputs = {
    ...context,
    hasTechnician: context.hasTechnician ?? true,
    inspectionNote: context.inspectionNote ?? 'supplied by the action',
    resolutionNote: context.resolutionNote ?? 'supplied by the action',
    reason: context.reason ?? 'supplied by the action',
  };

  return availableWorkOrderActions(status, withActionInputs);
}

export function nextStatus(
  status: WorkOrderStatus,
  action: WorkOrderAction,
  context: WorkOrderGateContext = {},
): WorkOrderStatus | null {
  return checkWorkOrderAction(status, action, context).allowed
    ? NEXT_STATUS[action]
    : null;
}

/** When this job was due to be responded to, from when it was reported. */
export function responseDeadline(
  priority: WorkOrderPriority,
  reportedAt: Date,
): Date {
  return new Date(reportedAt.getTime() + RESPONSE_HOURS[priority] * 3_600_000);
}

/**
 * Whether a work order has blown its response window.
 *
 * "Open" means not finished, not cancelled and not merely approved: an
 * APPROVED work order nobody has picked up is the case that actually ages,
 * because approving is what stops it appearing in anybody's mental queue.
 */
export function isOverdue(
  workOrder: {
    priority: WorkOrderPriority;
    reportedAt: Date;
    status: WorkOrderStatus;
  },
  now: Date = new Date(),
): boolean {
  if (
    workOrder.status === WorkOrderStatus.CLOSED ||
    workOrder.status === WorkOrderStatus.CANCELLED ||
    workOrder.status === WorkOrderStatus.COMPLETED
  ) {
    return false;
  }
  return responseDeadline(workOrder.priority, workOrder.reportedAt) < now;
}

/** Hours left before the response window closes; negative once it has. */
export function hoursRemaining(
  workOrder: { priority: WorkOrderPriority; reportedAt: Date },
  now: Date = new Date(),
): number {
  return Math.round(
    (responseDeadline(workOrder.priority, workOrder.reportedAt).getTime() -
      now.getTime()) /
      3_600_000,
  );
}

/** "Requested", "Out of service" — one label helper for both enums. */
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/**
 * Asset service state.
 *
 * A much smaller machine than the work order's, because an asset has no
 * stakeholders waiting on a decision — but RETIRED is terminal, and that is the
 * part worth enforcing: a retired lift that somebody quietly puts back to
 * OPERATIONAL is generating preventive work orders for equipment the company
 * no longer owns.
 */
export const ASSET_STATUS_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  [AssetStatus.OPERATIONAL]: [
    AssetStatus.SERVICE_DUE,
    AssetStatus.OUT_OF_SERVICE,
    AssetStatus.RETIRED,
  ],
  [AssetStatus.SERVICE_DUE]: [
    AssetStatus.OPERATIONAL,
    AssetStatus.OUT_OF_SERVICE,
    AssetStatus.RETIRED,
  ],
  [AssetStatus.OUT_OF_SERVICE]: [
    AssetStatus.OPERATIONAL,
    AssetStatus.SERVICE_DUE,
    AssetStatus.RETIRED,
  ],
  [AssetStatus.RETIRED]: [],
};

export function checkAssetStatusTransition(
  from: AssetStatus,
  to: AssetStatus,
): ActionCheck {
  if (from === to) return { allowed: true };
  if (!ASSET_STATUS_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      reason:
        from === AssetStatus.RETIRED
          ? 'This asset is retired, so its service state cannot change.'
          : `An asset cannot move from ${statusLabel(from).toLowerCase()} to ${statusLabel(
              to,
            ).toLowerCase()}.`,
    };
  }
  return { allowed: true };
}

/**
 * The next due date after a service, from the interval rather than from the old
 * date. A schedule that slipped a month slips once, not forever — which is the
 * difference between "the generator was serviced late in March" and a schedule
 * that is permanently one month behind with no way to tell.
 *
 * A due *date* is a calendar day, so the arithmetic is done in UTC: a server in
 * Nairobi and one in Berlin must agree that a schedule is due on the 1st, not
 * disagree by a day because of where the process happens to run.
 */
export function nextDueDate(
  currentDue: Date,
  frequencyDays: number,
  servedOn: Date = new Date(),
): Date {
  const next = addUtcDays(currentDue, frequencyDays);
  // Never in the past: a service performed long overdue still moves the clock
  // forward from the *current* due date, so the next due date is in the future
  // and the sweep has something to schedule.
  return next <= servedOn ? addUtcDays(servedOn, frequencyDays) : next;
}

/** Midnight UTC on `date` plus `days`, which is how a due date is stored. */
export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Midnight UTC on the day `date` falls in — the day a service is raised for. */
export function dayOf(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
