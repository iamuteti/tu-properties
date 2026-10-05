import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

/**
 * Module 17 — SMS providers.
 *
 * Both are thin REST clients over `fetch`, and both are deliberately
 * side-effect-testable: the HTTP call goes through an injectable `HttpClientLike`
 * so a spec can assert the exact URL, headers and body with dummy credentials
 * and no network. That matters more than it sounds — an SMS integration whose
 * only test is "it didn't throw" has not been tested.
 *
 * Neither provider throws on failure. They return `FAILED` with the vendor's
 * own message, because a rejected phone number and an expired trial account
 * need to reach whoever configured this, and an exception loses that.
 */

export interface SmsRequest {
  to: string;
  body: string;
  sender?: string | null;
}

export interface SmsResult {
  status: NotificationStatus;
  /** The vendor's message id, for reconciling against their dashboard. */
  externalId?: string;
  reason?: string;
}

/** The slice of `fetch` these clients need — injectable for tests. */
export type HttpClientLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

/**
 * Injection token for the HTTP client. A defaulted constructor parameter would
 * make Nest look for a provider literally called `Function` and fail the boot, so
 * the seam has to be a token.
 */
export const SMS_HTTP_CLIENT = 'SMS_HTTP_CLIENT';

export const defaultHttpClient: HttpClientLike = (url, init) =>
  fetch(url, init as RequestInit);

@Injectable()
export class TwilioSmsProvider {
  readonly id = 'TWILIO';
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(
    @Optional()
    @Inject(SMS_HTTP_CLIENT)
    private readonly http?: HttpClientLike,
  ) {}

  /**
   * Twilio's Messages API: form-encoded, authenticated with the account SID
   * and an auth token as HTTP Basic (the username is the SID).
   */
  async send(
    credentials: { accountSid: string; authToken: string },
    request: SmsRequest,
    options?: { baseUrl?: string; region?: string },
  ): Promise<SmsResult> {
    const baseUrl =
      options?.baseUrl ?? `https://api.${options?.region ?? 'us1'}.twilio.com`;
    const url = `${baseUrl}/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;

    const form = new URLSearchParams({
      To: request.to,
      Body: request.body,
    });
    // Optional: without a messaging service or sender, Twilio needs a from
    // number; an alphanumeric sender is only valid in some countries.
    if (request.sender) form.set('From', request.sender);

    const authorization = Buffer.from(
      `${credentials.accountSid}:${credentials.authToken}`,
    ).toString('base64');

    const response = await (this.http ?? defaultHttpClient)(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const text = await response.text();

    if (!response.ok) {
      const message = extractTwilioError(text) || `HTTP ${response.status}`;
      this.logger.warn(`Twilio rejected the message: ${message}`);
      return { status: NotificationStatus.FAILED, reason: message };
    }

    const sid = extractJsonString(text, 'sid');
    return { status: NotificationStatus.SENT, externalId: sid ?? undefined };
  }
}

@Injectable()
export class AfricasTalkingSmsProvider {
  readonly id = 'AFRICAS_TALKING';
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(
    @Optional()
    @Inject(SMS_HTTP_CLIENT)
    private readonly http?: HttpClientLike,
  ) {}

  /**
   * Africa's Talking takes the API key as the HTTP Basic username and the
   * username alone as the password, which trips people up often enough to be
   * worth spelling out.
   */
  async send(
    credentials: { apiKey: string; username: string },
    request: SmsRequest,
    options?: { baseUrl?: string; environment?: 'production' | 'sandbox' },
  ): Promise<SmsResult> {
    const baseUrl =
      options?.baseUrl ??
      (options?.environment === 'sandbox'
        ? 'https://api.sandbox.africastalking.com'
        : 'https://api.africastalking.com');
    const url = `${baseUrl}/version1/messaging`;

    const form = new URLSearchParams({
      to: request.to,
      message: request.body,
    });
    if (request.sender) form.set('from', request.sender);

    const authorization = Buffer.from(
      `${credentials.apiKey}:${credentials.username}`,
    ).toString('base64');

    const response = await (this.http ?? defaultHttpClient)(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const text = await response.text();

    if (!response.ok) {
      const message =
        extractAfricaTalkingError(text) || `HTTP ${response.status}`;
      this.logger.warn(`Africa's Talking rejected the message: ${message}`);
      return { status: NotificationStatus.FAILED, reason: message };
    }

    const status = extractJsonString(text, 'status');
    // Africa's Talking answers 200 with a per-recipient status, so a rejection
    // arrives in the body rather than as an HTTP error.
    if (status && status !== 'Success' && status !== 'Sent') {
      const message =
        extractJsonString(text, 'failureReason') ||
        extractJsonString(text, 'message') ||
        status;
      this.logger.warn(`Africa's Talking rejected the message: ${message}`);
      return { status: NotificationStatus.FAILED, reason: message };
    }

    return {
      status: NotificationStatus.SENT,
      externalId: extractJsonString(text, 'messageId') ?? undefined,
    };
  }
}

/** Twilio's error shape: { message, code }. */
function extractTwilioError(text: string): string | null {
  const message = extractJsonString(text, 'message');
  const code = extractJsonString(text, 'code');
  if (!message && !code) return null;
  return code ? `${message ?? 'Rejected'} (code ${code})` : message;
}

/** Africa's Talking: { status, message } or { SMSMessageStatus: { Code, ... } }. */
function extractAfricaTalkingError(text: string): string | null {
  const message = extractJsonString(text, 'message');
  const code = extractJsonString(text, 'Code');
  if (!message && !code) return null;
  return message
    ? `${message}${code ? ` (code ${code})` : ''}`
    : `code ${code}`;
}

/**
 * A deliberately small reader for `{"key":"value"}`.
 *
 * A full JSON parse is not safe here: vendor error bodies are not always JSON
 * (a proxy's HTML 502 is not), and a parse failure would replace a useful
 * error message with "Unexpected token <". This returns null instead, and the
 * caller falls back to the status code.
 */
function extractJsonString(text: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(text);
  if (match) return match[1];
  const numeric = new RegExp(`"${key}"\\s*:\\s*(-?\\d+)`).exec(text);
  return numeric ? numeric[1] : null;
}

export const SMS_PROVIDERS = {
  TWILIO: TwilioSmsProvider,
  AFRICAS_TALKING: AfricasTalkingSmsProvider,
} as const;

export type SmsProviderId = keyof typeof SMS_PROVIDERS;

export function isSmsProvider(value: string): value is SmsProviderId {
  return value in SMS_PROVIDERS;
}

export { NotificationChannel };
