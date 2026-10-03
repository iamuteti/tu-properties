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
import { RentalAgreementsService } from './rental-agreements.service';
import { Prisma, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rental-agreements')
export class RentalAgreementsController {
  constructor(
    private readonly rentalAgreementsService: RentalAgreementsService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('leases.create')
  create(
    @Body() createRentalAgreementDto: Prisma.RentalAgreementCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.create(
      createRentalAgreementDto,
      tenantId,
    );
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('leases.update')
  update(
    @Param('id') id: string,
    @Body() updateRentalAgreementDto: Prisma.RentalAgreementUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.update(
      id,
      updateRentalAgreementDto,
      tenantId,
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('leases.delete')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.remove(id, tenantId);
  }
}
