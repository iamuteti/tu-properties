import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
  WorkflowApproverKind,
  WorkflowEventType,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { requireRecord } from '@/common/utils';
import {
  ActiveDelegation,
  ApproverCandidate,
  canActOnStep,
  conditionApplies,
  deadlineFor,
  describeStepApprover,
  firstActionableIndex,
  isActionable,
  isEligibleApprover,
  isOverdue,
  nextActionableIndex,
  parseStepTemplates,
  toStepState,
  WorkflowDefinitionError,
  WorkflowStepTemplate,
} from './workflow-rules';
import { WorkflowHooksRegistry } from './workflow-hooks';
import type {
  CreateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDto,
} from './dto/workflow.dto';

type Tx = Prisma.TransactionClient;

/** Who is acting, resolved once from the request so every check agrees. */
export interface WorkflowActor extends ApproverCandidate {
  organizationId: string | null;
  isActive: boolean;
  isAdministrator: boolean;
}

/** The instance shape the decision paths need; a narrower `select` than detail. */
interface InstanceWithSteps {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  startedById: string | null;
  startedAt?: Date;
  stepInstances: {
    stepIndex: number;
    name: string;
    approverKind: WorkflowApproverKind;
    approverUserId: string | null;
    approverRole: string | null;
    status: WorkflowStepStatus;
  }[];
}

export interface StartWorkflowArgs {
  organizationId: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  /** The caller's payload: what the request is, and what conditions read. */
  context?: Record<string, unknown>;
  startedById?: string | null;
}

