import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { getTenantId } from '@/common/utils';
import { Prisma, UserRole } from '@prisma/client';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @Permissions('organizations.create')
  create(@Body() data: Prisma.OrganizationCreateInput) {
    return this.organizationsService.create(data);
  }

  @Get()
  @Permissions('organizations.view')
  findAll() {
    return this.organizationsService.findAll();
  }

  /** The caller's own organization (org profile read for the Settings UI). */
  @Get('me')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROPERTY_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.USER,
  )
  getMe(@Request() req) {
    const orgId = getTenantId(req);
    if (!orgId) {
      throw new ForbiddenException(
        'No organization is associated with this user',
      );
    }
    return this.organizationsService.findOne(orgId);
  }

  /**
   * Update the caller's own organization profile + system settings
   * (currency, timezone, tax fields). Open to every role of the org so the
   * Settings page can save; the structured `settings.update` permission is
   * what actually gates it (system roles grant it to Company Admin; the
   * legacy name-based fallback keeps ADMIN/SUPER_ADMIN through).
   */
  @Patch('me')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Permissions('settings.update')
  updateMe(
    @Request() req,
    @Body()
    data: {
      name?: string;
      contactEmail?: string | null;
      contactPhone?: string | null;
      legalName?: string | null;
      taxId?: string | null;
      currency?: string;
      timezone?: string;
    },
  ) {
    const orgId = getTenantId(req);
    if (!orgId) {
      throw new ForbiddenException(
        'No organization is associated with this user',
      );
    }
    return this.organizationsService.updateProfile(orgId, data);
  }

  @Get(':id')
  @Permissions('organizations.view')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Get('slug/:slug')
  @Permissions('organizations.view')
  findBySlug(@Param('slug') slug: string) {
    return this.organizationsService.findBySlug(slug);
  }

  @Get('subdomain/:subdomain')
  @Permissions('organizations.view')
  findBySubdomain(@Param('subdomain') subdomain: string) {
    return this.organizationsService.findBySubdomain(subdomain);
  }

  @Put(':id')
  @Permissions('organizations.update')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.OrganizationUpdateInput,
  ) {
    return this.organizationsService.update(id, data);
  }

  @Patch(':id')
  @Permissions('organizations.update')
  updateById(
    @Param('id') id: string,
    @Body() data: Prisma.OrganizationUpdateInput,
  ) {
    return this.organizationsService.update(id, data);
  }

  @Delete(':id')
  @Permissions('organizations.delete')
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }

  @Get('check/slug/:slug')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROPERTY_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.USER,
  )
  checkSlugAvailability(@Param('slug') slug: string) {
    return this.organizationsService.checkSlugAvailability(slug);
  }

  @Get('check/subdomain/:subdomain')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROPERTY_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.USER,
  )
  checkSubdomainAvailability(@Param('subdomain') subdomain: string) {
    return this.organizationsService.checkSubdomainAvailability(subdomain);
  }
}
