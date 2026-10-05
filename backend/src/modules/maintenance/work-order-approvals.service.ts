import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { WorkflowsService } from '@/modules/workflow/workflows.service';
import {
  WorkflowCompletionArgs,
  WorkflowHooksRegistry,
} from '@/modules/workflow/workflow-hooks';
import { WorkOrdersService } from './work-orders.service';
import { statusLabel } from './work-order-lifecycle';

type Tx = Prisma.TransactionClient;

export const WORK_ORDER_WORKFLOW_ENTITY = 'WORK_ORDER';

/** What a work order carries between "inspected" and "approved". */
interface WorkOrderApprovalContext {
  workOrderId: string;
  reference: string;
  title: string;
  category: string;
  priority: string;
  estimatedCost: number | null;
  inspectionNote: string | null;
  requestedBy?: string | null;
}

/**
 * Module 18's engine, applied to Module 9's most expensive mistake.
 *
 * The reason a maintenance module needs an approval gate at all is the repair
 * nobody authorised: a contractor called out twice, a part nobody approved, a
 * bill that belongs to the landlord rather than the company. So the work order
 * that passes inspection goes through the organization's configured WORK_ORDER
 * policy before it can be assigned — and because the engine refuses to let the
 * requester approve their own request, the person who authorised the repair is
 * never the person who asked for it.
 *
 * With no policy configured, `WorkflowsService.start` auto-approves and the
 * handler runs immediately, which is exactly how the module behaved before any
 * of this existed: a drop-in gate, not a new one organizations cannot open.
 */
@Injectable()
export class WorkOrderApprovalsService {
  constructor(
    private workOrders: WorkOrdersService,
    private workflows: WorkflowsService,
    hooks: WorkflowHooksRegistry,
  ) {
    hooks.register(WORK_ORDER_WORKFLOW_ENTITY, {
      // Runs inside the decision's transaction, so an approved work order can
      // never be left APPROVED by a rollback — or vice versa.
      onApproved: (args, tx) => this.approve(args, tx),
    });
  }

  /**
   * Ask for sign-off on an inspected work order.
   *
   * Fails fast while the person is still looking at the work order: an
   * impossible request is refused here rather than days later in an approver's
   * inbox.
   */
  async request(id: string, organizationId: string, userId?: string) {
    const workOrder = await this.workOrders.findOne(id, organizationId);

    if (workOrder.status !== WorkOrderStatus.INSPECTION) {
      throw new BadRequestException(
        `Only a work order that has been inspected can go for approval. This one is ${statusLabel(
          workOrder.status,
        ).toLowerCase()}.`,
      );
    }
    if (!workOrder.inspectionNote?.trim()) {
      throw new BadRequestException(
        'Record what the inspection found before sending this for approval — the approver reads the note, not the title.',
      );
    }

    const estimatedCost = workOrder.estimatedCost
      ? Number(workOrder.estimatedCost)
      : null;

    return this.workflows.start({
      organizationId,
      entityType: WORK_ORDER_WORKFLOW_ENTITY,
      entityId: workOrder.id,
      entityLabel: `${workOrder.reference} — ${workOrder.title}`,
      startedById: userId ?? null,
      context: {
        workOrderId: workOrder.id,
        reference: workOrder.reference,
        title: workOrder.title,
        category: workOrder.category,
        priority: workOrder.priority,
        // The conditions an organization writes against `estimatedCost` — the
        // approval policy is where "over this much needs two signatures" lives,
        // so the context carries the figure and nothing decides it here.
        estimatedCost,
        inspectionNote: workOrder.inspectionNote,
        requestedBy: userId ?? null,
      } satisfies WorkOrderApprovalContext,
    });
  }

  /**
   * The live approval for this work order, if there is one.
   *
   * Delegated to the engine rather than re-queried here: it already owns the
   * decision include (steps, events, actors), and a second query for the same
   * trail would be a second thing to keep correct.
   */
  async trail(id: string, organizationId?: string) {
    return this.workflows.findForEntity(
      WORK_ORDER_WORKFLOW_ENTITY,
      id,
      organizationId,
    );
  }

  private async approve(args: WorkflowCompletionArgs, tx: Tx) {
    const context = args.context as unknown as WorkOrderApprovalContext;

    if (!context?.workOrderId) {
      throw new BadRequestException(
        'This approval has no work order attached, so it cannot be carried out.',
      );
    }

    const workOrder = await this.workOrders.markApproved(
      context.workOrderId,
      tx,
      {
        actorId: args.decidedById,
        note: args.comment,
      },
    );

    return {
      workOrderId: workOrder.id,
      reference: workOrder.reference,
      status: workOrder.status,
      estimatedCost: context.estimatedCost,
    };
  }
}
