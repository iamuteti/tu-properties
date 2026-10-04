import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Module 18 — Workflow Engine: what actually happens when a request is approved.
 *
 * The engine must not know that a refund issues a credit note, or that a lease
 * approval activates an agreement. So a module that wants its requests approved
 * through the engine registers a handler here, keyed by entity type, and the
 * engine calls it when the last level says yes.
 *
 * Handlers run **inside the decision's transaction**. That is deliberate and it
 * is the reason money can safely depend on this: an approval and the effect it
 * authorises either both commit or neither does, so an instance can never sit
 * APPROVED with the refund it approved never having happened.
 *
 * The cost is that a consuming module imports this module (one direction only —
 * the engine never imports its consumers).
 */

export interface WorkflowCompletionArgs {
  instanceId: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  /** The caller's original payload, straight off the instance. */
  context: Record<string, unknown>;
  /** Who approved it (or, on a rejection, who rejected it). */
  decidedById: string | null;
  decidedByName?: string | null;
  decidedAt: Date;
  comment: string | null;
}

export interface WorkflowCompletionHandler {
  /** Run when the final level approves. Required. */
  onApproved(
    args: WorkflowCompletionArgs,
    tx: Prisma.TransactionClient,
  ): Promise<unknown>;
  /** Run when any level rejects. Optional — most modules just want the record. */
  onRejected?(
    args: WorkflowCompletionArgs,
    tx: Prisma.TransactionClient,
  ): Promise<unknown>;
}

@Injectable()
export class WorkflowHooksRegistry {
  private readonly logger = new Logger(WorkflowHooksRegistry.name);
  private readonly handlers = new Map<string, WorkflowCompletionHandler>();

  /**
   * Called from the consuming module's constructor, so it is an ordinary
   * bootstrap concern rather than configuration somebody has to remember to add.
   */
  register(entityType: string, handler: WorkflowCompletionHandler): void {
    if (this.handlers.has(entityType)) {
      this.logger.warn(
        `Replacing the existing completion handler for ${entityType}. Only one module should own an entity type.`,
      );
    }
    this.handlers.set(entityType, handler);
  }

  get(entityType: string): WorkflowCompletionHandler | undefined {
    return this.handlers.get(entityType);
  }

  has(entityType: string): boolean {
    return this.handlers.has(entityType);
  }
}
