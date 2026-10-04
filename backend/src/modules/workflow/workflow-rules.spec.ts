import { WorkflowApproverKind, WorkflowStepStatus } from '@prisma/client';
import {
  ActiveDelegation,
  canActOnStep,
  conditionApplies,
  deadlineFor,
  firstActionableIndex,
  isEligibleApprover,
  isOverdue,
  nextActionableIndex,
  parseStepTemplates,
  resolveField,
  StepState,
  WorkflowDefinitionError,
} from './workflow-rules';

/**
 * The engine's rules, tested without a database.
 *
 * These are the assertions that matter for money leaving the business: a level
 * that names nobody is rejected at save time, a small request skips the director,
 * nobody signs off their own request, a delegation carries authority only from
 * somebody who held it, and an overdue level escalates instead of stalling.
 */

const roleStep = (overrides: Partial<StepState> = {}): StepState => ({
  stepIndex: 0,
  name: 'Finance review',
  status: WorkflowStepStatus.ACTIVE,
  approverKind: WorkflowApproverKind.ROLE,
  approverRole: 'Accountant',
  ...overrides,
});

describe('parseStepTemplates', () => {
  it('accepts a two-level definition', () => {
    const steps = parseStepTemplates([
      {
        name: 'Finance review',
        approverKind: 'ROLE',
        approverRole: 'Accountant',
      },
      {
        name: 'Director sign-off',
        approverKind: 'USER',
        approverUserId: 'user-1',
      },
    ]);

    expect(steps).toHaveLength(2);
    expect(steps[0].approverRole).toBe('Accountant');
    expect(steps[1].approverKind).toBe(WorkflowApproverKind.USER);
    expect(steps[1].escalateAfterHours).toBeNull();
  });

  it('refuses a definition with no levels', () => {
    expect(() => parseStepTemplates([])).toThrow(WorkflowDefinitionError);
    expect(() => parseStepTemplates('approve')).toThrow(
      /at least one approval level/,
    );
  });

  it('refuses a level addressed to nobody', () => {
    expect(() =>
      parseStepTemplates([{ name: 'Manager', approverKind: 'ROLE' }]),
    ).toThrow(/no role was chosen/);
    expect(() =>
      parseStepTemplates([{ name: 'Manager', approverKind: 'USER' }]),
    ).toThrow(/no one was chosen/);
  });

  it('refuses an unnamed level', () => {
    expect(() =>
      parseStepTemplates([
        { approverKind: 'ROLE', approverRole: 'Accountant' },
      ]),
    ).toThrow(/needs a name/);
  });

  it('refuses an unknown condition operator rather than storing it', () => {
    expect(() =>
      parseStepTemplates([
        {
          name: 'Director sign-off',
          approverKind: 'ROLE',
          approverRole: 'Company Admin',
          condition: { field: 'amount', op: 'bigger', value: 100 },
        },
      ]),
    ).toThrow(/unknown condition "bigger"/);
  });

  it('refuses a non-positive escalation window', () => {
    expect(() =>
      parseStepTemplates([
        {
          name: 'Finance review',
          approverKind: 'ROLE',
          approverRole: 'Accountant',
          escalateAfterHours: 0,
        },
      ]),
    ).toThrow(/positive number of hours/);
  });
});

describe('resolveField', () => {
  const context = { amount: 5000, nested: { tenant: { name: 'Rohi' } } };

  it('reads a dotted path', () => {
    expect(resolveField(context, 'nested.tenant.name')).toBe('Rohi');
  });

  it('returns undefined rather than throwing for a missing path', () => {
    expect(resolveField(context, 'nested.missing.name')).toBeUndefined();
    expect(resolveField(context, 'amount.deeper')).toBeUndefined();
    expect(resolveField(context, '')).toBeUndefined();
  });
});

