import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { AccountingModule } from '@/modules/finance/accounting/accounting.module';
import { HrSelfServiceController } from './hr-self-service.controller';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { PayrollRulesController } from './payroll-rules.controller';
import { PayrollRulesService } from './payroll-rules.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';

/**
 * Module 12 — HR & Payroll.
 *
 * **Country-agnostic by construction.** Nothing in this module names a country, a
 * currency or a rate. Every figure that differs between jurisdictions is a row
 * reached through the same resolution path Module 7 uses for `TaxRule` — and the
 * scoring that decides which row applies lives in `common/jurisdiction.ts`, shared
 * with the tax engine rather than copied, because a subtly-wrong score does not
 * throw, it quietly applies the wrong rate.
 *
 * Three imports, and the directions matter:
 *
 * - `WorkflowModule` because a leave request is an approval, and the engine is
 *   where "the requester can never approve their own request" comes from. With no
 *   `LEAVE_REQUEST` policy configured the engine auto-approves, so a small
 *   organization gets a working flow without configuring one.
 * - `AccountingModule` because a payroll must reach the general ledger through
 *   finance's own service. `AccountingService.postEntry` proves the lines balance
 *   and refuses an unbalanced set, so a run that cannot be reconciled to the penny
 *   is stopped at the boundary rather than turning up in the trial balance three
 *   months later. This is the same one-directional dependency Module 10 uses for
 *   its supplier bills, and finance knows nothing about payroll.
 * - `AuditModule` for the standing requirement. In practice the global
 *   `AuditInterceptor` is what writes the trail, since every mutation here is a
 *   tenant-scoped `POST`/`PATCH`/`DELETE` — but a salary being changed is exactly
 *   the kind of action that should be asserted rather than assumed.
 *
 * Exports nothing. No other module needs the payroll, and an exported service is an
 * invitation.
 */
@Module({
  imports: [AuditModule, WorkflowModule, AccountingModule],
  controllers: [
    EmployeesController,
    LeaveController,
    PayrollRulesController,
    PayrollRunsController,
    // Self-service last, so the log reads manager-then-employee.
    HrSelfServiceController,
  ],
  providers: [
    EmployeesService,
    LeaveService,
    PayrollRulesService,
    PayrollRunsService,
  ],
})
export class HrModule {}
