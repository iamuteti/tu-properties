/**
 * A throwaway SMTP sink for proving Module 17 end to end.
 *
 * This exists because the module's standing claim in the docs is that *no message has ever
 * been sent by this app* - email and SMS both reported SUPPRESSED until a vendor was
 * configured. The provider-level integration spec already proves nodemailer can deliver to
 * a real SMTP server; what it cannot prove is the **application** path: a trigger firing,
 * NotificationsService dispatching, the provider dialling out, and the notification row
 * coming back SENT with a provider message id.
 *
 * So this listens, records every accepted message as JSON lines, and keeps the envelopes.
 * Deliberately no auth required and no TLS: the point is to observe delivery, not to
 * reproduce a vendor's behaviour (the spec covers rejection, bad passwords and unreachable
 * hosts already).
 *
 * Usage: ts-node -r tsconfig-paths/register scripts/smtp-sink.ts [port]
 */
import { SMTPServer } from 'smtp-server';
import * as fs from 'fs';
import * as path from 'path';

const port = Number(process.argv[2] ?? 2525);
const outFile = process.env.SINK_OUT ?? '/tmp/opencode/smtp-sink.jsonl';

interface Captured {
  at: string;
  from: string;
  to: string[];
  subject?: string;
  messageId?: string;
  body: string;
}

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  /**
   * Accept whatever credentials are offered.
   *
   * `authOptional: true` alone is not enough: nodemailer offers AUTH whenever the
   * server advertises it, and `smtp-server` rejects an AUTH it has no handler for, so
   * the first live run failed with `535 EAUTH` against this sink. The application
   * behaved correctly throughout — it recorded `FAILED` with the server's own reason
   * rather than claiming a send that never happened — but the sink was wrong, so it
   * now accepts.
   *
   * Rejection paths are not this script's job: `email-smtp.integration.spec.ts`
   * already covers a bad password and an unreachable host against a server that *does*
   * check credentials.
   */
  onAuth(_auth, _session, callback) {
    callback(null, { user: 'sink' });
  },
  onData(stream, _session, callback) {
    let raw = '';
    stream.on('data', (chunk) => (raw += chunk.toString()));
    stream.on('end', () => {
      const headerBlock = raw.split(/\r?\n\r?\n/)[0] ?? '';
      const header = (name: string) => {
        const m = headerBlock.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
        return m ? m[1].trim() : undefined;
      };
      const captured: Captured = {
        at: new Date().toISOString(),
        from: header('From') ?? '',
        to: (header('To') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        subject: header('Subject'),
        messageId: header('Message-ID'),
        body: raw,
      };
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.appendFileSync(outFile, `${JSON.stringify(captured)}\n`);
      console.log(
        `[sink] accepted "${captured.subject}" -> ${captured.to.join(', ')}`,
      );
      callback();
    });
  },
});

server.on('error', (err) => {
  console.error('[sink] error', err);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[sink] listening on 127.0.0.1:${port}, writing ${outFile}`);
});
