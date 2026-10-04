import { WorkflowApproverKind, WorkflowStepStatus } from '@prisma/client';

/**
 * Module 18 — Workflow Engine: the rules, with no database and no Nest.
 *
 * Everything here is a pure function over data that already exists, which is the
 * only way the interesting parts of an approval engine can be tested at all:
 * who may act on a level, whether a level's condition applies, where the next
 * level is, whether a level is overdue. The service owns persistence and
 * notification; this file owns the decisions.
 */

export const WORKFLOW_ENTITY_TYPES = [
  'REFUND',
  'EXPENSE',
  'LEASE',
  'PURCHASE_ORDER',
  'WORK_ORDER',
  'PAYOUT',
  'DISCOUNT',
  'WRITE_OFF',
] as const;

export type WorkflowEntityType =
  | (typeof WORKFLOW_ENTITY_TYPES)[number]
  | string;

export const WORKFLOW_CONDITION_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'exists',
] as const;

export type WorkflowConditionOp = (typeof WORKFLOW_CONDITION_OPS)[number];

export interface WorkflowCondition {
  field: string;
  op: WorkflowConditionOp;
  value?: unknown;
}

export interface WorkflowStepTemplate {
  name: string;
  approverKind: WorkflowApproverKind;
  approverUserId?: string | null;
  approverRole?: string | null;
  condition?: WorkflowCondition | null;
  escalateAfterHours?: number | null;
  escalateToUserId?: string | null;
}

/** A definition is configuration, so a bad one is a user error, not a 500. */
export class WorkflowDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowDefinitionError';
  }
}

/**
 * Read a definition's `steps` JSON into a validated template list.
 *
 * Refusing a malformed definition at write time is the point: a workflow whose
 * second level names nobody would otherwise sit in a table looking valid and
 * quietly never reach anybody.
 */
export function parseStepTemplates(raw: unknown): WorkflowStepTemplate[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new WorkflowDefinitionError(
      'A workflow needs at least one approval level.',
    );
  }

  return raw.map((entry, index) => {
    const label = `Level ${index + 1}`;
    if (typeof entry !== 'object' || entry === null) {
      throw new WorkflowDefinitionError(`${label} must be an object.`);
    }
    const step = entry as Record<string, unknown>;

    const name = typeof step.name === 'string' ? step.name.trim() : '';
    if (!name) {
      throw new WorkflowDefinitionError(`${label} needs a name.`);
    }

    const approverKind =
      step.approverKind === WorkflowApproverKind.USER
        ? WorkflowApproverKind.USER
        : WorkflowApproverKind.ROLE;
    const approverUserId =
      typeof step.approverUserId === 'string' && step.approverUserId.trim()
        ? step.approverUserId.trim()
        : null;
    const approverRole =
      typeof step.approverRole === 'string' && step.approverRole.trim()
        ? step.approverRole.trim()
        : null;

    // A level must be able to name someone. This is checked at save time rather
    // than discovered when a real refund is waiting on a level addressed to
    // nobody.
    if (approverKind === WorkflowApproverKind.USER && !approverUserId) {
      throw new WorkflowDefinitionError(
        `${label} ("${name}") is assigned to a specific person but no one was chosen.`,
      );
    }
    if (approverKind === WorkflowApproverKind.ROLE && !approverRole) {
      throw new WorkflowDefinitionError(
        `${label} ("${name}") is assigned to a role but no role was chosen.`,
      );
    }

    let condition: WorkflowCondition | null = null;
    if (step.condition !== undefined && step.condition !== null) {
      const rawCondition = step.condition as Record<string, unknown>;
      const field =
        typeof rawCondition.field === 'string' ? rawCondition.field.trim() : '';
      if (!field) {
        throw new WorkflowDefinitionError(
          `${label} ("${name}") has a condition with no field.`,
        );
      }
      const op = rawCondition.op as WorkflowConditionOp;
      if (!WORKFLOW_CONDITION_OPS.includes(op)) {
        throw new WorkflowDefinitionError(
          `${label} ("${name}") uses an unknown condition "${String(op)}". Use one of ${WORKFLOW_CONDITION_OPS.join(', ')}.`,
        );
      }
      condition = { field, op, value: rawCondition.value };
    }

    let escalateAfterHours: number | null = null;
    if (
      step.escalateAfterHours !== undefined &&
      step.escalateAfterHours !== null
    ) {
      const hours = Number(step.escalateAfterHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new WorkflowDefinitionError(
          `${label} ("${name}") must escalate after a positive number of hours.`,
        );
      }
      escalateAfterHours = Math.round(hours);
    }

    const escalateToUserId =
      typeof step.escalateToUserId === 'string' && step.escalateToUserId.trim()
        ? step.escalateToUserId.trim()
        : null;

    return {
      name,
      approverKind,
      approverUserId,
      approverRole,
      condition,
      escalateAfterHours,
      escalateToUserId,
    };
  });
}