describe('conditionApplies', () => {
  it('treats no condition as always applicable', () => {
    expect(conditionApplies(null, { amount: 1 })).toBe(true);
    expect(conditionApplies(undefined, {})).toBe(true);
  });

  it('compares numbers numerically', () => {
    expect(
      conditionApplies(
        { field: 'amount', op: 'gt', value: 10000 },
        { amount: 50000 },
      ),
    ).toBe(true);
    expect(
      conditionApplies(
        { field: 'amount', op: 'gt', value: 10000 },
        { amount: '500' },
      ),
    ).toBe(false);
    expect(
      conditionApplies(
        { field: 'amount', op: 'lte', value: 10000 },
        { amount: 10000 },
      ),
    ).toBe(true);
  });

  it('never lets a missing field pass a threshold', () => {
    expect(conditionApplies({ field: 'amount', op: 'gte', value: 1 }, {})).toBe(
      false,
    );
  });

  it('supports membership, containment and existence', () => {
    expect(
      conditionApplies(
        { field: 'currency', op: 'in', value: ['KES', 'UGX'] },
        { currency: 'KES' },
      ),
    ).toBe(true);
    expect(
      conditionApplies(
        { field: 'tags', op: 'contains', value: 'urgent' },
        { tags: ['urgent'] },
      ),
    ).toBe(true);
    expect(
      conditionApplies(
        { field: 'note', op: 'contains', value: 'OVERDUE' },
        { note: 'rent overdue' },
      ),
    ).toBe(true);
    expect(
      conditionApplies({ field: 'reason', op: 'exists' }, { reason: 'x' }),
    ).toBe(true);
    expect(conditionApplies({ field: 'reason', op: 'exists' }, {})).toBe(false);
  });

  it('reads a nested field so a condition can key off related records', () => {
    expect(
      conditionApplies(
        { field: 'customer.type', op: 'eq', value: 'LANDLORD' },
        { customer: { type: 'LANDLORD' } },
      ),
    ).toBe(true);
  });
});

describe('step ordering', () => {
  const steps = (statuses: WorkflowStepStatus[]): StepState[] =>
    statuses.map((status, index) => roleStep({ stepIndex: index, status }));

  it('finds the first decidable level', () => {
    expect(
      firstActionableIndex(
        steps([WorkflowStepStatus.APPROVED, WorkflowStepStatus.PENDING]),
      ),
    ).toBe(1);
    expect(firstActionableIndex(steps([WorkflowStepStatus.PENDING]))).toBe(0);
    // Nothing decidable: the caller treats this as finished, hence steps.length.
    expect(firstActionableIndex(steps([WorkflowStepStatus.APPROVED]))).toBe(1);
  });

  it('skips levels that no longer need a decision', () => {
    const list = steps([
      WorkflowStepStatus.APPROVED,
      WorkflowStepStatus.SKIPPED,
      WorkflowStepStatus.PENDING,
    ]);
    expect(nextActionableIndex(list, 0)).toBe(2);
    expect(nextActionableIndex(list, 2)).toBe(-1);
  });
});

describe('deadlines and escalation', () => {
  it('derives a deadline from the escalation window', () => {
    const from = new Date('2026-10-04T09:00:00Z');
    expect(
      deadlineFor(
        {
          name: 'x',
          approverKind: WorkflowApproverKind.ROLE,
          approverRole: 'Accountant',
          escalateAfterHours: 24,
        },
        from,
      ),
    ).toEqual(new Date('2026-10-05T09:00:00Z'));
  });

  it('has no deadline when no window was configured', () => {
    expect(
      deadlineFor(
        {
          name: 'x',
          approverKind: WorkflowApproverKind.ROLE,
          approverRole: 'Accountant',
        },
        new Date(),
      ),
    ).toBeNull();
  });

  it('is overdue only while the level is still open', () => {
    const dueAt = new Date('2026-10-04T09:00:00Z');
    const now = new Date('2026-10-04T10:00:00Z');
    expect(isOverdue(roleStep({ dueAt }), now)).toBe(true);
    expect(
      isOverdue(roleStep({ dueAt, status: WorkflowStepStatus.APPROVED }), now),
    ).toBe(false);
    expect(isOverdue(roleStep({ dueAt: null }), now)).toBe(false);
  });
});

