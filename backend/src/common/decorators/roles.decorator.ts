import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route (or whole controller) to the given roles.
 * Evaluated by the global RolesGuard, which runs after authentication.
 * Omit the decorator entirely to allow any authenticated user.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