/** Read a dotted path out of the request context. */
export function resolveField(context: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = context;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function looseEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return false;
  }
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left) === Number(right);
  }
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return Boolean(left) === Boolean(right);
  }
  return String(left) === String(right);
}

/**
 * Does a level apply to this request?
 *
 * This is how "director sign-off only above 50,000" is expressed without a
 * second workflow: the level's condition is false for a small request, the level
 * is recorded as SKIPPED, and the trail still shows it was considered. A missing
 * field counts as "does not apply" — a condition on an absent field must never
 * quietly let a large request past.
 */
export function conditionApplies(
  condition: WorkflowCondition | null | undefined,
  context: unknown,
): boolean {
  if (!condition) return true;

  const actual = resolveField(context, condition.field);
  const present = actual !== undefined && actual !== null;

  switch (condition.op) {
    case 'exists':
      return present;
    case 'eq':
      return present && looseEquals(actual, condition.value);
    case 'neq':
      return !present || !looseEquals(actual, condition.value);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!present) return false;
      const left = Number(actual);
      const right = Number(condition.value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      if (condition.op === 'gt') return left > right;
      if (condition.op === 'gte') return left >= right;
      if (condition.op === 'lt') return left < right;
      return left <= right;
    }
    case 'in': {
      if (!present || !Array.isArray(condition.value)) return false;
      return condition.value.some((candidate) =>
        looseEquals(actual, candidate),
      );
    }
    case 'contains': {
      if (!present) return false;
      if (Array.isArray(actual)) {
        return actual.some((candidate) =>
          looseEquals(candidate, condition.value),
        );
      }
      return String(actual)
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());
    }
    default:
      return false;
  }
}

/** The decision as stored on an instance's steps. */
export interface StepState {
  stepIndex: number;
  name: string;
  status: WorkflowStepStatus;
  approverKind: WorkflowApproverKind;
  approverUserId?: string | null;
  approverRole?: string | null;
  dueAt?: Date | null;
  escalateToUserId?: string | null;
}

const ACTIONABLE: WorkflowStepStatus[] = [
  WorkflowStepStatus.PENDING,
  WorkflowStepStatus.ACTIVE,
  WorkflowStepStatus.ESCALATED,
];

/** The persisted row shape the rules need, so callers can map either table. */
export interface StepRecord {
  stepIndex: number;
  name: string;
  status: WorkflowStepStatus;
  approverKind: WorkflowApproverKind;
  approverUserId: string | null;
  approverRole: string | null;
  dueAt?: Date | null;
  escalateToUserId?: string | null;
}

export function toStepState(step: StepRecord): StepState {
  return {
    stepIndex: step.stepIndex,
    name: step.name,
    status: step.status,
    approverKind: step.approverKind,
    approverUserId: step.approverUserId,
    approverRole: step.approverRole,
    dueAt: step.dueAt ?? null,
    escalateToUserId: step.escalateToUserId ?? null,
  };
}

export function isActionable(status: WorkflowStepStatus): boolean {
  return ACTIONABLE.includes(status);
}

/** The level a fresh instance is waiting on: the first applicable, undecided one. */
export function firstActionableIndex(steps: StepState[]): number {
  const index = steps.findIndex((step) => isActionable(step.status));
  return index === -1 ? steps.length : index;
}

/**
 * Where an approval goes next, or -1 when it is finished.
 *
 * SKIPPED and already-decided levels are passed over, so the caller never has
 * to think about how many levels a request happened to trip.
 */
export function nextActionableIndex(
  steps: StepState[],
  fromIndex: number,
): number {
  for (let index = fromIndex + 1; index < steps.length; index += 1) {
    if (isActionable(steps[index].status)) return index;
  }
  return -1;
}

/** The level's deadline, from the moment the level became the current one. */
export function deadlineFor(
  template: WorkflowStepTemplate,
  from: Date,
): Date | null {
  if (!template.escalateAfterHours) return null;
  return new Date(from.getTime() + template.escalateAfterHours * 3_600_000);
}

export function isOverdue(step: StepState, now: Date): boolean {
  return isActionable(step.status) && !!step.dueAt && step.dueAt <= now;
}

