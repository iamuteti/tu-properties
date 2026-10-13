import { Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getUserId } from '@/common/utils';
import { PlatformService } from './platform.service';

/**
 * The impersonation exit (Module 19 Phase C).
 *
 * Deliberately NOT on `PlatformOrganizationsController`: that controller is
 * class-level `@Roles(SUPER_ADMIN)`, and an impersonation token carries the
 * *target's* role — so the session that most needs to end could never reach
 * an endpoint behind it. This controller has no `@Roles` (any authenticated
 * caller), and the service refuses anything that is not an impersonation.
 */
@Controller('platform/impersonate')
@UseGuards(JwtAuthGuard)
export class PlatformImpersonationController {
  constructor(private readonly platformService: PlatformService) {}

  @Post('end')
  @HttpCode(200)
  end(@Request() req: any) {
    return this.platformService.endImpersonation(
      {
        userId: getUserId(req)!,
        jti: req.user?.jti,
        impersonatedBy: req.user?.impersonatedBy ?? null,
      },
      getUserId(req),
    );
  }
}
