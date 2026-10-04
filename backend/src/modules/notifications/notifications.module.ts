import { Module } from '@nestjs/common';
import {
  NotificationsController,
  NotificationTriggersController,
} from './notifications.controller';
import {
  EmailChannelProvider,
  InAppChannelProvider,
  NotificationsService,
  SmsChannelProvider,
} from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';

// Channels are providers rather than hardcoded branches, so adding WhatsApp or
// a real SMS vendor later is a new class registered here — not a change to the
// service that decides what to send.
@Module({
  controllers: [NotificationsController, NotificationTriggersController],
  providers: [
    NotificationsService,
    NotificationTriggersService,
    InAppChannelProvider,
    EmailChannelProvider,
    SmsChannelProvider,
  ],
  exports: [NotificationsService, NotificationTriggersService],
})
export class NotificationsModule {}
