import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Module 1: Core Platform — structured RBAC.
 *
 * Seeds the 12 standard system roles (organizationId = null, available to
 * every organization) with their permission JSON. Idempotent: existing rows
 * are matched by (name, organizationId = null) and their permissions updated
 * so re-seeding after a matrix change takes effect.
 *
 * Permission document shape (also documented in schema.prisma on `Role`):
 *   { "all": boolean?, "modules": { "<module>": { "view"|"create"|"update"|"delete": boolean } } }
 */

export const PERMISSION_MODULES = [
  'properties',
  'units',
  'landlords',
  'tenants',
  'leases',
  'moveouts',
  'invoices',
  'payments',
  'receipts',
  'users',
  'audit',
  'settings',
  'organizations',
  'branches',
  'documents',
  'crm_leads',
  'crm_contacts',
  'sales',
  'leases',
  'tenant_requests',
  'owner_statements',
  'owner_payouts',
  'accounting',
  'credits',
  'refunds',
  'tax',
  'payables',
  'billing',
  'notifications',
  'workflows',
  // Module 9 — Maintenance. Three modules, because three different jobs: the
  // queue, the plant register and the service calendar.
  'work_orders',
  'assets',
  'pm_schedules',
  // Module 10 — Procurement. Three modules because three documents and three
  // decisions: who asks, who we buy from, and what gets committed. `suppliers`
  // is separate from `payables` on purpose — the buyer curates the vendor list,
  // the accountant owns what is owed to them.
  'purchase_requests',
  'suppliers',
  'rfqs',
  'purchase_orders',
  // Module 11 — Inventory. Three modules because three different questions: what
  // do we stock, where is it kept, and what has moved. `warehouses` is separate
  // from `inventory_items` on purpose — a technician needs to know a store
  // exists, and only somebody who runs the store renames it.
  'inventory_items',
  'warehouses',
  'stock_movements',
  // Module 12 — HR & Payroll. Seven modules rather than two, and the split is the
  // security design of the module rather than tidiness:
  //   `employees.view`          the staff directory, no money. Nearly every role.
  //   `employees.compensation`  salaries, bank details, national IDs. Three roles.
  //   `leave_requests.view`     who is off, and a balance.
  //   `leave_requests.create`   file your own — granted to employees, grants nothing.
  //   `leave_requests.approve`  sign off somebody else's time.
  //   `payroll.view`            see payslips. `.manage` builds and posts a run.
  //   `.approve` signs off the figures, `.pay` releases the money — two different
  //   acts by two different people in a company that runs payroll properly.
  'employees',
  'leave_requests',
  'leave_policies',
  'holidays',
  'payroll',
  // Module 13 — Facilities. Five modules rather than one, because a clubhouse
  // diary and a gate log are not the same subject and should never share a
  // permission:
  //   `facilities.view`/`create`/`update`/`delete`  the register and the diary
  //   `facility_bookings.view`/`.create`/`.decide`  the slots. `.decide` is
  //     separate from `.update` for the same reason `payroll.approve` is: whoever
  //     books on a resident's behalf must not be the person who signs it off, and
  //     the row-level "nobody approves their own booking" rule cannot help when
  //     the two are the same account.
  //   `facility_blackouts.update`  closing a facility, which is a maintenance act.
  //   `visitors.view`/`.create`/`.update`  the gate log. Restricted to the roles
  //     whose job is being at the gate — see `FACILITIES_DOOR_ROLES`.
  //   `access_cards.view`/`.create`/`.update`  who can get in. The most sensitive
  //     grant in this file.
  'facilities',
  'facility_bookings',
  'facility_blackouts',
  'visitors',
  'access_cards',
  // Module 14 - Utilities. Four modules rather than one, because a meter register,
  // a reading taken off a meter, a tariff and a bill are four different kinds of
  // fact with four different consequences, and lumping them into `utilities.full`
  // is how a role ends up able to invent a consumption figure and bill it:
  //   `utility_meters.view`/`.create`/`.update`/`.delete`  the register. `update`
  //     covers retiring a meter, which is why `status` is not in the DTO.
  //   `meter_readings.view`/`.create`/`.update`/`.delete`  the readings. Held by
  //     the roles whose job is physically at the meter, and **not** by ACCOUNTANT -
  //     a finance user who can type a reading can write an arbitrary cheque.
  //   `utility_rates.view`/`.create`/`.update`  the tariffs. `update` is
  //     superseding: a rate is never edited in place, a window is closed and a new
  //     one opened, so an old bill still explains itself.
  //   `utility_charges.view`/`.create`/`.bill`/`.void`  the charges. `.bill` is the
  //     money action (consumption becomes an invoice) and is separate from
  //     `.update` for the same reason `.approve` and `.decide` are: the person who
  //     prepares a bill should not be the only person who can reverse it. `.void`
  //     is narrower again - see `utilities-roles.ts`.
  'utility_meters',
  'meter_readings',
  'utility_rates',
  'utility_charges',
  // Module 15 - Documents & Legal. One module, and deliberately not two: the
  // Document Center predates this module and already has its own `documents`
  // permission, so a second module here would split one user's access to one
  // concept across two rows of the matrix to answer no question.
  //   `contracts.view`/`.create`/`.update`/`.delete`/`.renew`  the register.
  // `create` and `update` are ordinary, but `.renew` is separate because a renewal
  // is a new contract that supersedes an old one, and the same argument separates
  // `payroll.approve` from `payroll.pay`: the person who decided not to renew should
  // not be the only person able to quietly extend the term. Deleting is included and
  // means "this row was entered in error" - a real lapse is recorded by letting the
  // contract expire, not by removing the evidence that it ever existed.
  'contracts',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export interface ModulePermissions {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
  /**
   * Module 12. Four CRUD actions do not cover a payroll, which is approved by one
   * person and released by another — and the whole reason those two are separate
   * is that collapsing them is how a payroll gets approved by whoever built it.
   *
   * Optional and absent-means-denied, deliberately: adding these two keys does not
   * grant them to any role that does not already name them, so the other eleven
   * modules keep exactly the four actions they had.
   */
  approve?: boolean;
  /** Release the money. Always narrower than `approve`. */
  pay?: boolean;
  /**
   * Module 12. **My own record only.**
   *
   * A separate action rather than a narrower reading of `view`, because "view"
   * means "the tenant's" everywhere else in this product and an employee holding
   * it would be handed every payslip in the company. This is the one action that
   * is resolved against the caller's own `User.employeeId` by the service rather
   * than against a parameter, which is the whole point: there is no request shape
   * in which an employee can name somebody else.
   */
  self?: boolean;
  /**
   * Module 13. Approve, decline and cancel a booking.
   *
   * Separate from `update` for the same reason `approve` is separate from the
   * payroll's CRUD actions: a leasing officer books the clubhouse to show a
   * prospect, and must not be the person who then authorises it. Splitting the
   * permission keeps the account that *writes* a request out of the account that
   * *grants* it, which the per-row "nobody approves their own booking" rule alone
   * cannot do when both are the same login.
   */
  decide?: boolean;
  /**
   * Module 14. Turn a period's consumption into an invoice.
   *
   * Separate from `create` and from `update` because it is the only action in this
   * product that creates a **document a resident is expected to pay**, out of a
   * measurement somebody else took. A role that can record a reading should not
   * thereby gain the power to price it, and `TECHNICIAN` is exactly that case: they
   * may report that the meter read 4,212, and may not decide what that costs.
   *
   * Absent-means-denied, like `approve`/`pay`/`decide` - adding this key does not
   * grant it to any role that does not already name it.
   */
  bill?: boolean;
  /**
   * Module 14. Reverse or write off a charge.
   *
   * Narrower than `bill` on purpose, and narrower than it is useful to be in a small
   * estate: raising a bill is routine, reversing one is a decision about money
   * somebody has already been asked for, so it takes the same authority as changing
   * the tariff that produced it.
   */
  void?: boolean;
  /**
   * Module 15. Replace an expiring contract with a new term.
   *
   * Separate from `create` because a renewal is not a new contract in the ordinary
   * sense: it inherits the counterparty, the type and the signed document of the
   * contract it replaces, it lands with the predecessor's `renewalOfId` set so the
   * register can answer "what happened to this one?", and it changes what a tenant is
   * committed to paying for another year. Anyone who can file a contract can file the
   * first one; extending somebody's obligation is a different decision.
   *
   * Absent-means-denied, like `approve`/`pay`/`decide`/`bill`/`void`.
   */
  renew?: boolean;
}

export interface PermissionSet {
  all?: boolean;
  modules: Record<string, ModulePermissions>;
}

const full = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
  delete: true,
});

