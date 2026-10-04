import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import {
  AfricasTalkingSmsProvider,
  HttpClientLike,
  TwilioSmsProvider,
} from './sms-providers';

/** What the delivery path needs from any SMS vendor client. */
export interface SmsSender {
  /** Every vendor client identifies itself, for logs and the admin panel. */
  readonly id: string;
  send(
    credentials: never,
    request: { to: string; body: string; sender?: string | null },
    options?: Record<string, unknown>,
  ): Promise<{
    status: NotificationStatus;
    externalId?: string;
    reason?: string;
  }>;
}

/**
 * Resolves a provider name to the client that talks to it.
 *
 * Lives in its own file rather than beside the configuration service so the two
 * have no import cycle — Nest reads constructor parameter types at class
 * definition time, and a class referring to one declared later in the same file
 * hits the temporal dead zone before anything is instantiated.
 *
 * The HTTP client is injectable, which is what lets one spec stub the network
 * for every vendor at once.
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly clients: Record<string, SmsSender>;

  constructor(http?: HttpClientLike) {
    const twilio = new TwilioSmsProvider(http);
    const africa = new AfricasTalkingSmsProvider(http);
    this.clients = { TWILIO: twilio, AFRICAS_TALKING: africa };
  }

  resolve(provider: string): SmsSender {
    const client = this.clients[provider];
    if (!client) {
      throw new BadRequestException(`Provider "${provider}" is not implemented`);
    }
    return client;
  }

  /** The provider names this deployment can actually use. */
  available(): string[] {
    return Object.keys(this.clients);
  }
}