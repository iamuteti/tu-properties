import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord } from '@/common/utils';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Roles the caller may assign: the 12 system roles (organizationId = null)
   * plus any organization-specific roles of the caller's own organization.
   * SUPER_ADMIN (no tenant scope) sees the system roles.
   */
  async listRoles(tenantId?: string) {
    const where: Prisma.RoleWhereInput = tenantId
      ? {
          OR: [{ organizationId: null }, { organizationId: tenantId }],
        }
      : { organizationId: null };
    return this.prisma.role.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /** Roles currently assigned to a user (structured RBAC). */
  async getUserRoles(userId: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.user, {
        id: userId,
        organizationId: tenantId,
      });
    }
    return this.prisma.roleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            organizationId: true,
          },
        },
      },
      orderBy: { role: { name: 'asc' } },
    });
  }

  /**
   * Replace a user's structured role assignments. Roles must be system roles
   * or roles of the caller's own organization (client input is never trusted
   * beyond that). Passing an empty array clears all assignments (the user
   * then falls back to their legacy enum role).
   */
  async setUserRoles(userId: string, roleIds: string[], tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.user, {
        id: userId,
        organizationId: tenantId,
      });
    }
    const uniqueIds = [...new Set(roleIds)];
    let roles: { id: string }[] = [];
    if (uniqueIds.length > 0) {
      const where: Prisma.RoleWhereInput = tenantId
        ? {
            id: { in: uniqueIds },
            OR: [{ organizationId: null }, { organizationId: tenantId }],
          }
        : { id: { in: uniqueIds }, organizationId: null };
      roles = await this.prisma.role.findMany({ where, select: { id: true } });
      if (roles.length !== uniqueIds.length) {
        throw new BadRequestException(
          'One or more roles are not available to this organization',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.roleAssignment.deleteMany({ where: { userId } }),
      this.prisma.roleAssignment.createMany({
        data: uniqueIds.map((roleId) => ({ userId, roleId })),
      }),
    ]);

    return this.getUserRoles(userId, tenantId);
  }

  /**
   * Create a user.
   *
   * The controller accepts the registration shape (plain `password` alongside
   * `passwordHash`), and Prisma rejects unknown arguments — so `password` is
   * stripped here. It used to be passed straight through, which made every
   * user creation a 500.
   *
   * A **portal user** (`portalTenantId` set) is a resident login for the self-
   * service portal. Two guards, because this is the one place where a wrong
   * assignment would hand someone another household's data:
   *   - the tenant must exist inside the caller's organization, and
   *   - the role is forced to `USER`, so a portal login can never be an admin
   *     (staff roles stay organisation-scoped and use the dashboard).
   */
  async create(
    data: Prisma.UserCreateInput & {
      password?: string;
      portalTenantId?: string | null;
    },
    tenantId?: string,
  ) {
    const { ...userData } = data;
    // `password` is not a column — Prisma rejects unknown arguments.
    delete (userData as { password?: string }).password;

    const portalTenantId = data.portalTenantId ?? null;

    if (portalTenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: {
          id: portalTenantId,
          ...(tenantId ? { organizationId: tenantId } : {}),
        },
        select: { id: true },
      });
      if (!tenant) {
        throw new BadRequestException(
          'The tenant for this portal login does not exist in your organization.',
        );
      }

      // Portal logins are residents: no staff role, ever.
      (userData as Record<string, unknown>).role = 'USER';
      (userData as Record<string, unknown>).portalTenant = {
        connect: { id: portalTenantId },
      };
    }

    if (tenantId) {
      await this.assertWithinUserLimit(tenantId);
    }

    return this.prisma.user.create({
      data: userData as Prisma.UserCreateInput,
      include: { organization: true },
    });
  }

  /**
   * Module 19 Phase C — plan-limit enforcement.
   *
   * `Organization.maxUsers` was set in seed data and never read (master doc
   * audit row 39): an org on a 3-seat plan could invite unlimited users. The
   * check lives here rather than the controller so every creation path —
   * invites, portal logins, the platform's own flows — meets the same gate.
   * SUPER_ADMIN writes without a tenant skip it: there is no plan to enforce
   * against. Portal logins count: they occupy a seat like any other login.
   */
  async assertWithinUserLimit(tenantId: string): Promise<void> {
    const [org, count] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: tenantId },
        select: { maxUsers: true },
      }),
      this.prisma.user.count({ where: { organizationId: tenantId } }),
    ]);
    if (org && count >= org.maxUsers) {
      throw new ConflictException(
        `User limit reached for this organization (max ${org.maxUsers}). Upgrade the plan to invite more users.`,
      );
    }
  }

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });
  }

  async findOneByResetToken(tokenHash: string) {
    return this.prisma.user.findFirst({
      where: { resetPasswordToken: tokenHash },
      include: { organization: true },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { organization: true },
    });
  }

  async findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.user, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.user, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.user.delete({ where: { id } });
  }
}
