import { UserRole } from '@prisma/client';

/**
 * Module 13 — who may see and change what in Facilities.
 *
 * One file, for the reason `hr-roles.ts` is one file: four controllers each
 * declaring their own list is how the question "who can revoke a resident's access
 * card?" stops having an answer. It has to be answerable in one place, because it
 * is a question about building security rather than about a screen.
 *
 * Four tiers, and the split is the security design of the module:
 *
 * - `FACILITIES_VIEW_ROLES` — the register and the diary. Broad, because
 *   "is the clubhouse free on Saturday" is a question a leasing officer, an
 *   accountant and a technician all need answered, and none of them should have to
 *   ask a colleague.
 * - `FACILITIES_BOOK_ROLES` — may reserve a slot. This is the interesting one: it
 *   includes `LEASING_OFFICER`, because letting a prospect be shown a vacant
 *   clubhouse is a sales action, but **excludes** `ACCOUNTANT`, who has no reason
 *   to book a room and no business holding a list of who is coming to the AGM.
 * - `FACILITIES_DECIDE_ROLES` — approves and declines bookings, and closes a
 *   facility for maintenance. Deliberately narrower than booking: whoever books on
 *   a resident's behalf is exactly the person who should not also be the one who
 *   signs it off, which is the same separation the booking lifecycle enforces at
 *   the row level with "nobody approves their own booking".
 * - `FACILITIES_DOOR_ROLES` — the gate: the visitor log and access cards. The
 *   narrowest list in the module, and the one to be most careful about. A visitor
 *   log records who came into a building and an access card decides who can get in
 *   next; both are personal data about people who are not staff and have no other
 *   relationship with the organization, so both are restricted to the roles whose
 *   actual job is being at the gate.
 *
 * Note what is absent: no accountant, and no leasing officer, may read the visitor
 * log. This is the one place in the product where a narrow list is more defensible
 * than a broad one, because the people in it did not choose to be recorded.
 */
export const FACILITIES_VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
  UserRole.LEASING_OFFICER,
  UserRole.ACCOUNTANT,
];

/**
 * May take a booking. Wider than the decide list on purpose — a leasing officer
 * showing a prospect around should not need an administrator in the loop — and
 * narrower than the view list, because reading a diary is not the same as writing
 * into it.
 */
export const FACILITIES_BOOK_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * Approves, declines, cancels and closes a facility.
 *
 * The exclusion worth naming: `LEASING_OFFICER` may book but not approve, so the
 * person who promised a prospect the clubhouse is not the person who authorises it.
 */
export const FACILITIES_DECIDE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
];

/**
 * The gate: who was on site, who is barred, and who holds a card.
 *
 * The narrowest list here, and deliberately so. `TECHNICIAN` is included because a
 * technician legitimately needs to know whether the person who called about the
 * boiler is expected; `LEASING_OFFICER` and `ACCOUNTANT` are not, because neither
 * needs a list of outsiders to this building. Revisiting this is the first thing a
 * deployment with a manned gate should ask about — the roles here are guesses at
 * a job, and the real one belongs to the organization that staffs the desk.
 */
export const FACILITIES_DOOR_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
];
