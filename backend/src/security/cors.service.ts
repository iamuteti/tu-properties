import { Injectable } from '@nestjs/common';
import { resolveAllowlist } from './cors';

export type CorsAllowlist = boolean | ((origin?: string) => boolean);

@Injectable()
export class CorsAllowlistService {
  private readonly allowlist: CorsAllowlist;

  constructor() {
    this.allowlist = resolveAllowlist(process.env.NODE_ENV || 'development');
  }

  /** Returns the resolved allowlist. `false` means "deny everything". */
  getAllowlist(): CorsAllowlist {
    return this.allowlist;
  }

  /** Convenience check used by main.ts. */
  isAllowed(origin?: string): boolean {
    if (typeof this.allowlist === 'boolean') {
      return this.allowlist;
    }
    return this.allowlist(origin);
  }
}