const decisionInclude = {
  stepInstances: { orderBy: { stepIndex: 'asc' } },
  events: {
    orderBy: { createdAt: 'asc' },
    include: {
      actorUser: { select: { id: true, firstName: true, lastName: true } },
      onBehalfOfUser: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  startedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  workflowDefinition: { select: { id: true, name: true, entityType: true } },
} as const;

/**
 * Module 18 — Workflow Engine.
 *
 * Multi-step approvals as configuration. The engine deliberately knows nothing
 * about refunds, leases or work orders: it starts a request against a
 * definition, hands it from level to level, records every decision, and calls
 * the owning module's completion hook when the last level agrees.
 *
 * The load-bearing decisions live in `workflow-rules.ts` and are unit-tested
 * there. This class owns persistence, authorization scope, notifications and the
 * audit trail.
 */
@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private hooks: WorkflowHooksRegistry,
  ) {}

  // ================================================================ actor

  /**
   * Resolve the acting user once: their roles, whether they are an administrator
   * (the only override the engine allows), and whether the account is live.
   *
   * Done in one place because a workflow is exactly the kind of feature where
   * two different notions of "is this person allowed to approve" would produce
   * two different answers.
   */
  async actorFrom(request: any): Promise<WorkflowActor> {
    const userId = request?.user?.userId ?? request?.user?.id;
    if (!userId) {
      throw new ForbiddenException('No authenticated user on request');
    }

    const user = await requireRecord(
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          isActive: true,
          organizationId: true,
          roleAssignments: { select: { role: { select: { name: true } } } },
        },
      }),
      'User',
    );

    const roleNames = user.roleAssignments.map(
      (assignment) => assignment.role.name,
    );
    return {
      id: user.id,
      role: user.role,
      roleNames,
      organizationId: user.organizationId,
      isActive: user.isActive,
      isAdministrator:
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.ADMIN ||
        roleNames.some((name) => name.trim().toLowerCase() === 'company admin'),
    };
  }

  // ========================================================== definitions

  /**
   * The policy that applies: this organization's own active definition first,
   * then a platform default. Highest `priority` wins inside each group.
   */
  async resolveDefinition(organizationId: string, entityType: string) {
    const own = await this.prisma.workflowDefinition.findFirst({
      where: { organizationId, entityType, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    if (own) return own;

    return this.prisma.workflowDefinition.findFirst({
      where: { organizationId: null, entityType, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async listDefinitions(organizationId: string, entityType?: string) {
    return this.prisma.workflowDefinition.findMany({
      where: {
        OR: [{ organizationId }, { organizationId: null }],
        ...(entityType ? { entityType } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { priority: 'desc' }],
      include: {
        _count: { select: { instances: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  async createDefinition(
    dto: CreateWorkflowDefinitionDto,
    organizationId: string,
    actor: WorkflowActor,
    request?: any,
  ) {
    const steps = this.parseOrReject(dto.steps);
    await this.assertApproversExist(steps, organizationId);

    const created = await this.prisma.workflowDefinition.create({
      data: {
        organizationId,
        entityType: dto.entityType.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        steps: steps as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
      },
    });

    await this.auditWorkflow(
      'WORKFLOW_DEFINITION_CREATED',
      created.id,
      actor.id,
      {
        entityType: created.entityType,
        name: created.name,
        levels: steps.length,
      },
      organizationId,
      request,
    );

    return created;
  }

  async updateDefinition(
    id: string,
    dto: UpdateWorkflowDefinitionDto,
    organizationId: string,
    actor: WorkflowActor,
    request?: any,
  ) {
    const existing = await this.findDefinition(id, organizationId);
    if (existing.organizationId === null) {
      throw new ForbiddenException(
        'This is a platform default. Copy it into your organization to change it — editing it would change every other tenant.',
      );
    }

    const steps = dto.steps ? this.parseOrReject(dto.steps) : undefined;
    if (steps) await this.assertApproversExist(steps, organizationId);

    const updated = await this.prisma.workflowDefinition.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      },
    });

    await this.auditWorkflow(
      'WORKFLOW_DEFINITION_UPDATED',
      updated.id,
      actor.id,
      {
        entityType: updated.entityType,
        name: updated.name,
        isActive: updated.isActive,
      },
      organizationId,
      request,
    );

    return updated;
  }

  /**
   * Delete is refused while approvals exist under a definition.
   *
   * The foreign key is `SetNull` precisely so an in-flight approval cannot
   * vanish — but that is a safety net, not a licence to delete a policy that a
   * hundred requests were raised under. Deactivating it is the real answer.
   */
  async removeDefinition(
    id: string,
    organizationId: string,
    actor: WorkflowActor,
    request?: any,
  ) {
    const existing = await this.findDefinition(id, organizationId);
    if (existing.organizationId === null) {
      throw new ForbiddenException(
        'A platform default cannot be deleted from an organization.',
      );
    }

    const inFlight = await this.prisma.workflowInstance.count({
      where: { workflowDefinitionId: id, status: 'IN_PROGRESS' },
    });
    const total = await this.prisma.workflowInstance.count({
      where: { workflowDefinitionId: id },
    });
    if (inFlight > 0) {
      throw new ConflictException(
        `${inFlight} approval(s) are still running under this workflow. Deactivate it instead — that stops new requests without stranding the ones in flight.`,
      );
    }

    await this.prisma.workflowDefinition.delete({ where: { id: existing.id } });
    await this.auditWorkflow(
      'WORKFLOW_DEFINITION_DELETED',
      existing.id,
      actor.id,
      {
        entityType: existing.entityType,
        name: existing.name,
        instances: total,
      },
      organizationId,
      request,
    );
    return { deleted: true };
  }

  private async findDefinition(id: string, organizationId: string) {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: {
        id,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    if (!definition) {
      throw new NotFoundException('Workflow definition not found');
    }
    return definition;
  }

  /**
   * A definition addressed to a role that does not exist, or to a person who has
   * left, is a level that can never be decided. Caught at save time rather than
   * the first time a real refund is waiting on it.
   */
  private async assertApproversExist(
    steps: WorkflowStepTemplate[],
    organizationId: string,
  ): Promise<void> {
    const [users, roles] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId,
          id: {
            in: [
              ...steps.map((step) => step.approverUserId),
              ...steps.map((step) => step.escalateToUserId),
            ].filter((id): id is string => !!id),
          },
        },
        select: { id: true },
      }),
      this.prisma.role.findMany({
        where: { OR: [{ organizationId }, { organizationId: null }] },
        select: { name: true },
      }),
    ]);

    const userIds = new Set(users.map((user) => user.id));
    const roleNames = new Set(roles.map((role) => role.name.toLowerCase()));

    for (const [index, step] of steps.entries()) {
      if (
        step.approverKind === WorkflowApproverKind.USER &&
        !userIds.has(step.approverUserId ?? '')
      ) {
        throw new BadRequestException(
          `Level ${index + 1} ("${step.name}") names a person who is not in this organization.`,
        );
      }
      if (
        step.approverKind === WorkflowApproverKind.ROLE &&
        !roleNames.has((step.approverRole ?? '').toLowerCase())
      ) {
        throw new BadRequestException(
          `Level ${index + 1} ("${step.name}") needs the role "${step.approverRole}", which does not exist. Available: ${[...roleNames].join(', ')}.`,
        );
      }
      if (step.escalateToUserId && !userIds.has(step.escalateToUserId)) {
        throw new BadRequestException(
          `Level ${index + 1} ("${step.name}") escalates to somebody who is not in this organization.`,
        );
      }
    }
  }

  /** Who can be picked in the definition editor. */
  async approverOptions(organizationId: string) {
    const [users, roles] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
        orderBy: [{ firstName: 'asc' }],
      }),
      this.prisma.role.findMany({
        where: { OR: [{ organizationId }, { organizationId: null }] },
        select: { id: true, name: true, isSystem: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { users, roles };
  }

  // ============================================================= instances

  /**
   * Start an approval for a request.
   *
   * Called by the module that owns the entity — never by a generic client
   * endpoint, because a caller who could post an arbitrary `context` could
   * fabricate the conditions its own approval depends on.
   */
  async start(args: StartWorkflowArgs) {
    const definition = await this.resolveDefinition(
      args.organizationId,
      args.entityType,
    );
    const context = args.context ?? {};

    if (!definition) {
      return this.runWithoutWorkflow(
        args,
        `No approval workflow is configured for ${args.entityType}, so this was processed directly. Configure one under Settings → Approval workflows to require sign-off.`,
      );
    }

    const templates = this.templatesOf(definition.steps, definition.name);
    const applicable = templates.map((template) =>
      conditionApplies(template.condition, context),
    );
    const firstApplicable = applicable.indexOf(true);

    if (firstApplicable === -1) {
      return this.runWithoutWorkflow(
        args,
        `Every level of "${definition.name}" was conditional and none applied to this request, so it was processed directly.`,
      );
    }

    const now = new Date();
    const instance = await this.prisma.workflowInstance.create({
      data: {
        organizationId: args.organizationId,
        workflowDefinitionId: definition.id,
        entityType: args.entityType,
        entityId: args.entityId,
        entityLabel: args.entityLabel ?? null,
        // Frozen copy: editing the definition later must not rewrite approvals
        // already raised under it.
        steps: templates as unknown as Prisma.InputJsonValue,
        context: context as Prisma.InputJsonValue,
        status: WorkflowInstanceStatus.IN_PROGRESS,
        currentStep: firstApplicable,
        startedById: args.startedById ?? null,
        startedAt: now,
        stepInstances: {
          create: templates.map((template, index) => ({
            stepIndex: index,
            name: template.name,
            approverKind: template.approverKind,
            approverUserId: template.approverUserId ?? null,
            approverRole: template.approverRole ?? null,
            escalateToUserId: template.escalateToUserId ?? null,
            status: !applicable[index]
              ? WorkflowStepStatus.SKIPPED
              : index === firstApplicable
                ? WorkflowStepStatus.ACTIVE
                : WorkflowStepStatus.PENDING,
            // Only the level being waited on has a deadline; the rest get theirs
            // when they become current.
            dueAt:
              index === firstApplicable ? deadlineFor(template, now) : null,
          })),
        },
        events: {
          create: {
            type: WorkflowEventType.STARTED,
            actorUserId: args.startedById ?? null,
            stepIndex: firstApplicable,
          },
        },
      },
      include: decisionInclude,
    });

    await this.auditWorkflow(
      'WORKFLOW_STARTED',
      instance.id,
      args.startedById,
      {
        entityType: instance.entityType,
        entityId: instance.entityId,
        definition: definition.name,
      },
      args.organizationId,
    );

    await this.notifyLevel(instance, 'APPROVAL_REQUESTED');

    return {
      ...instance,
      autoApproved: false,
      note: null as string | null,
    };
  }

  /**
   * No applicable policy: record the request as decided and run its completion
   * hook anyway, so a module can adopt the engine without changing behaviour on
   * day one. The `AUTO_APPROVED` event exists so this is auditable rather than
   * invisible — "approved because nobody set up a policy" is a fact worth
   * having in the trail.
   */
  private async runWithoutWorkflow(args: StartWorkflowArgs, note: string) {
    const now = new Date();

    const instance = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflowInstance.create({
        data: {
          organizationId: args.organizationId,
          entityType: args.entityType,
          entityId: args.entityId,
          entityLabel: args.entityLabel ?? null,
          steps: [] as unknown as Prisma.InputJsonValue,
          context: (args.context ?? {}) as Prisma.InputJsonValue,
          status: WorkflowInstanceStatus.APPROVED,
          currentStep: 0,
          finalComment: note,
          startedById: args.startedById ?? null,
          startedAt: now,
          completedAt: now,
          events: {
            create: {
              type: WorkflowEventType.AUTO_APPROVED,
              actorUserId: args.startedById ?? null,
              comment: note,
            },
          },
        },
      });

      // Same transaction as the approval: an instance can never read APPROVED
      // while the effect it authorised failed to happen. The effect is not
      // returned here — there is nothing waiting on a response from this path,
      // and the refund it created is discoverable through the refund itself.
      await this.runCompletionHook('onApproved', created, now, null, tx);

      return tx.workflowInstance.findUniqueOrThrow({
        where: { id: created.id },
        include: decisionInclude,
      });
    });

    await this.auditWorkflow(
      'WORKFLOW_AUTO_APPROVED',
      instance.id,
      args.startedById,
      { entityType: instance.entityType, entityId: instance.entityId, note },
      args.organizationId,
    );

    return { ...instance, autoApproved: true, note };
  }

  async findInstance(id: string, organizationId?: string) {
    return requireRecord(
      this.prisma.workflowInstance.findFirst({
        where: { id, ...(organizationId ? { organizationId } : {}) },
        include: decisionInclude,
      }),
      'Approval request',
    );
  }

  /** The live approval for a record, if there is one. */
  async findForEntity(
    entityType: string,
    entityId: string,
    organizationId?: string,
  ) {
    return this.prisma.workflowInstance.findFirst({
      where: {
        entityType,
        entityId,
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: decisionInclude,
    });
  }

  async listInstances(
    organizationId: string,
    filters?: {
      status?: string;
      entityType?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 50, 200);
    const where: Prisma.WorkflowInstanceWhereInput = {
      organizationId,
      ...(filters?.status
        ? { status: filters.status as WorkflowInstanceStatus }
        : {}),
      ...(filters?.entityType ? { entityType: filters.entityType } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.workflowInstance.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: decisionInclude,
      }),
      this.prisma.workflowInstance.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Approve or reject the current level.
   *
   * Rejection ends the request at any level — the usual rule, because a request
   * one level up from a refusal has no reason to keep travelling.
   */
  async act(args: {
    instanceId: string;
    organizationId?: string;
    decision: 'APPROVE' | 'REJECT';
    comment?: string;
    actor: WorkflowActor;
    request?: any;
  }) {
    const comment = args.comment?.trim() || null;
    if (args.decision === 'REJECT' && !comment) {
      throw new BadRequestException(
        'A rejection needs a note — it is what the person who asked will read.',
      );
    }

    const instance = await requireRecord(
      this.prisma.workflowInstance.findFirst({
        where: {
          id: args.instanceId,
          ...(args.organizationId
            ? { organizationId: args.organizationId }
            : {}),
        },
        include: decisionInclude,
      }),
      'Approval request',
    );

    if (
      instance.status !== WorkflowInstanceStatus.IN_PROGRESS &&
      instance.status !== WorkflowInstanceStatus.ESCALATED
    ) {
      throw new ConflictException(
        instance.status === WorkflowInstanceStatus.APPROVED
          ? 'This request has already been approved.'
          : instance.status === WorkflowInstanceStatus.REJECTED
            ? 'This request was already rejected.'
            : 'This request was cancelled.',
      );
    }

    const steps = instance.stepInstances.map(toStepState);
    const currentIndex = firstActionableIndex(steps);
    if (currentIndex === -1) {
      throw new ConflictException('This request has no level left to decide.');
    }
    const current = instance.stepInstances[currentIndex];

    // Cross-tenant guard. Role names are global (they are matched against
    // `Role.name`), so without this an accountant in one organization could
    // decide another organization's refund by guessing an instance id.
    if (
      args.actor.organizationId &&
      args.actor.organizationId !== instance.organizationId
    ) {
      throw new ForbiddenException(
        'This approval belongs to another organization.',
      );
    }

    const approverName = current.approverUserId
      ? await this.displayName(this.prisma, current.approverUserId)
      : null;
    const delegations = await this.activeDelegations(
      instance.organizationId,
      args.actor.id,
    );

    const verdict = canActOnStep({
      step: toStepState(current),
      requesterId: instance.startedById,
      actor: args.actor,
      delegations,
      isAdministrator: args.actor.isAdministrator,
      describeApprover: describeStepApprover(current, approverName),
    });
    if (!verdict.allowed) {
      throw new ForbiddenException(
        verdict.reason ?? 'You cannot decide this approval.',
      );
    }

    const now = new Date();
    const templates = this.templatesOf(instance.steps, instance.entityType);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Re-read under the transaction: two approvers pressing the button at once
      // must not both be recorded as deciding the same level.
      const fresh = await tx.workflowStep.findUnique({
        where: { id: current.id },
        select: { status: true },
      });
      if (!fresh || !isActionable(fresh.status)) {
        throw new ConflictException(
          'Somebody decided this level a moment ago. Reload to see where it stands.',
        );
      }

      await tx.workflowStep.update({
        where: { id: current.id },
        data: {
          status:
            args.decision === 'APPROVE'
              ? WorkflowStepStatus.APPROVED
              : WorkflowStepStatus.REJECTED,
          actedById: args.actor.id,
          actedAt: now,
          comment,
          actedViaDelegationId: verdict.delegationId ?? null,
        },
      });

      await tx.workflowEvent.create({
        data: {
          instanceId: instance.id,
          type:
            args.decision === 'APPROVE'
              ? WorkflowEventType.APPROVED
              : WorkflowEventType.REJECTED,
          actorUserId: args.actor.id,
          onBehalfOfUserId: verdict.onBehalfOfUserId ?? null,
          delegationId: verdict.delegationId ?? null,
          stepIndex: current.stepIndex,
          comment: overrideNote(verdict.viaOverride, comment),
        },
      });

      if (args.decision === 'REJECT') {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: {
            status: WorkflowInstanceStatus.REJECTED,
            completedAt: now,
            finalComment: comment,
          },
        });
        const effect = await this.runCompletionHook(
          'onRejected',
          instance,
          now,
          comment,
          tx,
        );
        return { finished: true as const, approved: false as const, effect };
      }

      const nextIndex = nextActionableIndex(steps, currentIndex);
      if (nextIndex === -1) {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: {
            status: WorkflowInstanceStatus.APPROVED,
            completedAt: now,
            finalComment: comment,
          },
        });
        const effect = await this.runCompletionHook(
          'onApproved',
          instance,
          now,
          comment,
          tx,
        );
        return { finished: true as const, approved: true as const, effect };
      }

      const nextStep = instance.stepInstances[nextIndex];
      const nextTemplate = templates[nextIndex];
      await tx.workflowStep.update({
        where: { id: nextStep.id },
        data: {
          status: WorkflowStepStatus.ACTIVE,
          dueAt: nextTemplate ? deadlineFor(nextTemplate, now) : null,
        },
      });
      await tx.workflowInstance.update({
        where: { id: instance.id },
        data: {
          currentStep: nextIndex,
          status: WorkflowInstanceStatus.IN_PROGRESS,
        },
      });

      return {
        finished: false as const,
        approved: false as const,
        effect: undefined,
      };
    });

    await this.auditWorkflow(
      args.decision === 'APPROVE'
        ? 'WORKFLOW_STEP_APPROVED'
        : 'WORKFLOW_REJECTED',
      instance.id,
      args.actor.id,
      {
        stepIndex: current.stepIndex,
        stepName: current.name,
        entityType: instance.entityType,
        entityId: instance.entityId,
        finished: outcome.finished,
        viaOverride: verdict.viaOverride ?? false,
        onBehalfOf: verdict.onBehalfOfUserId ?? null,
      },
      instance.organizationId,
      args.request,
    );

    const updated = await this.findInstance(
      instance.id,
      instance.organizationId,
    );

    if (outcome.finished) {
      await this.notifyRequester(updated, outcome.approved);
    } else {
      await this.notifyLevel(updated, 'APPROVAL_REQUESTED');
    }

    return { ...updated, effect: outcome.effect ?? null };
  }

  /** Withdraw a request while it is still open. */
  async cancel(args: {
    instanceId: string;
    organizationId?: string;
    reason: string;
    actor: WorkflowActor;
    request?: any;
  }) {
    const reason = args.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Cancelling an approval needs a reason.');
    }

    const instance = await requireRecord(
      this.prisma.workflowInstance.findFirst({
        where: {
          id: args.instanceId,
          ...(args.organizationId
            ? { organizationId: args.organizationId }
            : {}),
        },
      }),
      'Approval request',
    );

    if (
      instance.status !== WorkflowInstanceStatus.IN_PROGRESS &&
      instance.status !== WorkflowInstanceStatus.ESCALATED
    ) {
      throw new ConflictException('This request has already been decided.');
    }

    if (instance.startedById !== args.actor.id && !args.actor.isAdministrator) {
      throw new ForbiddenException(
        'Only the person who raised this request can withdraw it.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.workflowInstance.update({
        where: { id: instance.id },
        data: {
          status: WorkflowInstanceStatus.CANCELLED,
          completedAt: now,
          finalComment: reason,
        },
      }),
      this.prisma.workflowEvent.create({
        data: {
          instanceId: instance.id,
          type: WorkflowEventType.CANCELLED,
          actorUserId: args.actor.id,
          comment: reason,
        },
      }),
    ]);

    await this.auditWorkflow(
      'WORKFLOW_CANCELLED',
      instance.id,
      args.actor.id,
      { reason },
      instance.organizationId,
      args.request,
    );

    return this.findInstance(instance.id, instance.organizationId);
  }

  // ================================================================ inbox

  /**
   * Everything waiting on this person, plus what they asked for.
   *
   * One queue for every entity type on purpose: an approver's job is "decide
   * what is waiting on me", and splitting that by module is how approval
   * inboxes end up unmonitored.
   */
  async inbox(actor: WorkflowActor, organizationId: string, now = new Date()) {
    const openSteps = await this.prisma.workflowStep.findMany({
      where: {
        status: {
          in: [
            WorkflowStepStatus.ACTIVE,
            WorkflowStepStatus.PENDING,
            WorkflowStepStatus.ESCALATED,
          ],
        },
        instance: {
          organizationId,
          status: {
            in: [
              WorkflowInstanceStatus.IN_PROGRESS,
              WorkflowInstanceStatus.ESCALATED,
            ],
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 200,
      include: {
        instance: {
          include: {
            startedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    const delegations = await this.activeDelegations(organizationId, actor.id);

    // One query for every name the queue might need, rather than one per row.
    const namedIds = [
      ...new Set(
        openSteps
          .map((step) => step.approverUserId)
          .filter((id): id is string => !!id),
      ),
    ];
    const namedUsers = namedIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: namedIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(
      namedUsers.map((user) => [
        user.id,
        `${user.firstName} ${user.lastName}`.trim(),
      ]),
    );

    const pending = openSteps
      .map((step) => {
        const approverName = step.approverUserId
          ? (names.get(step.approverUserId) ?? null)
          : null;
        const verdict = canActOnStep({
          step: toStepState(step),
          requesterId: step.instance.startedById,
          actor,
          delegations,
          isAdministrator: actor.isAdministrator,
          describeApprover: describeStepApprover(step, approverName),
        });
        if (!verdict.allowed) return null;
        return {
          stepId: step.id,
          instanceId: step.instanceId,
          stepIndex: step.stepIndex,
          stepName: step.name,
          status: step.status,
          dueAt: step.dueAt,
          escalatedAt: step.escalatedAt,
          overdue: isOverdue(toStepState(step), now),
          viaDelegation: !!verdict.onBehalfOfUserId,
          onBehalfOfUserId: verdict.onBehalfOfUserId ?? null,
          viaOverride: verdict.viaOverride ?? false,
          entityType: step.instance.entityType,
          entityId: step.instance.entityId,
          entityLabel: step.instance.entityLabel,
          context: step.instance.context ?? {},
          requestedAt: step.instance.startedAt,
          requestedBy: step.instance.startedBy,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const requestedByMe = await this.prisma.workflowInstance.findMany({
      where: { organizationId, startedById: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: decisionInclude,
    });

    return {
      pending,
      requestedByMe,
      counts: {
        pending: pending.length,
        overdue: pending.filter((item) => item.overdue).length,
        escalated: pending.filter(
          (item) => item.status === WorkflowStepStatus.ESCALATED,
        ).length,
        requested: requestedByMe.filter(
          (instance) =>
            instance.status === WorkflowInstanceStatus.IN_PROGRESS ||
            instance.status === WorkflowInstanceStatus.ESCALATED,
        ).length,
      },
    };
  }

  // =========================================================== delegation

  async createDelegation(args: {
    organizationId: string;
    fromUserId: string;
    toUserId: string;
    startsAt?: string;
    endsAt?: string;
    reason?: string;
  }) {
    if (args.fromUserId === args.toUserId) {
      throw new BadRequestException(
        'You cannot delegate your approvals to yourself.',
      );
    }

    const target = await this.prisma.user.findFirst({
      where: {
        id: args.toUserId,
        organizationId: args.organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!target) {
      throw new BadRequestException(
        'That person is not an active user in this organization.',
      );
    }

    const startsAt = args.startsAt ? new Date(args.startsAt) : new Date();
    const endsAt = args.endsAt ? new Date(args.endsAt) : null;
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('A delegation has to end after it starts.');
    }

    const existing = await this.prisma.workflowDelegation.findFirst({
      where: {
        fromUserId: args.fromUserId,
        toUserId: args.toUserId,
        OR: [{ endsAt: null }, { endsAt: { gte: startsAt } }],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'You have already delegated to that person for this period.',
      );
    }

    return this.prisma.workflowDelegation.create({
      data: {
        organizationId: args.organizationId,
        fromUserId: args.fromUserId,
        toUserId: args.toUserId,
        startsAt,
        endsAt,
        reason: args.reason?.trim() ?? null,
      },
      include: {
        toUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listDelegations(organizationId: string, userId: string) {
    const now = new Date();

    const [givenByMe, givenToMe] = await Promise.all([
      this.prisma.workflowDelegation.findMany({
        where: {
          organizationId,
          fromUserId: userId,
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          toUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.workflowDelegation.findMany({
        where: {
          organizationId,
          toUserId: userId,
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          fromUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return { givenByMe, givenToMe };
  }

  async removeDelegation(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.workflowDelegation.findFirst({
      where: { id, organizationId },
      select: { id: true, fromUserId: true },
    });
    if (!existing) {
      throw new NotFoundException('Delegation not found');
    }
    if (existing.fromUserId !== userId) {
      throw new ForbiddenException(
        'Only the person who granted a delegation can withdraw it.',
      );
    }
    await this.prisma.workflowDelegation.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  /**
   * Delegations that are live *now*.
   *
   * Checked when the decision is taken rather than when the task arrived: a
   * delegation created this morning should cover yesterday's overdue request,
   * and one that expired yesterday should not cover today's.
   */
  private async activeDelegations(
    organizationId: string,
    toUserId: string,
    now = new Date(),
  ): Promise<ActiveDelegation[]> {
    const rows = await this.prisma.workflowDelegation.findMany({
      where: {
        organizationId,
        toUserId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      select: {
        id: true,
        fromUserId: true,
        fromUser: {
          select: {
            id: true,
            role: true,
            roleAssignments: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId,
      fromUser: row.fromUser
        ? {
            id: row.fromUser.id,
            role: row.fromUser.role,
            roleNames: row.fromUser.roleAssignments.map(
              (assignment) => assignment.role.name,
            ),
          }
        : undefined,
    }));
  }

  // ========================================================== escalation

  /**
   * An overdue level whose definition named an escalation target is handed to
   * that person: the level is reassigned (not copied), so the inbox and the
   * authorization check need no special case for escalated work.
   */
  async escalateInstance(
    instanceId: string,
    reason: string,
  ): Promise<{ reassigned: boolean }> {
    const now = new Date();
    const instance = await requireRecord(
      this.prisma.workflowInstance.findUnique({ where: { id: instanceId } }),
      'Approval request',
    );
    if (
      instance.status !== WorkflowInstanceStatus.IN_PROGRESS &&
      instance.status !== WorkflowInstanceStatus.ESCALATED
    ) {
      return { reassigned: false };
    }

    const step = await this.prisma.workflowStep.findUnique({
      where: {
        instanceId_stepIndex: { instanceId, stepIndex: instance.currentStep },
      },
    });
    if (!step || !isOverdue(toStepState(step), now) || step.escalatedAt) {
      return { reassigned: false };
    }

    const target = step.escalateToUserId;
    await this.prisma.$transaction([
      this.prisma.workflowStep.update({
        where: { id: step.id },
        data: target
          ? {
              status: WorkflowStepStatus.ESCALATED,
              escalatedAt: now,
              approverKind: WorkflowApproverKind.USER,
              approverUserId: target,
            }
          : { escalatedAt: now },
      }),
      ...(target
        ? [
            this.prisma.workflowInstance.update({
              where: { id: instanceId },
              data: { status: WorkflowInstanceStatus.ESCALATED },
            }),
          ]
        : []),
      this.prisma.workflowEvent.create({
        data: {
          instanceId,
          type: WorkflowEventType.ESCALATED,
          stepIndex: step.stepIndex,
          comment: reason,
        },
      }),
    ]);

    if (target) {
      const fresh = await this.findInstance(
        instanceId,
        instance.organizationId,
      );
      await this.notifyLevel(fresh, 'APPROVAL_ESCALATED');
    }

    return { reassigned: !!target };
  }

  // ========================================================== notification

  /**
   * Tell the level's approvers that something is waiting.
   *
   * Best-effort by design, as everywhere else in this codebase: an approval
   * nobody was notified about is still a real approval, and refusing the
   * decision because a notification row could not be written would be a worse
   * failure than the missed nudge.
   */
  private async notifyLevel(
    instance: InstanceWithSteps,
    type:
      | typeof NotificationType.APPROVAL_REQUESTED
      | typeof NotificationType.APPROVAL_ESCALATED,
    now = new Date(),
  ): Promise<void> {
    const open: WorkflowStepStatus[] = [
      WorkflowStepStatus.ACTIVE,
      WorkflowStepStatus.ESCALATED,
    ];
    const step = instance.stepInstances.find((candidate) =>
      open.includes(candidate.status),
    );
    if (!step) return;

    try {
      const recipients = await this.approverRecipients(
        instance.organizationId,
        step,
        now,
      );
      const label = instance.entityLabel ?? `${instance.entityType} request`;
      const verb =
        type === NotificationType.APPROVAL_ESCALATED
          ? 'escalated to you'
          : 'is waiting on you';

      for (const userId of recipients) {
        await this.notifications.notify(
          {
            organizationId: instance.organizationId,
            type,
            priority: NotificationPriority.HIGH,
            title: `${label} ${verb}`,
            body: `Level "${step.name}" of this approval needs a decision.`,
            entityType: 'WorkflowInstance',
            entityId: instance.id,
            actionUrl: '/approvals',
            channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
            // Once per level per event, so the sweep cannot re-notify.
            dedupeKey: `workflow:${instance.id}:${step.stepIndex}:${type.toLowerCase()}`,
          },
          { userId },
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not notify approvers of approval ${instance.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async notifyRequester(
    instance: {
      id: string;
      organizationId: string;
      startedById: string | null;
      status: WorkflowInstanceStatus;
      entityLabel: string | null;
    },
    approved: boolean,
  ): Promise<void> {
    if (!instance.startedById) return;
    try {
      await this.notifications.notify(
        {
          organizationId: instance.organizationId,
          type: NotificationType.APPROVAL_DECIDED,
          priority: NotificationPriority.HIGH,
          title: `${instance.entityLabel ?? 'Your request'} was ${approved ? 'approved' : 'rejected'}`,
          body: approved
            ? 'Every required level has signed off.'
            : 'Open the request to read the reason.',
          entityType: 'WorkflowInstance',
          entityId: instance.id,
          actionUrl: '/approvals',
          channels: [NotificationChannel.IN_APP],
          dedupeKey: `workflow:${instance.id}:decided:${approved ? 'approved' : 'rejected'}`,
        },
        { userId: instance.startedById },
      );
    } catch (error) {
      this.logger.warn(
        `Could not notify requester of approval ${instance.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** The live recipients of a level: its approvers plus their current delegates. */
  private async approverRecipients(
    organizationId: string,
    step: {
      approverKind: WorkflowApproverKind;
      approverUserId: string | null;
      approverRole: string | null;
    },
    now: Date,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        role: true,
        roleAssignments: { select: { role: { select: { name: true } } } },
      },
    });

    const approvers = users.filter((user) =>
      isEligibleApprover(step, {
        id: user.id,
        role: user.role,
        roleNames: user.roleAssignments.map(
          (assignment) => assignment.role.name,
        ),
      }),
    );
    if (approvers.length === 0) return [];

    const approverIds = approvers.map((user) => user.id);
    const delegates = await this.prisma.workflowDelegation.findMany({
      where: {
        organizationId,
        fromUserId: { in: approverIds },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      select: { toUserId: true },
    });

    return [
      ...new Set([
        ...approverIds,
        ...delegates
          .map((delegation) => delegation.toUserId)
          .filter((id) => users.some((user) => user.id === id)),
      ]),
    ];
  }

  // ================================================================ helpers

  private parseOrReject(steps: unknown): WorkflowStepTemplate[] {
    try {
      return parseStepTemplates(steps);
    } catch (error) {
      if (error instanceof WorkflowDefinitionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * The frozen template list on a definition or instance.
   *
   * A stored definition that no longer parses is a defect, not a user error —
   * both are validated at write time — so it fails loudly with the definition's
   * name rather than being silently downgraded to "no workflow".
   */
  private templatesOf(raw: unknown, label: string): WorkflowStepTemplate[] {
    try {
      return parseStepTemplates(raw);
    } catch (error) {
      throw new ConflictException(
        `The stored workflow "${label}" is not valid (${
          error instanceof Error ? error.message : error
        }). Repair it under Settings → Approval workflows.`,
      );
    }
  }

  private async runCompletionHook(
    phase: 'onApproved' | 'onRejected',
    instance: {
      id: string;
      organizationId: string;
      entityType: string;
      entityId: string;
      entityLabel: string | null;
      context: unknown;
    },
    decidedAt: Date,
    comment: string | null,
    tx: Tx,
  ): Promise<unknown> {
    const handler = this.hooks.get(instance.entityType);
    if (!handler) return undefined;

    const run = handler[phase];
    if (!run) return undefined;

    const decidedById =
      phase === 'onApproved'
        ? await this.lastApproverId(tx, instance.id)
        : await this.lastActorId(tx, instance.id);
    const decidedByName = decidedById
      ? await this.displayName(tx, decidedById)
      : null;

    return run.call(
      handler,
      {
        instanceId: instance.id,
        organizationId: instance.organizationId,
        entityType: instance.entityType,
        entityId: instance.entityId,
        entityLabel: instance.entityLabel,
        context: (instance.context ?? {}) as Record<string, unknown>,
        decidedById,
        decidedByName,
        decidedAt,
        comment,
      },
      tx,
    );
  }

  /** Who signed off the level that just completed, for the completion handler. */
  private async lastApproverId(
    tx: Tx,
    instanceId: string,
  ): Promise<string | null> {
    const step = await tx.workflowStep.findFirst({
      where: { instanceId, status: WorkflowStepStatus.APPROVED },
      orderBy: { stepIndex: 'desc' },
      select: { actedById: true },
    });
    return step?.actedById ?? null;
  }

  private async lastActorId(
    tx: Tx,
    instanceId: string,
  ): Promise<string | null> {
    const event = await tx.workflowEvent.findFirst({
      where: { instanceId, type: WorkflowEventType.REJECTED },
      orderBy: { createdAt: 'desc' },
      select: { actorUserId: true },
    });
    return event?.actorUserId ?? null;
  }

  private async displayName(
    client: Tx | PrismaService,
    userId: string,
  ): Promise<string | null> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  /** Best-effort audit, like everywhere else in this codebase. */
  private async auditWorkflow(
    action: string,
    instanceId: string,
    actorId: string | null | undefined,
    details: Record<string, unknown>,
    organizationId?: string,
    request?: any,
  ): Promise<void> {
    try {
      await this.audit.logAction({
        action,
        entity: 'WorkflowInstance',
        entityId: instanceId,
        details: JSON.stringify(details),
        ipAddress: request?.ip ?? null,
        userAgent: request?.headers?.['user-agent'] ?? null,
        ...(actorId ? { user: { connect: { id: actorId } } } : {}),
        ...(organizationId
          ? { organization: { connect: { id: organizationId } } }
          : {}),
      });
    } catch {
      // Auditing is best-effort; the decision itself must still succeed.
    }
  }
}

function overrideNote(
  viaOverride: boolean | undefined,
  comment: string | null,
) {
  if (!viaOverride) return comment;
  return `Administrator override${comment ? ` — ${comment}` : ''}`;
}