const view = (): ModulePermissions => ({ view: true });
const viewWrite = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
});

/**
 * Module 12's payroll, which needs the two actions `full()` deliberately omits.
 *
 * Not a generalisation of `full()`: giving every module `approve` and `pay` would
 * hand those actions to eleven modules that have no such step, and a permission
 * nobody has thought about is a permission nobody reviews.
 */
const payrollFull = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
  delete: true,
  approve: true,
  pay: true,
});

/**
 * Module 13's bookings, which need `.decide` on top of the four CRUD actions.
 *
 * Same reasoning as `payrollFull`, and the same refusal to generalise: giving every
 * module a `decide` key would hand an action that means nothing to seventeen
 * modules, and a permission nobody has thought about is a permission nobody
 * reviews. `.update` stays granted to whoever may edit a booking's descriptive
 * fields, while `.decide` is what actually moves it between states.
 */
const facilityBookingFull = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
  delete: true,
  decide: true,
});

/**
 * Module 14's charges, which need `.bill` and `.void` on top of the CRUD actions.
 *
 * `full()` deliberately does not include them, and this is not a generalisation of
 * it: `.bill` is the action that creates a payable document, and `.void` is the one
 * that takes one back. Both are granted here explicitly so that a role's ability to
 * move money has to be written down on that role rather than inherited from a helper
 * nobody reads.
 */
