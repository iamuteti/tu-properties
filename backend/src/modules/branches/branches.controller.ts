import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Prisma } from '@prisma/client';

/**
 * Organization branches/offices (Module 1: Core Platform).
 * Reads are open to any authenticated member of the tenant; writes are gated
 * by the structured `branches.*` permissions (Company Admin by default).
 */
@UseGuards(JwtAuthGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Permissions('branches.create')
  create(@Body() data: Prisma.BranchCreateInput, @Request() req) {
    return this.branchesService.create(data, getTenantId(req));
  }

  @Get()
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const tenantId = getTenantId(req);
    return this.branchesService.findAll(
      tenantId,
      search,
      isActive !== undefined ? { isActive: isActive === 'true' } : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.branchesService.findOne(id, getTenantId(req));
  }

  @Patch(':id')
  @Permissions('branches.update')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.BranchUpdateInput,
    @Request() req,
  ) {
    return this.branchesService.update(id, data, getTenantId(req));
  }

  @Delete(':id')
  @Permissions('branches.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.branchesService.remove(id, getTenantId(req));
  }
}
