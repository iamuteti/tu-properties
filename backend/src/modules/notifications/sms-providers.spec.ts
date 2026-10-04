import { NotificationStatus } from '@prisma/client';
import {
  AfricasTalkingSmsProvider,
  HttpClientLike,
  TwilioSmsProvider,
} from './sms-providers';

/**
 * Both providers are tested against a stubbed HTTP client with dummy
 * credentials, so what is asserted is the thing that actually breaks: the URL,
 * the auth header, and the field names each vendor expects. Getting the field
 * name wrong sends nothing and reports nothing, which is the failure mode a
 * "it didn't throw" test cannot catch.
 *
 * The dummy values below are shaped like the real thing (an `AC` prefix and a
 * 32-hex token for Twilio, a `key` + username pair for Africa's Talking) so the
 * tests would still be meaningful if they were ever pointed at a sandbox.
 */
describe('SMS providers', () => {
  const DUMMY_TWILIO = {
    accountSid: 'ACdummysid0000000000000000000000',
    authToken: 'dummy_auth_token_0000000000000000',
  };
  const DUMMY_AFRICA = {
    apiKey: 'dummy_api_key',
    username: 'sandbox',
  };

  function stubHttp(
    body: string,
    ok = true,
    status = 200,
  ): { http: HttpClientLike; calls: { url: string; init: never }[] } {
    const calls: { url: string; init: never }[] = [];
    const http: HttpClientLike = (url, init) => {
      calls.push({ url, init: init as never });
      return Promise.resolve({ ok, status, text: () => Promise.resolve(body) });
    };
    return { http, calls };
  }

  describe('Twilio', () => {
    it('posts form-encoded to the Messages API with HTTP Basic auth', async () => {
      const { http, calls } = stubHttp('{"sid":"SM123","status":"queued"}');
      const provider = new TwilioSmsProvider(http);

      const result = await provider.send(
        DUMMY_TWILIO,
        { to: '+254700000000', body: 'Rent due' },
        { baseUrl: 'https://api.us1.twilio.com' },
      );

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.externalId).toBe('SM123');

      const [call] = calls;
      expect(call.url).toBe(
        `https://api.us1.twilio.com/2010-04-01/Accounts/${DUMMY_TWILIO.accountSid}/Messages.json`,
      );
      const headers = (
        call.init as unknown as { headers: Record<string, string> }
      ).headers;
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      // Basic auth is the SID as username and the auth token as password.
      const expected = Buffer.from(
        `${DUMMY_TWILIO.accountSid}:${DUMMY_TWILIO.authToken}`,
      ).toString('base64');
      expect(headers.Authorization).toBe(`Basic ${expected}`);

      const body = new URLSearchParams(
        (call.init as unknown as { body: string }).body,
      );
      expect(body.get('To')).toBe('+254700000000');
      expect(body.get('Body')).toBe('Rent due');
    });

    it('sends the from number when one is configured', async () => {
      const { http, calls } = stubHttp('{"sid":"SM1"}');
      await new TwilioSmsProvider(http).send(
        DUMMY_TWILIO,
        { to: '+254700000000', body: 'Hi', sender: 'TUHAME' },
        { baseUrl: 'https://api.us1.twilio.com' },
      );
      const body = new URLSearchParams(
        (calls[0].init as unknown as { body: string }).body,
      );
      expect(body.get('From')).toBe('TUHAME');
    });

    it('reports a rejection with the vendor message and code', async () => {
      const { http } = stubHttp(
        '{"code":21211,"message":"The To number is not valid"}',
        false,
        400,
      );
      const result = await new TwilioSmsProvider(http).send(
        DUMMY_TWILIO,
        { to: 'not-a-number', body: 'Hi' },
        { baseUrl: 'https://api.us1.twilio.com' },
      );
      expect(result.status).toBe(NotificationStatus.FAILED);
      // The vendor's own wording is what makes the failure diagnosable.
      expect(result.reason).toContain('not valid');
      expect(result.reason).toContain('21211');
    });

    it('falls back to the status code when the error body is not JSON', async () => {
      const { http } = stubHttp('<html>Bad Gateway</html>', false, 502);
      const result = await new TwilioSmsProvider(http).send(
        DUMMY_TWILIO,
        { to: '+254700000000', body: 'Hi' },
        { baseUrl: 'https://api.us1.twilio.com' },
      );
      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.reason).toBe('HTTP 502');
    });
  });

  describe("Africa's Talking", () => {
    it('posts to the messaging endpoint with the API key as the Basic username', async () => {
      const { http, calls } = stubHttp('{"status":"Success","numSent":1}');
      const provider = new AfricasTalkingSmsProvider(http);

      const result = await provider.send(DUMMY_AFRICA, {
        to: '+254700000000',
        body: 'Rent due',
      });

      expect(result.status).toBe(NotificationStatus.SENT);
      const [call] = calls;
      expect(call.url).toBe(
        'https://api.africastalking.com/version1/messaging',
      );
      // The counter-intuitive part: the API key is the username, and the
      // username alone is the password.
      const expected = Buffer.from(
        `${DUMMY_AFRICA.apiKey}:${DUMMY_AFRICA.username}`,
      ).toString('base64');
      const headers = (
        call.init as unknown as { headers: Record<string, string> }
      ).headers;
      expect(headers.Authorization).toBe(`Basic ${expected}`);

      const body = new URLSearchParams(
        (call.init as unknown as { body: string }).body,
      );
      expect(body.get('to')).toBe('+254700000000');
      expect(body.get('message')).toBe('Rent due');
    });

    it('uses the sandbox host when asked', async () => {
      const { http, calls } = stubHttp('{"status":"Success"}');
      await new AfricasTalkingSmsProvider(http).send(
        DUMMY_AFRICA,
        {
          to: '+254700000000',
          body: 'Hi',
        },
        { environment: 'sandbox' },
      );
      expect(calls[0].url).toBe(
        'https://api.sandbox.africastalking.com/version1/messaging',
      );
    });

    it('treats a per-recipient failure in a 200 body as a failure', async () => {
      // Africa's Talking answers 200 even when it rejects the message, so the
      // body status is the only signal.
      const { http } = stubHttp(
        '{"status":"Rejected","message":"InvalidPhoneNumber","SMSMessageStatus":{"Code":"E1601"}}',
      );
      const result = await new AfricasTalkingSmsProvider(http).send(
        DUMMY_AFRICA,
        { to: 'bad', body: 'Hi' },
      );
      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.reason).toBeTruthy();
    });

    it('reports an HTTP failure with the vendor message', async () => {
      const { http } = stubHttp('{"message":"Unauthorized"}', false, 401);
      const result = await new AfricasTalkingSmsProvider(http).send(
        DUMMY_AFRICA,
        { to: '+254700000000', body: 'Hi' },
      );
      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.reason).toContain('Unauthorized');
    });
  });
});
