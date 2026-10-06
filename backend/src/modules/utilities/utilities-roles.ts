import { UserRole } from '@prisma/client';

/**
 * Module 14 — who may see, change and bill what in Utilities.
 *
 * One file, for the reason `facilities-roles.ts` and `hr-roles.ts` are one file:
 * four controllers each declaring their own list is how the question "who can put
 * a water bill on a resident?" stops having an answer. It has to be answerable in
 * one place, because it is a question about money rather than about a screen.
 *
 * Four tiers. The split that matters in this module is not the usual
 * view-versus-write one — it is that **taking a reading and turning a reading into
 * money are different jobs, held by different people, and granting one without the
 * other is how an estate gets utility bills nobody can explain.**
 *
 * - `UTILITIES_VIEW_ROLES` — the meter register, readings, tariffs and charges.
 *   Broad on purpose. "How much water did this flat use in June" is a question a
 *   leasing officer (answering a resident), an accountant (reconciling a bill), a
 *   technician (chasing a leak) and a property manager all need answered, and none
 *   of them should have to ask a colleague.
 *
 * - `UTILITIES_RECORD_ROLES` — **key in a reading**. The person who physically
 *   stands at the meter. `TECHNICIAN` and `MAINTENANCE_MANAGER` are in because
 *   reading a meter is exactly the kind of ground work their job already involves,
 *   and excluding them would mean every reading route went through an office.
 *   `ACCOUNTANT` is **not** in: an accountant does not read meters, and handing them
 *   the ability to invent a consumption figure is handing them the ability to write
 *   an arbitrary cheque.
 *
 * - `UTILITIES_REGISTER_ROLES` — **put a meter on the register**, including whether
 *   it is a bulk meter and how its consumption is divided. Narrower than recording a
 *   reading, and the split is deliberate: installing a meter is ground work, but
 *   declaring it a `BULK` meter with an `AREA` apportionment is a policy decision
 *   about who pays for the building's water. A technician who may read a meter must
 *   not thereby gain the power to decide how the estate splits its bills — and the
 *   database will accept either arrangement, which is exactly why the permission
 *   has to.
 *
 * - `UTILITIES_BILL_ROLES` — run billing, turning a period's consumption into an
 *   invoice. **This is the money action**, and it is the tier worth arguing about.
 *   `ACCOUNTANT` is in, because raising an invoice is their job. `PROPERTY_MANAGER`
 *   is in, because a small estate's manager does the billing themselves and a
 *   product that assumes a separate finance department does not describe most of
 *   its actual deployments. `TECHNICIAN` is **not** in: they may tell you the meter
 *   read 4,212, and they may not decide what that costs the resident.
 *
 * - `UTILITIES_RATE_ROLES` — set and supersede a tariff. Narrower than billing on
 *   purpose, and this is the exclusion worth naming: **an accountant may bill from a
 *   tariff but may not write one.** A tariff is a commercial decision about what the
 *   estate charges its residents, and letting finance set it silently is how a rate
 *   gets adjusted to make a number come out right. The two are deliberately in
 *   different lists even though both roles are senior.
 *
 * - `UTILITIES_VOID_ROLES` — write off or reverse a charge. Narrowest list in the
 *   module. Voiding a charge is deciding a resident does not owe that water, which is
 *   neither a data-entry act nor a routine bookkeeping one, so it sits with the two
 *   roles that can already change a tariff.
 *
 * Note what is absent entirely: `LEASING_OFFICER` may **read** everything and may do
 * nothing at all to it, and `SALES_AGENT` may not even do that. That is the same
 * narrow-list instinct as `FACILITIES_DOOR_ROLES`, and here the justification is
 * simpler — a leasing officer who can bill is a leasing officer who can bill a
 * prospect to win the lease, and a sales agent has no reason to know either way.
 */
export const UTILITIES_VIEW_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
  UserRole.LEASING_OFFICER,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.HR_MANAGER,
];

/**
 * Key in a reading on a meter that already exists.
 *
 * `ACCOUNTANT` is deliberately excluded — see the file header. The cost of this
 * exclusion is that an organization with no technician and no maintenance manager
 * has to route readings through a property manager; the benefit is that no finance
 * user can type in a consumption figure.
 */
export const UTILITIES_RECORD_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
];

/**
 * Put a meter on the register.
 *
 * Narrower than `UTILITIES_RECORD_ROLES`, and the difference is the whole argument:
 * a technician may report what a meter reads, but `scope` and `apportionmentMethod`
 * are how the estate decides who pays for a riser meter's water, and that is a
 * policy decision rather than ground work. `utility_meters.bulk_needs_method`
 * enforces only the *shape* of such a decision; this list decides who gets to make
 * it.
 */
export const UTILITIES_REGISTER_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Turn a billing period's consumption into an invoice.
 *
 * The money action. `ACCOUNTANT` is the natural holder; `PROPERTY_MANAGER` is here
 * because most estates this product is sold to have one person doing both jobs, and
 * a permission matrix that only works for a large organization is a permission matrix
 * that gets worked around.
 */
export const UTILITIES_BILL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.ACCOUNTANT,
];

/**
 * Set, supersede or close a tariff.
 *
 * **An accountant may bill from a tariff but may not write one.** The two are in
 * different lists deliberately: a rate is what the estate charges residents, which is
 * a commercial decision, and it is the input every future utility bill is derived
 * from — so the ability to change it silently is the ability to change what everybody
 * owes.
 */
export const UTILITIES_RATE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Void a charge — writing off what a resident owes for a meter's consumption.
 *
 * The narrowest list here, and narrower than billing on purpose: raising a bill is
 * routine, reversing one is a decision about money somebody has already been asked
 * for, and it needs the same authority as changing the rate that produced it.
 */
export const UTILITIES_VOID_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Whether a role may record a reading.
 *
 * Used by the meter service rather than only by the controller decorator, because
 * the same rule decides whether a *smart* meter's reading is accepted as well as a
 * manual one, and that check belongs next to the data rather than in a route.
 */
export function canRecordReading(role: UserRole): boolean {
  return UTILITIES_RECORD_ROLES.includes(role);
}

/**
 * Whether a role may put a new meter on the register.
 *
 * Separate from `canRecordReading` on purpose: reading a meter is ground work and
 * declaring how its consumption is divided is a policy decision.
 */
export function canRegisterMeter(role: UserRole): boolean {
  return UTILITIES_REGISTER_ROLES.includes(role);
}
