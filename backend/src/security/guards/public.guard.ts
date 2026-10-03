import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

/**
 * PublicGuard is the app-wide guard registered in AppModule.
 *
 * It behaves like JwtAuthGuard, except that routes decorated with
 * `@Public()` skip authentication entirely. This is what keeps the login,
 * register, and health endpoints reachable before a token exists.
 */
@Injectable()
export class PublicGuard extends JwtAuthGuard {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
