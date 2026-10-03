import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';

/**
 * Global guard enforcing role-based access control.
 *
 * - Runs after the global PublicGuard (authentication), so `request.user`
 *   is populated on every non-public route.
 * - Routes without @Roles() are open to any authenticated user.
 * - Routes with @Roles(...) require the user's role to be in the list;
 *   anything else gets a 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions for this operation');
    }

    return true;
  }
}
