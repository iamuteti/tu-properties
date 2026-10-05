import { UserRole } from '@prisma/client';

/**
 * Module 11 — who may see and who may change the store.
 *
 * Two lists rather than one, and the split is the design rather than a
 * convenience:
 *
 * - **Read** includes `TECHNICIAN` and `ACCOUNTANT`. A technician standing in a
 *   cupboard with a work order open needs to know what is on the shelf, and the
 *   accountant needs the valuation to agree with the ledger. Both are readers of
 *   the truth; neither runs the store.
 * - **Write** excludes both, and includes `PROCUREMENT_OFFICER` because the
 *   reorder decision is a buying decision. That is the same reasoning Module 10
 *   used to keep `payables` out of the procurement officer's hands: the buyer
 *   decides *what* to buy, the storekeeper decides *what arrived*, and the
 *   accountant decides what it cost.
 */
export const INVENTORY_VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
  UserRole.PROCUREMENT_OFFICER,
  UserRole.ACCOUNTANT,
];

export const INVENTORY_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.PROCUREMENT_OFFICER,
];
