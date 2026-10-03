import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '@/common/decorators/rate-limit.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory sliding-window rate limiter.
 *
 * Registered as an APP_GUARD (after PublicGuard/RolesGuard) and only
 * activates on handlers decorated with @RateLimit(). Buckets are keyed by
 * client IP + route so a flooded login attempt is throttled per client,
 * not per tenant.
 *
 * Trade-off (documented): state is per-process and resets on restart. For
 * a multi-instance deployment this must be moved to a shared store
 * (e.g. Redis) — the guard interface stays the same.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const route = (request.route?.path as string) || request.url || 'unknown';
    const keyPrefix = options.keyPrefix || route;
    const key = `${this.clientIp(request)}:${keyPrefix}`;

    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + options.ttl };
      this.buckets.set(key, bucket);
    }

    // Opportunistic cleanup so the map does not grow unbounded.
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (now >= b.resetAt) this.buckets.delete(k);
      }
    }

    bucket.count += 1;
    if (bucket.count <= options.limit) {
      return true;
    }

    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    this.logger.warn(
      `Rate limit exceeded: ${key} (${bucket.count} in window, limit ${options.limit})`,
    );
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          options.message || 'Too many requests. Please try again later.',
        retryAfter: retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private clientIp(request: any): string {
    // Respect a single proxied-forwarded address when present (e.g. ngrok),
    // otherwise fall back to the socket address.
    const forwarded = (request.headers?.['x-forwarded-for'] as string) || '';
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
