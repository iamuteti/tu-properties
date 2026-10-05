import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

/**
 * Gate for the tenant self-service portal.
 *
 * Applied *after* `JwtAuthGuard` (`@UseGuards(JwtAuthGuard, TenantPortalGuard)`),
 * which is what populates `request.user`. This guard adds the second half of
 * the rule: the session must belong to a *resident* — a user linked to exactly
 * one tenant record — and not to staff.
 *
 * Without it a property manager could read any tenant's lease through the
 * portal endpoints. The scope itself comes from `getPortalTenantId`, which
 * reads the user's own link and ignores anything the client sends.
 */
@Injectable()
export class TenantPortalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    if (!request?.user?.portalTenantId) {
      throw new ForbiddenException(
        'The tenant portal is for tenant accounts only.',
      );
    }

    return true;
  }
}
