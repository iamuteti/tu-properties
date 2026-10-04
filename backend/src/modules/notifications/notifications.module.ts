import { Module } from '@nestjs/common';
import {
  NotificationsController,
  NotificationTriggersController,
} from './notifications.controller';
import { NotificationConfigController } from './notification-config.controller';
import {
  EmailChannelProvider,
  InAppChannelProvider,
  NotificationsService,
  SmsChannelProvider,
} from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { NotificationConfigService } from './notification-config.service';
import { SmsProviderRegistry } from './sms-provider-registry';
import { AfricasTalkingSmsProvider, TwilioSmsProvider } from './sms-providers';

// Channels are providers rather than hardcoded branches, so adding WhatsApp or
// a real SMTP client later is a new class registered here — not a change to the
// service that decides what to send. The SMS client is resolved at send time
// from whichever provider the organization has made active.
@Module({
  controllers: [
    NotificationsController,
    NotificationTriggersController,
    NotificationConfigController,
  ],
  providers: [
    NotificationsService,
    NotificationTriggersService,
    NotificationConfigService,
    // Constructed directly rather than injected: its optional HTTP client is a
    // seam for tests, not a Nest dependency.
    { provide: SmsProviderRegistry, useFactory: () => new SmsProviderRegistry() },
    InAppChannelProvider,
    EmailChannelProvider,
    SmsChannelProvider,
    TwilioSmsProvider,
    AfricasTalkingSmsProvider,
  ],
  exports: [
    NotificationsService,
    NotificationTriggersService,
    NotificationConfigService,
  ],
})
export class NotificationsModule {}
