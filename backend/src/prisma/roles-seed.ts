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
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export interface ModulePermissions {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
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
    }),
  },
  {
    name: 'Tenant',
    description: 'Resident-facing access to their own documents.',
    permissions: set({
      documents: view(),
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
    }),
  },
  {
    name: 'HR Manager',
    description:
      'Read access to organization users for staffing administration.',
    permissions: set({
      users: view(),
      documents: view(),
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