describe('isEligibleApprover', () => {
  const step = roleStep();

  it('matches a structured role name regardless of case', () => {
    expect(
      isEligibleApprover(step, { id: 'u1', roleNames: ['accountant'] }),
    ).toBe(true);
    expect(
      isEligibleApprover(step, { id: 'u1', roleNames: ['Property Manager'] }),
    ).toBe(false);
  });

  it('matches the legacy UserRole enum value too', () => {
    expect(isEligibleApprover(step, { id: 'u1', role: 'ACCOUNTANT' })).toBe(
      true,
    );
  });

  it('matches a person-specific level by id', () => {
    const named = roleStep({
      approverKind: WorkflowApproverKind.USER,
      approverRole: null,
      approverUserId: 'u1',
    });
    expect(isEligibleApprover(named, { id: 'u1' })).toBe(true);
    expect(isEligibleApprover(named, { id: 'u2' })).toBe(false);
  });
});

describe('canActOnStep', () => {
  const delegation: ActiveDelegation = {
    id: 'd1',
    fromUserId: 'accountant-1',
    toUserId: 'deputy-1',
    fromUser: { id: 'accountant-1', roleNames: ['Accountant'] },
  };

  it('lets a configured approver act', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'accountant-1', roleNames: ['Accountant'] },
      delegations: [],
      describeApprover: 'anyone holding Accountant',
    });
    expect(result.allowed).toBe(true);
    expect(result.viaOverride).toBeUndefined();
  });

  it('refuses the person who raised the request, whoever they are', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'accountant-1',
      actor: { id: 'accountant-1', roleNames: ['Accountant'] },
      delegations: [],
      isAdministrator: true,
      describeApprover: 'anyone holding Accountant',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/you raised yourself/);
  });

  it('lets a delegate act for the approver who granted it', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'deputy-1', roleNames: ['Property Manager'] },
      delegations: [delegation],
      describeApprover: 'anyone holding Accountant',
    });
    expect(result).toMatchObject({
      allowed: true,
      onBehalfOfUserId: 'accountant-1',
      delegationId: 'd1',
    });
  });

  it('ignores a delegation from somebody who was never an approver', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'deputy-1' },
      delegations: [
        { id: 'd2', fromUserId: 'someone-else', toUserId: 'deputy-1' },
      ],
      describeApprover: 'anyone holding Accountant',
    });
    expect(result.allowed).toBe(false);
  });

  it('refuses a delegate of a different approver', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'deputy-1' },
      delegations: [
        { id: 'd3', fromUserId: 'other-approver', toUserId: 'deputy-1' },
      ],
      describeApprover: 'anyone holding Accountant',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/waiting on anyone holding Accountant/);
  });

  it('lets an administrator override, and says so', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'admin-1' },
      delegations: [],
      isAdministrator: true,
      describeApprover: 'anyone holding Accountant',
    });
    expect(result).toMatchObject({ allowed: true, viaOverride: true });
  });

  it('refuses a decided or skipped level', () => {
    const decided = canActOnStep({
      step: roleStep({ status: WorkflowStepStatus.APPROVED }),
      requesterId: 'requester-1',
      actor: { id: 'accountant-1', roleNames: ['Accountant'] },
      delegations: [],
      describeApprover: 'anyone holding Accountant',
    });
    expect(decided.reason).toMatch(/already been decided/);

    const skipped = canActOnStep({
      step: roleStep({ status: WorkflowStepStatus.SKIPPED }),
      requesterId: 'requester-1',
      actor: { id: 'accountant-1', roleNames: ['Accountant'] },
      delegations: [],
      describeApprover: 'anyone holding Accountant',
    });
    expect(skipped.reason).toMatch(/did not apply/);
  });

  it('refuses a deactivated account', () => {
    const result = canActOnStep({
      step: roleStep(),
      requesterId: 'requester-1',
      actor: { id: 'accountant-1', roleNames: ['Accountant'], isActive: false },
      delegations: [],
      describeApprover: 'anyone holding Accountant',
    });
    expect(result.allowed).toBe(false);
  });
});
