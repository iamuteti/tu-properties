/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { NotificationStatus } from '@prisma/client';
import { SMTPServer } from 'smtp-server';
import { EmailChannelProvider, SmtpCredentials } from './email-provider';

/**
 * A real SMTP conversation, not a stub.
 *
 * Everything else in this module's tests injects a fake transport, which proves
 * the message is *built* correctly. This one starts an actual SMTP server on a
 * loopback port and lets nodemailer speak to it, which is the only way to prove
 * the settings we hand it are settings a server can accept — port, secure flag
 * and AUTH. A wrong `secure` setting is exactly the kind of failure that never
 * appears in a mocked test and never appears in production either, because
 * nobody notices a channel that quietly sends nothing.
 *
 * So this test asserts: the server received the message, the credentials were
 * checked, and a wrong password comes back as FAILED with a reason rather than a
 * thrown exception.
 */
describe('EmailChannelProvider against a real SMTP server', () => {
  let server: SMTPServer;
  let port: number;
  let received: {
    from: string;
    to: string[];
    subject?: string;
    body: string;
  }[];

  const start = (
    options: { authOptional?: boolean; requirePassword?: string } = {},
  ) =>
    new Promise<number>((resolve, reject) => {
      received = [];
      server = new SMTPServer({
        // onAuth is where credentials are actually checked; returning an error
        // is how a server rejects a bad password.
        onAuth: (auth, _session, callback) => {
          if (
            options.requirePassword &&
            auth.password !== options.requirePassword
          ) {
            callback(new Error('Invalid username or password'));
            return;
          }
          callback(null, { user: auth.username });
        },
        onData: (_stream, session, callback) => {
          const chunks: Buffer[] = [];
          _stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          _stream.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            received.push({
              from: session.envelope.mailFrom
                ? session.envelope.mailFrom.address
                : '',
              to: session.envelope.rcptTo.map((entry) => entry.address),
              subject: /Subject:\s*(.+)/i.exec(raw)?.[1]?.trim(),
              body: raw,
            });
            callback();
          });
        },
        disabledCommands: options.authOptional ? ['AUTH'] : ['STARTTLS'],
        secure: false,
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.server.address();
        const bound = typeof address === 'object' && address ? address.port : 0;
        resolve(bound);
      });
    });

  const stop = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });

  const providerFor = (credentials: SmtpCredentials) =>
    new EmailChannelProvider(
      {
        activeProvider: async () => ({
          provider: 'SMTP',
          credentials,
          settings: {},
        }),
        savedProvider: async () => credentials,
      } as never,
      { available: () => [] } as never,
    );

  const credentialsFor = (
    overrides: Partial<SmtpCredentials> = {},
  ): SmtpCredentials => ({
    host: '127.0.0.1',
    port,
    username: 'alerts@example.com',
    password: 'dummy-password',
    from: 'no-reply@example.com',
    ...overrides,
  });

  beforeEach(async () => {
    jest.setTimeout(20000);
    port = await start({ requirePassword: 'dummy-password' });
  });

  afterEach(async () => {
    await stop();
  });

  it('delivers a message the server actually receives', async () => {
    const result = await providerFor(credentialsFor()).deliver(
      {
        title: 'Rent due',
        body: 'Your rent for October falls due on the 1st.',
        to: { email: 'tenant@example.com' },
      },
      'org-1',
    );

    expect(result.status).toBe(NotificationStatus.SENT);
    expect(received).toHaveLength(1);
    expect(received[0].to).toContain('tenant@example.com');
    expect(received[0].from).toBe('no-reply@example.com');
    expect(received[0].subject).toMatch(/Rent due/);
    expect(received[0].body).toContain('falls due on the 1st');
  });

  it('authenticates with the stored username and password', async () => {
    // If AUTH were not sent, the server would reject this; it succeeding is
    // the evidence that the credentials reach the wire.
    const result = await providerFor(credentialsFor()).deliver(
      { title: 'Hi', body: 'There', to: { email: 'someone@example.com' } },
      'org-1',
    );
    expect(result.status).toBe(NotificationStatus.SENT);
  });

  it('reports a rejected password as FAILED with the server reason', async () => {
    const result = await providerFor(
      credentialsFor({ password: 'wrong-password' }),
    ).deliver(
      { title: 'Hi', body: 'There', to: { email: 'someone@example.com' } },
      'org-1',
    );

    expect(result.status).toBe(NotificationStatus.FAILED);
    // The reason has to name the actual problem, not just "failed".
    expect(result.reason?.toLowerCase()).toMatch(/auth|password|credential/);
    expect(received).toHaveLength(0);
  });

  it('reports an unreachable host rather than hanging', async () => {
    const result = await providerFor(
      credentialsFor({
        port: 1, // nothing listens here
      }),
    ).deliver(
      { title: 'Hi', body: 'There', to: { email: 'someone@example.com' } },
      'org-1',
    );
    expect(result.status).toBe(NotificationStatus.FAILED);
    expect(result.reason).toBeTruthy();
  });

  it('sends a test message through the saved configuration', async () => {
    const result = await providerFor(credentialsFor()).testSend(
      'admin@example.com',
      'org-1',
    );
    expect(result.ok).toBe(true);
    expect(received[0].to).toContain('admin@example.com');
  });
});
