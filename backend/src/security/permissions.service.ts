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
        perms = await this.permissionsFromLegacyEnum(legacyRole, userId);
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

  /**
   * Fall back to the legacy `UserRole` enum when a user has no `RoleAssignment`.
   *
   * This existed to keep pre-structured-role data working, and it is the only place
   * a permission set can arrive as a silent empty object for a reason nobody
   * wrote down. Three distinct outcomes, all of which used to look identical from
   * the outside:
   *
   * 1. The enum maps to a role that exists — normal.
   * 2. The enum has **no mapping at all**. Legitimate and expected: `EMPLOYEE` is
   *    deliberately unmapped, because the self-service role is named 'Staff
   *    Self-Service' rather than after the enum, and self-service must be granted
   *    explicitly. Logged at `log` so the log stays worth reading.
   * 3. The enum **maps to a role that does not exist** — a typo, or a role that was
   *    renamed or deleted. That is a real defect and gets a `warn` naming both
   *    halves, because "this user can do nothing" is otherwise indistinguishable
   *    from a broken install.
   *
   * Note what this no longer does: it used to default to the `Tenant` role for an
   * unrecognised enum. That default handed tenant-level read access to anyone whose
   * role was merely unknown — including a user carrying `HR_MANAGER`, which is a
   * real seeded role that had no map entry. Unknown now means denied.
   */
  private async permissionsFromLegacyEnum(
    legacyRole: string | null | undefined,
    userId: string,
  ): Promise<PermissionSet> {
    if (!legacyRole) {
      return { all: false, modules: {} };
    }

    const mapped = LEGACY_ROLE_TO_SYSTEM_ROLE[legacyRole];

    if (!mapped) {
      this.logger.log(
        `User ${userId} carries UserRole.${legacyRole}, which has no entry in ` +
          `LEGACY_ROLE_TO_SYSTEM_ROLE. Denied until a RoleAssignment is created for ` +
          `them. If that is wrong, assign the role directly rather than adding a map entry.`,
      );
      return { all: false, modules: {} };
    }

    const role = await this.prisma.role.findFirst({
      where: { name: mapped, organizationId: null },
      select: { permissions: true },
    });

    if (!role) {
      this.logger.warn(
        `UserRole.${legacyRole} maps to the system role "${mapped}", which does not ` +
          `exist. User ${userId} has been denied everything — check ` +
          `LEGACY_ROLE_TO_SYSTEM_ROLE in roles-seed.ts, or assign them a role directly.`,
      );
      return { all: false, modules: {} };
    }

    return this.parse(role.permissions);
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