const utilityChargeFull = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
  delete: true,
  bill: true,
  void: true,
});

/**
 * Module 15's contracts, which need `.renew` on top of the CRUD actions.
 *
 * Same reasoning as `utilityChargeFull`: `full()` deliberately omits it, and
 * generalising it would hand "extend this tenant's term" to every module that has a
 * `create` action. A renewal is a new obligation, so the power to create one has to be
 * written down on the role that has it rather than inherited from a helper nobody
 * reads.
 */
const contractFull = (): ModulePermissions => ({
  view: true,
  create: true,
  update: true,
  delete: true,
  renew: true,
});

function set(
  modules: Record<string, ModulePermissions>,
  all = false,
): PermissionSet {
  return { all, modules };
}

/**
 * The 12 standard roles. Mirrors the legacy name-based matrix that was in
 * place after Module 0 (properties/units/landlords/tenants/leases/moveouts
 * writes = SUPER_ADMIN/ADMIN/PROPERTY_MANAGER; finance = SUPER_ADMIN/ADMIN/
 * ACCOUNTANT; users + audit = ADMIN/SUPER_ADMIN; orgs = SUPER_ADMIN) while
 * adding the seven operational roles that the docs call for.
 */
export const SYSTEM_ROLES: {
  name: string;
  description: string;
  permissions: PermissionSet;
}[] = [
  {
    name: 'Super Admin',
    description:
      'Platform-level access across all organizations (SaaS administration).',
    permissions: set({}, true),
  },
  {
    name: 'Company Admin',
    description:
      'Full access within the organization, including users, audit, settings and branches.',
    permissions: set({
      properties: full(),
      units: full(),
      landlords: full(),
      tenants: full(),
      leases: full(),
      moveouts: full(),
      invoices: full(),
      payments: full(),
      receipts: full(),
      users: full(),
      audit: view(),
      settings: { view: true, update: true },
      branches: full(),
      documents: full(),
      crm_leads: full(),
      crm_contacts: full(),
      sales: full(),
      tenant_requests: full(),
      // Module 6: owner statements and payouts.
      owner_statements: full(),
      owner_payouts: full(),
      // Module 7: the general ledger is finance work too.
      accounting: full(),
      credits: full(),
      refunds: full(),
      tax: full(),
      payables: full(),
      billing: full(),
      // Reading their own notifications needs no permission beyond signing in;
      // running the reminder sweep does.
      notifications: full(),
      // Module 18: deciding what is waiting on them, plus the administrator's
      // separate power to rewrite the approval policy itself.
      workflows: full(),
      // Module 9: maintenance is day-to-day company work, not an add-on.
      work_orders: full(),
      assets: full(),
      pm_schedules: full(),
      // Module 10: procurement is company work too, and the administrator is
      // who signs the big ones when no policy has been configured.
      purchase_requests: full(),
      suppliers: full(),
      rfqs: full(),
      purchase_orders: full(),
      // Module 11: running the store is company work, so the administrator has
      // the whole of it.
      inventory_items: full(),
      warehouses: full(),
      stock_movements: full(),
      // Module 12. Full HR: this role may have to fix a misconfigured
      // statutory rule without waiting for an accountant. Salary visibility
      // follows ADMIN throughout this product.
      employees: full(),
      leave_requests: full(),
      leave_policies: full(),
      holidays: full(),
      payroll: payrollFull(),
      // Module 13: full facilities, including the gate. An administrator who
      // cannot revoke a resident's card would have to ask somebody else to do the
      // job they are accountable for, which is how the card outlives the tenancy.
      facilities: full(),
      facility_bookings: facilityBookingFull(),
      facility_blackouts: full(),
      visitors: full(),
      access_cards: full(),
      // Module 14: full utilities. An administrator accountable for the whole
      // organization is the role that must be able to correct a tariff and reverse
      // a bill, since both are decisions above any single operator.
      utility_meters: full(),
      meter_readings: full(),
      utility_rates: full(),
      utility_charges: utilityChargeFull(),
      // Module 15: everything on the contract register, including `.renew` and
      // `.delete`. An administrator accountable for the whole organization is the
      // role that has to be able to correct a contract someone else filed in error,
      // and to serve notice on the last day it can be served.
      contracts: contractFull(),
    }),
  },
  {
    name: 'Property Manager',
    description:
      'Day-to-day property operations: properties, units, landlords, tenants, leases, move-outs.',
    permissions: set({
      properties: full(),
      units: full(),
      landlords: full(),
      tenants: full(),
      moveouts: full(),
      documents: viewWrite(),
      // Module 3 CRM: the pipeline is part of day-to-day property work.
      crm_leads: full(),
      crm_contacts: full(),
      // Module 4: a property manager can run a sale to handover.
      sales: full(),
      // Module 5: leases, renewals and move-outs are daily property work.
      leases: full(),
      // Resident requests raised from the tenant portal.
      tenant_requests: full(),
      // Module 18: refund and purchase approvals arrive at a property manager,
      // but the *policy* stays with an administrator.
      workflows: viewWrite(),
      // Module 9: repairs happen in their buildings, so they run the queue — but
      // the plant register and the service calendar belong to whoever maintains
      // it, not to every property manager.
      work_orders: full(),
      assets: view(),
      pm_schedules: view(),
      // Module 10: a property manager raises the requests ("we need six lift
      // ropes") and approves small ones, but running the supplier side — the
      // vendor list and the purchase orders — is the procurement officer's job.
      purchase_requests: full(),
      suppliers: view(),
      rfqs: view(),
      purchase_orders: view(),
      // Module 11: they know what a building needs and where the spare is, so
      // they can move stock and read the shelf — but the item master and the
      // store list belong to whoever runs the store.
      inventory_items: view(),
      warehouses: view(),
      stock_movements: viewWrite(),
      // Module 12: they know who works on which building, so the directory
      // and leave approval. NOT compensation and NOT payroll — a property
      // manager reading a cleaner's salary is the leak this split prevents.
      employees: view(),
      leave_requests: viewWrite(),
      leave_policies: view(),
      holidays: view(),
      // Module 13: a property manager runs the buildings, so they own the clubhouse
      // diary and the gate. They book *and* decide, which is safe here because the
      // booking lifecycle still refuses to let one person approve a booking they
      // raised themselves — the row-level rule, not the permission, is what stops
      // that.
      facilities: full(),
      facility_bookings: facilityBookingFull(),
      facility_blackouts: full(),
      visitors: full(),
      access_cards: full(),
      // Module 14: the property manager owns all of it, and this is the role that
      // shows why the `UTILITIES_BILL_ROLES` list includes them - most estates this
      // is sold to have one person doing the billing. Note they get
      // `utility_rates` too: the tariff is a commercial decision about what the
      // estate charges residents, and that is a landlord conversation, not a
      // bookkeeping one.
      utility_meters: full(),
      meter_readings: full(),
      utility_rates: full(),
      utility_charges: utilityChargeFull(),
      // Module 15: the full register, and the role that most needs it - a property
      // manager is who serves notice, decides not to renew, and answers the landlord
      // what the notice period is. `.renew` included because extending the estate's
      // terms is their decision and nobody else's.
      contracts: contractFull(),
    }),
  },
  {
    name: 'Leasing Officer',
    description:
      'Leasing operations: tenants, leases, move-outs, unit availability.',
    permissions: set({
      tenants: viewWrite(),
      units: view(),
      leases: viewWrite(),
      moveouts: viewWrite(),
      documents: viewWrite(),
      // Enquiries and viewings are how a leasing officer's day starts.
      crm_leads: full(),
      crm_contacts: full(),
      // A leasing officer may register a sale but not run commissions.
      sales: viewWrite(),
      // Resident requests are exactly their job: read the queue, decide.
      tenant_requests: full(),
      // Module 6: owners are their clients — statements get run and paid out.
      owner_statements: full(),
      owner_payouts: full(),
      // Module 7: they can read the ledger (e.g. commission basis) but must
      // not post or reverse entries.
      accounting: view(),
      credits: view(),
      refunds: view(),
      tax: view(),
      payables: view(),
      billing: view(),
      notifications: view(),
      // Module 18: they can be an approver on a policy, not the author of it.
      workflows: view(),
      // Module 9: a leasing officer gets told about a broken door, not the asset
      // register behind it.
      work_orders: view(),
      // Module 11: a leasing officer runs a vacancy, not a store. They can see
      // what stock exists because a tenant asks "is there another bucket?", and
      // that is the end of it.
      inventory_items: view(),
      warehouses: view(),
      // Module 12: a leasing officer files their own leave and sees who works
      // here. Not approval, and not compensation.
      employees: view(),
      leave_requests: viewWrite(),
      holidays: view(),
      // Module 13: a leasing officer shows prospects around, so they may book — and
      // may *not* decide, because the person who promised a prospect the clubhouse
      // must not be the person who authorises it. That separation is the whole
      // reason `facility_bookings.decide` is its own key. No visitor log and no
      // access cards: neither is theirs to read.
      facilities: view(),
      facility_bookings: { view: true, create: true },
      facility_blackouts: view(),
      // Module 14: read-only, and deliberately nothing more. A leasing officer
      // asking a resident "how much water did you use last month" is a fair
      // question — it comes up in every renewal conversation. A leasing officer who
      // can *bill* is a leasing officer who can bill a prospect to win the lease, so
      // no reading, no rate and no charge beyond reading them.
      utility_meters: view(),
      meter_readings: view(),
      utility_rates: view(),
      utility_charges: view(),
      // Module 15: read-only, and nothing else - the same instinct as
      // `utility_charges: view()` directly above. A leasing officer asks about the
      // notice period in every renewal conversation and must be able to read the
      // answer, but a leasing officer who can *renew* is a leasing officer who can keep
      // a flat they cannot re-let off the market, under a lease they negotiated. No
      // `.create` either: filing a contract is an obligation, not a lead.
      contracts: view(),
    }),
  },

  {
    name: 'Sales Agent',
    description:
      'Read-only access to properties, units and tenants for sales activity, plus lead capture.',
    permissions: set({
      properties: view(),
      units: view(),
      tenants: view(),
      crm_leads: full(),
      crm_contacts: viewWrite(),
      // Sales agents own the sale pipeline and their own commission.
      sales: viewWrite(),
      // Module 14: nothing. A sales agent showing a flat to a prospect has no reason
      // to see its meter's consumption, and no reason at all to be able to change it.
      // (This block used to sit here by mistake - it was written for the Leasing
      // Officer, whose block it was mistaken for. The role that can answer a
      // resident "how much water did you use" is the one that deals with residents.)
      //
      // Module 15: `view`, and only `view`. A sales agent showing a buyer the signed
      // sale agreement needs to read it - that is the whole of their reason, and it is
      // a real one. They may not file a `SALE` contract: the sale is `crm_leads` and
      // `sales` work, and turning a signed contract into a row is what closes it.
      contracts: view(),
    }),
  },
  {
    name: 'Accountant',
    description: 'Full finance module: invoices, payments, receipts.',
    permissions: set({
      invoices: full(),
      payments: full(),
      receipts: full(),
      tenants: view(),
      leases: view(),
      landlords: view(),
      documents: viewWrite(),
      // Module 6: statements and payouts are finance work.
      owner_statements: full(),
      owner_payouts: full(),
      // Module 14: reads the meters, the readings, the tariff **and** the charges -
      // they reconcile a utility bill against what the utility company actually
      // charged the estate, which needs all four. They raise the bills (`.bill`).
      //
      // They get **no `meter_readings` write and no `utility_rates` write**, and
      // those two absences are the whole point of this module's permission split:
      // an accountant who can type in a consumption figure can write an arbitrary
      // cheque, and an accountant who can set a tariff can quietly change what every
      // resident owes. `utilityChargeFull()` is not used here precisely because it
      // carries `.void`; billing is reversible, reversing is an administrator's or
      // property manager's call.
      utility_meters: view(),
      meter_readings: view(),
      utility_rates: view(),
      utility_charges: { view: true, create: true, update: true, bill: true },
      // Module 15: `view`, `renew` and **no `create`**. The exclusion is the point
      // and it is the same one as `utility_charges` above: the accountant already
      // owns every payable in this organization, so granting them `contracts.create`
      // would let them manufacture the lease that a payable hangs off. They can
      // extend a term - renewing a supplier agreement is genuinely their job - but
      // not file the original obligation. They also get no `.delete`, because a
      // contract they can reverse is a contract they can make disappear.
      contracts: { view: true, renew: true },
      // Module 7: chart of accounts, journal entries and trial balance.
      accounting: full(),
      credits: full(),
      refunds: full(),
      tax: full(),
      payables: full(),
      billing: full(),
      notifications: view(),
      // Module 18: money approvals are their job — the accountant is who
      // approves refunds and expenses below the director level.
      workflows: full(),
      // Module 9: the accountant pays for repairs, so the cost figures matter —
      // but they do not dispatch technicians or edit the plant register.
      work_orders: view(),
      assets: view(),
      // Module 10: procurement is read-only to finance, which is what makes the
      // `create-bill` seam work — the buyer raises the order, the accountant
      // turns it into a payable and posts the ledger entry.
      purchase_requests: view(),
      suppliers: full(),
      rfqs: view(),
      purchase_orders: full(),
      // Module 11: the accountant needs the valuation to agree with the ledger,
      // and a stock movement is what explains a maintenance cost. Reading it is
      // finance's job; writing it is the store's.
      inventory_items: view(),
      warehouses: view(),
      stock_movements: view(),
      // Module 12: the one role that legitimately reads salaries — it is
      // their job — and they own the statutory rules, because a rule's figures
      // are a legal matter and the person who posts the liability is better
      // placed to enter them than a system administrator.
      employees: full(),
      leave_requests: view(),
      holidays: view(),
      payroll: payrollFull(),
      // Module 13: read-only, and only the diary. A booking fee is money this
      // organization will eventually charge, so the accountant must be able to see
      // what was charged — but the *visitor log* and the *access cards* are a
      // privacy question, not a finance one, and neither belongs here.
      facilities: view(),
      facility_bookings: view(),
      facility_blackouts: view(),
    }),
  },
  {
    name: 'Maintenance Manager',
    description: 'Oversees maintenance work on properties and units.',
    permissions: set({
      properties: view(),
      units: view(),
      tenants: view(),
      documents: viewWrite(),
      // Module 18: work-order approvals land here.
      workflows: viewWrite(),
      // Module 9: the module this role exists for. Full on the queue and the
      // register; the service calendar is theirs to set up and pause.
      work_orders: full(),
      assets: full(),
      pm_schedules: full(),
      // Module 10: they specify what they need ("six lift ropes") but do not
      // choose a supplier or commit the company to a purchase.
      purchase_requests: full(),
      suppliers: view(),
      rfqs: view(),
      purchase_orders: view(),
      // Module 11: this is the role that owns the store. Maintenance managers run
      // the plant register, so they run the shelf that feeds it.
      inventory_items: full(),
      warehouses: full(),
      stock_movements: full(),
      // Module 12: runs the technicians, so they approve their leave. No
      // compensation.
      employees: view(),
      leave_requests: viewWrite(),
      holidays: view(),
      // Module 13: a maintenance manager closes the clubhouse for repairs and
      // approves who uses it, so they book *and* decide. The gate is theirs too —
      // they are as likely as anybody to be the one holding a visitor's pass at the
      // barrier — but **not** the access cards: issuing and revoking a fob is a
      // property decision, and the person who maintains the plant should not be the
      // person who hands out keys to it.
      facilities: viewWrite(),
      facility_bookings: facilityBookingFull(),
      facility_blackouts: full(),
      visitors: full(),
      access_cards: view(),
      // Module 14: a maintenance manager installs meters, so they may register one and key
      // in its readings. They may not `utility_rates` at all and cannot bill: what
      // a resident pays for water is not a maintenance decision.
      utility_meters: full(),
      meter_readings: full(),
      utility_rates: view(),
      utility_charges: view(),
      // Module 15: compliance certificates, and nothing else. `view`/`create`/
      // `update` and no `.renew` - a maintenance manager is who goes and gets the
      // lift licence and the gas safety certificate done, and is not who decides the
      // estate commits to another year of them. No `.create` for `COMPLIANCE` alone:
      // the same key would also let them file a supplier contract, which is why the
      // service re-checks the type against `canFileComplianceCertificate`.
      contracts: { view: true, create: true, update: true },
    }),
  },

  {
    name: 'Technician',
    description: 'Field technician — read access to properties and units.',
    permissions: set({
      properties: view(),
      units: view(),
      // Module 9: a technician needs the work order they are standing in front
      // of, and the asset's service history to know what was done last time.
      // They do not get the register, the calendar or the delete rights.
      work_orders: viewWrite(),
      assets: view(),
      // Module 11: a technician needs to read the shelf to do the job — "do we
      // have a 13A plug?" — and needs to record what they took. They do not get
      // the item master, the store list, or anything that could put stock back.
      inventory_items: view(),
      warehouses: view(),
      // Module 12: files their own leave and sees the directory. `viewWrite`,
      // not `full` — filing a request grants nothing beyond filing one, and a
      // technician must not be able to approve somebody else's holiday.
      employees: view(),
      leave_requests: viewWrite(),
      holidays: view(),
      // Module 13: a technician needs one thing from this module and no more —
      // they need to know whether the person who called about the boiler is
      // expected at the gate, which is `visitors.view` and deliberately nothing
      // else. They do **not** book facilities: a maintenance manager books the
      // clubhouse for a building meeting, and widening it to every technician is
      // the kind of drift that happens one role at a time until nobody can say who
      // may book a room. And no cards — a technician should not be able to answer
      // "does the caretaker have a key?" by granting one.
      facilities: view(),
      facility_bookings: view(),
      visitors: view(),
      // Module 14: a technician is the person who finds the burst pipe that
      // doubled a building's water bill, so they need to read the meters, read
      // the readings and read the charges.
      //
      // They get `meter_readings` **write** and nothing else in this module -
      // not the rate, not the bill. Reporting that a meter reads 4,212 is
      // ground truth; deciding what that costs a resident is not, and the two
      // being in the same hands is how a technician ends up responsible for the
      // accuracy of somebody's invoice.
utility_meters: view(),
      meter_readings: view(),
      utility_rates: view(),
      utility_charges: view(),
      // Module 15: `view`, for one specific reason - a technician working on a lift
      // needs to know whether its licence is current, and an expired one is the whole
      // reason not to ride it. That is a read of the register, not a stake in it, so
      // it stops there: they perform the inspection that produces a certificate, but
      // the certificate is the maintenance manager's to hold, not theirs to file.
      contracts: view(),
    }),
  },
  {
    name: 'Landlord',
    description:
      'Owner-facing read access to their properties, billing and documents.',
    permissions: set({
      properties: view(),
      units: view(),
      invoices: view(),
      receipts: view(),
      documents: view(),
      // Module 6: the owner portal (Phase 2) reads exactly these two.
      owner_statements: view(),
      owner_payouts: view(),
      // Module 15: **nothing, deliberately.** A landlord is a counterparty on the
      // `MANAGEMENT` contracts in this very register, so the honest grant would be
      // `view` scoped to contracts whose `landlordId` is this user - and there is no
      // way to express that scope here, because these permissions are organisation
      // wide. Granting `contracts.view` unqualified would show every landlord in the
      // estate every other landlord's agreement. `documents: view()` above is already
      // scoped per landlord by the service, so the per-counterparty portal belongs with
      // Module 19, where that resolution machinery exists and can be reused.
    }),
  },
  {
    name: 'Tenant',
    description: 'Resident-facing access to their own documents.',
    permissions: set({
      documents: view(),
      // Module 15: **nothing, for the same reason as the Landlord role above.** A
      // tenant is a counterparty on the `LEASE` contracts, so this is the highest-value
      // unread grant in the matrix if it is ever scoped wrongly - and the scope that
      // makes it safe is per-tenant, not per-organisation. `documents: view()` is
      // already resolved against the caller's own rental agreement.
    }),
  },
  {
    name: 'Procurement Officer',
    description:
      'Runs the purchase cycle: requests, supplier records, quotation rounds and purchase orders.',
    permissions: set({
      properties: view(),
      units: view(),
      documents: viewWrite(),
      // Module 18: purchase requests are the workflow this role exists for.
      workflows: viewWrite(),
      // Module 10: the module this role exists for. Note the absence of
      // `payables` — this role commits the company to buying, and the accountant
      // turns that commitment into money. Splitting those two is the point.
      purchase_requests: full(),
      suppliers: full(),
      rfqs: full(),
      purchase_orders: full(),
      // Module 11: the reorder decision is a buying decision, so this role can see
      // the shelf and the reorder list — and book goods in, because the person
      // signing for a delivery is the person who knows what came. They do not get
      // the item master: what counts as a store item and what its reorder level
      // is belongs to whoever runs the store.
      inventory_items: view(),
      warehouses: view(),
      stock_movements: viewWrite(),
      // Module 14: read-only, and not an obvious fit — included on purpose. The
      // utility company bills the *estate*, not the resident, so the same
      // reconciliation argument that puts an accountant on this data applies to
      // whoever negotiates and checks the supply contract. They have no reason to
      // type a reading, set a tariff or raise a bill, and no reason to be able to.
      utility_meters: view(),
      meter_readings: view(),
      utility_rates: view(),
      utility_charges: view(),
      // Module 15: the strongest grant outside the property manager, and the one that
      // justifies `contracts` being a single module rather than one per contract type.
      // A `VENDOR` contract is the document a procurement officer negotiates, so
      // `.renew` is literally their job - and if `.renew` had been scoped to the finance
      // team only, renewing the supply contract would have gone to an accountant who
      // did not negotiate it. `.delete` is withheld: the officer who negotiated a
      // supplier must not be able to erase the record of what they agreed.
      contracts: { view: true, create: true, update: true, renew: true },
      // Module 12: sees who exists (a purchase request may name a
      // requester) but nothing else.
      employees: view(),
    }),
  },
  {
    name: 'HR Manager',
    description:
      'Compensation, leave policy, holidays and the statutory payroll rules. Everything about payroll except releasing the money, which stays with whoever holds bank access.',
    permissions: set({
      users: view(),
      documents: view(),
      // Module 12: this role existed as a stub holding only read access to
      // organization users — the same hole as issues 51/54/67/75, where a seeded
      // role has permissions nobody uses and nothing for the job it names. It is
      // the role this module exists to give something to.
      //
      // `employees: full()` is compensation: salaries, bank details and national
      // identifiers. That is correct for an HR manager and *only* for an HR
      // manager among the operational roles, which is why the rest of this matrix
      // stops at `employees: view()`.
      employees: full(),
      leave_requests: full(),
      leave_policies: full(),
      holidays: full(),
      payroll: payrollFull(),
      // Module 14: view only, and the least obvious grant in this file. An HR
      // manager's job involves payslips, and a payslip carrying a utilities
      // deduction is a document they will be asked about - so they need to be able
      // to read what a resident was charged and why. Read is the whole of it: no
      // reading, no rate, no bill.
      utility_meters: view(),
      meter_readings: view(),
      utility_rates: view(),
      utility_charges: view(),
    }),
  },
  {
    name: 'Staff Self-Service',
    description:
      'Your own payslips, your own leave balance, and filing your own leave. Nothing about anybody else.',
    permissions: set({
      // **Only the three `self` actions.** This role deliberately does not hold
      // `employees.view` — that means "the tenant's staff", and an employee
      // holding it would be handed every salary in the company. `self` is a
      // different action precisely so the two cannot be confused, and it is
      // resolved by the service against the caller's own `User.employeeId` rather
      // than against anything in the request.
      employees: { self: true },
      leave_requests: { self: true },
      payroll: { self: true },
      // Module 15: nothing, and the absence is the design. An employee's own
      // employment contract is the one document in the register they might
      // reasonably expect, and `ContractType` has no employment value - a staff
      // contract is payroll and employee data, which is why those two carry `self`
      // above. Granting this role `contracts.view` to reach it would hand them
      // every landlord agreement in the organization.
    }),
  },
];

