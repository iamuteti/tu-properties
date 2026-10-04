import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkflowStepStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { isOverdue, toStepState } from './workflow-rules';
import { WorkflowsService } from './workflows.service';

/**
 * Module 18 — Workflow Engine: the escalation sweep.
 *
 * An approval with a deadline is a promise that somebody will be told when it
 * passes one. The sweep is deliberately separate from `WorkflowsService`: it is
 * the one part of the engine that runs on a timer, and keeping it on its own
 * makes it obvious what is scheduled and what is not.
 *
 * Idempotent by construction — a level already carrying `escalatedAt` is
 * skipped — so a restart mid-sweep, or two app instances running the same
 * minute, cannot escalate the same request twice.
 */
@Injectable()
export class WorkflowEscalationService {
  private readonly logger = new Logger(WorkflowEscalationService.name);

  constructor(
    private prisma: PrismaService,
    private workflows: WorkflowsService,
  ) {}

  /**
   * Hourly, off the hour. Escalation is a business-hours concern; an approval
   * that went stale at 02:00 does not need to be chased at 02:00.
   */
  @Cron('0 7 * * * *')
  async sweepOverdueLevels() {
    try {
      const result = await this.runEscalationSweep(new Date());
      if (result.escalated || result.flagged) {
        this.logger.log(
          `Escalation sweep: ${result.escalated} handed up, ${result.flagged} flagged overdue with nowhere to escalate to`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Escalation sweep failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async runEscalationSweep(now = new Date()) {
    const overdue = await this.prisma.workflowStep.findMany({
      where: {
        status: {
          in: [
            WorkflowStepStatus.ACTIVE,
            WorkflowStepStatus.ESCALATED,
            WorkflowStepStatus.PENDING,
          ],
        },
        escalatedAt: null,
        dueAt: { lte: now },
        instance: {
          status: { in: ['IN_PROGRESS', 'ESCALATED'] },
        },
      },
      select: {
        id: true,
        stepIndex: true,
        name: true,
        status: true,
        approverKind: true,
        approverUserId: true,
        approverRole: true,
        dueAt: true,
        escalateToUserId: true,
        instanceId: true,
      },
      orderBy: { dueAt: 'asc' },
      take: 200,
    });

    let escalated = 0;
    let flagged = 0;

    for (const step of overdue) {
      if (!isOverdue(toStepState(step), now)) continue;

      const reason = step.escalateToUserId
        ? `"${step.name}" passed its deadline and was escalated.`
        : `"${step.name}" passed its deadline. No escalation target is configured, so it stays with the current approvers.`;

      const result = await this.workflows.escalateInstance(
        step.instanceId,
        reason,
      );
      if (result.reassigned) escalated += 1;
      else flagged += 1;
    }

    return { escalated, flagged, scanned: overdue.length };
  }
}
