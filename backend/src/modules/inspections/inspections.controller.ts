import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getUserId, requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { InspectionsService } from './inspections.service';
// Imported as a value, not a type: Nest reads the DTO class off the emitted
// design:paramtypes, and a type-only import erases it so the body would skip
// validation entirely.
import {
  CreateInspectionDto,
  UpdateInspectionItemDto,
} from '@/modules/leases/dto/lease.dto';

const INSPECTION_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
];

@UseGuards(JwtAuthGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  @Roles(...INSPECTION_ROLES)
  @Permissions('leases.update')
  create(@Body() dto: CreateInspectionDto, @Request() req) {
    return this.inspections.create(dto, requireTenantId(req));
  }

  @Get()
  list(
    @Request() req,
    @Query('unitId') unitId?: string,
    @Query('type') type?: string,
  ) {
    return this.inspections.list(requireTenantId(req), { unitId, type });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.inspections.findOne(id, requireTenantId(req));
  }

  @Post(':id/items')
  @Roles(...INSPECTION_ROLES)
  @Permissions('leases.update')
  addItem(
    @Param('id') id: string,
    @Body()
    body: {
      area: string;
      item: string;
      condition?: string;
      notes?: string;
      estimatedCost?: number;
    },
    @Request() req,
  ) {
    return this.inspections.addItem(id, body, requireTenantId(req));
  }

  @Patch(':id/items/:itemId')
  @Roles(...INSPECTION_ROLES)
  @Permissions('leases.update')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInspectionItemDto,
    @Request() req,
  ) {
    return this.inspections.updateItem(id, itemId, dto, requireTenantId(req));
  }

  @Post(':id/complete')
  @Roles(...INSPECTION_ROLES)
  @Permissions('leases.update')
  complete(@Param('id') id: string, @Request() req) {
    return this.inspections.complete(id, requireTenantId(req), getUserId(req));
  }

  @Delete(':id')
  @Roles(...INSPECTION_ROLES)
  @Permissions('leases.update')
  remove(@Param('id') id: string, @Request() req) {
    return this.inspections.remove(id, requireTenantId(req));
  }
}
