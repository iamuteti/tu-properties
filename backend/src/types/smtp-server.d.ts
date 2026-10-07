/**
 * Minimal ambient types for `smtp-server`.
 *
 * The package ships no types and `@types/smtp-server` is not a dependency, so every
 * import of it resolves to `any` — which is why `email-smtp.integration.spec.ts` carries
 * a `no-unsafe-argument` warning and why `scripts/smtp-sink.ts` was thirteen lint errors.
 *
 * Declared here rather than installed as a devDependency because the surface actually
 * used is four members, and a local declaration documents **what this repository relies
 * on** instead of inheriting whatever a DefinitelyTyped package happens to describe.
 * That is the same argument the codebase makes for `toCsv` and `requireRecord` over a
 * generic library: the interface we depend on should be one we can read.
 *
 * Only what is used is declared. If a call site needs more, add it here deliberately
 * rather than widening to `any`, which would put the problem back.
 */
declare module 'smtp-server' {
  import type { Socket } from 'net';

  /**
   * An address in an envelope.
   *
   * `smtp-server` models these as objects with an `address` string rather than plain
   * strings, which is why the spec reads `mailFrom.address` and `rcptTo[i].address`.
   */
  export interface SMTPAddress {
    address: string;
    args?: string[];
  }

  export interface SMTPServerSession {
    id: string;
    envelope: {
      mailFrom: SMTPAddress | false;
      rcptTo: SMTPAddress[];
      /** Present only when the client authenticated. */
      auth?: { username: string; mechanism: string };
    };
  }

  /** The credentials `onAuth` receives. Both are `undefined` when none were sent. */
  export interface SMTPServerAuth {
    username?: string;
    password?: string;
    mechanism?: string;
  }

  export interface SMTPServerOptions {
    /** Accept mail without a username/password. */
    authOptional?: boolean;
    disabledCommands?: string[];
    logger?: boolean;
    /** Implicit TLS from the first byte. The spec sets this false to test STARTTLS. */
    secure?: boolean;
    onAuth?: (
      auth: SMTPServerAuth,
      session: SMTPServerSession,
      /*
       * `user` is `string | undefined` because the spec forwards `auth.username`
       * straight through, and a client that authenticated with no username is
       * representable. Typing it as `string` would be a lie the compiler enforces.
       */
      callback: (
        err: Error | null,
        response?: { user: string | undefined },
      ) => void,
    ) => void;
    onData?: (
      stream: Socket,
      session: SMTPServerSession,
      callback: (err?: Error) => void,
    ) => void;
  }

  export class SMTPServer {
    constructor(options?: SMTPServerOptions);
    /** The underlying `net.Server` — used to read the bound port when listening on 0. */
    readonly server: import('net').Server;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: never[]) => void): this;
    listen(port: number, host: string, callback?: () => void): this;
    close(callback?: (err?: Error) => void): this;
  }
}
