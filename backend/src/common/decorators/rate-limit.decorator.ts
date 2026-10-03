import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** Number of requests allowed per window. */
  limit: number;
  /** Window size in milliseconds. */
  ttl: number;
  /** Optional key prefix — defaults to the route path. */
  keyPrefix?: string;
  /** Message returned with the 429. */
  message?: string;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
