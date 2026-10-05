import { UserRole } from '@prisma/client';

/**
 * Module 12 — who may see and who may change what in HR.
 *
 * In one file rather than four, because these lists answer a single question that
 * has to be answerable in one place: **"who can see a salary?"** Four controllers
 * each declaring their own role list is how that question stops having an answer.
 *
 * Three tiers, and the differences between them are the security design of the
 * module rather than tidiness:
 *
 * - `HR_VIEW_ROLES` — the staff directory. Names, departments, job titles, start
 *   dates. Nearly every role, because "who do I ask when the lift is broken" is a
 *   question everybody needs answered.
 * - `HR_APPROVER_ROLES` — signs off somebody else's time off, and maintains leave
 *   policy and holidays.
 * - `HR_COMPENSATION_ROLES` — salaries, bank details, national identifiers. Three
 *   roles: an administrator, an accountant and an HR manager.
 *
 * Note what is *not* here: nobody in the operational half of this product
 * (`PROPERTY_MANAGER`, `MAINTENANCE_MANAGER`, `TECHNICIAN`, `LEASING_OFFICER`,
 * `PROCUREMENT_OFFICER`) can read a salary. That is a deliberate narrowing of what
 * a property manager can see about their own staff, and it is the one decision here
 * most worth revisiting if a deployment says otherwise.
 */

/** The staff directory, with no money on it. */
export const HR_VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
  UserRole.ACCOUNTANT,
  UserRole.LEASING_OFFICER,
  UserRole.PROCUREMENT_OFFICER,
];

/** Salaries, bank details and statutory identifiers. */
export const HR_COMPENSATION_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.HR_MANAGER,
];

/** Who signs off somebody else's leave, and maintains policy and holidays. */
export const HR_APPROVER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Who can read a payslip at all, which is also who can see the rules behind it —
 * configuring a rule you cannot see is not a thing anyone should have to do.
 *
 * Deliberately excludes `PROPERTY_MANAGER`, who may approve figures elsewhere but
 * does not sign off the payroll: in a company that runs payroll properly, the
 * person who approves the numbers and the person who releases the money are two
 * people. That is also why the controller asks for `payroll.pay` separately from
 * `payroll.approve`.
 */
export const HR_PAYROLL_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.HR_MANAGER,
];
