import { Module } from '@nestjs/common';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RefundApprovalsService } from './refund-approvals.service';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditsModule } from '../credits/credits.module';

/**
 * Refunds route through the workflow engine (Module 18), which is why
 * `WorkflowModule` is imported here. The dependency runs one way: refunds ask
 * the engine to carry a request, the engine never imports refunds.
 */
@Module({
  imports: [AccountingModule, CreditsModule, WorkflowModule],
  controllers: [RefundsController],
  providers: [RefundsService, RefundApprovalsService],
  exports: [RefundsService],
})
export class RefundsModule {}
