import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restrict a route (or whole controller) to users whose structured role
 * permissions include every given permission.
 *
 * Permission format: "<module>.<action>", e.g. "properties.create",
 * "invoices.view", "users.delete". Modules are defined in
 * `src/prisma/roles-seed.ts` (PERMISSION_MODULES).
 *
 * Evaluated by the global PermissionsGuard, which runs after the RolesGuard.
 * Routes without @Permissions() only need the (optional) @Roles() check.
 * SUPER_ADMIN and roles with `all: true` pass every permission check.
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
