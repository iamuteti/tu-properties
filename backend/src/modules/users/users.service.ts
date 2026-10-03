import { Injectable, BadRequestException } from '@nestjs/common';
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

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, include: { organization: true } });
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