/**
 * Legacy `UserRole` enum → system role name, used as a fallback for users who
 * have no RoleAssignment rows yet (existing data). Keeps current access
 * behavior exactly as the name-based matrix established it.
 */
export const LEGACY_ROLE_TO_SYSTEM_ROLE: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Company Admin',
  PROPERTY_MANAGER: 'Property Manager',
  // Module 5 and Module 9 added these enum values because the seeded roles had
  // no way to be held; these two lines are what make a user with the enum value
  // actually inherit the seeded role's permissions (master doc issues 51/54).
  LEASING_OFFICER: 'Leasing Officer',
  MAINTENANCE_MANAGER: 'Maintenance Manager',
  TECHNICIAN: 'Technician',
  // Module 10: same hole as Leasing Officer and the two maintenance roles — the
  // seeded Procurement Officer had permissions but no enum value, so it could be
  // granted but never held.
  PROCUREMENT_OFFICER: 'Procurement Officer',
  ACCOUNTANT: 'Accountant',
  // Module 12: `HR_MANAGER` was added to the enum with the seeded HR Manager role
  // and was missing from this map, so an HR manager with no `RoleAssignment`
  // silently fell through to the old `?? 'Tenant'` default — tenant-level read
  // access, which is not what an HR manager's absence should look like.
  HR_MANAGER: 'HR Manager',
  // `UserRole.EMPLOYEE` is deliberately **absent**, and its absence is the design.
  //
  // This map resolves an enum to a `Role.name` by exact string, so it can only
  // reach roles whose name matches their code. Self-service is deliberately named
  // 'Staff Self-Service' rather than 'EMPLOYEE' or 'Employee' — it describes a
  // capability, not a job title, and none of the other twelve seeded roles is a
  // job title either. So the mapping cannot reach it, and requiring an explicit
  // `RoleAssignment` is exactly right: the employee role is the one place where
  // being *granted* something matters more than the fallback.
  //
  // A login with `UserRole.EMPLOYEE` and no assignment therefore resolves to
  // nothing. `PermissionsService` now warns when that happens, because "the user
  // has no permissions" and "this map entry is a typo" look identical otherwise.
  USER: 'Tenant',
};

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { name: role.name, organizationId: null },
    });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          permissions: role.permissions as unknown as Prisma.InputJsonValue,
          description: role.description,
          isSystem: true,
        },
      });
    } else {
      await prisma.role.create({
        data: {
          name: role.name,
          description: role.description,
          isSystem: true,
          permissions: role.permissions as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  console.log(`Seeded ${SYSTEM_ROLES.length} system roles`);
}
