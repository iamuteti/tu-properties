import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationChannel, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { NotificationConfigService } from './notification-config.service';

/**
 * Provider configuration, for the admin panel.
 *
 * Separate controller from the per-user notification endpoints because these
 * are organization-wide, write-sensitive, and carry credentials: an
 * administrator configures a provider, a tenant reads their own messages. The
 * guard is company admin only.
 */
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('notifications/config')
export class NotificationConfigController {
  constructor(private readonly config: NotificationConfigService) {}

  /** Which providers exist and what fields each one needs. */
  @Get('providers')
  @Permissions('notifications.run')
  providers() {
    return this.config.catalogue();
  }

  /** Current configuration per channel, with credentials masked. */
  @Get()
  @Permissions('notifications.run')
  list(@Request() req) {
    return this.config.list(this.requireTenant(req));
  }

  /**
   * Store a provider's credentials. This does **not** activate the channel —
   * an administrator enters the keys, tests them, and then switches over, so a
   * half-typed SID cannot break a channel that was working.
   */
  @Post()
  @Permissions('notifications.run')
  save(
    @Body()
    body: {
      channel: NotificationChannel;
      provider: string;
      credentials: Record<string, unknown>;
      settings?: Record<string, unknown>;
    },
    @Request() req,
  ) {
    return this.config.save(this.requireTenant(req), {
      ...body,
      updatedBy: getUserId(req),
    });
  }

  @Post(':channel/activate')
  @Permissions('notifications.run')
  activate(@Param('channel') channel: NotificationChannel, @Request() req) {
    return this.config.activate(
      this.requireTenant(req),
      channel,
      getUserId(req),
    );
  }

  @Post(':channel/deactivate')
  @Permissions('notifications.run')
  deactivate(@Param('channel') channel: NotificationChannel, @Request() req) {
    return this.config.deactivate(
      this.requireTenant(req),
      channel,
      getUserId(req),
    );
  }

  /**
   * Send a test message through the saved configuration, active or not — so an
   * administrator can check a newly entered key before switching the channel
   * over to it.
   */
  @Post(':channel/test')
  @Permissions('notifications.run')
  test(
    @Param('channel') channel: NotificationChannel,
    @Body() body: { to: string },
    @Request() req,
  ) {
    return this.config.testSend(this.requireTenant(req), channel, body?.to ?? '');
  }

  private requireTenant(req: unknown): string {
    const tenantId = getTenantId(req as never);
    if (!tenantId) {
      throw new BadRequestException('No organization scope on this request');
    }
    return tenantId;
  }
}
