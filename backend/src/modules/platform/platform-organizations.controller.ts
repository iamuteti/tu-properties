import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { UserRole } from '@prisma/client';
import { getUserId } from '@/common/utils';
import {
  OnboardOrganizationDto,
  SuspendOrganizationDto,
} from './dto/onboarding.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { PlatformService } from './platform.service';

/**
 * The platform-admin surface (Module 19).
 *
 * Architecturally separate from the tenant controllers: class-level `@Roles(SUPER_ADMIN)`,
 * and the service behind it is free to touch any organization because that's the job.
 *
 * This is **not** a move of `OrganizationsController`; it is a new, narrower surface.
 * The tenant-facing self-service that already exists — `GET/PATCH /organizations/me` —
 * stays where it is; platform management (list every org, onboard, suspend, read one)
 * goes here, behind SUPER_ADMIN, exactly once, which is the split Module 19's task list
 * asked for ("never share a controller with tenant endpoints").
 */
@Controller('platform/organizations')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformOrganizationsController {
  constructor(private readonly platformService: PlatformService) {}

  @Post()
  create(@Body() dto: OnboardOrganizationDto, @Request() req: any) {
    return this.platformService.onboard(dto, getUserId(req));
  }

  @Get()
  findAll() {
    return this.platformService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.platformService.findOne(id);
  }

  /**
   * Derived usage for one tenant (Module 19 Phase C) — counts, never stored.
   * The dashboard reads this rather than a column nobody maintains.
   */
  @Get(':id/usage')
  usage(@Param('id') id: string) {
    return this.platformService.usage(id);
  }

  /** User directory for one tenant — the impersonation dialog's picker. */
  @Get(':id/users')
  listUsers(@Param('id') id: string) {
    return this.platformService.listUsers(id);
  }

  /**
   * Start a time-limited impersonation of one tenant user (Module 19 Phase C).
   * Returns a bearer token carrying the *target's* role — so this very
   * endpoint is unreachable while impersonating, and there is no second hop.
   */
  @Post(':id/impersonate')
  @RateLimit({
    limit: 10,
    ttl: 5 * 60 * 1000,
    message: 'Too many impersonation attempts. Try again in a few minutes.',
  })
  impersonate(
    @Param('id') id: string,
    @Body() dto: ImpersonateDto,
    @Request() req: any,
  ) {
    return this.platformService.impersonate(id, dto, getUserId(req)!, {
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Patch(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendOrganizationDto,
    @Request() req: any,
  ) {
    return this.platformService.setSuspended(id, true, dto, getUserId(req));
  }

  @Patch(':id/activate')
  @HttpCode(200)
  activate(
    @Param('id') id: string,
    @Body() dto: SuspendOrganizationDto,
    @Request() req: any,
  ) {
    // Reason field exists on SuspendOrganizationDto so a suspension always carries
    // one; it is accepted here too and stored off the subscription status cleanup,
    // because reactivation should likewise be a deliberate, note-worthy action.
    return this.platformService.setSuspended(id, false, dto, getUserId(req));
  }
}
