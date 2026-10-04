import { NotificationChannel, NotificationStatus } from '@prisma/client';
import {
  EmailChannelProvider,
  SmtpCredentials,
  describeMailError,
} from './email-provider';

const CONFIG = {
  activeProvider: jest.fn(),
  savedProvider: jest.fn(),
} as unknown as import('./notification-config.service').NotificationConfigService;

const DUMMY_SMTP: SmtpCredentials = {
  host: 'smtp.example.com',
  port: '587',
  username: 'alerts@example.com',
  password: 'dummy-password',
  from: 'no-reply@example.com',
};

/**
 * What is asserted here is the part that fails quietly in production: the
 * message is built correctly but the SMTP settings are wrong, so nothing is
 * delivered and nothing is reported. Port 465 means implicit TLS and 587 means
 * STARTTLS — guessing wrong is one of the most common SMTP misconfigurations, so
 * both the default and an explicit override are pinned.
 *
 * This proves the message is *built and submitted*. It cannot prove the mail
 * reaches an inbox: that depends on the sending domain's SPF/DKIM/DMARC records,
 * which is DNS configuration this codebase cannot verify.
 */
describe('EmailChannelProvider (SMTP)', () => {
  let sent: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }[];
  let settings: SmtpCredentials[];
  let failure: Error | null;

  const provider = () =>
    new EmailChannelProvider(
      CONFIG,
      { available: () => ['TWILIO', 'AFRICAS_TALKING'] } as never,
      (credentials) => {
        settings.push(credentials);
        return {
          sendMail: (message: (typeof sent)[number]) => {
            if (failure) return Promise.reject(failure);
            sent.push(message);
            return Promise.resolve({ messageId: 'msg-1' });
          },
        };
      },
    );

  beforeEach(() => {
    sent = [];
    settings = [];
    failure = null;
    (CONFIG.activeProvider as jest.Mock).mockReset();
    (CONFIG.savedProvider as jest.Mock).mockReset();
    (CONFIG.activeProvider as jest.Mock).mockResolvedValue({
      provider: 'SMTP',
      credentials: DUMMY_SMTP,
      settings: {},
    });
  });

  it('suppresses when the recipient has no email address', async () => {
    const result = await provider().deliver(
      { title: 'Rent due', body: 'Please pay', to: { email: null } },
      'org-1',
    );
    // Tenants routinely have no email on file, so this is routine — but it has
    // to say so rather than throwing or pretending to send.
    expect(result.status).toBe(NotificationStatus.SUPPRESSED);
    expect(result.reason).toMatch(/no email address/i);
    expect(sent).toHaveLength(0);
  });

  it('suppresses rather than throwing when given nothing to send to', async () => {
    // A missing `to` must not escape as a TypeError: the caller records one
    // row per message, and an exception here would take down the whole
    // notification, not just this channel.
    const result = await provider().deliver(
      { title: 'Rent due', body: 'Please pay' },
      'org-1',
    );
    expect(result.status).toBe(NotificationStatus.SUPPRESSED);
  });

  it('suppresses when no email provider is active', async () => {
    (CONFIG.activeProvider as jest.Mock).mockResolvedValue(null);
    const result = await provider().deliver(
      {
        title: 'Rent due',
        body: 'Please pay',
        to: { email: 'tenant@example.com' },
      },
      'org-1',
    );
    expect(result.status).toBe(NotificationStatus.SUPPRESSED);
    expect(result.reason).toMatch(/configure SMTP/i);
  });

  it('sends through the active configuration', async () => {
    const result = await provider().deliver(
      {
        title: 'Rent due',
        body: 'Please pay by Friday',
        to: { email: 'tenant@example.com' },
      },
      'org-1',
    );

    expect(result.status).toBe(NotificationStatus.SENT);
    expect(sent[0]).toEqual({
      from: DUMMY_SMTP.from,
      to: 'tenant@example.com',
      subject: 'Rent due',
      text: 'Please pay by Friday',
    });
  });

  it('negotiates STARTTLS by default on port 587', async () => {
    // The transport factory is nodemailer's; what matters is that the port and
    // secure flag chosen here are what nodemailer needs for that port.
    await provider().deliver(
      { title: 'Hi', body: 'There', to: { email: 'a@b.co' } },
      'org-1',
    );
    expect(settings[0]).toMatchObject({
      host: 'smtp.example.com',
      port: '587',
    });
  });

  it('honours an explicit secure setting over the port default', async () => {
    (CONFIG.activeProvider as jest.Mock).mockResolvedValue({
      provider: 'SMTP',
      credentials: { ...DUMMY_SMTP, port: '587', secure: true },
      settings: {},
    });
    await provider().deliver(
      { title: 'Hi', body: 'There', to: { email: 'a@b.co' } },
      'org-1',
    );
    expect(settings[0].secure).toBe(true);
  });

  it('reports the SMTP response code when the server rejects the mail', async () => {
    failure = Object.assign(new Error('Invalid credentials'), {
      responseCode: 535,
      code: 'EAUTH',
    });
    const result = await provider().deliver(
      { title: 'Hi', body: 'There', to: { email: 'a@b.co' } },
      'org-1',
    );
    expect(result.status).toBe(NotificationStatus.FAILED);
    // "535 authentication failed" and "550 mailbox unavailable" point at
    // entirely different fixes, so the code has to survive to the admin.
    expect(result.reason).toContain('SMTP 535');
    expect(result.reason).toContain('EAUTH');
  });

  it('describes an error with no code rather than hiding it', () => {
    expect(describeMailError(new Error('socket hang up'))).toBe(
      'socket hang up',
    );
    expect(describeMailError('nope')).toBe('nope');
  });

  describe('test send', () => {
    it('uses the saved configuration even when the channel is inactive', async () => {
      // The whole point: an administrator checks a freshly typed key before
      // switching a live channel over to it.
      (CONFIG.savedProvider as jest.Mock).mockResolvedValue(DUMMY_SMTP);
      const result = await provider().testSend('admin@example.com', 'org-1');

      expect(result.ok).toBe(true);
      expect(sent[0].subject).toMatch(/test/i);
      expect(sent[0].to).toBe('admin@example.com');
    });

    it('reports honestly when nothing is saved yet', async () => {
      (CONFIG.savedProvider as jest.Mock).mockResolvedValue(null);
      const result = await provider().testSend('admin@example.com', 'org-1');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/no SMTP configuration/i);
    });

    it('surfaces a server rejection rather than claiming success', async () => {
      (CONFIG.savedProvider as jest.Mock).mockResolvedValue(DUMMY_SMTP);
      failure = Object.assign(new Error('Recipient address rejected'), {
        responseCode: 550,
      });
      const result = await provider().testSend('nobody@example.com', 'org-1');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.reason).toContain('550');
    });
  });

  it('is the EMAIL channel', () => {
    expect(provider().channel).toBe(NotificationChannel.EMAIL);
  });
});
