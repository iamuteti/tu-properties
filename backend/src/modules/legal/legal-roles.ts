import { UserRole } from '@prisma/client';

/**
 * Module 15 - who may see, file, change and renew a contract.
 *
 * One file, for the reason `facilities-roles.ts`, `hr-roles.ts` and
 * `utilities-roles.ts` are each one file: two controllers declaring two lists is how
 * "who can put a lease renewal in front of a tenant?" stops having an answer. It has
 * to be answerable in one place, because a contract is the document people are held
 * to - the question is about obligation, not about a screen.
 *
 * Five tiers, and the split that matters here is not view-versus-write. It is that
 * **filing a contract, changing its descriptive fields, and extending someone's term
 * are three different jobs.** Anyone can create the first one; the third is a promise
 * made on somebody else's behalf.
 *
 * - `CONTRACTS_VIEW_ROLES` - the register and every contract in it. Broad on purpose,
 *   because "what is the notice period on this landlord's agreement?" is a question
 *   a leasing officer (answering a prospective tenant), a property manager (planning
 *   the term), an accountant (explaining a charge) and a procurement officer (checking
 *   a supplier's terms) all need answered, and none of them should have to ask.
 *
 * - `CONTRACTS_FILE_ROLES` - **record a contract and its dates.** This is the
 *   document clerk's job. `PROCUREMENT_OFFICER` is in and `ACCOUNTANT` is not, for
 *   the same reason `TECHNICIAN` is absent from `UTILITIES_BILL_ROLES`: an accountant
 *   who can file a lease can manufacture a tenant's commitment to a figure nobody
 *   agreed to. Reading the register is in their job; writing to it is not.
 *
 * - `CONTRACTS_COMPLIANCE_ROLES` - **file and maintain a compliance certificate.**
 *   A separate tier, and the only one that is granted *without* `.renew`.
 *   `MAINTENANCE_MANAGER` and `FACILITIES`-adjacent roles do the inspections that
 *   generate these: gas safety, fire, lifts. Being the person who obtains and renews
 *   the certificate is genuinely their job, and it would be strange to make the
 *   maintenance manager route a lift licence through an office. What they may not do
 *   is extend a term, because a certificate's renewal is a commitment to a regulator
 *   and to the residents of the building, and that is the property manager's call.
 *
 * - `CONTRACTS_RENEW_ROLES` - **replace an expiring contract with a new term.**
 *   The narrowest tier in the module, and the one worth arguing about, because it
 *   changes what somebody is committed to paying for another year. `PROPERTY_MANAGER`
 *   and `ACCOUNTANT` are in - extending a supplier agreement is exactly what an
 *   accountant does, and most estates this product is sold to have one person doing
 *   both jobs. `PROCUREMENT_OFFICER` is in for a narrower reason: renewing a supplier
 *   contract *is* their job, and drawing the line at "the supplier contract you
 *   negotiated" rather than "any contract in the estate" is the only version of this
 *   tier that survives contact with an actual organization. The tier exists to keep
 *   `MAINTENANCE_MANAGER` and `LEASING_OFFICER` out, not to fence the finance team in.
 *
 * - `CONTRACTS_DELETE_ROLES` - remove a row from the register. Narrower than it looks
 *   and narrower than it needs to be: **this means the row was entered in error, not
 *   that the contract lapsed.** A genuine end is recorded by letting the contract
 *   expire, which keeps the counterparty, the dates and the renewal chain as evidence.
 *   So `.delete` is held by `PROPERTY_MANAGER` and `ADMIN` and not by anyone whose job
 *   is dealing with the contract itself - if you negotiated it, you do not get to
 *   erase it.
 *
 * Note what is absent, and it is a deliberate gap rather than an oversight:
 * `LANDLORD` and `TENANT` hold **no** grant here. Both are counterparties in this
 * register and both will eventually need to read their own contract from a portal, but
 * that is row-level scoping ("only contracts whose `landlordId` is mine"), and
 * per-counterparty scoping belongs with the portal work in Module 19, where the
 * existing self-service resolution machinery lives. Granting a tenant `view` today
 * would hand them every contract in the estate, and no amount of filtering in the
 * service fixes that later without a migration of who has already been told they may.
 */
export const CONTRACTS_VIEW_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.LEASING_OFFICER,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Record a contract and its dates.
 *
 * `ACCOUNTANT` is deliberately excluded - see the file header. They may read the
 * register; they may not write an obligation into it.
 */
export const CONTRACTS_FILE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.PROCUREMENT_OFFICER,
];

/**
 * File and maintain a compliance certificate.
 *
 * Granted without `.renew`, which is the distinction that makes this tier worth
 * existing: the maintenance manager is the person who goes and gets the lift licence
 * renewed, and is not the person who decides the estate commits to another year of it.
 */
export const CONTRACTS_COMPLIANCE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Replace an expiring contract with a new term.
 *
 * The only tier that changes somebody's commitment. Holds the two senior business
 * roles plus procurement, for the reasons in the file header.
 */
export const CONTRACTS_RENEW_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.PROCUREMENT_OFFICER,
];

/**
 * Remove a contract from the register - meaning it was entered in error.
 *
 * Excludes everyone who negotiates contracts on purpose. See the file header: a lapsed
 * contract is recorded by letting it expire.
 */
export const CONTRACTS_DELETE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Whether a role may file or change a compliance certificate.
 *
 * Used by the contract service rather than only by the controller decorator: the same
 * rule has to decide whether a `COMPLIANCE` contract can be edited *after* it is on
 * the register, because turning a certificate into a lease agreement by flipping
 * `type` would otherwise be a way around `CONTRACTS_FILE_ROLES` entirely. The check
 * belongs next to the data.
 *
 * Accepts `undefined` so the service can pass `req.user.role` through directly - that
 * value is untyped in this codebase, and widening the parameter is cheaper than
 * casting at three call sites.
 */
export function canFileComplianceCertificate(
  role: UserRole | undefined,
): boolean {
  return role !== undefined && CONTRACTS_COMPLIANCE_ROLES.includes(role);
}

/**
 * The seeded system roles that should be told a contract needs attention.
 *
 * A `UserRole` and a seeded `Role.name` are different things - the enum value is
 * `PROPERTY_MANAGER`, the row is `Property Manager` - and the notification sweep has to
 * query by name. Mapping them in one named constant means the two lists can be compared
 * against each other in a test, rather than one silently omitting a role that the other
 * grants.
 *
 * Union of `CONTRACTS_RENEW_ROLES` and `CONTRACTS_COMPLIANCE_ROLES`, minus `SUPER_ADMIN`:
 * a super admin has no `organizationId` and sits on no organization's register, so
 * there is nothing for them to be told about - and a notification reaching every
 * platform administrator about one estate's gas safety certificate is a complaint
 * waiting to happen.
 */
export const CONTRACT_REMINDER_ROLE_NAMES = [
  'Company Admin',
  'Property Manager',
  'Accountant',
  'Procurement Officer',
  'Maintenance Manager',
] as const;
