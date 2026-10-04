import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  WorkflowApproverKind,
  WorkflowEventType,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
} from '@prisma/client';
import { WorkflowActor, WorkflowsService } from './workflows.service';
import { WorkflowHooksRegistry } from './workflow-hooks';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

/**
 * The engine, exercised against a fake Prisma.
 *
 * `workflow-rules.spec.ts` proves the decisions; this proves the decisions are
 * wired to the right rows in the right order — which is where an approval engine
 * fails quietly: a request that reaches APPROVED without reaching anybody, a
 * rejection that leaves the next level open, a conditional level silently
 * dropped rather than recorded as skipped.
 */

interface FakeStep {
  id: string;
  stepIndex: number;
  name: string;
  approverKind: WorkflowApproverKind;
  approverUserId: string | null;
  approverRole: string | null;
  escalateToUserId: string | null;
  status: WorkflowStepStatus;
  dueAt: Date | null;
  escalatedAt: Date | null;
  actedById: string | null;
  actedAt: Date | null;
  comment: string | null;
  actedViaDelegationId: string | null;
}

interface FakeInstance {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  steps: unknown;
  context: unknown;
  status: WorkflowInstanceStatus;
  currentStep: number;
  finalComment: string | null;
  startedById: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  stepInstances: FakeStep[];
  events: { type: WorkflowEventType; stepIndex: number | null }[];
}

const templates = [
  {
    name: 'Finance review',
    approverKind: WorkflowApproverKind.ROLE,
    approverRole: 'Accountant',
    approverUserId: null,
    condition: null,
    escalateAfterHours: 48,
    escalateToUserId: null,
  },
  {
    name: 'Director sign-off',
    approverKind: WorkflowApproverKind.ROLE,
    approverRole: 'Company Admin',
    approverUserId: null,
    // Only a large refund needs the second pair of eyes.
    condition: { field: 'amount', op: 'gt', value: 50000 },
    escalateAfterHours: null,
    escalateToUserId: null,
  },
];

const actor = (overrides: Partial<WorkflowActor> = {}): WorkflowActor => ({
  id: 'accountant-1',
  organizationId: 'org-1',
  role: 'ACCOUNTANT',
  roleNames: ['Accountant'],
  isActive: true,
  isAdministrator: false,
  ...overrides,
});

function step(overrides: Partial<FakeStep> & { stepIndex: number }): FakeStep {
  return {
    id: `step-${overrides.stepIndex}`,
    name: `Level ${overrides.stepIndex + 1}`,
    approverKind: WorkflowApproverKind.ROLE,
    approverUserId: null,
    approverRole: 'Accountant',
    escalateToUserId: null,
    status: WorkflowStepStatus.PENDING,
    dueAt: null,
    escalatedAt: null,
    actedById: null,
    actedAt: null,
    comment: null,
    actedViaDelegationId: null,
    ...overrides,
  };
}

function instanceWith(overrides: Partial<FakeInstance> = {}): FakeInstance {
  return {
    id: 'wf-1',
    organizationId: 'org-1',
    entityType: 'REFUND',
    entityId: 'pay-1',
    entityLabel: 'Refund of KES 60,000 on payment MPESA-1',
    steps: templates,
    context: { amount: 60000 },
    status: WorkflowInstanceStatus.IN_PROGRESS,
    currentStep: 0,
    finalComment: null,
    startedById: 'requester-1',
    startedAt: new Date('2026-10-01T09:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-10-01T09:00:00Z'),
    stepInstances: [
      step({ stepIndex: 0, status: WorkflowStepStatus.ACTIVE }),
      step({ stepIndex: 1, status: WorkflowStepStatus.PENDING }),
    ],
    events: [],
    ...overrides,
  };
}

const isOpen = (candidate: FakeStep) =>
  candidate.status === WorkflowStepStatus.ACTIVE ||
  candidate.status === WorkflowStepStatus.PENDING ||
  candidate.status === WorkflowStepStatus.ESCALATED;

function mockPrisma(seed?: FakeInstance) {
  const current = seed;

  const workflowInstance = {
    findFirst: jest.fn(async () => (current ? { ...current } : null)),
    findUnique: jest.fn(async () => (current ? { ...current } : null)),
    findUniqueOrThrow: jest.fn(async () => (current ? { ...current } : null)),
    findMany: jest.fn(async () => (current ? [{ ...current }] : [])),
    create: jest.fn(async ({ data }: any) => ({
      ...data,
      stepInstances: [],
      events: [],
    })),
    update: jest.fn(async ({ data }: any) => {
      if (current) Object.assign(current, data);
      return current ? { ...current } : null;
    }),
    count: jest.fn().mockResolvedValue(0),
  };
  const workflowStep = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(async () => current?.stepInstances.find(isOpen) ?? null),
    findUnique: jest.fn(async ({ where }: any) => {
      const found = current?.stepInstances.find(
        (candidate) =>
          candidate.id === where.id ||
          candidate.stepIndex === where.instanceId_stepIndex?.stepIndex,
      );
      return found ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const found = current?.stepInstances.find(
        (candidate) => candidate.id === where.id,
      );
      if (found) Object.assign(found, data);
      return found ?? {};
    }),
  };
  const workflowEvent = {
    create: jest.fn(async ({ data }: any) => {
      current?.events.push({
        type: data.type,
        stepIndex: data.stepIndex ?? null,
      });
      return {};
    }),
    findFirst: jest.fn(async () => ({ actorUserId: 'accountant-1' })),
  };
  const workflowDefinition = {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const workflowDelegation = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    delete: jest.fn(),
  };
  const user = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
  };
  const role = { findMany: jest.fn().mockResolvedValue([]) };
  const tx = { workflowInstance, workflowStep, workflowEvent, user };

  return {
    workflowInstance,
    workflowStep,
    workflowEvent,
    workflowDefinition,
    workflowDelegation,
    user,
    role,
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    ),
  };
}

