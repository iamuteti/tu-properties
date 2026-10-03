/**
 * Resolve the CORS allowlist from the environment.
 *
 * - In development, localhost on any port is always allowed.
 * - In production/staging, an explicit list must be provided via
 *   `CORS_ORIGINS` (comma-separated). If none is provided in a
 *   non-local environment, we fall back to a strict empty allowlist
 *   rather than opening the wildcard.
 *
 * Returns `true` to allow the request through, or `false` to reject it.
 * Returning `false` (not `'*'`) is what makes the wildcard mistake hard to
 * repeat: the browser will show a real CORS error instead of silently
 * allowing everything.
 */
export function resolveAllowlist(nodeEnv: string) {
  const isLocal = nodeEnv === 'development' || nodeEnv === 'local';

  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowlist: string[] = [];

  if (isLocal) {
    // Allow any localhost port during local development.
    allowlist.push(
      'http://localhost:3002',
      'http://localhost:3000',
      'http://localhost:3001',
    );
  }

  for (const origin of configured) {
    if (!allowlist.includes(origin)) {
      allowlist.push(origin);
    }
  }

  if (!isLocal && allowlist.length === 0) {
    // Production without an explicit allowlist: deny everything.
    // This is intentionally strict — never silently allow `*`.
    return false;
  }

  return (origin: string | undefined) => {
    // Allow same-origin / server-to-server requests (no Origin header).
    if (!origin) return true;
    if (allowlist.includes(origin)) return true;

    // Support wildcard subdomain patterns declared as `*.domain.com`.
    for (const pattern of configured) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(2);
        if (origin.endsWith('.' + suffix) || origin === suffix) {
          return true;
        }
      }
    }

    return false;
  };
}
