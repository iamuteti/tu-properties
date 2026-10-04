import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { NotificationsService } from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(
    @Request() req,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listForUser(req.user.userId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(@Request() req) {
    return { count: await this.notifications.unreadCount(req.user.userId) };
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Request() req) {
    return this.notifications.markRead(id, req.user.userId);
  }

  @Post('read-all')
  markAllRead(@Request() req) {
    return this.notifications.markAllRead(req.user.userId);
  }

  @Get('preferences')
  preferences(@Request() req) {
    return this.notifications.getPreferences(req.user.userId);
  }

  @Post('preferences')
  setPreference(
    @Body() body: { type: NotificationType; inApp?: boolean; email?: boolean; sms?: boolean; push?: boolean },
    @Request() req,
  ) {
    return this.notifications.setPreference(
      req.user.userId,
      body.type,
      body,
      getTenantId(req),
    );
  }
}

/**
 * Trigger control. Separate from the read endpoints because running the
 * reminder sweep is an administrative action, not something any signed-in user
 * can trigger by accident.
 */
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('notifications/triggers')
export class NotificationTriggersController {
  constructor(private readonly triggers: NotificationTriggersService) {}

  /** Run the reminder sweep now instead of waiting for the schedule. */
  @Post('run')
  @Permissions('notifications.run')
  run(@Body() body: { onDate?: string }) {
    return this.triggers.runDailyReminders(
      body.onDate ? new Date(body.onDate) : new Date(),
    );
  }
}

export { getUserId };