import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkflowsService } from '@/modules/workflow/workflows.service';
import {
  WorkflowCompletionArgs,
  WorkflowHooksRegistry,
} from '@/modules/workflow/workflow-hooks';
import { round2 } from '../invoice-allocation';
import { RefundsService } from './refunds.service';

type Tx = Prisma.TransactionClient;

export const REFUND_WORKFLOW_ENTITY = 'REFUND';

/** What a refund request carries between "asked for" and "approved". */
interface RefundRequestContext {
  paymentId: string;
  amount: number;
  reason: string;
  refundReference?: string | null;
  toCredit?: boolean | null;
  requestedBy?: string | null;
  currency?: string;
  payer?: string | null;
  invoiceNumber?: string | null;
  refundable?: number;
}

/**
 * Module 18, applied to the one process in this codebase where an approval is
 * worth having: **money going back out**.
 *
 * Before this, `POST /finance/refunds` moved cash, issued a credit note and
 * posted to the ledger in the same call that recorded the request — so the
 * person pressing the button was also the person deciding. Two-person approval
 * is now the default where a policy says so, and the engine's separation-of-
 * duties rule makes it impossible for one login to do both.
 *
 * With no workflow configured for `REFUND`, `WorkflowsService.start`
 * auto-approves and the refund happens immediately, exactly as before — which is
 * why this is a drop-in change rather than a new gate organizations cannot
 * open.
 */
@Injectable()
export class RefundApprovalsService {
  constructor(
    private refunds: RefundsService,
    private workflows: WorkflowsService,
    hooks: WorkflowHooksRegistry,
  ) {
    hooks.register(REFUND_WORKFLOW_ENTITY, {
      onApproved: (args, tx) => this.execute(args, tx),
      // A rejection needs no side effect: the instance and its event trail are
      // the record, and no money ever moved.
    });
  }

  /**
   * Ask for a refund. Returns the approval request — approved immediately when
   * no policy applies, or a pending multi-level request when one does.
   */
  async request(
    dto: {
      paymentId: string;
      amount: number;
      reason: string;
      refundReference?: string;
      toCredit?: boolean;
    },
    tenantId: string,
    userId?: string,
  ) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A refund needs a reason');
    }
    const amount = round2(Number(dto.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    // Fail fast: an impossible request is refused while the person is still
    // looking at the payment, not days later in an approver's face.
    const check = await this.refunds.assertRefundable(
      { paymentId: dto.paymentId, amount },
      tenantId,
    );

    return this.workflows.start({
      organizationId: tenantId,
      entityType: REFUND_WORKFLOW_ENTITY,
      entityId: dto.paymentId,
      entityLabel: check.label,
      startedById: userId ?? null,
      context: {
        paymentId: dto.paymentId,
        amount,
        currency: check.payment.currency,
        reason: dto.reason.trim(),
        refundReference: dto.refundReference ?? null,
        toCredit: dto.toCredit ?? false,
        requestedBy: userId ?? null,
        payer: check.payment.paidFrom ?? check.payment.payee ?? null,
        invoiceNumber: check.payment.invoice?.invoiceNumber ?? null,
        refundable: check.refundable,
      } satisfies RefundRequestContext,
    });
  }

  /**
   * Perform the refund an approved request asked for.
   *
   * Runs inside the approval's transaction, so the decision and the credit
   * note, the ledger entry and the invoice re-derivation either all commit or
   * none do. `processedBy` stays the person who *asked* — the refund record
   * answers "who wanted their money back", and the approval trail answers "who
   * agreed".
   */
  private async execute(args: WorkflowCompletionArgs, tx: Tx) {
    const context = args.context as unknown as RefundRequestContext;
    if (!context?.paymentId || !context?.amount) {
      throw new BadRequestException(
        'This refund request has no payment or amount attached, so it cannot be carried out.',
      );
    }

    const refund = await this.refunds.create(
      {
        paymentId: context.paymentId,
        amount: Number(context.amount),
        reason: context.reason,
        refundReference: context.refundReference ?? undefined,
        toCredit: context.toCredit ?? false,
        processedBy: context.requestedBy ?? args.decidedById ?? undefined,
      },
      args.organizationId,
      tx,
    );

    return {
      refundId: refund.id,
      creditNoteNumber: refund.creditNote?.creditNoteNumber ?? null,
      amount: Number(refund.amount),
      currency: context.currency ?? null,
    };
  }
}
