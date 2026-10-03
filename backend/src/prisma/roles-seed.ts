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
    }),
  },
  {
    name: 'Maintenance Manager',
    description: 'Oversees maintenance work on properties and units.',
    permissions: set({
      properties: view(),
      units: view(),
      documents: viewWrite(),
    }),
  },
  {
    name: 'Technician',
    description: 'Field technician — read access to properties and units.',
    permissions: set({
      properties: view(),
      units: view(),
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
      'Procurement operations with read access to properties and units.',
    permissions: set({
      properties: view(),
      units: view(),
      documents: viewWrite(),
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
