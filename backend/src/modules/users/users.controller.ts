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

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(
    @Body() createUserDto: Prisma.UserCreateInput | Prisma.UserUncheckedCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    if (tenantId) {
      // Org admins can only create users inside their own organization —
      // never trust the client-supplied organization (id or relation).
      const { organization, organizationId, ...rest } =
        createUserDto as Prisma.UserUncheckedCreateInput & Record<string, unknown>;
      return this.usersService.create({
        ...rest,
        organization: { connect: { id: tenantId } },
      } as Prisma.UserCreateInput);
    }
    return this.usersService.create(createUserDto as Prisma.UserCreateInput);
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: Prisma.UserUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.usersService.update(id, updateUserDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.usersService.remove(id, tenantId);
  }
}
