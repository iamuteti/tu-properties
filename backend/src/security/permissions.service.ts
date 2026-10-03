import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  LEGACY_ROLE_TO_SYSTEM_ROLE,
  ModulePermissions,
  PermissionSet,
} from '@/prisma/roles-seed';

/**
 * Structured RBAC resolver (Module 1: Core Platform).
 *
 * A user's effective permission set is the union of the `permissions` JSON of
 * every role assigned to them via `user_roles`. Users with no assignment yet
 * (existing data) fall back to their legacy `UserRole` enum mapped to the
 * matching system role, so access behavior is unchanged until an admin
 * assigns structured roles.
 *
 * Results are cached per user for 60s so the guard stays cheap; the cache is
 * invalidated when a user's role assignments change.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<
    string,
    { at: number; perms: PermissionSet }
  >();
  private static readonly TTL_MS = 60_000;

  constructor(private prisma: PrismaService) {}

  /** Resolve the effective permission set for a user. */
  async getPermissionSet(
    userId: string,
    legacyRole?: string | null,
  ): Promise<PermissionSet> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < PermissionsService.TTL_MS) {
      return cached.perms;
    }

    let perms: PermissionSet;
    try {
      const assignments = await this.prisma.roleAssignment.findMany({
        where: { userId },
        include: { role: { select: { permissions: true } } },
      });

      if (assignments.length > 0) {
        perms = this.union(
          assignments.map((a) => this.parse(a.role.permissions)),
        );
      } else {
        const systemRoleName =
          LEGACY_ROLE_TO_SYSTEM_ROLE[legacyRole ?? ''] ?? 'Tenant';
        const role = await this.prisma.role.findFirst({
          where: { name: systemRoleName, organizationId: null },
        });
        perms = role
          ? this.parse(role.permissions)
          : { all: false, modules: {} };
      }
    } catch (err) {
      // Fail closed: on a lookup error treat the user as having no
      // structured permissions.
      this.logger.warn('Permission lookup failed; denying', err as Error);
      perms = { all: false, modules: {} };
    }

    this.cache.set(userId, { at: Date.now(), perms });
    return perms;
  }

  /** Check a single "<module>.<action>" permission for the acting user. */
  async hasPermission(
    user: { userId?: string; role?: string | null },
    permission: string,
  ): Promise<boolean> {
    // Platform super admin bypasses structured permissions entirely.
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }
    if (!user.userId) {
      return false;
    }
    const [module, action] = permission.split('.');
    if (!module || !action) {
      return false;
    }
    const perms = await this.getPermissionSet(user.userId, user.role);
    if (perms.all) {
      return true;
    }
    return !!perms.modules?.[module]?.[action];
  }

  /** Drop the cached permission set (call after changing a user's roles). */
  invalidate(userId: string) {
    this.cache.delete(userId);
  }

  private parse(value: unknown): PermissionSet {
    if (!value || typeof value !== 'object') {
      return { all: false, modules: {} };
    }
    const obj = value as Partial<PermissionSet>;
    return {
      all: !!obj.all,
      modules:
        obj.modules && typeof obj.modules === 'object' ? obj.modules : {},
    };
  }

  private union(sets: PermissionSet[]): PermissionSet {
    if (sets.some((s) => s.all)) {
      return { all: true, modules: {} };
    }
    const modules: Record<string, ModulePermissions> = {};
    for (const set of sets) {
      for (const [module, actions] of Object.entries(set.modules ?? {})) {
        const target = (modules[module] ??= {});
        for (const [action, granted] of Object.entries(actions)) {
          if (granted) {
            target[action as keyof ModulePermissions] = true;
          }
        }
      }
    }
    return { all: false, modules };
  }
}
