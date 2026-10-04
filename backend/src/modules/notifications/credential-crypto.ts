import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Credential encryption for provider configuration (Module 17).
 *
 * An admin panel that stores vendor keys means the keys are in the database,
 * which means every backup, every replica and every `SELECT *` now carries
 * them. So they are encrypted before they are written and never returned in
 * plaintext afterwards — the API hands back a masked hint ("AC••••…9f") and
 * nothing else.
 *
 * AES-256-GCM. The key comes from `NOTIFICATION_CREDENTIALS_KEY` in the
 * environment, and is *derived* from whatever that value is rather than
 * requiring exactly 32 bytes: a human setting it should not have to know that,
 * and rejecting startup over length would be a worse failure than deriving.
 *
 * Losing this key makes stored credentials unrecoverable — that is the point of
 * encrypting them, but it is why the admin panel lets a key be re-entered
 * instead of only ever read back.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function keyFromEnv(): string {
  const secret = process.env.NOTIFICATION_CREDENTIALS_KEY;
  if (!secret) {
    throw new Error(
      'NOTIFICATION_CREDENTIALS_KEY is not set — provider credentials cannot be stored securely. Set it in the environment before configuring a provider.',
    );
  }
  return secret;
}

/** Encrypt an object into `v1:<iv>:<tag>:<ciphertext>`, all base64. */
export function encryptCredentials(
  credentials: Record<string, unknown>,
  secret = keyFromEnv(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypt what `encryptCredentials` produced. Throws if tampered with. */
export function decryptCredentials<T = Record<string, unknown>>(
  payload: string,
  secret = keyFromEnv(),
): T {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Stored credentials are not in the expected format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

/**
 * A hint that identifies a credential without disclosing it: enough to tell an
 * admin whether the right key is stored, useless to anyone who reads it.
 */
export function maskCredential(value: unknown): string {
  const text = asText(value);
  if (!text) return '';
  if (text.length <= 4) return '••••';
  return `${text.slice(0, 2)}${'•'.repeat(6)}${text.slice(-2)}`;
}

/**
 * Credentials are strings in practice, but they arrive from an admin form as
 * `unknown`. Masking must never render "[object Object]" — that would show an
 * administrator a plausible-looking hint for a value that is not the key they
 * typed, which is worse than showing nothing.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

/** Every secret field of a provider's credentials, by name. */
export const SECRET_FIELDS: Record<string, string[]> = {
  TWILIO: ['accountSid', 'authToken'],
  AFRICAS_TALKING: ['apiKey', 'username'],
  SMTP: ['password'],
};

export function maskAll(
  provider: string,
  credentials: Record<string, unknown>,
): Record<string, string> {
  const secrets = SECRET_FIELDS[provider] ?? [];
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    masked[key] = secrets.includes(key) ? maskCredential(value) : asText(value);
  }
  return masked;
}