type PrismaMock = ReturnType<typeof mockPrisma>;

async function build(
  prisma: PrismaMock,
  hooks: WorkflowHooksRegistry,
): Promise<WorkflowsService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      WorkflowsService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditService, useValue: { logAction: jest.fn() } },
      {
        provide: NotificationsService,
        useValue: { notify: jest.fn().mockResolvedValue([]) },
      },
      { provide: WorkflowHooksRegistry, useValue: hooks },
    ],
  }).compile();
  return moduleRef.get(WorkflowsService);
}

describe('WorkflowsService', () => {
  let hooks: WorkflowHooksRegistry;
  let approved: jest.Mock;

  beforeEach(() => {
    hooks = new WorkflowHooksRegistry();
    approved = jest.fn().mockResolvedValue({ refundId: 'rfd-1' });
    hooks.register('REFUND', { onApproved: approved });
  });

  describe('start', () => {
    it('materializes every level and opens the first applicable one', async () => {
      const prisma = mockPrisma();
      prisma.workflowDefinition.findFirst.mockResolvedValue({
        id: 'def-1',
        name: 'Refund approval',
        steps: templates,
      });
      const service = await build(prisma, hooks);

      await service.start({
        organizationId: 'org-1',
        entityType: 'REFUND',
        entityId: 'pay-1',
        entityLabel: 'Refund of KES 60,000',
        startedById: 'requester-1',
        context: { amount: 60000 },
      });

      const created = prisma.workflowInstance.create.mock.calls[0][0].data;
      expect(created.currentStep).toBe(0);
      expect(created.stepInstances.create).toHaveLength(2);
      expect(created.stepInstances.create[0].status).toBe(
        WorkflowStepStatus.ACTIVE,
      );
      expect(created.stepInstances.create[1].status).toBe(
        WorkflowStepStatus.PENDING,
      );
      // The frozen copy is what the levels are read from for the life of the
      // request, so editing the definition cannot move it.
      expect(created.steps).toEqual(templates);
      expect(created.workflowDefinitionId).toBe('def-1');
      // Only the level being waited on carries a deadline.
      expect(created.stepInstances.create[0].dueAt).toBeInstanceOf(Date);
      expect(created.stepInstances.create[1].dueAt).toBeNull();
    });

    it('records a skipped level rather than dropping it', async () => {
      const prisma = mockPrisma();
      prisma.workflowDefinition.findFirst.mockResolvedValue({
        id: 'def-1',
        name: 'Refund approval',
        steps: templates,
      });
      const service = await build(prisma, hooks);

      await service.start({
        organizationId: 'org-1',
        entityType: 'REFUND',
        entityId: 'pay-1',
        startedById: 'requester-1',
        context: { amount: 3000 },
      });

      const created = prisma.workflowInstance.create.mock.calls[0][0].data;
      expect(created.stepInstances.create[1].status).toBe(
        WorkflowStepStatus.SKIPPED,
      );
    });

    it('auto-approves and still runs the completion hook with no policy configured', async () => {
      const prisma = mockPrisma(
        instanceWith({ status: WorkflowInstanceStatus.APPROVED }),
      );
      prisma.workflowDefinition.findFirst.mockResolvedValue(null);
      const service = await build(prisma, hooks);

      const result = await service.start({
        organizationId: 'org-1',
        entityType: 'REFUND',
        entityId: 'pay-1',
        startedById: 'requester-1',
        context: { amount: 1000 },
      });

      expect(result.autoApproved).toBe(true);
      expect(approved).toHaveBeenCalledTimes(1);
      const created = prisma.workflowInstance.create.mock.calls[0][0].data;
      expect(created.status).toBe(WorkflowInstanceStatus.APPROVED);
      expect(created.events.create.type).toBe(WorkflowEventType.AUTO_APPROVED);
    });
  });

  describe('act', () => {
    it('advances to the next level without completing the request', async () => {
      const prisma = mockPrisma(instanceWith());
      const service = await build(prisma, hooks);

      await service.act({
        instanceId: 'wf-1',
        organizationId: 'org-1',
        decision: 'APPROVE',
        actor: actor(),
      });

      const instanceUpdate = prisma.workflowInstance.update.mock.calls[0][0];
      expect(instanceUpdate.data.currentStep).toBe(1);
      expect(instanceUpdate.data.status).toBe(
        WorkflowInstanceStatus.IN_PROGRESS,
      );
      expect(prisma.workflowStep.update.mock.calls[0][0].data.status).toBe(
        WorkflowStepStatus.APPROVED,
      );
      // The completion hook must not have run — a level is still to go.
      expect(approved).not.toHaveBeenCalled();
    });

    it('completes and runs the completion hook on the last level', async () => {
      const prisma = mockPrisma(
        instanceWith({
          currentStep: 1,
          stepInstances: [
            step({ stepIndex: 0, status: WorkflowStepStatus.APPROVED }),
            step({
              stepIndex: 1,
              status: WorkflowStepStatus.ACTIVE,
              approverRole: 'Company Admin',
            }),
          ],
        }),
      );
      const service = await build(prisma, hooks);

      await service.act({
        instanceId: 'wf-1',
        organizationId: 'org-1',
        decision: 'APPROVE',
        actor: actor({ role: 'ADMIN', roleNames: ['Company Admin'] }),
      });

      const instanceUpdate = prisma.workflowInstance.update.mock.calls[0][0];
      expect(instanceUpdate.data.status).toBe(WorkflowInstanceStatus.APPROVED);
      expect(instanceUpdate.data.completedAt).toBeInstanceOf(Date);
      expect(approved).toHaveBeenCalledTimes(1);
    });

    it('ends the request at any level when it is rejected', async () => {
      const prisma = mockPrisma(instanceWith());
      const service = await build(prisma, hooks);

      await service.act({
        instanceId: 'wf-1',
        organizationId: 'org-1',
        decision: 'REJECT',
        comment: 'The tenant already received this back as credit.',
        actor: actor(),
      });

      expect(prisma.workflowInstance.update.mock.calls[0][0].data.status).toBe(
        WorkflowInstanceStatus.REJECTED,
      );
      expect(approved).not.toHaveBeenCalled();
    });

    it('refuses a rejection with no note', async () => {
      const prisma = mockPrisma(instanceWith());
      const service = await build(prisma, hooks);

      await expect(
        service.act({
          instanceId: 'wf-1',
          organizationId: 'org-1',
          decision: 'REJECT',
          actor: actor(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses the person who raised the request', async () => {
      const prisma = mockPrisma(instanceWith({ startedById: 'accountant-1' }));
      const service = await build(prisma, hooks);

      await expect(
        service.act({
          instanceId: 'wf-1',
          organizationId: 'org-1',
          decision: 'APPROVE',
          actor: actor({ id: 'accountant-1' }),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an approver from another organization', async () => {
      const prisma = mockPrisma(instanceWith());
      const service = await build(prisma, hooks);

      await expect(
        service.act({
          instanceId: 'wf-1',
          organizationId: 'org-1',
          decision: 'APPROVE',
          actor: actor({ organizationId: 'org-2' }),
        }),
      ).rejects.toThrow(/another organization/);
    });

    it('refuses a request that has already been decided', async () => {
      const prisma = mockPrisma(
        instanceWith({ status: WorkflowInstanceStatus.APPROVED }),
      );
      const service = await build(prisma, hooks);

      await expect(
        service.act({
          instanceId: 'wf-1',
          organizationId: 'org-1',
          decision: 'APPROVE',
          actor: actor(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('escalateInstance', () => {
    it('reassigns an overdue level to its escalation target', async () => {
      const prisma = mockPrisma(
        instanceWith({
          stepInstances: [
            step({
              stepIndex: 0,
              status: WorkflowStepStatus.ACTIVE,
              dueAt: new Date(Date.now() - 60_000),
              escalateToUserId: 'director-1',
            }),
            step({ stepIndex: 1, status: WorkflowStepStatus.PENDING }),
          ],
        }),
      );
      const service = await build(prisma, hooks);

      const result = await service.escalateInstance('wf-1', 'overdue');

      expect(result.reassigned).toBe(true);
      const stepUpdate = prisma.workflowStep.update.mock.calls[0][0].data;
      expect(stepUpdate.status).toBe(WorkflowStepStatus.ESCALATED);
      expect(stepUpdate.approverUserId).toBe('director-1');
      expect(prisma.workflowInstance.update.mock.calls[0][0].data.status).toBe(
        WorkflowInstanceStatus.ESCALATED,
      );
    });

    it('leaves an already-escalated level alone', async () => {
      const prisma = mockPrisma(
        instanceWith({
          status: WorkflowInstanceStatus.ESCALATED,
          stepInstances: [
            step({
              stepIndex: 0,
              status: WorkflowStepStatus.ESCALATED,
              dueAt: new Date(Date.now() - 60_000),
              escalatedAt: new Date(),
            }),
          ],
        }),
      );
      const service = await build(prisma, hooks);

      const result = await service.escalateInstance('wf-1', 'overdue');

      expect(result.reassigned).toBe(false);
      expect(prisma.workflowStep.update).not.toHaveBeenCalled();
    });
  });
});
