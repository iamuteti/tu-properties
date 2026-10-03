import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  Request,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * Audit trail access.
 * - SUPER_ADMIN: platform-wide view (all organizations).
 * - ADMIN: strictly scoped to their own organization — they cannot read
 *   audit entries (or user audit trails) from other tenants.
 */
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async getAll(
    @Request() req,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getAll({
      organizationId: this.adminScope(req),
      entity,
      action,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('entity/:entity/:entityId')
  async getLogsForEntity(@Request() req, @Param('entity') entity: string, @Param('entityId') entityId: string) {
    return this.auditService.getLogsForEntity(
      entity,
      entityId,
      this.adminScope(req),
    );
  }

  @Get('user/:userId')
  async getLogsByUser(@Request() req, @Param('userId') userId: string) {
    // ADMIN may only inspect users of their own organization.
    if (!this.adminScope(req)) {
      return this.auditService.getLogsByUser(userId);
    }
    const target = await this.usersService.findOne(userId);
    if (!target || target.organizationId !== req.user.organizationId) {
      throw new NotFoundException('User not found');
    }
    return this.auditService.getLogsByUser(userId, req.user.organizationId);
  }

  /**
   * Returns the caller's organizationId when they are an ADMIN (tenant
   * scope), or undefined for SUPER_ADMIN (platform scope, sees all).
   */
  private adminScope(req: any): string | undefined {
    return req.user?.role === UserRole.ADMIN ? req.user.organizationId : undefined;
  }
}
