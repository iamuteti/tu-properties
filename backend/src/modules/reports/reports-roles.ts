import { UserRole } from '@prisma/client';

/**
 * Module 16 - who may read a report.
 *
 * One file, for the reason `legal-roles.ts` and `utilities-roles.ts` are each one file:
 * two controllers declaring two lists is how "who can see the estate's profit and loss?"
 * stops having an answer.
 *
 * The line here is **money across the whole organization**, and it is narrower than it
 * looks. A report is not a record: there is no single lease to be the owner of, and no
 * sensible way to scope a P&L to one property manager's buildings. So this module draws
 * the boundary at roles that can already see the organization's whole financial
 * position - the same people who reach `/finance/reconciliation` and the trial balance.
 *
 * What that excludes, and why each exclusion is deliberate rather than an oversight:
 *
 * - **`LEASING_OFFICER` holds nothing.** They are the most likely person in the company
 *   to want an occupancy report - it is their job - and they can get occupancy per
 *   property through the property screens they already have. What they cannot get is
 *   the revenue attached to it, because a leasing officer who can see what a unit
 *   earns has a number to negotiate against.
 * - **`MAINTENANCE_MANAGER` and `TECHNICIAN` hold nothing.** Their throughput and cost
 *   figures are on the work-order queue they already use, scoped to their own work.
 *   What they must not have is cost *per property* across an estate they do not manage,
 *   which is a budget conversation.
 * - **`PROCUREMENT_OFFICER` holds nothing**, for the same reason: supplier spend across
 *   the estate is Finance's picture. Their own purchasing figures live in `/procurement`.
 *
 * `SUPER_ADMIN` is on the list because it is on every list in this codebase - it has no
 * `organizationId`, so `getTenantId` returns `undefined` and its reads are deliberately
 * unscoped, which is what a platform administrator is for.
 *
 * One permission module, `reports`, rather than one per report category. A reader who
 * may see the revenue may see the occupancy that produced it; splitting `reports` into
 * `reports.occupancy` and `reports.financial` would create the possibility of a role
 * with the first and not the second, and there is no version of that which is coherent -
 * an occupancy figure with no revenue beside it is not more confidential, it is just
 * less useful.
 */
export const REPORTS_VIEW_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
];