/** The people a level could be waiting on, as far as the rules can tell. */
export interface ApproverCandidate {
  id: string;
  role?: string | null;
  roleNames?: string[];
}

export function matchesRole(
  value: string | null | undefined,
  role: string,
): boolean {
  return (value ?? '').trim().toLowerCase() === role.trim().toLowerCase();
}

/**
 * Is this person a valid approver for this level?
 *
 * A role level matches either a structured `Role.name` or the legacy `UserRole`
 * enum value, because role names are still not mapped onto that enum (master doc
 * issue 51) — matching on names alone would leave the enum-only users (the ones
 * the older matrix created) invisible to every workflow.
 */
export function isEligibleApprover(
  step: Pick<StepState, 'approverKind' | 'approverUserId' | 'approverRole'>,
  candidate: ApproverCandidate,
): boolean {
  if (step.approverKind === WorkflowApproverKind.USER) {
    return !!step.approverUserId && step.approverUserId === candidate.id;
  }
  if (!step.approverRole) return false;
  return (
    (candidate.roleNames ?? []).some((name) =>
      matchesRole(name, step.approverRole!),
    ) || matchesRole(candidate.role, step.approverRole)
  );
}

export interface ActiveDelegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  /**
   * Who granted it, with their roles. A delegation only carries authority that
   * the person granting it actually held, so the delegator has to be checkable
   * against the level here rather than trusted by the caller.
   */
  fromUser?: ApproverCandidate;
}

export interface CanActResult {
  allowed: boolean;
  reason?: string;
  /** The person whose approval was actually given, when acting for a delegate. */
  onBehalfOfUserId?: string;
  delegationId?: string;
  /** Set when an administrator acted outside the configured approvers. */
  viaOverride?: boolean;
}

/**
 * May this person decide this level right now?
 *
 * Three rules, in the order an auditor would ask about them:
 *
 *   1. Nobody approves their own request. Absolute — not even a super admin,
 *      because the one control that makes two-person approval worth anything is
 *      the absence of a "both roles in one login" path.
 *   2. The configured approver decides, or somebody they have delegated to.
 *   3. An organization/platform administrator may override, and the decision is
 *      recorded as an override rather than quietly blending into the trail.
 */
export function canActOnStep(args: {
  step: StepState;
  requesterId: string | null;
  actor: ApproverCandidate & { isActive?: boolean };
  delegations: ActiveDelegation[];
  isAdministrator?: boolean;
  describeApprover: string;
}): CanActResult {
  const {
    step,
    requesterId,
    actor,
    delegations,
    isAdministrator,
    describeApprover,
  } = args;

  if (!isActionable(step.status)) {
    return {
      allowed: false,
      reason:
        step.status === WorkflowStepStatus.SKIPPED
          ? 'This level did not apply to this request.'
          : 'This level has already been decided.',
    };
  }

  if (actor.isActive === false) {
    return { allowed: false, reason: 'This account is deactivated.' };
  }

  if (requesterId && requesterId === actor.id) {
    return {
      allowed: false,
      reason: 'You cannot approve a request you raised yourself.',
    };
  }

  if (isEligibleApprover(step, actor)) {
    return { allowed: true };
  }

  // A delegation only carries the authority of somebody who had it to give:
  // either the level's named person, or anyone who holds the level's role.
  const delegate = delegations.find(
    (delegation) =>
      delegation.toUserId === actor.id &&
      delegation.fromUserId !== actor.id &&
      (delegation.fromUserId === step.approverUserId ||
        (delegation.fromUser
          ? isEligibleApprover(step, delegation.fromUser)
          : false)),
  );
  if (delegate) {
    return {
      allowed: true,
      onBehalfOfUserId: delegate.fromUserId,
      delegationId: delegate.id,
    };
  }

  if (isAdministrator) {
    return { allowed: true, viaOverride: true };
  }

  return {
    allowed: false,
    reason: `This level is waiting on ${describeApprover}, not you.`,
  };
}

/** Human-readable target of a level, for the refusal message and the inbox. */
export function describeStepApprover(
  step: Pick<StepState, 'approverKind' | 'approverRole' | 'approverUserId'>,
  userName?: string | null,
): string {
  if (step.approverKind === WorkflowApproverKind.USER) {
    return userName ? `${userName} specifically` : 'a named approver';
  }
  return step.approverRole
    ? `anyone holding ${step.approverRole}`
    : 'nobody (unassigned)';
}
