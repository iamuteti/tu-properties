import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Prisma, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { PermissionsService } from '@/security/permissions.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Permissions('users.view')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Post()
  @Permissions('users.create')
  async create(
    @Body()
    createUserDto: Prisma.UserCreateInput | Prisma.UserUncheckedCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    const data = {
      ...(createUserDto as Prisma.UserUncheckedCreateInput &
        Record<string, unknown>),
    };

    // Invite flow: when no password is supplied, mint a temporary one and
    // return it once so the admin can hand it to the new user (they must
    // change it; a real email invite flow is a follow-up).
    let temporaryPassword: string | undefined;
    if (!data.passwordHash) {
      temporaryPassword = crypto.randomBytes(9).toString('base64url');
      data.passwordHash = await bcrypt.hash(temporaryPassword, 10);
    }

    let user;
    if (tenantId) {
      // Org admins can only create users inside their own organization —
      // never trust the client-supplied organization (id or relation).
      const { organization, organizationId, ...rest } = data;
      // `portalTenantId` (a self-service resident login) is passed through as a
      // scalar; the service validates the tenant is in this organization and
      // forces a non-staff role.
      user = await this.usersService.create(
        {
          ...rest,
          organization: { connect: { id: tenantId } },
        } as Prisma.UserCreateInput,
        tenantId,
      );
    } else {
      user = await this.usersService.create(data as Prisma.UserCreateInput);
    }

    return temporaryPassword ? { user, temporaryPassword } : user;
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.findAll(tenantId);
  }

  /** Roles assignable from the UI: system roles + this org's own roles. */
  @Get('roles')
  listRoles(@Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.listRoles(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/roles')
  getUserRoles(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.getUserRoles(id, tenantId);
  }

  @Patch(':id')
  @Permissions('users.update')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: Prisma.UserUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.usersService.update(id, updateUserDto, tenantId);
  }

  /** Replace a user's structured role assignments (Module 1 RBAC). */
  @Patch(':id/roles')
  @Permissions('users.update')
  async setUserRoles(
    @Param('id') id: string,
    @Body() body: { roleIds: string[] },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    const assignments = await this.usersService.setUserRoles(
      id,
      body?.roleIds ?? [],
      tenantId,
    );
    // Take the permission cache change live immediately.
    this.permissionsService.invalidate(id);
    return assignments;
  }

  @Delete(':id')
  @Permissions('users.delete')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.remove(id, tenantId);
  }
}
