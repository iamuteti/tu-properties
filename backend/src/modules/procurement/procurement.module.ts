import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { PayablesModule } from '@/modules/finance/payables/payables.module';
import { ProcurementSuppliersController } from './suppliers.controller';
import { ProcurementSuppliersService } from './suppliers.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseRequestApprovalsService } from './purchase-request-approvals.service';
import { PurchaseRequestsController } from './purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests.service';
import { RfqsController } from './rfqs.controller';
import { RfqsService } from './rfqs.service';

/**
 * Module 10 — Procurement.
 *
 * Four sub-domains on one pipeline: a department requests something, suppliers
 * quote for it, one quote wins, and the resulting order becomes a supplier bill
 * in Finance. The controllers are mounted under `/procurement/…` rather than
 * `/finance/…` because the thing being described is a purchase, and an account
 * is only one of the three documents involved.
 *
 * Imports:
 * - `WorkflowModule` for the approval gate on a purchase request, for the same
 *   reason refunds and maintenance import it: the engine is the gate's job and
 *   the engine never imports the module it approves.
 * - `PayablesModule` because PO completion creates a real `SupplierBill` through
 *   finance's own service — priced by the tax engine, posted to the ledger. This
 *   is the one direction of dependency, and finance knows nothing about
 *   purchase orders.
 * - `AuditModule` and `NotificationsModule` for the standing requirements:
 *   decisions are audited, approvers are told.
 *
 * Exports `PurchaseRequestsService` and `PurchaseOrdersService` for a future
 * module that raises a purchase from its own records (a maintenance job that has
 * been costed, for instance) — the same additive shape Module 5 gave the
 * maintenance module for tenant requests.
 */
@Module({
  imports: [AuditModule, NotificationsModule, WorkflowModule, PayablesModule],
  controllers: [
    ProcurementSuppliersController,
    PurchaseRequestsController,
    RfqsController,
    PurchaseOrdersController,
  ],
  providers: [
    ProcurementSuppliersService,
    PurchaseRequestsService,
    PurchaseRequestApprovalsService,
    RfqsService,
    PurchaseOrdersService,
  ],
  exports: [PurchaseRequestsService, PurchaseOrdersService, RfqsService],
})
export class ProcurementModule {}
