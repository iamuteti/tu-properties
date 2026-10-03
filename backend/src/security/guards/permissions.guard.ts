import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { PermissionsService } from '../permissions.service';

/**
 * Global guard enforcing structured (JSON) role permissions.
 *
 * - Runs after the global PublicGuard (authentication) and RolesGuard, so
 *   `request.user` is populated on every non-public route.
 * - Routes without @Permissions() are unaffected (the name-based RolesGuard
 *   still applies where @Roles() is set).
 * - Routes with @Permissions('module.action', ...) require the user's
 *   effective structured permission set to grant every listed permission.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      string[] | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    for (const permission of requiredPermissions) {
      const granted = await this.permissionsService.hasPermission(
        user,
        permission,
      );
      if (!granted) {
        throw new ForbiddenException(
          'Insufficient permissions for this operation',
        );
      }
    }

    return true;
  }
}
