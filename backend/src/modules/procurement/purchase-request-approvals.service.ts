import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PurchaseRequestsService } from './purchase-requests.service';
import { WorkflowsService } from '@/modules/workflow/workflows.service';
import {
  WorkflowCompletionArgs,
  WorkflowHooksRegistry,
} from '@/modules/workflow/workflow-hooks';
import type { Tx } from './tx';

export const PURCHASE_REQUEST_WORKFLOW_ENTITY = 'PURCHASE_REQUEST';

/**
 * What a purchase request carries between "submitted" and "decided".
 *
 * The context is the *whole* of what an approval policy can condition on, which
 * is the point: an organization writes "over 500,000 needs two signatures" and
 * this is where the 500,000 comes from. Nothing here decides anything.
 */
interface PurchaseRequestApprovalContext {
  purchaseRequestId: string;
  reference: string;
  title: string;
  category: string;
  priority: string;
  /** What the requester expects to spend — often null, and a policy must cope
   *  with that: "we need it and we do not know the price" is a real request. */
  estimatedAmount: number | null;
  currency: string;
  department: string | null;
  lineCount: number;
  neededBy: string | null;
  requestedBy?: string | null;
}

/**
 * Module 18's engine, applied to procurement.
 *
 * The reason a purchase needs an approval gate is the purchase nobody
 * authorised — and the reason the *engine* is the right place for it is that it
 * already refuses to let the requester approve their own request. That control is
 * what makes two-person approval worth anything, and reimplementing a
 * single-approver flow here would throw it away.
 *
 * With no PURCHASE_REQUEST policy configured the engine auto-approves and the
 * handler runs immediately, so an installation that has never configured an
 * approval policy still works exactly as before: a drop-in gate, not a new one
 * organizations cannot open.
 */
@Injectable()
export class PurchaseRequestApprovalsService {
  constructor(
    private requests: PurchaseRequestsService,
    private workflows: WorkflowsService,
    hooks: WorkflowHooksRegistry,
  ) {
    hooks.register(PURCHASE_REQUEST_WORKFLOW_ENTITY, {
      // Runs inside the decision's transaction, so an approved request can never
      // be left APPROVED by a rollback — or vice versa.
      onApproved: (args, tx) => this.approve(args, tx),
      // A rejection is recorded rather than merely dropped: the requester has to
      // be able to read why their request failed.
      onRejected: (args, tx) => this.reject(args, tx),
    });
  }

  /**
   * Ask for sign-off on a submitted request.
   *
   * Fails fast while the person is still looking at the request: an impossible
   * request is refused here rather than days later in an approver's inbox.
   */
  async request(id: string, organizationId: string, userId?: string) {
    const request = await this.requests.findOne(id, organizationId);

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a submitted purchase request can go for approval. This one is ${String(
          request.statusLabel,
        ).toLowerCase()}.`,
      );
    }

    if (request.lineCount === 0) {
      throw new BadRequestException(
        'This request has no lines, so there is nothing for an approver to look at.',
      );
    }

    const estimatedAmount =
      request.estimatedAmount != null ? Number(request.estimatedAmount) : null;

    return this.workflows.start({
      organizationId,
      entityType: PURCHASE_REQUEST_WORKFLOW_ENTITY,
      entityId: request.id,
      entityLabel: `${request.reference} — ${request.title}`,
      startedById: userId ?? null,
      context: {
        purchaseRequestId: request.id,
        reference: request.reference,
        title: request.title,
        category: request.category,
        priority: request.priority,
        estimatedAmount,
        currency: request.currency,
        department: request.department,
        lineCount: request.lineCount,
        neededBy: request.neededBy
          ? new Date(request.neededBy).toISOString()
          : null,
        requestedBy: userId ?? null,
      } satisfies PurchaseRequestApprovalContext,
    });
  }

  /**
   * The live approval for this request, if there is one.
   *
   * Delegated to the engine rather than re-queried: it already owns the decision
   * include (steps, events, actors), and a second query for the same trail would
   * be a second thing to keep correct.
   */
  async trail(id: string, organizationId?: string) {
    return this.workflows.findForEntity(
      PURCHASE_REQUEST_WORKFLOW_ENTITY,
      id,
      organizationId,
    );
  }

  private async approve(
    args: WorkflowCompletionArgs,
    tx: Prisma.TransactionClient,
  ) {
    const context = args.context as unknown as PurchaseRequestApprovalContext;

    if (!context?.purchaseRequestId) {
      throw new BadRequestException(
        'This approval has no purchase request attached, so it cannot be carried out.',
      );
    }

    const request = await this.requests.markApproved(
      context.purchaseRequestId,
      tx as unknown as Tx,
      { decidedById: args.decidedById, note: args.comment },
    );

    // Outside the decision's transaction, and best-effort: the state change is
    // the record, and a failed notification must not roll back an approval
    // everybody already agreed to.
    await this.requests.announceOutcome(request.id, request.organizationId);

    return {
      purchaseRequestId: request.id,
      reference: request.reference,
      status: request.status,
      estimatedAmount: context.estimatedAmount,
    };
  }

  private async reject(
    args: WorkflowCompletionArgs,
    tx: Prisma.TransactionClient,
  ) {
    const context = args.context as unknown as PurchaseRequestApprovalContext;

    if (!context?.purchaseRequestId) {
      throw new BadRequestException(
        'This decision has no purchase request attached, so it cannot be carried out.',
      );
    }

    const request = await this.requests.markRejected(
      context.purchaseRequestId,
      tx as unknown as Tx,
      { decidedById: args.decidedById, reason: args.comment },
    );

    // The requester has to be able to read *why*; the rejection reason is the
    // only thing they get.
    await this.requests.announceOutcome(request.id, request.organizationId);

    return {
      purchaseRequestId: request.id,
      reference: request.reference,
      status: request.status,
    };
  }
}
